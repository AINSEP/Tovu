import { registerAdminRedirectCreateRoute } from "../routes/admin/redirects/create";
import { registerAdminRedirectGetRoute } from "../routes/admin/redirects/get-by-id";
import { registerAdminRedirectHitsRoute } from "../routes/admin/redirects/hits";
import { registerAdminRedirectImportRoute } from "../routes/admin/redirects/import";
import { registerAdminRedirectListRoute } from "../routes/admin/redirects/list";
import { registerAdminRedirectTombstoneRoute } from "../routes/admin/redirects/tombstone";
import { registerAdminRedirectUpdateRoute } from "../routes/admin/redirects/update";
import type { RedirectRouteDeps } from "../http/admin/redirects";
import type { ServerModuleHandle } from "./types";

/**
 * @file ADR-046 Phase 3 (SPEC-041) — the `redirects` server module (SPEC-009 Redirects admin
 * CRUD/import/hits surface).
 *
 * `RedirectRouteDeps` is reused as-is from its existing (unusual) location, `http/admin/
 * redirects.ts` — not redefined here, same unusual-location pattern `menus`/`MenuRouteDeps`
 * established (see `modules/menus.ts`'s file header). All 7 registrars already use
 * `RedirectRouteRegistrar`, so no per-file changes were needed to wire this module.
 *
 * Owns all 7 registrations (list, get-by-id, create, update, tombstone, import, hits) — moved
 * here verbatim from `app.ts`'s `createApp()`, same registrar function bodies, no behavior
 * change, same relative order.
 */
export function createRedirectsModule(deps: RedirectRouteDeps): ServerModuleHandle {
  return {
    name: "redirects",
    registerRoutes: (app) => {
      registerAdminRedirectListRoute(app, deps);
      registerAdminRedirectGetRoute(app, deps);
      registerAdminRedirectCreateRoute(app, deps);
      registerAdminRedirectUpdateRoute(app, deps);
      registerAdminRedirectTombstoneRoute(app, deps);
      registerAdminRedirectImportRoute(app, deps);
      registerAdminRedirectHitsRoute(app, deps);
    },
  };
}
