import { registerAdminSeoGetEntryRoute } from "../../../inbound/admin-http/routes/seo/get-entry.js";
import { registerAdminSeoPutEntryRoute } from "../../../inbound/admin-http/routes/seo/put-entry.js";
import { registerAdminSeoGetEntryAnalyzeRoute } from "../../../inbound/admin-http/routes/seo/get-entry-analyze.js";
import { registerAdminSeoGetSettingsRoute } from "../../../inbound/admin-http/routes/seo/get-settings.js";
import { registerAdminSeoPutSettingsRoute } from "../../../inbound/admin-http/routes/seo/put-settings.js";
import { registerAdminSeoPostSitemapRegenerateRoute } from "../../../inbound/admin-http/routes/seo/post-sitemap-regenerate.js";
import { registerSeoSitemapRoute } from "../../../routes/site/sitemap.js";
import { registerSeoRobotsRoute } from "../../../routes/site/robots.js";
import type { SeoRouteDeps } from "../../../inbound/admin-http/routes/seo/deps.js";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file ADR-046 Phase 3 (SPEC-042, final slice) — the `seo` server module (SPEC-008 SEO).
 *
 * Owns all 8 registrations: 6 admin routes (`get-entry`/`put-entry`/`get-entry-analyze`/
 * `get-settings`/`put-settings`/`post-sitemap-regenerate`) plus 2 public, unauthenticated site
 * routes (`GET /sitemap.xml`, `GET /robots.txt`) that live outside `routes/admin/seo/` — mirrors
 * `media.ts`'s precedent of bundling a public route into an otherwise-admin module. Moved here
 * verbatim from `app.ts`'s `createApp()`, same registrar function bodies, no behavior change,
 * same relative order.
 *
 * CRITICAL ORDERING REQUIREMENT (verified, per SPEC-042 REQ-06): the 2 public routes
 * (`registerSeoSitemapRoute`/`registerSeoRobotsRoute`) MUST still register before the site's
 * `GET /:slug` catch-all (`registerSiteRoutes`, `routes/site/pages.ts`). This module's call site
 * in `app.ts` sits at the exact same position the 8 SEO registrations previously occupied — well
 * before `registerSiteRoutes`'s call — so this ordering constraint is preserved unchanged.
 * `src/server/__tests__/unit/route-class-precedence.unit.test.ts` structurally asserts this
 * against the real Express router stack and was re-run green after this move (see SPEC-042
 * handoff for the exact evidence).
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
    },
  };
}
