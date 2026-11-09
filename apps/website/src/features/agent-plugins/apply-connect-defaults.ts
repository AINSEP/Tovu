/** Tovu compatibility shim (A8 seam). The portable body lives in `portable/apply-connect-defaults.ts` and requires the
 * host's projection pair; only this legacy entry, whose frozen callers may pass no ports, adds
 * Tovu's canonical pair via `agentPluginMcpPortsOf`. A caller that already carries projections keeps
 * its own pair (same function and error identity). Every other export is the portable module's. */
import { withAgentPluginMcpPorts } from './mcp-host-bindings.js';
import { createApplyConnectDefaults as createWithPorts, type ApplyConnectDefaultsDeps as PortableApplyConnectDefaultsDeps } from './portable/apply-connect-defaults.js';
import type { AgentPluginMcpContext } from './service-ports.js';
export * from './portable/apply-connect-defaults.js';

export type ApplyConnectDefaultsDeps = Omit<PortableApplyConnectDefaultsDeps, 'projections' | 'classifyError'> & AgentPluginMcpContext;

export function createApplyConnectDefaults(deps: ApplyConnectDefaultsDeps, options: Parameters<typeof createWithPorts>[1] = {}): (serverId: string) => Promise<void> {
  return createWithPorts(withAgentPluginMcpPorts(deps), options);
}
