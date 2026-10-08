import { toolMetadata } from '../../contracts/core/tool-metadata/media.js';
import { adaptLegacyAuthorize } from "@jini-ai/cms/core";
import { ToolInputError } from "@jini-ai/core";
import { buildDomainRegistrations, indexCatalogById, requireInputRecord, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import { requireToolPermission } from "@jini-ai/cms/core";
import sharp from "sharp";

import type { ToolContributor } from "#src/assistant/index";
import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import { sniffContentType, type AssetBlobRepoPort, type BlobStorePort, type MediaRecord, type MediaRepoPort } from "./index.js";

/**
 * @file `media_view_image` — lets the assistant LOOK at one media-library image.
 *
 * Found by a real run: asked to write alt text, the assistant answered that none of its tools could
 * open an image and refused to guess. Every other media tool returns metadata and a `publicUrl`, and
 * a URL is not something the model can see. This tool returns the picture itself as an MCP `image`
 * content block (`{type:'image', mimeType, data}`) beside a `text` block of the asset's metadata —
 * the same typed-media shape `assistant/demo-image-tool.ts` proves end to end, which every delivery
 * path keeps intact: the daemon's delegated-tool bridge treats `image` as model-visible
 * (`@jini-ai/daemon`'s `tool-result-surfaces.ts`), `@jini-ai/mcp`'s gateway unwraps and forwards it
 * verbatim, and the BYOK surface maps it onto each provider's own image part
 * (`assistant/byok-provider-turn.ts`).
 *
 * Named `media_*`, not `content_read.*`: that prefix means "one of `assistant/content-read-tool.ts`'s
 * 29 derived cards" — `content-read-tool.test.ts` and the parent-tool-read eval both identify cards by
 * it — and this is an ordinary contributor with no older read tool to collapse.
 *
 * ## Size
 *
 * Re-encoded as WebP, long edge at most {@link VIEW_IMAGE_MAX_EDGE_PX}, never enlarged. 1568px is
 * the long edge past which Claude's vision input is downscaled anyway, so anything larger only costs
 * bytes and tokens. WebP rather than JPEG because it keeps transparency (a logo on a transparent
 * background would otherwise come back on black), and every BYOK provider accepts it. EXIF
 * orientation is applied first, so the model sees the photo the right way up.
 *
 * ## What it refuses
 *
 * The decision is made from the stored BYTES (`sniffContentType`), never the declared type: a video
 * is refused with a pointer to `media_view_video` (video extraction is a separate injected port,
 * with optional host ffmpeg), and anything else that is not a decodable raster image is
 * refused by name. Every refusal is a `ToolInputError`, so the model gets the reason, not a redacted
 * internal error.
 */

export const MEDIA_VIEW_IMAGE_TOOL_ID = "media_view_image";

/** Long-edge cap for the returned image — see this file's header, "Size". */
export const VIEW_IMAGE_MAX_EDGE_PX = 1568;

const WEBP_QUALITY = 80;

/** Everything the tool reads. A narrow slice of `RouteDeps`, so a test can pass in-memory repos. */
export interface MediaViewImageToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  mediaRepo: MediaRepoPort;
  assetBlobRepo: AssetBlobRepoPort;
  blobStore: BlobStorePort;
}

/** Mirrors each domain's own local catalog interface (see `assistant/demo-image-tool.ts`). */
interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema: Readonly<Record<string, unknown>>;
}

export const mediaViewImageAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: MEDIA_VIEW_IMAGE_TOOL_ID,
    description:
      "THIS IS HOW TO LOOK AT / SEE / VIEW AN IMAGE in the media library — opens one image and returns the actual picture so you can see what it shows. " +
      "Call this before writing or improving alt text, writing a caption, describing a photo, checking what a picture contains, or choosing between images; " +
      "never guess what an image shows from its title or filename. Pass exactly one of `mediaId` or `slug` (find them with content_read.media_asset). " +
      `Returns the image (WebP, long edge at most ${VIEW_IMAGE_MAX_EDGE_PX}px, downscaled when larger) plus its metadata as JSON: id, slug, title, current alt, caption, status, the original's type and dimensions, and the returned dimensions. ` +
      "Read-only: it changes nothing — to save new alt text afterwards, use media_update_metadata. For video still frames use media_view_video; this tool refuses anything that is not a still image.",
    sideEffects: "none",
    authorization: { permission: "media.read" },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        mediaId: { type: "string", description: "The media asset's id. Pass this or `slug`, not both." },
        slug: { type: "string", description: "The media asset's slug (short lookup name). Pass this or `mediaId`, not both." },
      },
    },
  },
];

export const mediaViewImageDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> mediaRepo.findById/findBySlug + assetBlobRepo.findByHash + blobStore.get + an in-memory
  // re-encode. Nothing is written anywhere.
  [MEDIA_VIEW_IMAGE_TOOL_ID, "none"],
]);

const CATALOG_BY_ID = indexCatalogById({ catalog: mediaViewImageAgentToolCatalog });

/** Prefixes every refusal with the tool id, so the model can tell which call it came from. */
function refusal(message: string): ToolInputError {
  return new ToolInputError({ message: `${MEDIA_VIEW_IMAGE_TOOL_ID}: ${message}` });
}

type AssetLookup = { by: "id"; value: string } | { by: "slug"; value: string };

/**
 * Reads the one lookup key the caller supplied.
 *
 * @throws {ToolInputError} Unless exactly one of `mediaId`/`slug` is a non-empty string.
 */
