import { adminSurfaceWritePreflight, defineAdminSurfaceRoutes } from "@jini-ai/cms/admin-http/routes/agent-plugins/admin-surfaces";
import {
  adminSurfaceBootstrapHeaders,
  createAdminSurfaceActionDispatcher,
  createAdminSurfaceBootstrap,
  type AdminSurfaceActionOutcome,
  type LoadedAdminSurface,
} from "@jini-ai/agent-plugins/admin-surfaces";

import {
  NO_ADMIN_SURFACE_HOST,
  ADMIN_SURFACE_ACTION_PERMISSION,
  withAdminSurfaceSignIns,
  adminSurfaceFileUrl,
  createAgentPluginAdminSurfaceSource,
  findAdminSurface,
  type AdminSurfaceHost,
  type AdminSurfaceSource,
} from "#src/features/agent-plugins/admin-surfaces/surfaces";
import { mountAdminJsonRoute, type AdminJsonRouteMountOptions, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { AgentPluginsRouteDeps, AgentPluginsRouteRegistrar } from "#src/server/inbound/admin-http/routes/agent-plugins/deps";

/**
 * @file K1 (w4-routes P, RT-K1-adm-agent-plugins-2): the plugin-owned admin-surface routes — Jini
 * `defineAdminSurfaceRoutes` (`@jini-ai/cms/admin-http/routes/agent-plugins/admin-surfaces`) behind the
 * admin ports. The surface files are served by the public route mounted in
 * `agent-plugin-surface-files-route.ts`.
 *
 * The hand-written writes refused in this order, pinned by `admin-surfaces.gate-order.wire.test.ts`:
 * their own cross-origin 403 (`CROSS_ORIGIN_REFUSED`) → the session-credential 403 → the workspace
 * 404 → RBAC. The mount reproduces it with `preflight` (the origin check, evaluated first),
 * `sessionCredentialOnly` and `authenticateBeforeWorkspace`. The GET read had neither write gate:
 * workspace 404 → session → RBAC, the default order. All three used `authorizeOrRespond` (`"guarded"`)
 * and one `sendAdminFailure` operation. Tovu binds the surface source (a test may replace it),
 * the host's handlers, bootstrap data and sign-in collector, the clock, and the handler-error log.
 */

const routes = defineAdminSurfaceRoutes<LoadedAdminSurface, AdminSurfaceActionOutcome>();

/** `sendAdminFailure`'s operation and the decision source all three hand-written routes used. */
const SURFACE_FAILURE: AdminJsonRouteMountOptions = { authorization: "guarded", failure: { operation: "routes/agent-plugins/admin-surfaces", code: "INTERNAL_ERROR" } };

/** The two writes' legacy gates, in the hand-written order (see this file's header): Jini's same-origin
 *  write check answers Tovu's own cross-origin copy first. */
const SURFACE_WRITE_GATES: AdminJsonRouteMountOptions = {
  ...SURFACE_FAILURE,
  preflight: adminSurfaceWritePreflight({ refusal: { status: 403, body: { error: "admin surface requests must come from the admin page itself", code: "CROSS_ORIGIN_REFUSED" } } }),
  sessionCredentialOnly: { message: "admin surfaces accept only a signed-in admin session", permission: ADMIN_SURFACE_ACTION_PERMISSION },
  authenticateBeforeWorkspace: true,
};

/** The real source over the lifecycle owner, unless the deps carry one; read per request as before. */
function sourceFor(deps: AgentPluginsRouteDeps): AdminSurfaceSource {
  return deps.adminSurfaceSource ?? createAgentPluginAdminSurfaceSource({ lifecycle: deps.agentPluginLifecycle });
}

/** The bound host (none by default: no handlers, no bootstrap data); read per request as before. */
function hostFor(deps: AgentPluginsRouteDeps): AdminSurfaceHost {
  return deps.adminSurfaceHost ?? NO_ADMIN_SURFACE_HOST;
}

/** The two port fields; `authorize` is read per request (tests reassign it). */
function portDeps({ deps }: { deps: AgentPluginsRouteDeps }, _optional: Record<string, never> = {}): AdminJsonRoutePortDeps {
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
}

/** Both writes resolve the URL's surface among the admitted ones. */
function findSurfaceFor({ deps }: { deps: AgentPluginsRouteDeps }, _optional: Record<string, never> = {}) {
  return ({ workspaceId, pluginId, surfaceId }: { workspaceId: string; pluginId: string; surfaceId: string }) => findAdminSurface({ source: sourceFor(deps), workspaceId, pluginId, surfaceId });
}

/** The surface list, bootstrap and action routes, GET then the two POSTs as before. */
export const registerAgentPluginAdminSurfaceRoutes: AgentPluginsRouteRegistrar = ({ errors, app, deps }, _options = {}) => {
  mountAdminJsonRoute({ errors, app, spec: routes.list, deps: {
    ...portDeps({ deps }), listSurfaces: (args) => sourceFor(deps).list(args), surfaceFileUrl: adminSurfaceFileUrl,
  } }, SURFACE_FAILURE);
  mountAdminJsonRoute({ errors, app, spec: routes.bootstrap, deps: {
    ...portDeps({ deps }), findSurface: findSurfaceFor({ deps }),
    bootstrapData: (args) => hostFor(deps).bootstrapData(args),
    createBootstrap: createAdminSurfaceBootstrap, bootstrapHeaders: () => adminSurfaceBootstrapHeaders(), nowMs: () => deps.clock.nowMs(),
  } }, SURFACE_WRITE_GATES);
  mountAdminJsonRoute({ errors, app, spec: routes.action, deps: {
    ...portDeps({ deps }), findSurface: findSurfaceFor({ deps }),
    dispatcherFor: ({ surface }) => createAdminSurfaceActionDispatcher({ descriptor: surface.descriptor, handlers: hostFor(deps).handlersFor({ pluginId: surface.plugin.pluginId, surfaceId: surface.descriptor.id }) }, {
      // Only the error's class reaches the log: a handler's message could quote provider detail.
      onHandlerError: ({ surfaceId, action, error }) => console.error("[admin-surfaces] action handler failed", { pluginId: surface.plugin.pluginId, surfaceId, action, error: error instanceof Error ? error.name : typeof error }),
    }),
    withSignIns: ({ run }) => withAdminSurfaceSignIns({ host: hostFor(deps), run }),
  } }, SURFACE_WRITE_GATES);
};
