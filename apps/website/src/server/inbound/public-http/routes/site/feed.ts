import { reportServerFailure } from "#src/server/inbound/shared/admin-failure";
import { seoForRequest } from "../../http/site/seo-render-context.js";
import { buildFeed, FEED_PATH, renderRssXml } from "@jini-ai/cms/seo";
import { resolveSiteTitle } from "#src/features/settings/index";
import type { SeoRouteRegistrar } from "#src/server/runtime/composition/modules/seo";

/** Same header and reasoning as `sitemap.ts`: the response uses the request authority. */
const CACHE_CONTROL_PUBLIC_PAGE = "public, max-age=60, stale-while-revalidate=300";

/**
 * GET /feed.xml — the public RSS 2.0 feed (`Jini/packages/cms/src/seo/feed.ts`). Public and unauthenticated like
 * `sitemap.xml`, and registered with it by `modules/seo.ts`, ahead of the `/:slug` catch-all.
 */
export const registerFeedRoute: SeoRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.get(FEED_PATH, async (req, res) => {
    try {
      await deps.seoReady;
      const seoDeps = seoForRequest({ req, deps: deps.seoDeps });
      const siteTitle = await resolveSiteTitle(
        { settingsRepo: deps.settingsRepo, preservationStore: deps.siteTitlePreservationStore, workspaceRepo: deps.workspaceRepo, siteDisplayName: deps.siteDisplayName },
        { workspaceId: deps.workspaceId }
      );
      const feed = await buildFeed({
        deps: seoDeps,
        input: { workspaceId: deps.workspaceId, siteTitle },
      }, {});
      res.set("Cache-Control", CACHE_CONTROL_PUBLIC_PAGE).type("application/rss+xml").send(renderRssXml({ feed }, {}));
    } catch (error) {
      const { errorId } = reportServerFailure({ error, operation: "public:feed" }, { tracker: res.locals.adminFailureTracker });
      res.status(500).type("text/plain").send(`The site couldn’t load the feed. Reload this page and report this error ID if it keeps happening. Error ID: ${errorId}`);
    }
  });
};
