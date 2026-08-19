import type { UUID } from "@jini-ai/cms/core";
import type {
  AssetRenditionRepoPort,
  MediaRepoPort,
  TransformDefinitionRepoPort,
  TransformFormat,
} from "../media/index.js";

/**
 * @file `resolveSeoImageRef` (ADR-PIPE-008 Decision §6, C-013, EC-07) —
 * media-ref-to-URL resolution for `ogImage`/`twitterImage`. Read-only, over
 * `media`'s existing repos (no new port). Never generates a rendition, never
 * throws — resolves `undefined` on any lookup miss (deleted asset, trashed
 * asset, unregistered transform, ungenerated rendition) so the rest of the
 * head render never breaks over one bad image reference.
 */

const ABSOLUTE_URL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

function isAbsoluteUrl(value: string): boolean {
  return ABSOLUTE_URL_PATTERN.test(value) || value.startsWith("//");
}

/** Cosmetic only (ADR-027 §4 — never participates in the rendition lookup itself). */
const EXT_BY_TRANSFORM_FORMAT: Record<TransformFormat, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  gif: "gif",
};

export interface ResolveSeoImageRefDeps {
  mediaRepo: MediaRepoPort;
  assetRenditionRepo: AssetRenditionRepoPort;
  transformDefinitionRepo: TransformDefinitionRepoPort;
}

export interface ResolveSeoImageRefInput {
  workspaceId: UUID;
  /** Either `"{assetId}:{transformName}"` or an already-absolute URL. */
  ref: string;
}

/**
 * Resolves an `ogImage`/`twitterImage` field to an absolute URL, or
 * `undefined` on any miss.
 *
 * @complexity O(1) — bounded repo lookups (one asset read, one transform-
 * version listing, one rendition read).
 */
export async function resolveSeoImageRef(
  deps: ResolveSeoImageRefDeps,
  input: ResolveSeoImageRefInput
): Promise<string | undefined> {
  const ref = input.ref?.trim();
  if (!ref) return undefined;
  if (isAbsoluteUrl(ref)) return ref;

  const separatorIndex = ref.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === ref.length - 1) return undefined;
  const assetId = ref.slice(0, separatorIndex);
  const transformName = ref.slice(separatorIndex + 1);

  const asset = await deps.mediaRepo.findById({ workspaceId: input.workspaceId, id: assetId });
  if (!asset || asset.status === "trashed") return undefined;

  const versions = await deps.transformDefinitionRepo.listByName({
    workspaceId: input.workspaceId,
    name: transformName,
  });
  if (versions.length === 0) return undefined;
  const latest = versions.reduce((a, b) => (b.version > a.version ? b : a));

  const rendition = await deps.assetRenditionRepo.findOne({
    workspaceId: input.workspaceId,
    assetId,
    transformName,
    version: latest.version,
  });
  if (!rendition) return undefined;

  const ext = EXT_BY_TRANSFORM_FORMAT[latest.params.format] ?? latest.params.format;
  return `/m/${assetId}/${transformName}.v${latest.version}/image.${ext}`;
}
