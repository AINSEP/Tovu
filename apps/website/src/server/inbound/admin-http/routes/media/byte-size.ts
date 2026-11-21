import { orFallback } from "@jini-ai/core/errors/idioms";
import type { MediaRecord } from "#src/features/media/index";
import type { MediaRouteDeps } from "./deps.js";

type ByteSizeDeps = Pick<MediaRouteDeps, "workspaceId" | "assetBlobRepo" | "blobStore">;
/** The one field this reads from each `MediaRecord`: its source blob's content hash. */
type ByteSizeMedia = { readonly source: Pick<MediaRecord["source"], "sha256"> };

/** Only the returned media batch is visited; original keys come from the blob repo port.
 * LocalFsBlobStore memoizes successful stat results by content-addressed key. Older built Jini
 * adapters remain importable and report unknown until their sizeOf capability is available.
 * One missing/unreadable blob must not prevent the operator from seeing the rest of the library.
 */
export async function resolveMediaByteSizes(
  { deps, media }: { deps: ByteSizeDeps; media: readonly ByteSizeMedia[] },
  _optional: Record<string, never> = {},
): Promise<Map<string, number | null>> {
  const sha256s = [...new Set(media.map((item) => item.source.sha256))];
  const sizes = new Map<string, number | null>(sha256s.map((sha256) => [sha256, null]));
  // Structural capability check also supports the installed declaration before Jini is rebuilt.
  const store = deps.blobStore as ByteSizeDeps["blobStore"] & {
    sizeOf?: (required: { storageKey: string }, optional?: Record<string, never>) => Promise<number | null>;
  };
  if (store.sizeOf && sha256s.length > 0) {
    const blobs = await orFallback({ work: () => deps.assetBlobRepo.list({ workspaceId: deps.workspaceId }, { sha256s }), fallback: [], step: "Read media blob rows" });
    const blobsBySha256 = new Map(blobs.map((blob) => [blob.sha256, blob]));
    let cursor = 0;
    const worker = async () => {
      while (cursor < sha256s.length) {
        const sha256 = sha256s[cursor];
        if (sha256 === undefined) throw new Error("media byte-size worker has no hash at its cursor");
        cursor += 1;
        let size: number | null = null;
        const blob = blobsBySha256.get(sha256);
        try {
          if (store.sizeOf) {
            size = blob ? await store.sizeOf({ storageKey: blob.storageKey }) : null;
          }
        } catch {
          // Per-row failure stays unknown; the adapter does not cache absent/error results.
        }
        sizes.set(sha256, size);
      }
    };
    await Promise.all(Array.from({ length: Math.min(8, sha256s.length) }, worker));
  }
  return sizes;
}
