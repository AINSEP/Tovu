import type { NextFunction, Request, Response } from "express";
import { parseListingBatchPath, parseListingPagePath } from "@jini-ai/cms/listing";
import type { RouteRegistrar } from "#src/server/routes/types";
import { recordListingBatchRequest, recordListingPageRequest, listingPageRequestOf } from "../listing/listing-state.js";
import { tryRedirectPhase } from "../redirect-phase.js";

/** Points a listing URL's request at its page (keeping any query) so the `/` and `/:slug` handlers
 *  render it through every one of their branches unchanged (Express 4 re-matches the rewritten `req.url`). */
function rewriteToListingPage({ req, pagePath }: { req: Request; pagePath: string }, _optional: Record<string, never> = {}): void {
  const queryStart = req.url.indexOf("?");
  req.url = pagePath + (queryStart === -1 ? "" : req.url.slice(queryStart));
}

/** A batch request whose page has no such listing: restore the batch URL and fall through to the 404.
 *  A numbered page first consults its own not-found redirect rules, which the nested-path redirect
 *  fallback never saw because the rewrite had already claimed the request (A-1, 2026-10-22); a
 *  failing lookup goes to Express's error handling, as that fallback's does. */
export async function listingBatchNotFound({ req, res, next, workspaceId }: {
  req: Request; res: Response; next: NextFunction; workspaceId: string;
}, _optional: Record<string, never> = {}): Promise<void> {
  const numberedPage = listingPageRequestOf({ req }) !== undefined;
  req.url = req.originalUrl;
  try {
    if (numberedPage && (await tryRedirectPhase({ phase: "post_content", path: req.path, workspaceId, res }))) return undefined;
  } catch (err) {
    return next(err);
  }
  next();
  return undefined;
}

/** The two listing rewrites, `/_more/…` then `/page/<n>`: they run before every page route. */
export const registerListingRewrites: RouteRegistrar = ({ app }, _options = {}) => {
  // See-more batch URLs (`<page>/_more/<key>/<after>`): rewrite to the page itself so the `/` and
  // `/:slug` handlers below render it through every one of their branches unchanged (Express 4
  // re-matches the rewritten `req.url`); `finalizePublicPageHtml` then cuts out the one batch.
  app.get(/\/_more\/[^/]+\/[^/]+\/?$/, (req, _res, next) => {
    const listingBatch = parseListingBatchPath({ path: req.path });
    if (listingBatch === undefined) return next();
    recordListingBatchRequest({ req, listingBatch });
    rewriteToListingPage({ req, pagePath: listingBatch.pagePath });
    next();
    return undefined;
  });

  // Numbered listing pages (`<page>/page/<n>`, Bug C): the same rewrite to the page itself; a
  // `paged` post-previews listing then renders page `n`, and a page without one answers 404.
  app.get(/\/page\/[^/]+\/?$/, (req, _res, next) => {
    const listingPage = parseListingPagePath({ path: req.path });
    if (listingPage === undefined) return next();
    recordListingPageRequest({ req, listingPage });
    rewriteToListingPage({ req, pagePath: listingPage.pagePath });
    next();
    return undefined;
  });
};
