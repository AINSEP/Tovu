import { findMediaByIdOrSlug, type MediaContentTypeStorePort, type MediaRepoPort } from "../media/index.js";

/**
 * @file Resolves the media reference a caller gives for a post/page's featured image (2026-10-05)
 * to the canonical asset id `PostRecord.featuredMediaId` stores.
 *
 * Why the id and never the slug: the render path looks the featured asset up by id
 * (`featuredImageView` in `render.ts` reads `mediaAssetMetadata.get(post.featuredMediaId)`), and a
 * media slug is editable, so storing one would break the moment the asset is renamed.
 *
 * `normalizeFeaturedMediaId` (`post.ts`) checks shape only; this is the existence check it defers
 * to "the caller that resolved it". The admin editor's picker only offers real library assets, so
 * the agent tool is the caller that needs it.
 */

export interface FeaturedImageDeps {
  mediaRepo: MediaRepoPort;
  /** Optional: content types are sniffed into this store lazily, so an asset may have none yet. An
   *  unknown type is accepted (it cannot be told apart from an image); a known non-image is not. */
  mediaContentTypeStore?: Pick<MediaContentTypeStorePort, "getMany">;
}

export type FeaturedImageResolution =
  | { ok: true; id: string }
  | { ok: false; reason: "missing" | "trashed" | "not-image"; contentType?: string };

/**
 * Looks the reference up through `findMediaByIdOrSlug` (id first, then slug — the lookup every
 * media reference in this codebase uses), and refuses a trashed asset or one whose recorded content type is not an image.
 *
 * @complexity O(1) — at most two repo reads and one content-type read.
 */
export async function resolveFeaturedImageRef(required: {
  deps: FeaturedImageDeps;
  input: { workspaceId: string; ref: string };
}): Promise<FeaturedImageResolution> {
  const { deps, input } = required;
  const ref = input.ref.trim();
  const asset = await findMediaByIdOrSlug({ deps: { mediaRepo: deps.mediaRepo }, input: { workspaceId: input.workspaceId, idOrSlug: ref } });
  if (!asset) return { ok: false, reason: "missing" };
  if (asset.status === "trashed") return { ok: false, reason: "trashed" };
  const types = await deps.mediaContentTypeStore?.getMany({ workspaceId: input.workspaceId, sha256s: [asset.source.sha256] });
  const contentType = types?.get(asset.source.sha256);
  if (contentType !== undefined && !contentType.startsWith("image/")) return { ok: false, reason: "not-image", contentType };
  return { ok: true, id: asset.id };
}
