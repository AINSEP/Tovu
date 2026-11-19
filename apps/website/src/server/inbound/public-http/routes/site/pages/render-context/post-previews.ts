import type { PublicPostRecord as PostRecord } from "#src/features/post/contracts";
import { listPublishedPostPreviews } from "#src/features/post/post-read";
import type { MemberContext, MemberAccessResolver } from "#src/features/members/index";
// Keep request rendering separate from theme installation, imports, and agent tools.
import { postPreviewsBatchSize, isPagedPostPreviewsMarker, type StaticPostPreview, type StaticListingBatch, type StaticPostPreviewsPage } from "#src/features/theme/static-render-previews";
import { markersOfType, POST_PREVIEWS_MARKER_TYPE, type EmbedMarker } from "@jini-ai/cms/widgets/markers";
import { extractListingCardTemplate, listingBatchPath, listingKeyOfAttributes, readListingBatch, readListingPage, renderListingPageNav, type ListingSource } from "@jini-ai/cms/listing";
import { postDisplayDateIso } from "#src/contracts/core/scheduled-publish";
import { formatDateLabel, resolveSiteTimeZoneSafely } from "@jini-ai/cms/widgets/date-label";
import { postPublicPath } from "#src/platform/routing/index";
import { featuredImageView } from "../../../../http/site/render/template-render-data.js";
import type { RouteDeps } from "#src/server/routes/types";
import type { TemplateRenderDeps } from "./deps.js";
import { siteTimeZoneDep } from "./site-title.js";
import { type KeyedPostPreviewBatch, storeListingJsonPage, ListingBatchNotFoundError } from "../listing/listing-state.js";
import { decidePostMemberAccess } from "./member-access.js";
import { resolveMediaTransformVersionsForRender, resolveMediaAssetMetadataForRender } from "./media-metadata.js";

/** Pure display formatting for a post-previews card's date — the one place this file turns
 *  the post's display date ({@link postDisplayDateIso}: `publishAt` when set, else `updatedAt`) into
 *  the short label a card shows (e.g. "Sep 3, 2026"). `PostRecord` has no `publishedAt` (see
 *  `static-render.ts`'s `StaticPostPreview.dateIso` doc for why). A malformed timestamp —
 *  should not occur for a real stored row — degrades to the raw ISO string rather than
 *  "Invalid Date", a legible if ugly output over a broken one. Bug D: the day is the site's
 *  (`timeZone`, from `core.site.timezone`), not the server's UTC. */
export function formatPostPreviewDate({ iso, timeZone }: { iso: string; timeZone: string }, _optional = {}): string {
  return formatDateLabel({ iso }, { timeZone });
}

/**
 * Post-previews marker resolution (2026-09-03) — resolves the bounded, ADR-030 §4
 * visibility-filtered {@link StaticPostPreview}s a `{"type":"post-previews"}` marker in `pageHtml`
 * needs, or `undefined` when `pageHtml` carries no such marker at all (the "pay for the query only
 * when present" gate — REQ 2 of the post-previews marker's own spec). A `data-jini-see-more` marker
 * also gets its next batch URL (`<pagePath>/_more/<key>/<after>`) while more posts remain.
 *
 * Applies the SAME member-access rule (`decidePostMemberAccess`, as `isVisible` of
 * `readListingBatch`, so hidden rows are skipped before a batch is filled) the
 * `filterVisiblePosts` gate on the home/related-posts listing already applies to
 * `posts` — see that function's own doc for why gating only SOME listings is protection that looks
 * real and isn't (ADR-030 §4); this listing gets no exception. `kind: "post"` and
 * `status: "published"` are already enforced by the bounded repo query itself
 * (`listPublishedPostPreviews` -> `PostRepoPort.listPublishedPreviews`), so a Page — including
 * whichever one claims the reserved `/` root slug — can never appear in this listing by
 * construction; not re-checked here.
 *
 * @complexity At most 4 bounded `listPublishedPreviews` reads per batch (one batch for the plain
 * markers at their widest limit, one per see-more marker), each `size + 1` rows. Cover
 * selection scans those visible bodies and resolves distinct media refs with one MIME batch;
 * it never adds an unbounded post query or resolves hidden posts' cover metadata.
 */
