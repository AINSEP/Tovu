import { buildSitemap } from "#src/features/seo/index";
import type { SeoRouteRegistrar } from "../../../admin-http/routes/seo/deps.js";

/** Owner decision (TM-TOVU-2026-08-12-A request-cost audit, Phase 2 change 2 of 2) — same header,
 *  same reasoning as `pages.ts`'s own `CACHE_CONTROL_PUBLIC_PAGE` (see that file's doc): this route
 *  reads no per-request state beyond `deps`, so the body is identical for every visitor. */
const CACHE_CONTROL_PUBLIC_PAGE = "public, max-age=60, stale-while-revalidate=300";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * GET /sitemap.xml — public, unauthenticated (SPEC-008 api.spec.md `SEO_GET_SITEMAP`, REQ-08,
 * tasks.md T046). Registered ahead of the `/:slug` catch-all in `pages.ts`'s registration order.
 */
export const registerSeoSitemapRoute: SeoRouteRegistrar = (app, deps) => {
  app.get("/sitemap.xml", async (_req, res) => {
    try {
      await deps.seoReady;
      const entries = await buildSitemap(
        { postRepo: deps.postRepo, settingsRepo: deps.settingsRepo, media: deps },
        { workspaceId: deps.workspaceId }
      );
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
