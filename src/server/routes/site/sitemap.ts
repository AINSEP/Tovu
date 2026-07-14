import { buildSitemap } from "../../../seo";
import type { RouteRegistrar } from "../types";

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
export const registerSeoSitemapRoute: RouteRegistrar = (app, deps) => {
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
      res.type("text/xml").send(body);
    } catch {
      res.status(500).type("text/plain").send("internal error");
    }
  });
};