export async function resolvePostPreviewsForRender({ deps, memberAccessResolver, memberContext, pageHtml, pagePath }: { deps: Pick<RouteDeps, "workspaceId" | "postRepo" | "mediaRepo" | "mediaContentTypeStore" | "transformDefinitionRepo" | "entryTermReadRepo"> & Pick<TemplateRenderDeps, "listingBatch" | "listingPage">; memberAccessResolver: MemberAccessResolver; memberContext: MemberContext; pageHtml: string; pagePath: string }, _optional = {}): Promise<{ previews: readonly StaticPostPreview[]; batches: ReadonlyMap<number, StaticListingBatch<StaticPostPreview>>; page?: StaticPostPreviewsPage } | undefined> {
  const markers = markersOfType({ html: pageHtml, type: POST_PREVIEWS_MARKER_TYPE });
  if (markers.length === 0) return undefined;

  const source: ListingSource<PostRecord> = async ({ offset, limit }) =>
    (await listPublishedPostPreviews({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId, limit, offset } })).posts;
  const isVisible = (post: PostRecord): boolean => decidePostMemberAccess({ resolver: memberAccessResolver, post, context: memberContext }).allowed;

  // Plain markers share one batch at the widest limit (each slices its own); a see-more marker
  // (`data-jini-listing`) reads its own batch, from `after` when this request asks for that key. A
  // listing with a `<template data-jini-card>` loads its next batches as JSON (`.json` batch URLs).
  const plainLimit = widestPlainPostPreviewsLimit(markers);
  const plain = plainLimit > 0 ? (await readListingBatch({ source, after: 0, size: plainLimit }, { isVisible })).items : [];
  const keyed = await readKeyedPostPreviewBatches({ deps, markers, source, isVisible, pagePath });
  const paged = await readPagedPostPreviews({ deps, markers, source, isVisible, pagePath });

  const listed = [...plain, ...[...keyed.values()].flatMap((batch) => batch.posts), ...(paged?.posts ?? [])];
  const [mediaAssetMetadata, mediaTransformVersions] = await Promise.all([
    resolveMediaAssetMetadataForRender({ deps, post: undefined }, { listed }),
    resolveMediaTransformVersionsForRender(deps),
  ]);
  // Bug D: card dates are the site's calendar day. `deps` is the full route deps at runtime; its
  // narrowed type simply does not name the optional `siteTimeZone`.
  const timeZone = await resolveSiteTimeZoneSafely({ workspaceId: deps.workspaceId }, siteTimeZoneDep(deps));
  const toPreview = (post: PostRecord): StaticPostPreview => {
    const dateIso = postDisplayDateIso(post);
    return { title: post.title, href: postPublicPath({ slug: post.slug }), dateIso, dateLabel: formatPostPreviewDate({ iso: dateIso, timeZone }), featuredImage: featuredImageView({ ctx: { mediaAssetMetadata, mediaTransformVersions }, post }) };
  };
  const batches = new Map<number, StaticListingBatch<StaticPostPreview>>();
  for (const [key, batch] of keyed) batches.set(key, { items: batch.posts.map(toPreview), ...(batch.nextHref !== undefined ? { nextHref: batch.nextHref } : {}) });
  await storeListingJsonPage({ deps, keyed, toPreview });
  const page = paged && { items: paged.posts.map(toPreview), nav: paged.nav };
  return { previews: plain.map(toPreview), batches, ...(page ? { page } : {}) };
}

/**
 * Bug C (2026-10-22) — the requested page (`deps.listingPage`, else 1) of a page's `paged`
 * post-previews listing, sized by the first paged marker, with its rendered prev/next nav; every
 * paged marker on the page shows this one page. `undefined` when the page carries no paged marker.
 * A page past the last throws {@link ListingBatchNotFoundError}, answered as the ordinary 404.
 * @complexity One visible-count scan of the published posts (`readListingPage`).
 */
async function readPagedPostPreviews({ deps, markers, source, isVisible, pagePath }: {
  deps: Pick<TemplateRenderDeps, "listingPage">;
  markers: readonly EmbedMarker[];
  source: ListingSource<PostRecord>;
  isVisible: (post: PostRecord) => boolean;
  pagePath: string;
}): Promise<{ posts: readonly PostRecord[]; nav: string } | undefined> {
  const marker = markers.find(isPagedPostPreviewsMarker);
  if (marker === undefined) return undefined;
  const page = await readListingPage({ source, page: deps.listingPage ?? 1, pageSize: postPreviewsBatchSize(marker) }, { isVisible, pagePath });
  if (page === undefined) throw new ListingBatchNotFoundError();
  return { posts: page.items, nav: renderListingPageNav({ page }) };
}

/** The widest batch size among plain (non-see-more, non-paged) post-previews markers; `0` when every
 *  marker is a see-more or paged listing. @complexity O(m) over markers. */
function widestPlainPostPreviewsLimit(markers: readonly EmbedMarker[]): number {
  return markers.reduce((widest, marker) => (isPlainPostPreviewsMarker(marker) ? Math.max(widest, postPreviewsBatchSize(marker)) : widest), 0);
}

/** Neither a see-more listing nor a paged one: renders a slice of the shared plain batch. @complexity O(attrs). */
function isPlainPostPreviewsMarker(marker: EmbedMarker): boolean {
  return listingKeyOfAttributes({ attrs: marker.attrs }) === undefined && !isPagedPostPreviewsMarker(marker);
}

/** Reads each distinct see-more listing's batch (first marker per key wins), in marker order.
 *  @complexity One bounded batch read per distinct listing key. */
async function readKeyedPostPreviewBatches({ deps, markers, source, isVisible, pagePath }: {
  deps: Pick<TemplateRenderDeps, "listingBatch">;
  markers: readonly EmbedMarker[];
  source: ListingSource<PostRecord>;
  isVisible: (post: PostRecord) => boolean;
  pagePath: string;
}): Promise<Map<number, KeyedPostPreviewBatch>> {
  const keyed = new Map<number, KeyedPostPreviewBatch>();
  for (const marker of markers) {
    const key = listingKeyOfAttributes({ attrs: marker.attrs });
    if (key === undefined || keyed.has(key)) continue;
    const after = deps.listingBatch?.key === key ? deps.listingBatch.after : 0;
    const batch = await readListingBatch({ source, after, size: postPreviewsBatchSize(marker) }, { isVisible });
    keyed.set(key, toKeyedPostPreviewBatch({ batch, marker, key, pagePath }));
  }
  return keyed;
}

/** A read batch plus its next-batch URL (`.json` when the listing carries a card template). */
function toKeyedPostPreviewBatch({ batch, marker, key, pagePath }: {
  batch: { items: readonly PostRecord[]; hasMore: boolean; next: number };
  marker: EmbedMarker;
  key: number;
  pagePath: string;
}): KeyedPostPreviewBatch {
  if (!batch.hasMore) return { posts: batch.items, next: null };
  const format = extractListingCardTemplate({ html: marker.inner }) === undefined ? {} : { format: "json" as const };
  return { posts: batch.items, next: batch.next, nextHref: listingBatchPath({ pagePath, key, after: batch.next, ...format }) };
}
