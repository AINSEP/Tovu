import { registerAgentPluginFilesRoute } from "#src/server/inbound/admin-http/routes/agent-plugins/files";
import { registerAgentPluginsListRoute } from "#src/server/inbound/admin-http/routes/agent-plugins/list";
import { registerAgentPluginSetEnabledRoute } from "#src/server/inbound/admin-http/routes/agent-plugins/set-enabled";
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
 */
export function createAgentPluginsModule(deps: RouteDeps): ServerModuleHandle {
  return {
    name: "agent-plugins",
    registerRoutes: (app) => {
      registerAgentPluginsListRoute(app, deps);
      registerAgentPluginSetEnabledRoute(app, deps);
      registerAgentPluginFilesRoute(app, deps);
    },
  };
}
