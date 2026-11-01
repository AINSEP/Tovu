import { seoForRequest } from "../../http/site/seo-render-context.js";
import { escapeXml } from "#src/platform/html/escape";
import type { SeoRouteRegistrar } from "#src/server/inbound/admin-http/routes/seo/deps";

/** Owner decision (TM-TOVU-2026-08-12-A request-cost audit, Phase 2 change 2 of 2) — same header,
 *  same reasoning as `pages.ts`'s own `CACHE_CONTROL_PUBLIC_PAGE` (see that file's doc): this route
 *  uses the serving origin, so a cache must retain the request authority in its key. */
const CACHE_CONTROL_PUBLIC_PAGE = "public, max-age=60, stale-while-revalidate=300";

/**
 * GET /sitemap.xml — public, unauthenticated (SPEC-008 api.spec.md `SEO_GET_SITEMAP`, REQ-08,
 * tasks.md T046). Registered ahead of the `/:slug` catch-all in `pages.ts`'s registration order.
 */
export const registerSeoSitemapRoute: SeoRouteRegistrar = (app, deps) => {
  app.get("/sitemap.xml", async (req, res) => {
    try {
      await deps.seoReady;
      const seoDeps = seoForRequest({ req, deps: deps.seoDeps });
      const entries = await deps.sitemapService.buildSitemap({ workspaceId: deps.workspaceId }, { renderBaseUrl: seoDeps.renderBaseUrl });
      const body =
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        entries
          .map((e) => {
            const lastmod = e.lastmod ? `<lastmod>${escapeXml(e.lastmod)}</lastmod>` : "";
            return `  <url><loc>${escapeXml(e.loc)}</loc>${lastmod}</url>`;
          })
          .join("\n") +
        (entries.length > 0 ? "\n" : "") +
        `</urlset>\n`;
      res.set("Cache-Control", CACHE_CONTROL_PUBLIC_PAGE).type("text/xml").send(body);
    } catch {
      res.status(500).type("text/plain").send("internal error");
    }
  });
};
