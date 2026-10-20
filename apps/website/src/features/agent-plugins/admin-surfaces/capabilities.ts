import type { AdminSurfaceCapabilitiesPort, AdminSurfaceConnections, AdminSurfacePublicConfig, AdminSurfaceState } from "@jini-ai/agent-plugins/admin-surfaces";
import type { AgentPluginToolCapabilitiesPort, AgentPluginToolCapabilityScope } from "@jini-ai/agent-plugins/lifecycle/tools";

/**
 * @file Tovu's `AdminSurfaceCapabilitiesPort`: what a plugin's admin-surface handlers get per call.
 * `http`, `limiter` and `artifacts` are the executable-tool ports (same guarded client, same
 * per-plugin budgets); `connections`, `state` and `publicConfig` are surface-only and come from the
 * composition root, each already scoped to the call's plugin, workspace and admin. Nothing here
 * names a provider.
 */

/** @complexity O(1) per call; each port is built lazily by its factory. */
export function createAdminSurfaceCapabilities(
  required: {
    readonly tools: AgentPluginToolCapabilitiesPort;
    readonly connectionsFor: (scope: AgentPluginToolCapabilityScope) => AdminSurfaceConnections;
    readonly stateFor: (scope: { readonly workspaceId: string; readonly pluginId: string }) => AdminSurfaceState;
    readonly publicConfig: AdminSurfacePublicConfig;
  },
  _optional: Record<string, never> = {},
): AdminSurfaceCapabilitiesPort {
  return (scope) => {
    const { http, limiter, artifacts } = required.tools(scope);
    return {
      // Absent stays absent: this site has no artifact store, and a stub would hide that from the plugin.
      http, limiter, ...(artifacts === undefined ? {} : { artifacts }),
      connections: required.connectionsFor(scope),
      state: required.stateFor({ workspaceId: scope.workspaceId, pluginId: scope.pluginId }),
      publicConfig: required.publicConfig,
    };
  };
}
