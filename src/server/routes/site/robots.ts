import { buildRobots } from "#src/seo/index";
import type { SeoRouteRegistrar } from "../admin/seo/deps";

/**
 * GET /robots.txt — public, unauthenticated (SPEC-008 api.spec.md `SEO_GET_ROBOTS`, REQ-09,
 * tasks.md T046).
 */
export const registerSeoRobotsRoute: SeoRouteRegistrar = (app, deps) => {
  app.get("/robots.txt", async (_req, res) => {
    try {
      await deps.seoReady;
      const policy = await buildRobots({ settingsRepo: deps.settingsRepo }, { workspaceId: deps.workspaceId });
      const lines: string[] = [];
      for (const rule of policy.rules) {
        lines.push(`User-agent: ${rule.userAgent}`);
        for (const path of rule.allow ?? []) lines.push(`Allow: ${path}`);
        for (const path of rule.disallow ?? []) lines.push(`Disallow: ${path}`);
        lines.push("");
      }
      for (const url of policy.sitemapUrls) lines.push(`Sitemap: ${url}`);
      res.type("text/plain").send(lines.join("\n") + (lines.length > 0 ? "\n" : ""));
    } catch {
      res.status(500).type("text/plain").send("internal error");
    }
  });
};
