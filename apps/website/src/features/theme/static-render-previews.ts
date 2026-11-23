import { POST_PREVIEWS_MARKER_TYPE, substituteMarkers, withInnerContent, type EmbedMarker } from "@jini-ai/cms/widgets/markers";
import { extractListingCardTemplate, listingKeyOfAttributes, parseListingBatchSize, renderListingMore, wrapListingItems } from "@jini-ai/cms/listing";
import { escapeHtml } from "@jini-ai/core/text";
import { type StaticFeaturedImage, renderCoverImageTag } from "./static-render-content.js";


/**
 * Post-previews marker (2026-09-03) — a theme/page marker that renders a bounded list of published
 * post previews wherever `{"type":"post-previews"}` appears, so any authored Page can host a post
 * listing (the immediate consumer is a themed `/blog`-style marketing page, but the mechanism is not
 * special-cased to one slug or theme). Follows the SAME "route resolves the I/O, this file only
 * decides how it renders" split {@link injectMenuEmbeds}/{@link scanMenuEmbedIds} already establish
 * for `{"type":"menu"}`.
 */

/** A `{"type":"post-previews"}` marker with no `limit` keeps its legacy 6 (no silent change); a
 *  configured one is clamped by the shared listing rule (`parseListingBatchSize`, ceiling 24, the
 *  same REQ-25 bound `recent-entries.ts` applies), so no config can turn the listing into a scan. */
const LEGACY_POST_PREVIEWS_LIMIT = 6;

/**
 * Minimal render-time shape for one post shown by a `{"type":"post-previews"}` marker — the
 * post-listing counterpart to {@link StaticMenuItem}: the route layer resolves the real, bounded,
 * visibility-filtered `PostRecord[]` (query, ADR-030 §4 gate, public path) and hands this file only
 * what it renders, keeping this module I/O- and domain-free per the file's own header.
 */
export interface StaticPostPreview {
  readonly title: string;
  readonly href: string;
  /** ISO 8601, for `<time datetime>` — `PostRecord` has no `publishedAt` (the unified-content-marker
   *  design doc's own note on why), so this is the go-live time (`publishAt`) when the post has one,
   *  else `updatedAt`, the same field the bounded query orders by (`postDisplayDateIso`). */
  readonly dateIso: string;
  /** Pre-formatted for display (e.g. "Sep 3, 2026") — no date-formatting/locale logic belongs in
   *  this pure render layer, mirroring every other pre-resolved field on this shape. */
  readonly dateLabel: string;
  /** Library cover from the shared public policy; an absent image emits no tag. */
  readonly featuredImage?: StaticFeaturedImage | null;
}

/** One marker's batch size — what the route fetches, what {@link injectPostPreviewsEmbeds} shows,
 *  and a see-more listing's batch size, so they never disagree.
 *  The route scans only the current page: unlike shared menu chrome, post listings are page-scoped,
 *  so pages without a marker must not query posts. Plain markers share one bounded query at the
 *  widest clamped size; each marker slices its own limit. Keyed/paged listings resolve separately. */
export function postPreviewsBatchSize(marker: Pick<EmbedMarker, "config">): number {
  return parseListingBatchSize({ config: marker.config }, { fallback: LEGACY_POST_PREVIEWS_LIMIT });
}

/** `{"type":"post-previews","paged":true}` — a numbered-pages listing (Bug C, 2026-10-22): the route
 *  resolves the requested page (`/page/<n>`, `/blog/page/<n>`) and its nav, so no list stops at one
 *  batch with older posts unreachable from any link. */
export function isPagedPostPreviewsMarker(marker: Pick<EmbedMarker, "config">): boolean {
  return marker.config.paged === true;
}

/** A paged post-previews listing's current page, resolved by the route: its posts and its
 *  already-rendered nav (`''` when there is only one page). */
export interface StaticPostPreviewsPage {
  readonly items: readonly StaticPostPreview[];
  readonly nav: string;
}

/** One see-more listing's rendered batch (`data-jini-see-more`, keyed by `data-jini-listing`): the
 *  items at the requested cursor, plus the next batch URL when more exist. */
