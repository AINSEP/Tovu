/** @file Public head adapter for the shared cover policy; no persisted SEO or post writes. */
import type { GetEntryMetaDeps, SeoPostRecord } from "@jini-ai/cms/seo";
import { collectCoverMediaRefs, resolveCoverImage, type CoverImage, type CoverMedia } from "../post/cover-image.js";

/** Use the existing media/image owners to populate the selector's synchronous metadata port.
 * Unknown MIME follows the featured-image owner's existing acceptance rule; videos/trashed refs
 * are refused there before they enter this map. No new lookup or image URL owner is introduced.
 * @complexity O(n + a) body traversal and distinct refs, each with bounded existing media reads.
 */
export async function resolveSeoCoverImage(
  { deps, post }: { deps: GetEntryMetaDeps; post: SeoPostRecord },
  _optional: Record<string, never> = {},
): Promise<CoverImage | null> {
  const media = new Map<string, CoverMedia>();
  await Promise.all(collectCoverMediaRefs({ post }).map(async (ref) => {
    const valid = await deps.media.featuredImage.resolveFeaturedImageRef({ workspaceId: post.workspaceId, ref });
    if (!valid.ok) return;
    const asset = await deps.media.featuredImage.findMediaByIdOrSlug({ workspaceId: post.workspaceId, idOrSlug: ref });
    if (!asset || asset.status === "trashed") return;
    media.set(ref, { id: asset.id, width: asset.width, height: asset.height, contentType: null });
  }));
  return resolveCoverImage({ post }, { mediaLookup: ({ ref }) => media.get(ref) ?? null, allowExternalHttps: true });
}

/** Offer a body cover to the existing SEO evaluator below explicit overrides and above defaults.
 * This detached projection is confined to public rendering; stored featuredMediaId stays untouched.
 * A library ref uses the evaluator's existing featured/default chain, including transform misses.
 * External body URLs populate OG only, never Twitter's fallback.
 * @complexity O(s) for the existing SEO JSON; no effects.
 */
export function withCoverSeoDefaults(
  { post, cover }: { post: SeoPostRecord; cover: CoverImage | null },
  _optional: Record<string, never> = {},
): SeoPostRecord {
  if (post.featuredMediaId || !cover) return post;
  if (cover.mediaId) return { ...post, featuredMediaId: cover.mediaId };
  let overrides: Record<string, unknown> = {};
  try {
    const value: unknown = JSON.parse(post.seoExtJson ?? "{}");
    if (typeof value === "object" && value !== null && !Array.isArray(value)) overrides = value as Record<string, unknown>;
  } catch { /* Match the existing SEO evaluator's malformed-JSON fallback. */ }
  return {
    ...post,
    seoExtJson: JSON.stringify({
      ...overrides,
      ogImage: overrides.ogImage || cover.url,
    }),
  };
}
