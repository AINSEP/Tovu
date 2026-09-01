import { registerAdminSeoGetEntryRoute } from "#src/server/inbound/admin-http/routes/seo/get-entry";
import { registerAdminSeoPutEntryRoute } from "#src/server/inbound/admin-http/routes/seo/put-entry";
import { registerAdminSeoGetEntryAnalyzeRoute } from "#src/server/inbound/admin-http/routes/seo/get-entry-analyze";
import { registerAdminSeoGetSettingsRoute } from "#src/server/inbound/admin-http/routes/seo/get-settings";
import { registerAdminSeoPutSettingsRoute } from "#src/server/inbound/admin-http/routes/seo/put-settings";
import { registerAdminSeoPostSitemapRegenerateRoute } from "#src/server/inbound/admin-http/routes/seo/post-sitemap-regenerate";
import { registerSeoSitemapRoute } from "#src/server/inbound/public-http/routes/site/sitemap";
import { registerSeoRobotsRoute } from "#src/server/inbound/public-http/routes/site/robots";
import { registerLlmsTxtRoute } from "#src/server/inbound/public-http/routes/site/llms";
import type { SeoRouteDeps } from "#src/server/inbound/admin-http/routes/seo/deps";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file ADR-046 Phase 3 (SPEC-042, final slice) — the `seo` server module (SPEC-008 SEO).
 *
 * Owns all 9 registrations: 6 admin routes (`get-entry`/`put-entry`/`get-entry-analyze`/
 * `get-settings`/`put-settings`/`post-sitemap-regenerate`) plus 3 public, unauthenticated site
 * routes (`GET /sitemap.xml`, `GET /robots.txt`, `GET /llms.txt`) that live outside
 * `routes/admin/seo/` — mirrors `media.ts`'s precedent of bundling a public route into an
 * otherwise-admin module. The first 8 were moved here verbatim from `app.ts`'s `createApp()`,
 * same registrar function bodies, no behavior change, same relative order; `registerLlmsTxtRoute`
 * (`llms.ts`, ai-first-docs-checklist "Do now" item 1) joined them 2026-08-31.
 *
 * CRITICAL ORDERING REQUIREMENT (verified, per SPEC-042 REQ-06): the public routes
 * (`registerSeoSitemapRoute`/`registerSeoRobotsRoute`/`registerLlmsTxtRoute`) MUST still register
 * before the site's `GET /:slug` catch-all (`registerSiteRoutes`, `routes/site/pages.ts`). This
 * module's call site in `app.ts` sits at the exact same position the 8 SEO registrations
 * previously occupied — well before `registerSiteRoutes`'s call — so this ordering constraint is
 * preserved unchanged. `src/server/__tests__/unit/route-class-precedence.unit.test.ts`
 * structurally asserts this against the real Express router stack and was re-run green after this
 * move (see SPEC-042 handoff for the exact evidence); `llms.txt`'s own fixed path is a new
 * "well-known" leaf with no `:slug` overlap risk of its own.
 */
export function createSeoModule(deps: SeoRouteDeps): ServerModuleHandle {
  return {
    name: "seo",
    registerRoutes: (app) => {
      registerAdminSeoGetEntryRoute(app, deps);
      registerAdminSeoPutEntryRoute(app, deps);
      registerAdminSeoGetEntryAnalyzeRoute(app, deps);
      registerAdminSeoGetSettingsRoute(app, deps);
      registerAdminSeoPutSettingsRoute(app, deps);
      registerAdminSeoPostSitemapRegenerateRoute(app, deps);
      registerSeoSitemapRoute(app, deps);
      registerSeoRobotsRoute(app, deps);
      registerLlmsTxtRoute(app, deps);
    },
  };
}
