/** Tovu compatibility shim (A8 seam). The portable body lives in `portable/connection-status.ts` and requires the
 * host's projection pair; only this legacy entry, whose frozen callers may pass no ports, adds
 * Tovu's canonical pair via `agentPluginMcpPortsOf`. A caller that already carries projections keeps
 * its own pair (same function and error identity). Every other export is the portable module's. */
import { agentPluginMcpPortsOf } from './mcp-host-bindings.js';
import { loadAgentPluginConnectionStatuses as loadWithPorts } from './portable/connection-status.js';
import type { AgentPluginMcpContext } from './service-ports.js';
export * from './portable/connection-status.js';

export function loadAgentPluginConnectionStatuses(
  required: Omit<Parameters<typeof loadWithPorts>[0], 'projections'> & AgentPluginMcpContext,
  _optional = {},
): ReturnType<typeof loadWithPorts> {
  return loadWithPorts({ ...required, projections: agentPluginMcpPortsOf(required).projections });
}
