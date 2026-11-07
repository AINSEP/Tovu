/** Moved to `@jini-ai/agent-plugins/lifecycle/host-tools`; this wrapper keeps the old names and
 * signature, and supplies this product's permission check and names. */
import { pluginNoteHandler as hostPluginNoteHandler, pluginNoteToolCatalog, type HostToolSurfaces } from "@jini-ai/agent-plugins/lifecycle/host-tools";
import { adaptLegacyAuthorize, requireToolPermission } from "@jini-ai/cms/core";
import type { AgentToolDefinition, ToolHandler } from "@jini-ai/core";
import type { AgentPluginLayout } from "./layout.js";
import { type OperatorLocaleDeps } from "../../contracts/headless/index.js";
import type { AgentPluginAccessTokenToolDeps } from "./access-token-tool.js";
import type { AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import { AGENT_PLUGIN_HOST_TOOL_PERMISSIONS, agentPluginHostToolPorts } from "./host-tool-ports.js";

export { WRITE_PLUGIN_NOTE, pluginNoteRisk } from "@jini-ai/agent-plugins/lifecycle/host-tools";
export const pluginNoteCatalog: AgentToolDefinition[] = pluginNoteToolCatalog({ permission: AGENT_PLUGIN_HOST_TOOL_PERMISSIONS.enable });
/**
 * The note-saving handler. Notes are context, never a permission grant.
 * @param required.deps Workspace, authorization and the settings ledger the operator's locale is read from.
 * @param required.surfaces Retained host contributor transport ABI; notes need no approval.
 * @param options.layout Agent Plugins filesystem layout; required from the booted site binding.
 * @complexity O(p) for p installed plugins.
 */
export function pluginNoteHandler(
  required: { deps: Pick<AgentPluginAccessTokenToolDeps, "workspaceId" | "authorize"> & OperatorLocaleDeps; surfaces: AssistantSurfaceDeps },
  options: { layout: AgentPluginLayout },
): ToolHandler {
  required.surfaces satisfies HostToolSurfaces;
  return hostPluginNoteHandler({ workspaceId: required.deps.workspaceId, ports: agentPluginHostToolPorts({ agentPluginLayout: options.layout }),
    requirePermission: (input, entity) => requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: required.deps.authorize }), ...input }, entity) });
}
