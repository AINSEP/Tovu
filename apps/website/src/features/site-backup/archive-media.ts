import { createHash } from "node:crypto";
import path from "node:path";
import { sniffContentType, sanitizeSvg, computeBlobStorageKey, mimeForTransformFormat, type BlobStorePort, type ImageTransformerPort, type TransformParams } from "#src/features/media/index";
import { SiteShareRefusal } from "./share-policy.js";
import { sharePathAlias, validateSharePath } from "./share-file-policy.js";
import { addBuffered, reportedBlobSize, fetchVerifiedBlob, type ShareLedger } from "./share-preparation-steps.js";
import type { ArchiveMedia } from "./archive-manifest.js";

/** Snapshot-owned metadata, never a read from mutable live media repositories. */
export interface ArchiveMediaSource {
  readonly id: string; readonly workspaceId: string; readonly slug: string;
  readonly originalFilename: string | null; readonly kind: string;
  readonly storageKey: string; readonly sha256: string;
  readonly documentOwned?: boolean;
  readonly public?: { readonly storageKey?: string; readonly sha256?: string; readonly version: number; readonly params: TransformParams };
}
export interface ArchiveMediaCopy extends ArchiveMedia {
  readonly workspaceId: string; readonly storageKey: string; readonly contentType: string;
  readonly publicVersion?: number;
  readonly documentOwned?: boolean;
}
export type ArchiveMediaRewriter = (required: { bytes: Buffer; copies: readonly ArchiveMediaCopy[] }, optional?: { signal?: AbortSignal }) => Promise<Buffer>;
const EXTENSIONS: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "audio/wav": "wav", "audio/mpeg": "mp3", "audio/flac": "flac", "audio/mp4": "m4a" };

/** Picks exactly one public copy per item, in id order, without writing to the source site.
 * @throws SiteShareRefusal naming missing, corrupt or unbounded media; raster failures never fall back to raw bytes.
 * @complexity O(items log items + media bytes); shared caps bound retained output and each input read.
 */
export async function bufferArchiveMedia(required: { sources: readonly ArchiveMediaSource[]; blobStore: Pick<BlobStorePort, "get" | "sizeOf">; imageTransformer: ImageTransformerPort; ledger: ShareLedger }, optional: { signal?: AbortSignal } = {}): Promise<ArchiveMediaCopy[]> {
  const aliases = new Set<string>();
  const copies: ArchiveMediaCopy[] = [];
  for (const source of [...required.sources].sort((a, b) => a.id < b.id ? -1 : Number(a.id > b.id))) {
    optional.signal?.throwIfAborted();
    const original = await readCopy({ blobStore: required.blobStore, source });
    const selected = await publicCopy({ source, original, blobStore: required.blobStore, imageTransformer: required.imageTransformer });
    const file = mediaPath({ source, extension: selected.extension, aliases });
    const sha256 = createHash("sha256").update(selected.bytes).digest("hex");
    const storageKey = computeBlobStorageKey({ workspaceId: source.workspaceId, sha256 });
    validateSharePath({ path: "uploads/" + storageKey });
    addBuffered({ ledger: required.ledger, file: { path: file, content: selected.bytes } });
    copies.push({ id: source.id, slug: source.slug, path: file, sha256, workspaceId: source.workspaceId, storageKey, contentType: selected.contentType, documentOwned: source.documentOwned, ...(selected.publicVersion === undefined ? {} : { publicVersion: selected.publicVersion }) });
  }
  return copies;
}

/** Size and checksum must come from the snapshot/store contract before bytes can be archived. */
async function readCopy(required: { blobStore: Pick<BlobStorePort, "get" | "sizeOf">; source: { storageKey: string; sha256?: string; kind?: string } }): Promise<Buffer> {
  validateSharePath({ path: "uploads/" + required.source.storageKey });
  const size = await reportedBlobSize({ blobStore: required.blobStore, storageKey: required.source.storageKey, document: required.source.kind === "document" });
  return fetchVerifiedBlob({ blobStore: required.blobStore, media: required.source, size });
}

async function publicCopy(required: { source: ArchiveMediaSource; original: Buffer; blobStore: Pick<BlobStorePort, "get" | "sizeOf">; imageTransformer: ImageTransformerPort }): Promise<{ bytes: Buffer; contentType: string; extension: string; publicVersion?: number }> {
  const contentType = sniffContentType({ bytes: required.original });
  if (required.source.kind === "document") return { bytes: required.original, contentType, extension: originalExtension(required.source) };
  if (contentType === "image/svg+xml") return { bytes: Buffer.from(await sanitizeSvg({ bytes: required.original })), contentType, extension: "svg" };
  if (!contentType.startsWith("image/")) return { bytes: required.original, contentType, extension: EXTENSIONS[contentType] ?? originalExtension(required.source) };
  return rasterCopy(required);
}

async function rasterCopy(required: { source: ArchiveMediaSource; original: Buffer; blobStore: Pick<BlobStorePort, "get" | "sizeOf">; imageTransformer: ImageTransformerPort }): Promise<{ bytes: Buffer; contentType: string; extension: string; publicVersion: number }> {
  const definition = required.source.public;
  if (!definition || definition.params.format !== "webp") throw new SiteShareRefusal({ code: "INVALID_MEDIA", message: `Media '${required.source.id}' has no public webp transform.` });
  try {
    const bytes = definition.storageKey
      ? await readCopy({ blobStore: required.blobStore, source: { storageKey: definition.storageKey, ...(definition.sha256 ? { sha256: definition.sha256 } : {}) } })
      : Buffer.from((await required.imageTransformer.transform({ bytes: required.original, params: definition.params })).bytes);
    if (sniffContentType({ bytes }) !== "image/webp") throw new Error("public rendition is not webp");
    return { bytes, contentType: mimeForTransformFormat({ format: definition.params.format }), extension: "webp", publicVersion: definition.version };
  } catch (error) {
    throw new SiteShareRefusal({ code: "INVALID_MEDIA", message: `Cannot export media '${required.source.id}' (${required.source.slug}): ${error instanceof Error ? error.message : "image decode failed"}` });
  }
}

function originalExtension(source: ArchiveMediaSource): string {
  const extension = path.extname(source.originalFilename ?? "").slice(1).toLowerCase();
  return /^[a-z0-9]{1,12}$/.test(extension) ? extension : "bin";
}
function mediaPath(required: { source: ArchiveMediaSource; extension: string; aliases: Set<string> }): string {
  const slug = required.source.slug || required.source.id;
  let candidate = `media/${slug}.${required.extension}`, suffix = 2;
  while (required.aliases.has(sharePathAlias({ path: candidate }))) candidate = `media/${slug}-${suffix++}.${required.extension}`;
  validateSharePath({ path: candidate });
  required.aliases.add(sharePathAlias({ path: candidate }));
  return candidate;
}
