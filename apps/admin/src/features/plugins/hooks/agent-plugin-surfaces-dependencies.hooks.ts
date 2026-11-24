import { authenticatedAdminRequest } from "@/lib/admin-http/request";
import { WORKSPACE_ID } from "../../../lib/admin-http/config";
import type { AdminSurfaceBootstrap } from "@jini-ai/agent-plugins/admin-surfaces";
import type { AgentPluginSurfaceActionAnswer, AgentPluginSurfacesPort, AgentPluginSurfaceSummary } from "@jini-ai/admin/screens/plugins/hooks/agent-plugin-surfaces-port.hooks";

/**
 * @file The real {@link AgentPluginSurfacesPort}: same-origin admin requests with the session
 * cookie. The two POSTs carry the browser's own `Origin`, which the server's CSRF gate requires.
 */

const base = ({ pluginId }: { pluginId: string }, _optional = {}) => `/workspaces/${WORKSPACE_ID}/agent-plugins/${encodeURIComponent(pluginId)}/surfaces`;

export const defaultAgentPluginSurfacesPort: AgentPluginSurfacesPort = {
  list: ({ pluginId }, _optional = {}) => authenticatedAdminRequest<{ surfaces: AgentPluginSurfaceSummary[] }>({ path: base({ pluginId }), method: "GET" }),
  bootstrap: ({ pluginId, surfaceId }, _optional = {}) => authenticatedAdminRequest<AdminSurfaceBootstrap>({ path: `${base({ pluginId })}/${encodeURIComponent(surfaceId)}/bootstrap`, method: "POST", body: {} }),
  action: ({ pluginId, surfaceId, action, payload }, _optional = {}) => authenticatedAdminRequest<AgentPluginSurfaceActionAnswer>({
    path: `${base({ pluginId })}/${encodeURIComponent(surfaceId)}/actions`, method: "POST", body: { action, payload },
  }),
};
