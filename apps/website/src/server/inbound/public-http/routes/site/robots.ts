import { buildRobots } from "#src/features/seo/index";
import type { SeoRouteRegistrar } from "#src/server/inbound/admin-http/routes/seo/deps";

/** Owner decision (TM-TOVU-2026-08-12-A request-cost audit, Phase 2 change 2 of 2) — same header,
 *  same reasoning as `pages.ts`'s own `CACHE_CONTROL_PUBLIC_PAGE` (see that file's doc): this route
 *  reads no per-request state beyond `deps`, so the body is identical for every visitor. */
const CACHE_CONTROL_PUBLIC_PAGE = "public, max-age=60, stale-while-revalidate=300";

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
      res.set("Cache-Control", CACHE_CONTROL_PUBLIC_PAGE).type("text/plain").send(lines.join("\n") + (lines.length > 0 ? "\n" : ""));
    } catch {
      res.status(500).type("text/plain").send("internal error");
    }
  });
};
