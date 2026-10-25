import { registerPluginExportFilesRoute } from "#src/server/inbound/public-http/routes/agent-plugin-surfaces/export-files";
import { registerAgentPluginMemoryRoutes } from "#src/server/inbound/admin-http/routes/agent-plugins/memory";
import { registerAgentPluginFilesRoute } from "#src/server/inbound/admin-http/routes/agent-plugins/files";
import { registerAgentPluginInstallRoute } from "#src/server/inbound/admin-http/routes/agent-plugins/install";
import { registerAgentPluginsListRoute } from "#src/server/inbound/admin-http/routes/agent-plugins/list";
import { registerAgentPluginSetEnabledRoute } from "#src/server/inbound/admin-http/routes/agent-plugins/set-enabled";
import { registerAgentPluginAdminSurfaceRoutes } from "#src/server/inbound/admin-http/routes/agent-plugins/admin-surfaces";
import { registerAdminSurfaceFilesRoute } from "#src/server/inbound/public-http/routes/agent-plugin-surfaces/files";
import { registerApiConnectionOAuthCallbackRoute } from "#src/server/inbound/public-http/routes/api-connections/oauth-callback";
import { registerApiConnectionSignInRoute } from "#src/server/inbound/admin-http/routes/agent-plugins/connection-sign-in";
import { EXTERNAL_MCP_OAUTH_CALLBACK_PER_IP, createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import type { RouteDeps } from "#src/server/routes/types";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file The `agent-plugins` server module (2026-09-09) — mirrors `modules/plugins.ts`'s own
 * structure for the separate `.tovu-plugin` site/runtime family.
 *
 * `AgentPluginsRouteDeps` (`routes/admin/agent-plugins/deps.ts`) is a structural subset of
 * `RouteDeps` (`workspaceId`/`authorize` only — see that file's own header for why this domain
 * needs no wider slice), so `RouteDeps` satisfies it with no cast, same as `widgets.ts`'s own
 * rationale for its module deps.
 *
 * Registers the admin Agent Plugins screen's two routes: `AGENT_PLUGINS_LIST` (the read) and
 * `AGENT_PLUGIN_SET_ENABLED` (the enable/disable toggle, added 2026-09-09 by the visual-redesign
 * workstream this file's prior revision named as the toggle's owner), plus `AGENT_PLUGIN_FILES`
 * (the eye button's read-only package viewer, 2026-09-13). All take the same narrow
 * `AgentPluginsRouteDeps` slice; see `set-enabled.ts`'s own header for why that mutation is
 * `authorizeOrRespond`-gated rather than `executeCommand`-wrapped, and what that costs.
 * `AGENT_PLUGIN_INSTALL_ZIP` (2026-10-06) is the "Add a plugin" upload; see `install.ts`.
 * Plugin-owned admin surfaces (2026-10-20): the session-gated list/bootstrap/action routes in
 * `admin-surfaces.ts`, and the PUBLIC surface-files route (see its header for why it carries no
 * session), which therefore must not sit under `/api/admin`.
 * Plugin-declared API connections (2026-10-20): the PUBLIC OAuth callback their hosted sign-in
 * returns to, registered only when the composition provides them (`deps.apiConnections`). It is
 * session-less for the reason its own header gives (it reads a separate browser-binding cookie),
 * so it also sits outside `/api/admin`, with its own
 * per-IP limiter instance sized like the external-MCP callback's (same anonymous, exchange-costly shape).
 * Its hosted sign-in links open through the session-gated `connection-sign-in.ts` route, which
 * binds the starting browser before redirecting to the provider.
 */
export function createAgentPluginsModule(deps: RouteDeps): ServerModuleHandle {
  const callbackLimiter = createRateLimiter({ profile: EXTERNAL_MCP_OAUTH_CALLBACK_PER_IP, clock: deps.clock });
  return {
    name: "agent-plugins",
    registerRoutes: (app) => {
      registerAgentPluginsListRoute(app, deps);
      registerAgentPluginSetEnabledRoute(app, deps);
      registerAgentPluginFilesRoute(app, deps);
      registerAgentPluginInstallRoute(app, deps);
      registerAgentPluginMemoryRoutes(app, deps);
      registerAgentPluginAdminSurfaceRoutes(app, deps);
      registerAdminSurfaceFilesRoute(app, deps);
      registerPluginExportFilesRoute({ app, deps });
      if (deps.apiConnections) {
        registerApiConnectionSignInRoute(app, { workspaceId: deps.workspaceId, host: deps.apiConnections.host });
        registerApiConnectionOAuthCallbackRoute(app, { host: deps.apiConnections.host, callbackLimiter });
      }
    },
  };
}
