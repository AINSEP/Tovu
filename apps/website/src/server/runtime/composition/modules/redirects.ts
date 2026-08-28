import { registerAdminRedirectCreateRoute } from "../../../inbound/admin-http/routes/redirects/create.js";
import { registerAdminRedirectGetRoute } from "../../../inbound/admin-http/routes/redirects/get-by-id.js";
import { registerAdminRedirectHitsRoute } from "../../../inbound/admin-http/routes/redirects/hits.js";
import { registerAdminRedirectImportRoute } from "../../../inbound/admin-http/routes/redirects/import.js";
import { registerAdminRedirectListRoute } from "../../../inbound/admin-http/routes/redirects/list.js";
import { registerAdminRedirectTombstoneRoute } from "../../../inbound/admin-http/routes/redirects/tombstone.js";
import { registerAdminRedirectUpdateRoute } from "../../../inbound/admin-http/routes/redirects/update.js";
import type { RedirectRouteDeps } from "../../../inbound/admin-http/http/redirects.js";
import type { ServerModuleHandle } from "./types.js";

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
