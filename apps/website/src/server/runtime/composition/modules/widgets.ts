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
import { widgetPreviewRoute } from "@jini-ai/cms/admin-http/routes/widgets/preview";
import { mountAdminJsonRoute } from "#src/server/inbound/admin-http/admin-json-route-ports";
import { knownWidgetErrorToResponse } from "#src/server/inbound/admin-http/http/widgets";
import { renderWidgetPreview } from "#src/server/inbound/admin-http/routes/widgets/preview-render";
import type { Express } from "express";
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
/**
 * K1 (RT-K1-adm-widgets-4): the preview is the Jini spec `widgetPreviewRoute`, mounted behind the
 * admin ports. The registrar binds what the spec cannot import: the theme/document adapter
 * (`renderWidgetPreview`, host-owned — `render` stays injectable for tests) and the widget error
 * ladder's typed rungs. `"direct"` is the hand-written `authorizeDirectOrRespond`;
 * `deferMissingPrincipal` lets the spec answer its own 401 for a missing session (the hand-written
 * route checked the session before the permission and the body) and `authenticateBeforeWorkspace`
 * keeps that 401 ahead of the workspace 404 (it checked the session before `rejectForeignWorkspace`;
 * w4-routes K restored the order a K1 conversion had flipped); an unmapped failure is
 * `adminFailureResponse`'s operation-only `http/widgets` copy, as `mapWidgetErrorToResponse` wrote it.
 */
export function registerAdminWidgetPreviewRoute({ app, deps }: { app: Express; deps: RouteDeps }, { render = renderWidgetPreview }: { render?: typeof renderWidgetPreview } = {}): void {
  mountAdminJsonRoute(
    {
      app,
      spec: widgetPreviewRoute,
      deps: {
        workspaceId: deps.workspaceId,
        // Read per request, as the hand-written route read `deps.authorize`.
        authorize: (params) => deps.authorize(params),
        renderPreview: ({ input }) => render({ deps, input }),
        mapWidgetError: ({ error }) => knownWidgetErrorToResponse({ err: error }),
      },
    },
    { authorization: "direct", deferMissingPrincipal: true, authenticateBeforeWorkspace: true, failure: { operation: "http/widgets" }, failureCopy: "operation" },
  );
}

export function createWidgetsModule(deps: RouteDeps): ServerModuleHandle {
  return {
    name: "widgets",
    registerRoutes: ({ app }, _options = {}) => {
      // Route-ordering note: Express matches in registration order, and `/widgets/regions` would
      // otherwise be swallowed by `GET/PUT /widgets/:id`'s param route (`:id` matches the literal
      // string "regions") — every `/widgets/regions*` registrar (literal path) MUST be registered
      // BEFORE `get-by-id.ts`/`update.ts`'s `/widgets/:id` (param path). The AI tool routes
      // (`/widgets/tools/*`) have the same shape and MUST also precede them for the same reason.
      registerAdminWidgetListRoute({ app, deps });
      registerAdminWidgetPreviewRoute({ app, deps });
      registerAdminWidgetRegionsListRoute({ app, deps });
      registerAdminWidgetRegionBindRoute({ app, deps });
      registerAdminWidgetRegionGetRoute({ app, deps });
      registerAdminWidgetRegionMutatePlacementsRoute({ app, deps });
      registerAdminWidgetAgentToolsRoutes({ app, deps });
      registerAdminWidgetGetRoute({ app, deps });
      registerAdminWidgetCreateRoute({ app, deps });
      registerAdminWidgetUpdateRoute({ app, deps });
      registerAdminWidgetTrashRoute({ app, deps });
      registerAdminWidgetEmbedInsertRoute({ app, deps });
      registerAdminWidgetEmbedRemoveRoute({ app, deps });
      registerAdminWidgetEmbedReorderRoute({ app, deps });
    },
  };
}
