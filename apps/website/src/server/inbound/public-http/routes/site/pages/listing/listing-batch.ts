import { seoForRequest } from "../../../../http/site/seo-render-context.js";
import type { Request } from "express";
import type { RouteDeps } from "#src/server/routes/types";
import type { TemplateRenderDeps } from "../render-context/deps.js";
import { listingBatchRequestOf, listingPageRequestOf } from "./listing-state.js";
import { isStaticExportRequest } from "../request-policy.js";

/** One port/stylesheet collector per request, including nested template renders. */
function pluginExportSession({ deps, req }: { deps: RouteDeps; req: Request }, _options = {}) {
  const mode = typeof req.header === "function" && isStaticExportRequest(req) ? "static" : "live";
  return deps.pluginExports?.forRender({ mode });
}

/** `deps` for this request, carrying its see-more batch request (if any) down to the listing render. */
export function withListingBatch<T extends RouteDeps>(deps: T, req: Request): T & Pick<TemplateRenderDeps, "listingBatch" | "listingPage"> {
  deps = { ...deps, seoDeps: seoForRequest({ req, deps: deps.seoDeps }) };
  const listingBatch = listingBatchRequestOf({ req });
  const listingPage = listingPageRequestOf({ req })?.page;
  const pluginExportRender = pluginExportSession({ deps, req });
  const declaredScripts: import('@jini-ai/cookie-consent').DeclaredScript[] = [];
  const renderAssets = req.res?.locals?.siteConsentAssets as RouteDeps['documentAssets'];
  const documentAssets: RouteDeps['documentAssets'] = renderAssets ? ({ scripts, ...options }) => renderAssets({ scripts: [...scripts, ...declaredScripts], ...options }) : undefined;
  const commentsCursor = typeof req.query?.commentCursor === 'string' ? req.query.commentCursor : undefined;
  // A static export/static-publish has no `/api/site/comments` to post to, and a snapshot would keep a
  // comment public after it is trashed: like the assistant bubble, it ships an empty comments surface.
  // (`req.header` is absent only on the route tests' direct handler calls.)
  if (typeof req.header === 'function' && isStaticExportRequest(req)) return { ...deps, pluginExportRender, listingBatch, listingPage, commentsCursor, declaredScripts, documentAssets, commentsProviders: undefined };
  return { ...deps, pluginExportRender, listingBatch, listingPage, commentsCursor, declaredScripts, documentAssets };
}
