import type { Request } from "express";
import type { PublicPostRecord as PostRecord } from "#src/features/post/contracts";
import type { StaticPostPreview, StaticFeaturedImage } from "#src/features/theme/static-render";
import { extractListingBatch, renderListingBatchDocument, type ListingBatchRequest, type ListingPageRequest, type ListingJsonPage } from "@jini-ai/cms/listing";
import { postAuthorForDisplay } from "#src/contracts/core/post-author";
import { extractPlainTextFromHtml } from "#src/features/post/rendering";
import { deriveExcerpt } from "@jini-ai/cms/seo";
import type { AssignedTermView } from "@jini-ai/cms/taxonomy";
import type { RouteDeps } from "#src/server/routes/types";
import type { TemplateRenderDeps } from "../render-context/deps.js";
import { resolveAssignedTermsForRender } from "../render-context/taxonomy.js";

/** One see-more listing's visible posts, the cursor of its next batch (`null` when none), and that
 *  batch's URL. */
export interface KeyedPostPreviewBatch { posts: readonly PostRecord[]; next: number | null; nextHref?: string }

/** For a `.json` see-more request, records that listing's batch as JSON items for
 *  `finalizePublicPageHtml` to send; a no-op for every other request. */
export async function storeListingJsonPage({ deps, keyed, toPreview }: {
  deps: Pick<RouteDeps, "workspaceId" | "entryTermReadRepo"> & Pick<TemplateRenderDeps, "listingBatch">;
  keyed: ReadonlyMap<number, KeyedPostPreviewBatch>;
  toPreview: (post: PostRecord) => StaticPostPreview;
}): Promise<void> {
  const jsonRequest = deps.listingBatch?.format === "json" ? deps.listingBatch : undefined;
  const jsonBatch = jsonRequest && keyed.get(jsonRequest.key);
  if (!jsonRequest || !jsonBatch) return;
  const items = await Promise.all(jsonBatch.posts.map(async (post) => toListingJsonItem({ post, preview: toPreview(post), terms: await resolveAssignedTermsForRender(deps, post) })));
  listingJsonPages.set(jsonRequest, { items, nextCursor: jsonBatch.next });
}

/** One post as a see-more JSON batch item: public fields only, the same ones its card shows plus the
 *  excerpt, term names and a byline the post shows. */
interface ListingJsonItem {
  readonly title: string;
  readonly href: string;
  readonly date: string;
  readonly dateLabel: string;
  readonly excerpt?: string;
  readonly cover: StaticFeaturedImage | null;
  readonly terms: readonly string[];
  readonly author?: string;
}

function toListingJsonItem(
  { post, preview, terms }: { post: PostRecord; preview: StaticPostPreview; terms: readonly AssignedTermView[] },
  _optional: Record<string, never> = {}
): ListingJsonItem {
  const excerpt = deriveExcerpt({ post, postRepo: { extractPlainText: ({ html }) => extractPlainTextFromHtml({ html }) } });
  const author = postAuthorForDisplay({ post });
  return {
    title: preview.title,
    href: preview.href,
    date: preview.dateIso,
    dateLabel: preview.dateLabel,
    ...(excerpt !== undefined ? { excerpt } : {}),
    cover: preview.featuredImage ?? null,
    terms: terms.map((term) => term.termName),
    ...(author !== null ? { author } : {}),
  };
}

/** The body for a see-more batch request, or undefined when this is an ordinary page request.
 * @throws ListingBatchNotFoundError when the requested batch is not on this page.
 */
export function listingBatchBody({ req, html }: { req: Request; html: string }, _optional: Record<string, never> = {}): string | undefined {
  // A see-more batch URL answers with just that listing's next items, not the page around them.
  const listingBatch = listingBatchRequests.get(req);
  if (listingBatch?.format === "json") {
    const page = listingJsonPages.get(listingBatch);
    if (page === undefined) throw new ListingBatchNotFoundError();
    // Every caller has already typed the response as html; the JSON form answers as JSON.
    req.res?.type("json");
    return JSON.stringify(page);
  }
  if (listingBatch !== undefined) {
    const batch = extractListingBatch({ html, key: listingBatch.key });
    if (batch === undefined) throw new ListingBatchNotFoundError();
    return renderListingBatchDocument({ key: listingBatch.key, ...batch });
  }
  return undefined;
}

/** See-more batch requests by request, set by the `/_more/` rewrite in {@link registerSiteRoutes}. */
const listingBatchRequests = new WeakMap<Request, ListingBatchRequest>();

/** A `.json` batch request's page, recorded by the post-previews resolver for that request's key. */
const listingJsonPages = new WeakMap<ListingBatchRequest, ListingJsonPage<ListingJsonItem>>();

/** Numbered listing page requests by request, set by the `/page/<n>` rewrite in {@link registerSiteRoutes}.
 *  `requestPath` is the path as requested, before the rewrite pointed `req.url` at its page. */
const listingPageRequests = new WeakMap<Request, ListingPageRequest & { requestPath: string }>();

/** Records `req` as a see-more batch request (the `/_more/` rewrite). */
export function recordListingBatchRequest({ req, listingBatch }: { req: Request; listingBatch: ListingBatchRequest }, _optional: Record<string, never> = {}): void {
  listingBatchRequests.set(req, listingBatch);
}

/** The see-more batch request recorded for `req`, if any. */
export function listingBatchRequestOf({ req }: { req: Request }, _optional: Record<string, never> = {}): ListingBatchRequest | undefined {
  return listingBatchRequests.get(req);
}

/** Records `req` as a numbered listing page request, with the path as requested (the `/page/<n>` rewrite). */
export function recordListingPageRequest({ req, listingPage }: { req: Request; listingPage: ListingPageRequest }, _optional: Record<string, never> = {}): void {
  listingPageRequests.set(req, { ...listingPage, requestPath: req.path });
}

/** The numbered listing page request recorded for `req`, if any. */
export function listingPageRequestOf({ req }: { req: Request }, _optional: Record<string, never> = {}): (ListingPageRequest & { requestPath: string }) | undefined {
  return listingPageRequests.get(req);
}

/** The page behind a batch URL has no see-more listing with that key, or the page behind a
 *  `/page/<n>` URL has no paged listing reaching page `n`: answered as a 404. */
export class ListingBatchNotFoundError extends Error {}

/** A `/page/<n>` request whose page rendered no paged listing nav (n ≥ 2 always has one) would
 *  otherwise answer as a duplicate of the page itself: it is a 404 instead. @complexity O(html). */
export function assertListingPageServed({ req, html }: { req: Request; html: string }, _optional: Record<string, never> = {}): void {
  if (listingPageRequests.has(req) && !html.includes('class="jini-pagination"')) throw new ListingBatchNotFoundError();
}
