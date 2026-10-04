import { authenticatedAdminRequest, WORKSPACE_ID } from "@/lib/api";
import type { AgentPluginMemoryPort, PluginMemoryListing } from "./agent-plugin-memory-port.hooks";
const endpoint = (pluginId: string) => `/workspaces/${WORKSPACE_ID}/agent-plugins/${encodeURIComponent(pluginId)}/memory`;
export const defaultAgentPluginMemoryPort: AgentPluginMemoryPort = {
  read: ({ pluginId }, _optional = {}) => authenticatedAdminRequest<PluginMemoryListing>({ path: endpoint(pluginId), method: "GET" }),
  saveNote: ({ pluginId, entryPath, text }, _optional = {}) => authenticatedAdminRequest<PluginMemoryListing>({
    path: endpoint(pluginId), method: "PUT", body: { entryPath, text },
  }),
};
