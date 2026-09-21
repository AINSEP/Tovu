import { registerAdminWidgetAgentToolsRoutes } from "#src/server/inbound/admin-http/routes/widgets/agent-tools";
import { registerAdminWidgetCreateRoute } from "#src/server/inbound/admin-http/routes/widgets/create";
import { registerAdminWidgetEmbedInsertRoute } from "#src/server/inbound/admin-http/routes/widgets/embed-insert";
import { registerAdminWidgetEmbedRemoveRoute } from "#src/server/inbound/admin-http/routes/widgets/embed-remove";
import { registerAdminWidgetEmbedReorderRoute } from "#src/server/inbound/admin-http/routes/widgets/embed-reorder";
import { registerAdminWidgetGetRoute } from "#src/server/inbound/admin-http/routes/widgets/get-by-id";
import { registerAdminWidgetListRoute } from "#src/server/inbound/admin-http/routes/widgets/list";
import { registerAdminWidgetRegionBindRoute } from "#src/server/inbound/admin-http/routes/widgets/region-bind";
import { registerAdminWidgetRegionGetRoute } from "#src/server/inbound/admin-http/routes/widgets/region-get";
import { registerAdminWidgetRegionMutatePlacementsRoute } from "#src/server/inbound/admin-http/routes/widgets/region-mutate-placements";
import { registerAdminWidgetRegionsListRoute } from "#src/server/inbound/admin-http/routes/widgets/regions-list";
import { registerAdminWidgetTrashRoute } from "#src/server/inbound/admin-http/routes/widgets/trash";
import { registerAdminWidgetUpdateRoute } from "#src/server/inbound/admin-http/routes/widgets/update";
import type { RouteDeps } from "#src/server/routes/types";
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
      registerAdminWidgetEmbedInsertRoute(app, deps);
      registerAdminWidgetEmbedRemoveRoute(app, deps);
      registerAdminWidgetEmbedReorderRoute(app, deps);
    },
  };
}
