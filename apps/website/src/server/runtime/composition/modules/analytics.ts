import type { AdminAnalyticsRecentHitsDeps } from "#src/server/inbound/admin-http/routes/analytics/recent-hits";
import { registerAdminAnalyticsRecentHitsRoute } from "#src/server/inbound/admin-http/routes/analytics/recent-hits";
import type { RouteRegistration, ServerModuleHandle } from "./types.js";

/**
 * @file ADR-046 Phase 3 (SPEC-041) — the `analytics` server module (ADR-035/ADR-PIPE-014 admin
 * "recent hits" read route).
 *
 * `AdminAnalyticsRecentHitsDeps` is reused as-is from its existing narrow location,
 * `routes/admin/analytics/recent-hits.ts` — not redefined here. Owns the single registration
 * (`registerAdminAnalyticsRecentHitsRoute`), moved here verbatim from `app.ts`'s `createApp()`,
 * same registrar function body, no behavior change.
 */
export function createAnalyticsModule(deps: AdminAnalyticsRecentHitsDeps): ServerModuleHandle<RouteRegistration> {
  return {
    name: "analytics",
    registerRoutes: ({ errors, app }, _options = {}) => {
      registerAdminAnalyticsRecentHitsRoute({ errors, app, deps });
    },
  };
}