function readLookup(input: unknown): AssetLookup {
  const record = requireInputRecord({ input: input });
  const keys = (["mediaId", "slug"] as const).filter((key) => record[key] !== undefined);
  const key = keys.length === 1 ? keys[0]! : undefined;
  const value = key === undefined ? undefined : record[key];
  if (key === undefined || typeof value !== "string" || value.length === 0) {
    throw refusal("pass exactly one of 'mediaId' or 'slug' (a non-empty string).");
  }
  return key === "mediaId" ? { by: "id", value } : { by: "slug", value };
}

/** @throws {ToolInputError} When no asset matches. */
async function findAsset(deps: MediaViewImageToolDeps, lookup: AssetLookup): Promise<MediaRecord> {
  const found =
    lookup.by === "id"
      ? await deps.mediaRepo.findById({ workspaceId: deps.workspaceId, id: lookup.value })
      : await deps.mediaRepo.findBySlug({ workspaceId: deps.workspaceId, slug: lookup.value });
  if (!found) {
    throw refusal(`no media asset with ${lookup.by} '${lookup.value}'. Use content_read.media_asset to list the library and find the right id or slug.`);
  }
  return found;
}

/** @throws {ToolInputError} When the asset's blob row is gone. */
async function readStoredBytes(deps: MediaViewImageToolDeps, asset: MediaRecord): Promise<Uint8Array> {
  const blob = await deps.assetBlobRepo.findByHash({ workspaceId: deps.workspaceId, sha256: asset.source.sha256 });
  if (!blob) throw refusal(`media asset '${asset.id}' has no stored file, so there is nothing to show.`);
  return deps.blobStore.get({ storageKey: blob.storageKey });
}

interface RenderedImage {
  data: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
}

/** EXIF orientations 5-8 rotate by 90°, so the stored width/height are swapped relative to what a viewer sees. */
function isQuarterTurn(orientation: number | undefined): boolean {
  return orientation !== undefined && orientation >= 5;
}

/**
 * Applies EXIF orientation, bounds the long edge, and re-encodes as WebP.
 *
 * @throws {ToolInputError} When `sharp` cannot decode the bytes.
 * @complexity O(pixels) — one decode and one encode, bounded by the host's upload size cap.
 */
async function renderForModel(asset: MediaRecord, bytes: Uint8Array, contentType: string): Promise<RenderedImage> {
  try {
    const source = Buffer.from(bytes);
    const metadata = await sharp(source).metadata();
    const { data, info } = await sharp(source)
      .rotate()
      .resize({ width: VIEW_IMAGE_MAX_EDGE_PX, height: VIEW_IMAGE_MAX_EDGE_PX, fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    const swap = isQuarterTurn(metadata.orientation);
    return {
      data: data.toString("base64"),
      width: info.width,
      height: info.height,
      originalWidth: (swap ? metadata.height : metadata.width) ?? info.width,
      originalHeight: (swap ? metadata.width : metadata.height) ?? info.height,
    };
  } catch {
    throw refusal(`media asset '${asset.id}' could not be decoded as an image (${contentType}) — its stored file may be damaged.`);
  }
}

/**
 * Refuses anything that is not a still image, judged by the bytes.
 *
 * @throws {ToolInputError} For a video, or for bytes that are not a raster image type.
 */
function assertStillImage(asset: MediaRecord, contentType: string): void {
  if (contentType.startsWith("video/")) {
    throw refusal(
      `media asset '${asset.id}' is a video (${contentType}). This tool only shows still images. Use media_view_video with this mediaId to see sampled video frames.`,
    );
  }
  if (!contentType.startsWith("image/") || contentType === "image/svg+xml") {
    throw refusal(`media asset '${asset.id}' is not a viewable image (its stored bytes are ${contentType}).`);
  }
}

/**
 * Builds the tool's registration.
 *
 * @returns One registration: `media_view_image`, read-only.
 */
export function buildMediaViewImageRegistrations(deps: MediaViewImageToolDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    [MEDIA_VIEW_IMAGE_TOOL_ID]: async (ctx) => {
      const lookup = readLookup(ctx.input);
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: ctx.principal.id, permission: "media.read" }, { entityType: "media" });

      const asset = await findAsset(deps, lookup);
      const bytes = await readStoredBytes(deps, asset);
      const contentType = sniffContentType({ bytes });
      assertStillImage(asset, contentType);
      const rendered = await renderForModel(asset, bytes, contentType);

      const metadata = {
        id: asset.id,
        slug: asset.slug,
        title: asset.title,
        alt: asset.alt,
        caption: asset.caption,
        status: asset.status,
        original: { contentType, width: rendered.originalWidth, height: rendered.originalHeight },
        returned: {
          mimeType: "image/webp",
          width: rendered.width,
          height: rendered.height,
          downscaled: rendered.width < rendered.originalWidth || rendered.height < rendered.originalHeight,
        },
      };
      return {
        content: [
          { type: "text", text: JSON.stringify(metadata) },
          { type: "image", mimeType: "image/webp", data: rendered.data },
        ],
      };
    },
  };

  return buildDomainRegistrations({ metadata: toolMetadata,
    domain: "media-view",
    catalogModule: "features/media/view-image-tool.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: mediaViewImageDerivedRisk,
  });
}

/** Contributes the tool to the assistant catalog — installed by `tool-catalog-manifest.ts`. */
export function contributeMediaViewImageTools(): ToolContributor {
  return { domain: "media-view", build: buildMediaViewImageRegistrations, risk: mediaViewImageDerivedRisk };
}