export interface StaticListingBatch<T> {
  readonly items: readonly T[];
  readonly nextHref?: string;
}

/** One preview's markup — optional cover, title link and display date, already resolved by the route. */
function renderPostPreviewCard(preview: StaticPostPreview): string {
  return (
    `<article class="post-card">` +
    (preview.featuredImage ? renderCoverImageTag({ image: preview.featuredImage }, { loading: "lazy" }) : "") +
    `<h3><a href="${escapeHtml({ text: preview.href })}">${escapeHtml({ text: preview.title })}</a></h3>` +
    `<div class="post-meta"><time datetime="${escapeHtml({ text: preview.dateIso })}">${escapeHtml({ text: preview.dateLabel })}</time></div>` +
    `</article>`
  );
}

/**
 * Fill every `{"type":"post-previews"}` marker with up to its own (clamped) `limit` of `previews`'
 * leading entries, or leave the marker's authored fallback content completely untouched when there
 * is nothing to show (`previews` empty — mechanism not wired for this page, or zero visible posts —
 * or this marker's own slice comes up empty). Identical "no data ⇒ theme's own fallback survives"
 * contract {@link injectMenuEmbeds} already established for `{"type":"menu"}`: a theme with no
 * published posts yet renders exactly as authored rather than an empty grid.
 *
 * `previews` is already the CALLER's bounded, visibility-filtered, ordered result — see
 * {@link StaticPostPreview}'s own doc. This function only decides how many of it one marker shows
 * and how each one renders; it performs no I/O and applies no visibility rule of its own.
 *
 * A `paged` marker ({@link isPagedPostPreviewsMarker}) renders `page` (the route's requested page and
 * its nav) instead, when the route resolved one; a see-more key on it is then ignored.
 *
 * @complexity O(n) over `html`'s length for the marker scan/splice, plus O(m) over the small, fixed
 * number of post-previews markers a real page carries.
 */
export function injectPostPreviewsEmbeds({ html, previews, batches }: { html: string; previews: readonly StaticPostPreview[]; batches: ReadonlyMap<number, StaticListingBatch<StaticPostPreview>> }, { page }: { page?: StaticPostPreviewsPage } = {}): string {
  return substituteMarkers({ html: html, resolve: (marker) => {
    if (marker.type !== POST_PREVIEWS_MARKER_TYPE) return undefined;
    if (page !== undefined && isPagedPostPreviewsMarker(marker)) return renderPagedPostPreviews({ marker, page });
    const key = listingKeyOfAttributes({ attrs: marker.attrs });
    const batch = key === undefined ? undefined : batches.get(key);
    if (key !== undefined && batch !== undefined) return renderKeyedPostPreviews({ marker, key, batch });
    const slice = previews.slice(0, postPreviewsBatchSize(marker));
    return slice.length === 0 ? undefined : withInnerContent({ marker: marker, inner: slice.map(renderPostPreviewCard).join("") });
  } });
}

/** A see-more listing's batch, or `undefined` (authored fallback) when it is empty. */
function renderKeyedPostPreviews(
  { marker, key, batch }: { marker: EmbedMarker; key: number; batch: StaticListingBatch<StaticPostPreview> },
  _optional: Record<string, never> = {}
): string | undefined {
  if (batch.items.length === 0) return undefined;
  // A theme's client-side card stays in the listing for the see-more script to fill.
  const card = extractListingCardTemplate({ html: marker.inner }) ?? "";
  const inner = card + wrapListingItems({ key, items: batch.items.map(renderPostPreviewCard).join("") });
  return withInnerContent({ marker, inner }) + (batch.nextHref === undefined ? "" : renderListingMore({ key, href: batch.nextHref }));
}

/** A paged listing's current page followed by its nav, or `undefined` (authored fallback, no nav)
 *  when there are no posts at all. */
function renderPagedPostPreviews(
  { marker, page }: { marker: EmbedMarker; page: StaticPostPreviewsPage },
  _optional: Record<string, never> = {}
): string | undefined {
  if (page.items.length === 0) return undefined;
  return withInnerContent({ marker, inner: page.items.map(renderPostPreviewCard).join("") }) + page.nav;
}
