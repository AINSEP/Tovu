import type { Express } from "express";
import { mountJsonRoute, type JsonRoutePorts, type JsonRouteSpec } from "@jini-ai/http-kit";
import { RouteRefusalError } from "@jini-ai/core/errors/route-refusal";
import { widgetCreateRoute } from "@jini-ai/cms/admin-http/routes/widgets/create";
import { widgetGetRoute } from "@jini-ai/cms/admin-http/routes/widgets/get-by-id";
import { widgetListRoute } from "@jini-ai/cms/admin-http/routes/widgets/list";
import { widgetRegionBindRoute } from "@jini-ai/cms/admin-http/routes/widgets/region-bind";
import { widgetRegionGetRoute } from "@jini-ai/cms/admin-http/routes/widgets/region-get";
import { widgetRegionsListRoute } from "@jini-ai/cms/admin-http/routes/widgets/regions-list";
import { widgetTrashRoute } from "@jini-ai/cms/admin-http/routes/widgets/trash";
import { widgetUpdateRoute } from "@jini-ai/cms/admin-http/routes/widgets/update";
import { buildWidgetsDeps, buildWidgetsRegionDeps } from "#src/features/widgets/deps";
import { registerAdminWidgetAgentToolsRoutes } from "#src/server/inbound/admin-http/routes/widgets/agent-tools";
import { registerAdminWidgetEmbedInsertRoute } from "#src/server/inbound/admin-http/routes/widgets/embed-insert";
import { registerAdminWidgetEmbedRemoveRoute } from "#src/server/inbound/admin-http/routes/widgets/embed-remove";
import { registerAdminWidgetEmbedReorderRoute } from "#src/server/inbound/admin-http/routes/widgets/embed-reorder";
import { registerAdminWidgetPreviewRoute } from "#src/server/inbound/admin-http/routes/widgets/preview";
import { registerAdminWidgetRegionMutatePlacementsRoute } from "#src/server/inbound/admin-http/routes/widgets/region-mutate-placements";
import { createAdminJsonRoutePorts, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { OperatorPrincipalRecord } from "#src/server/inbound/admin-http/dev-auth";
import { mapWidgetErrorToResponse } from "#src/server/inbound/admin-http/http/widgets";
import type { RouteDeps } from "#src/server/routes/types";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file The `widgets` server module (SPEC-043, ADR-047) — ADR-046 Phase 3 server-module
 * convention, mirroring `modules/menus.ts`. Eight widgets routes are Jini route specs
 * (`@jini-ai/cms/admin-http/routes/widgets/*`) mounted behind the admin ports below; the rest are
 * still hand-written `RouteRegistrar`s. Every route reads only its own fields of `RouteDeps`
 * (`RouteDeps` already carries every dependency a widgets route needs — `widgetBindingRepo`/
 * `entryRefsRepo` were added directly to `RouteDeps` by this same dispatch, unlike menus'
 * `MenuRouteDeps` widening), so this module needs no widened deps type of its own.
 *
 * Registration order: instance CRUD, then region routes, then embed routes, then the AI tool
 * surface — matches the base implementation-outline's own dependency sequencing note (instance
 * CRUD must exist before region/embed placement can reference real instances).
 */
/** A widgets registrar: reads `RouteDeps` at registration and passes each route only its own fields. */
export type WidgetRouteRegistrar = (required: { app: Express; deps: RouteDeps }, optional?: Record<string, never>) => void;

/**
 * The admin ports, with the widgets error port. The widgets routes never consulted the
 * publishing-credential override (`authorizeDirectOrRespond` / the domain's own RBAC check), so
 * authorization is `"direct"`. Anything a spec does not refuse itself (a plugin hook refusal, an
 * unexpected failure) is answered by `mapWidgetErrorToResponse`, exactly as the hand-written
 * routes' `catch` did — including its `http/widgets` failure copy, which the default admin error
 * port would replace with route-derived copy.
 */
const widgetJsonRoutePorts: JsonRoutePorts<AdminJsonRoutePortDeps, OperatorPrincipalRecord> = {
  ...createAdminJsonRoutePorts({ authorization: "direct" }),
  onError: ({ res, error }) => {
    if (error instanceof RouteRefusalError) { res.status(error.response.status).json(error.response.body); return; }
    mapWidgetErrorToResponse({ err: error, res });
  },
};

/** Mount one Jini widgets spec behind {@link widgetJsonRoutePorts}.
 * @complexity O(1) setup. */
function mountWidgetJsonRoute<Input, Output, Deps>(
  { app, spec, deps }: { app: Express; spec: Omit<JsonRouteSpec<Input, Output, Deps, OperatorPrincipalRecord>, "ports">; deps: Deps & AdminJsonRoutePortDeps },
  _optional: Record<string, never> = {},
): void {
  mountJsonRoute<Input, Output, Deps & AdminJsonRoutePortDeps, OperatorPrincipalRecord>({ app, spec: { ...spec, ports: widgetJsonRoutePorts }, deps });
}

/** The two port fields every widgets mount passes. `authorize` is read per request, as the
 *  hand-written routes read `deps.authorize`, so a later reassignment of it is still honoured. */
function widgetPortDeps({ deps }: { deps: RouteDeps }, _options: Record<string, never> = {}): AdminJsonRoutePortDeps {
  const authorize: RouteDeps["authorize"] = (params) => deps.authorize(params);
  return { workspaceId: deps.workspaceId, authorize };
}

export const registerAdminWidgetListRoute: WidgetRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountWidgetJsonRoute({ app, spec: widgetListRoute, deps: { ...widgetPortDeps({ deps }), entryRepo: deps.entryRepo } });
};

export const registerAdminWidgetGetRoute: WidgetRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountWidgetJsonRoute({ app, spec: widgetGetRoute, deps: { ...widgetPortDeps({ deps }), entryRepo: deps.entryRepo, entryRefsRepo: deps.entryRefsRepo } });
};

export const registerAdminWidgetCreateRoute: WidgetRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountWidgetJsonRoute({ app, spec: widgetCreateRoute, deps: { ...widgetPortDeps({ deps }), widgetsDeps: () => buildWidgetsDeps(deps) } });
};

export const registerAdminWidgetUpdateRoute: WidgetRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountWidgetJsonRoute({ app, spec: widgetUpdateRoute, deps: { ...widgetPortDeps({ deps }), widgetsDeps: () => buildWidgetsDeps(deps) } });
};

export const registerAdminWidgetTrashRoute: WidgetRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountWidgetJsonRoute({ app, spec: widgetTrashRoute, deps: { ...widgetPortDeps({ deps }), widgetsDeps: () => buildWidgetsDeps(deps) } });
};

export const registerAdminWidgetRegionsListRoute: WidgetRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountWidgetJsonRoute({ app, spec: widgetRegionsListRoute, deps: { ...widgetPortDeps({ deps }), entryRepo: deps.entryRepo, widgetBindingRepo: deps.widgetBindingRepo } });
};

export const registerAdminWidgetRegionGetRoute: WidgetRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountWidgetJsonRoute({ app, spec: widgetRegionGetRoute, deps: { ...widgetPortDeps({ deps }), entryRepo: deps.entryRepo, widgetBindingRepo: deps.widgetBindingRepo } });
};

export const registerAdminWidgetRegionBindRoute: WidgetRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountWidgetJsonRoute({ app, spec: widgetRegionBindRoute, deps: { ...widgetPortDeps({ deps }), regionDeps: () => buildWidgetsRegionDeps(deps) } });
};

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
