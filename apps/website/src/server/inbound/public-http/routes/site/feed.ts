import { buildFeed, FEED_PATH, renderRssXml } from "#src/features/seo/index";
import { resolveSiteTitle } from "#src/features/settings/site-title";
import type { SeoRouteRegistrar } from "#src/server/inbound/admin-http/routes/seo/deps";

/** Same header and reasoning as `sitemap.ts`: the body reads no per-request state. */
const CACHE_CONTROL_PUBLIC_PAGE = "public, max-age=60, stale-while-revalidate=300";

/**
 * GET /feed.xml — the public RSS 2.0 feed (`features/seo/feed.ts`). Public and unauthenticated like
 * `sitemap.xml`, and registered with it by `modules/seo.ts`, ahead of the `/:slug` catch-all.
 */
export const registerFeedRoute: SeoRouteRegistrar = (app, deps) => {
  app.get(FEED_PATH, async (_req, res) => {
    try {
      await deps.seoReady;
      const siteTitle = await resolveSiteTitle(
        { settingsRepo: deps.settingsRepo, preservationStore: deps.siteTitlePreservationStore, workspaceRepo: deps.workspaceRepo, siteDisplayName: deps.siteDisplayName },
        { workspaceId: deps.workspaceId }
      );
      const feed = await buildFeed(
        { postRepo: deps.postRepo, settingsRepo: deps.settingsRepo, media: deps, originRegistry: deps.originRegistry },
        { workspaceId: deps.workspaceId, siteTitle }
      );
      res.set("Cache-Control", CACHE_CONTROL_PUBLIC_PAGE).type("application/rss+xml").send(renderRssXml(feed));
    } catch {
      res.status(500).type("text/plain").send("internal error");
    }
  });
};
