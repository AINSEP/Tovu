/** Tovu compatibility shim (A8 seam, A9 move). The portable body lives in `@jini-ai/agent-plugins/connect` and requires the
 * host's projection pair; only this legacy entry, whose frozen callers may pass no ports, adds
 * Tovu's canonical pair via `agentPluginMcpPortsOf`. A caller that already carries projections keeps
 * its own pair (same function and error identity). Every other export is the portable module's. */
import { withAgentPluginMcpPorts } from './mcp-host-bindings.js';
import { loadAgentPluginConnectionStatuses as loadWithPorts } from '@jini-ai/agent-plugins/connect';
import type { AgentPluginMcpContext } from './service-ports.js';
export type { AgentPluginConnectionStatus } from '@jini-ai/agent-plugins/connect';

export function loadAgentPluginConnectionStatuses(
  required: Omit<Parameters<typeof loadWithPorts>[0], 'projections'> & AgentPluginMcpContext,
  _optional = {},
): ReturnType<typeof loadWithPorts> {
  return loadWithPorts(withAgentPluginMcpPorts(required));
}
