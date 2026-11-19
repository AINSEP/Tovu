import { reportServerFailure } from "#src/server/inbound/shared/admin-failure";
import { seoForRequest } from "../../http/site/seo-render-context.js";
import { serializeSitemapXml } from "@jini-ai/cms/seo";
import type { SeoRouteRegistrar } from "#src/server/inbound/admin-http/routes/seo/deps";

/** Owner decision (TM-TOVU-2026-08-12-A request-cost audit, Phase 2 change 2 of 2) — same header,
 *  same reasoning as `pages.ts`'s own `CACHE_CONTROL_PUBLIC_PAGE` (see that file's doc): this route
 *  uses the serving origin, so a cache must retain the request authority in its key. */
const CACHE_CONTROL_PUBLIC_PAGE = "public, max-age=60, stale-while-revalidate=300";

/**
 * GET /sitemap.xml — public, unauthenticated (SPEC-008 api.spec.md `SEO_GET_SITEMAP`, REQ-08,
 * tasks.md T046). Registered ahead of the `/:slug` catch-all in `pages.ts`'s registration order.
 */
export const registerSeoSitemapRoute: SeoRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.get("/sitemap.xml", async (req, res) => {
    try {
      await deps.seoReady;
      const seoDeps = seoForRequest({ req, deps: deps.seoDeps });
      const entries = await deps.sitemapService.buildSitemap({ workspaceId: deps.workspaceId }, { renderBaseUrl: seoDeps.renderBaseUrl });
      const body = serializeSitemapXml({ entries });
      res.set("Cache-Control", CACHE_CONTROL_PUBLIC_PAGE).type("text/xml").send(body);
    } catch (error) {
      const { errorId } = reportServerFailure({ error, operation: "public:sitemap" }, { tracker: res.locals.adminFailureTracker });
      res.status(500).type("text/plain").send(`The site couldn’t load the sitemap. Reload this page and report this error ID if it keeps happening. Error ID: ${errorId}`);
    }
  });
};
