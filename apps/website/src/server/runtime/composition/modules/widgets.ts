import type { Express } from "express";
import { mountJsonRoute, type JsonRoutePorts, type JsonRouteSpec } from "@jini-ai/http-kit";
import { RouteRefusalError } from "@jini-ai/core/errors/route-refusal";
import { widgetCreateRoute } from "@jini-ai/cms/admin-http/routes/widgets/create";
import { widgetCreateToolRoute, WidgetToolPlacementFailedError, widgetToolPlacementFailedBody } from "@jini-ai/cms/admin-http/routes/widgets/agent-tools-create";
import { widgetDiagnoseToolRoute } from "@jini-ai/cms/admin-http/routes/widgets/agent-tools-diagnose";
import { widgetPlaceToolRoute } from "@jini-ai/cms/admin-http/routes/widgets/agent-tools-place";
import { widgetRemoveToolRoute } from "@jini-ai/cms/admin-http/routes/widgets/agent-tools-remove";
import { widgetEmbedInsertRoute } from "@jini-ai/cms/admin-http/routes/widgets/embed-insert";
import { widgetEmbedRemoveRoute } from "@jini-ai/cms/admin-http/routes/widgets/embed-remove";
import { widgetEmbedReorderRoute } from "@jini-ai/cms/admin-http/routes/widgets/embed-reorder";
import { widgetGetRoute } from "@jini-ai/cms/admin-http/routes/widgets/get-by-id";
import { widgetListRoute } from "@jini-ai/cms/admin-http/routes/widgets/list";
import { widgetRegionBindRoute } from "@jini-ai/cms/admin-http/routes/widgets/region-bind";
import { widgetRegionGetRoute } from "@jini-ai/cms/admin-http/routes/widgets/region-get";
import { widgetRegionMutatePlacementsRoute } from "@jini-ai/cms/admin-http/routes/widgets/region-mutate-placements";
import { widgetRegionsListRoute } from "@jini-ai/cms/admin-http/routes/widgets/regions-list";
import { widgetTrashRoute } from "@jini-ai/cms/admin-http/routes/widgets/trash";
import { widgetUpdateRoute } from "@jini-ai/cms/admin-http/routes/widgets/update";
import { buildWidgetsDeps, buildWidgetsRegionDeps } from "#src/features/widgets/deps";
import { createAdminJsonRoutePorts, mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { OperatorPrincipalRecord } from "#src/server/inbound/admin-http/dev-auth";
import { knownWidgetErrorToResponse, mapWidgetErrorToResponse, widgetErrorToResponse } from "#src/server/inbound/admin-http/http/widgets";
import { widgetPreviewRoute } from "@jini-ai/cms/admin-http/routes/widgets/preview";
import { renderWidgetPreview } from "#src/server/inbound/admin-http/routes/widgets/preview-render";
import type { RouteDeps } from "#src/server/routes/types";
import type { ServerModuleHandle } from "./types.js";
import type { RouteErrorPorts } from "@jini-ai/core/contracts/server";

/**
 * @file The `widgets` server module (SPEC-043, ADR-047) — ADR-046 Phase 3 server-module
 * convention, mirroring `modules/menus.ts`. Twelve widgets routes are Jini route specs
 * (`@jini-ai/cms/admin-http/routes/widgets/*`) mounted behind the admin ports below, plus the four AI
 * tool route specs (`agent-tools-*`); only the preview route is still a hand-written registrar. Every route reads only its own fields of `RouteDeps`
 * (`RouteDeps` already carries every dependency a widgets route needs — `widgetBindingRepo`/
 * `entryRefsRepo` were added directly to `RouteDeps` by this same dispatch, unlike menus'
 * `MenuRouteDeps` widening), so this module needs no widened deps type of its own.
 *
 * Registration order: instance CRUD, then region routes, then embed routes, then the AI tool
 * surface — matches the base implementation-outline's own dependency sequencing note (instance
 * CRUD must exist before region/embed placement can reference real instances).
 */
/** A widgets registrar: reads `RouteDeps` at registration and passes each route only its own fields.
 * `errors` are the owning site's route error ports (`createApp`'s one site reporter), bound to every spec it mounts. */
export type WidgetRouteRegistrar = (required: { app: Express; deps: RouteDeps; errors: RouteErrorPorts }, optional?: Record<string, never>) => void;

/**
 * The admin ports, with the widgets error port. The widgets routes never consulted the
 * publishing-credential override (`authorizeDirectOrRespond` / the domain's own RBAC check), so
 * authorization is `"direct"`. Anything a spec does not refuse itself (a plugin hook refusal, an
 * unexpected failure) is answered by `mapWidgetErrorToResponse`, exactly as the hand-written
 * routes' `catch` did — including its `http/widgets` failure copy, which the default admin error
 * port would replace with route-derived copy.
 *
 * A `widgets.create` tool placement failure the spec could not map itself (a plugin hook refusal,
 * an unexpected failure) arrives as `WidgetToolPlacementFailedError`: it is answered with the same
 * host envelope, merged into the spec's placement-failed body so the created widget's id survives.
 */
const widgetJsonRoutePorts: JsonRoutePorts<AdminJsonRoutePortDeps, OperatorPrincipalRecord> = {
  ...createAdminJsonRoutePorts({ authorization: "direct" }),
  onError: ({ res, error }) => {
    if (error instanceof RouteRefusalError) { res.status(error.response.status).json(error.response.body); return; }
    if (error instanceof WidgetToolPlacementFailedError) {
      const { status, body } = widgetErrorToResponse({ err: error.cause }, { tracker: res.locals?.adminFailureTracker, reporter: res.locals?.failureReporter });
      res.status(status).json(widgetToolPlacementFailedBody({ widget: error.widget, errorBody: body }));
      return;
    }
    mapWidgetErrorToResponse({ err: error, res });
  },
};

/** Mount one Jini widgets spec behind {@link widgetJsonRoutePorts}.
 * @param required.errors - The owning site's route error ports. They put this mount in reporter mode:
 *   {@link widgetJsonRoutePorts}' `onError` still answers a failure first; a broken answer or write is one record.
 * @complexity O(1) setup. */
function mountWidgetJsonRoute<Input, Output, Deps>(
  { app, spec, deps, errors }: { app: Express; spec: Omit<JsonRouteSpec<Input, Output, Deps, OperatorPrincipalRecord>, "ports">; deps: Deps & AdminJsonRoutePortDeps; errors: RouteErrorPorts },
  _optional: Record<string, never> = {},
): void {
  mountJsonRoute<Input, Output, Deps & AdminJsonRoutePortDeps, OperatorPrincipalRecord>({ app, spec: { ...spec, ports: widgetJsonRoutePorts }, deps,
    // No widgets spec asks for `requireSameOrigin`, so this policy is never consulted; it exists only
    // because a reporter-mode host context carries one, and it refuses (fails closed) if a later spec asks.
    adapter: { originPolicy: { isSameOrigin: () => false }, errors } });
}

/** The admin surface's outward copy for a classified domain error is that error's own message. */
const outwardErrorMessage = ({ error }: { error: Error }): string => error.message;

/** The two port fields every widgets mount passes, plus the outward error copy every widgets spec refuses with. `authorize` is read per request, as the
 *  hand-written routes read `deps.authorize`, so a later reassignment of it is still honoured. */
function widgetPortDeps({ deps }: { deps: RouteDeps }, _options: Record<string, never> = {}): AdminJsonRoutePortDeps & { outwardErrorMessage: typeof outwardErrorMessage } {
  const authorize: RouteDeps["authorize"] = (params) => deps.authorize(params);
  return { workspaceId: deps.workspaceId, authorize, outwardErrorMessage };
}

export const registerAdminWidgetListRoute: WidgetRouteRegistrar = ({ app, deps, errors }, _options = {}) => {
  mountWidgetJsonRoute({ app, errors, spec: widgetListRoute, deps: { ...widgetPortDeps({ deps }), entryRepo: deps.entryRepo } });
};

export const registerAdminWidgetGetRoute: WidgetRouteRegistrar = ({ app, deps, errors }, _options = {}) => {
  mountWidgetJsonRoute({ app, errors, spec: widgetGetRoute, deps: { ...widgetPortDeps({ deps }), entryRepo: deps.entryRepo, entryRefsRepo: deps.entryRefsRepo } });
};

export const registerAdminWidgetCreateRoute: WidgetRouteRegistrar = ({ app, deps, errors }, _options = {}) => {
  mountWidgetJsonRoute({ app, errors, spec: widgetCreateRoute, deps: { ...widgetPortDeps({ deps }), widgetsDeps: () => buildWidgetsDeps(deps) } });
};

export const registerAdminWidgetUpdateRoute: WidgetRouteRegistrar = ({ app, deps, errors }, _options = {}) => {
  mountWidgetJsonRoute({ app, errors, spec: widgetUpdateRoute, deps: { ...widgetPortDeps({ deps }), widgetsDeps: () => buildWidgetsDeps(deps) } });
};

export const registerAdminWidgetTrashRoute: WidgetRouteRegistrar = ({ app, deps, errors }, _options = {}) => {
  mountWidgetJsonRoute({ app, errors, spec: widgetTrashRoute, deps: { ...widgetPortDeps({ deps }), widgetsDeps: () => buildWidgetsDeps(deps) } });
};

export const registerAdminWidgetRegionsListRoute: WidgetRouteRegistrar = ({ app, deps, errors }, _options = {}) => {
  mountWidgetJsonRoute({ app, errors, spec: widgetRegionsListRoute, deps: { ...widgetPortDeps({ deps }), entryRepo: deps.entryRepo, widgetBindingRepo: deps.widgetBindingRepo } });
};

export const registerAdminWidgetRegionGetRoute: WidgetRouteRegistrar = ({ app, deps, errors }, _options = {}) => {
  mountWidgetJsonRoute({ app, errors, spec: widgetRegionGetRoute, deps: { ...widgetPortDeps({ deps }), entryRepo: deps.entryRepo, widgetBindingRepo: deps.widgetBindingRepo } });
};

export const registerAdminWidgetRegionBindRoute: WidgetRouteRegistrar = ({ app, deps, errors }, _options = {}) => {
  mountWidgetJsonRoute({ app, errors, spec: widgetRegionBindRoute, deps: { ...widgetPortDeps({ deps }), regionDeps: () => buildWidgetsRegionDeps(deps) } });
};

export const registerAdminWidgetRegionMutatePlacementsRoute: WidgetRouteRegistrar = ({ app, deps, errors }, _options = {}) => {
  mountWidgetJsonRoute({
    app,
    errors,
    spec: widgetRegionMutatePlacementsRoute,
    deps: { ...widgetPortDeps({ deps }), widgetBindingRepo: deps.widgetBindingRepo, regionDeps: () => buildWidgetsRegionDeps(deps) },
  });
};

export const registerAdminWidgetEmbedInsertRoute: WidgetRouteRegistrar = ({ app, deps, errors }, _options = {}) => {
  mountWidgetJsonRoute({ app, errors, spec: widgetEmbedInsertRoute, deps: { ...widgetPortDeps({ deps }), widgetsDeps: () => buildWidgetsDeps(deps) } });
};

export const registerAdminWidgetEmbedRemoveRoute: WidgetRouteRegistrar = ({ app, deps, errors }, _options = {}) => {
  mountWidgetJsonRoute({ app, errors, spec: widgetEmbedRemoveRoute, deps: { ...widgetPortDeps({ deps }), widgetsDeps: () => buildWidgetsDeps(deps) } });
};

export const registerAdminWidgetEmbedReorderRoute: WidgetRouteRegistrar = ({ app, deps, errors }, _options = {}) => {
  mountWidgetJsonRoute({ app, errors, spec: widgetEmbedReorderRoute, deps: { ...widgetPortDeps({ deps }), widgetsDeps: () => buildWidgetsDeps(deps) } });
};

/** The four AI tool routes (`widgets.place` / `.create` / `.remove` / `.diagnose`), registered in
 *  that order. The placement deps are built per request, as the hand-written routes built them. */
export const registerAdminWidgetAgentToolsRoutes: WidgetRouteRegistrar = ({ app, deps, errors }, _options = {}) => {
  const placement = {
    ...widgetPortDeps({ deps }),
    widgetBindingRepo: deps.widgetBindingRepo,
    entryRepo: deps.entryRepo,
    widgetsDeps: () => buildWidgetsDeps(deps),
    regionDeps: () => buildWidgetsRegionDeps(deps),
  };
  mountWidgetJsonRoute({ app, errors, spec: widgetPlaceToolRoute, deps: { ...placement, idGen: deps.idGen } });
  mountWidgetJsonRoute({ app, errors, spec: widgetCreateToolRoute, deps: { ...placement, idGen: deps.idGen } });
  mountWidgetJsonRoute({ app, errors, spec: widgetRemoveToolRoute, deps: placement });
  mountWidgetJsonRoute({ app, errors, spec: widgetDiagnoseToolRoute, deps: { ...widgetPortDeps({ deps }), entryRepo: deps.entryRepo, entryRefsRepo: deps.entryRefsRepo } });
};

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
export function registerAdminWidgetPreviewRoute({ errors, app, deps }: { errors: RouteErrorPorts; app: Express; deps: RouteDeps }, { render = renderWidgetPreview }: { render?: typeof renderWidgetPreview } = {}): void {
  mountAdminJsonRoute(
    { errors,
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

/**
 * @param required.deps - The widgets routes' deps.
 * @param required.errors - The owning site's route error ports, bound to the routes mounted directly on http-kit.
 */
export function createWidgetsModule({ deps, errors }: { deps: RouteDeps; errors: RouteErrorPorts }, _optional: Record<string, never> = {}): ServerModuleHandle {
  return {
    name: "widgets",
    registerRoutes: ({ app }, _options = {}) => {
      // Route-ordering note: Express matches in registration order, and `/widgets/regions` would
      // otherwise be swallowed by `GET/PUT /widgets/:id`'s param route (`:id` matches the literal
      // string "regions") — every `/widgets/regions*` registrar (literal path) MUST be registered
      // BEFORE `get-by-id.ts`/`update.ts`'s `/widgets/:id` (param path). The AI tool routes
      // (`/widgets/tools/*`) have the same shape and MUST also precede them for the same reason.
      registerAdminWidgetListRoute({ app, deps, errors });
      registerAdminWidgetPreviewRoute({ errors, app, deps });
      registerAdminWidgetRegionsListRoute({ app, deps, errors });
      registerAdminWidgetRegionBindRoute({ app, deps, errors });
      registerAdminWidgetRegionGetRoute({ app, deps, errors });
      registerAdminWidgetRegionMutatePlacementsRoute({ app, deps, errors });
      registerAdminWidgetAgentToolsRoutes({ app, deps, errors });
      registerAdminWidgetGetRoute({ app, deps, errors });
      registerAdminWidgetCreateRoute({ app, deps, errors });
      registerAdminWidgetUpdateRoute({ app, deps, errors });
      registerAdminWidgetTrashRoute({ app, deps, errors });
      registerAdminWidgetEmbedInsertRoute({ app, deps, errors });
      registerAdminWidgetEmbedRemoveRoute({ app, deps, errors });
      registerAdminWidgetEmbedReorderRoute({ app, deps, errors });
    },
  };
}
