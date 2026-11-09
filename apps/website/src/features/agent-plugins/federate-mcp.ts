/** Tovu compatibility shim (A8 seam). The portable body lives in `portable/federate-mcp.ts` and requires the
 * host's projection pair; only this legacy entry, whose frozen callers may pass no ports, adds
 * Tovu's canonical pair via `agentPluginMcpPortsOf`. A caller that already carries projections keeps
 * its own pair (same function and error identity). Every other export is the portable module's. */
import { withAgentPluginMcpPorts } from "./mcp-host-bindings.js";
import { provisionAgentPluginMcpServers as provisionWithPorts, type ProvisionAgentPluginMcpServersInput, type ProvisionAgentPluginMcpServersResult } from "./portable/federate-mcp.js";
import type { AgentPluginMcpContext, AgentPluginMcpPort } from "./service-ports.js";
export * from "./portable/federate-mcp.js";

export function provisionAgentPluginMcpServers(
  deps: AgentPluginMcpContext & Pick<AgentPluginMcpPort, "repo" | "saveServer"> & Partial<Pick<AgentPluginMcpPort, "notifyRosterChanged">>,
  input: ProvisionAgentPluginMcpServersInput,
): Promise<ProvisionAgentPluginMcpServersResult> {
  return provisionWithPorts(withAgentPluginMcpPorts(deps), input);
}
