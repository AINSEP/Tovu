import { registerAdminMenuAssignLocationRoute } from "../routes/admin/menus/assign-location.js";
import { registerAdminMenuCreateRoute } from "../routes/admin/menus/create.js";
import { registerAdminMenuDeleteRoute } from "../routes/admin/menus/delete.js";
import { registerAdminMenuGetRoute } from "../routes/admin/menus/get-by-id.js";
import { registerAdminMenuListRoute } from "../routes/admin/menus/list.js";
import { registerAdminMenuUpdateTreeRoute } from "../routes/admin/menus/update-tree.js";
import type { MenuRouteDeps } from "../http/admin/menus.js";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file ADR-046 Phase 3 (SPEC-040) — the `menus` server module (ADR-029 navigation menus admin
 * CRUD + location assignment).
 *
 * `MenuRouteDeps` is reused as-is from its existing (unusual) location, `http/admin/menus.ts` —
 * not redefined here. It's a genuine superset of `RouteDeps` (`extends RouteDeps { menuRepo,
 * navLocationBindingRepo }`), not a `Pick`-based narrowing like `TaxonomyRouteDeps`/
 * `ContentRouteDeps` — see that file's own header for why it lives there instead of a
 * `routes/admin/menus/deps.ts` file. All 6 registrars already use `MenuRouteRegistrar`, so no
 * per-file changes were needed to wire this module.
 *
 * Owns all 6 registrations (list, get-by-id, create, update-tree, assign-location, delete) —
 * moved here verbatim from `app.ts`'s `createApp()`, same registrar function bodies, no behavior
 * change, same relative order.
 */
export function createMenusModule(deps: MenuRouteDeps): ServerModuleHandle {
  return {
    name: "menus",
    registerRoutes: (app) => {
      registerAdminMenuListRoute(app, deps);
      registerAdminMenuGetRoute(app, deps);
      registerAdminMenuCreateRoute(app, deps);
      registerAdminMenuUpdateTreeRoute(app, deps);
      registerAdminMenuAssignLocationRoute(app, deps);
      registerAdminMenuDeleteRoute(app, deps);
    },
  };
}
