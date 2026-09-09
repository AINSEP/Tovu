import { registerAgentPluginsListRoute } from "#src/server/inbound/admin-http/routes/agent-plugins/list";
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
 * Registers `AGENT_PLUGINS_LIST` only — the admin Agent Plugins screen's read path. No
 * enable/disable route here: that mutation already exists as `plugins_set_enabled`'s activation
 * write inside the assistant tool surface and as the composer's `pluginRefId` pin, and adding an
 * HTTP enable/disable endpoint is a separate, later decision (the visual-redesign workstream's own
 * "an enable toggle" scope, not this read-path change).
 */
export function createAgentPluginsModule(deps: RouteDeps): ServerModuleHandle {
  return {
    name: "agent-plugins",
    registerRoutes: (app) => {
      registerAgentPluginsListRoute(app, deps);
    },
  };
}
