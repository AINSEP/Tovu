import { registerAdminWidgetAgentToolsRoutes } from "../../../inbound/admin-http/routes/widgets/agent-tools.js";
import { registerAdminWidgetCreateRoute } from "../../../inbound/admin-http/routes/widgets/create.js";
import { registerAdminWidgetEmbedInsertRoute } from "../../../inbound/admin-http/routes/widgets/embed-insert.js";
import { registerAdminWidgetEmbedRemoveRoute } from "../../../inbound/admin-http/routes/widgets/embed-remove.js";
import { registerAdminWidgetEmbedReorderRoute } from "../../../inbound/admin-http/routes/widgets/embed-reorder.js";
import { registerAdminWidgetGetRoute } from "../../../inbound/admin-http/routes/widgets/get-by-id.js";
import { registerAdminWidgetListRoute } from "../../../inbound/admin-http/routes/widgets/list.js";
import { registerAdminWidgetPurgeRoute } from "../../../inbound/admin-http/routes/widgets/purge.js";
import { registerAdminWidgetRegionBindRoute } from "../../../inbound/admin-http/routes/widgets/region-bind.js";
import { registerAdminWidgetRegionGetRoute } from "../../../inbound/admin-http/routes/widgets/region-get.js";
import { registerAdminWidgetRegionMutatePlacementsRoute } from "../../../inbound/admin-http/routes/widgets/region-mutate-placements.js";
import { registerAdminWidgetRegionsListRoute } from "../../../inbound/admin-http/routes/widgets/regions-list.js";
import { registerAdminWidgetTrashRoute } from "../../../inbound/admin-http/routes/widgets/trash.js";
import { registerAdminWidgetUpdateRoute } from "../../../inbound/admin-http/routes/widgets/update.js";
import type { RouteDeps } from "../../../routes/types.js";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file The `widgets` server module (SPEC-043, ADR-047) — ADR-046 Phase 3 server-module
 * convention, mirroring `modules/menus.ts` exactly. Every widgets route is a plain `RouteRegistrar`
 * (`RouteDeps` already carries every dependency a widgets route needs — `widgetBindingRepo`/
 * `entryRefsRepo` were added directly to `RouteDeps` by this same dispatch, unlike menus'
 * `MenuRouteDeps` widening), so this module needs no widened deps type of its own.
 *
 * Registration order: instance CRUD, then region routes, then embed routes, then the AI tool
 * surface — matches the base implementation-outline's own dependency sequencing note (instance
 * CRUD must exist before region/embed placement can reference real instances).
 */
export function createWidgetsModule(deps: RouteDeps): ServerModuleHandle {
  return {
    name: "widgets",
    registerRoutes: (app) => {
      // Route-ordering note: Express matches in registration order, and `/widgets/regions` would
      // otherwise be swallowed by `GET/PUT /widgets/:id`'s param route (`:id` matches the literal
      // string "regions") — every `/widgets/regions*` registrar (literal path) MUST be registered
      // BEFORE `get-by-id.ts`/`update.ts`'s `/widgets/:id` (param path). The AI tool routes
      // (`/widgets/tools/*`) have the same shape and MUST also precede them for the same reason.
      registerAdminWidgetListRoute(app, deps);
      registerAdminWidgetRegionsListRoute(app, deps);
      registerAdminWidgetRegionBindRoute(app, deps);
      registerAdminWidgetRegionGetRoute(app, deps);
      registerAdminWidgetRegionMutatePlacementsRoute(app, deps);
      registerAdminWidgetAgentToolsRoutes(app, deps);
      registerAdminWidgetGetRoute(app, deps);
      registerAdminWidgetCreateRoute(app, deps);
      registerAdminWidgetUpdateRoute(app, deps);
      registerAdminWidgetTrashRoute(app, deps);
      registerAdminWidgetPurgeRoute(app, deps);
      registerAdminWidgetEmbedInsertRoute(app, deps);
      registerAdminWidgetEmbedRemoveRoute(app, deps);
      registerAdminWidgetEmbedReorderRoute(app, deps);
    },
  };
}
