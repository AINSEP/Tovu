/** Moved to `@jini-ai/agent-plugins/lifecycle/host-tools`; this wrapper keeps the old signature and
 * binds the host-tools ports to this product's layout, memory, metadata and permission names. */
import { buildPluginMemoryRegistrations as buildHostPluginMemoryRegistrations } from "@jini-ai/agent-plugins/lifecycle/host-tools";
import type { ToolRegistration } from "@jini-ai/core";
import type { ApplyExtensionApprovalPolicy } from "#src/contracts/headless/assistant-tool-approval-policy";
import { agentPluginHostToolPorts } from "./host-tool-ports.js";

interface Identity { readonly id: string; readonly pluginId: string; readonly archiveDigest: string; }
/** Every capability closes over its owning plugin. Caller-controlled ids/kinds are rejected. */
export function buildPluginMemoryRegistrations(required: {
  withExtensionApprovalPolicy: ApplyExtensionApprovalPolicy;
  sources: readonly Identity[]; workspaceId: string; agentPluginLayout: import("./layout.js").AgentPluginLayout;
  gate: { isCallable(plugin: { pluginId: string; archiveDigest: string }): Promise<boolean> };
}, _optional: {} = {}): ToolRegistration[] {
  const { agentPluginLayout, ...rest } = required;
  return buildHostPluginMemoryRegistrations({ ...rest, ports: agentPluginHostToolPorts({ agentPluginLayout }) });
}
