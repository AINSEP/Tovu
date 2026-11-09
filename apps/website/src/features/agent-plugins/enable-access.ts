/** Tovu compatibility shim (A8 seam). The portable body lives in `portable/enable-access.ts` and requires the
 * host's projection pair; only this legacy entry, whose frozen callers may pass no ports, adds
 * Tovu's canonical pair via `agentPluginMcpPortsOf`. A caller that already carries projections keeps
 * its own pair (same function and error identity). Every other export is the portable module's. */
import type { AgentPluginToolGrant, AgentPluginDeclaredTools } from '@jini-ai/agent-plugins/lifecycle';
import { agentPluginMcpProjectionPorts, agentPluginMcpPortsOf } from './mcp-host-bindings.js';
import { previewAgentPluginEnableAccess as previewWithPorts, validatedAgentPluginToolGrant as validatedWithPorts } from './portable/enable-access.js';
import type { AgentPluginMcpContext, AgentPluginMcpProjectionPorts } from './service-ports.js';
export * from './portable/enable-access.js';

export function validatedAgentPluginToolGrant(
  required: { current: AgentPluginToolGrant; declared: AgentPluginDeclaredTools },
  options: { reason?: 'sign-in' | 'owner-enable'; ports?: AgentPluginMcpProjectionPorts } = {},
): AgentPluginToolGrant | null {
  return validatedWithPorts(required, { ...options, ports: options.ports ?? agentPluginMcpProjectionPorts });
}

export function previewAgentPluginEnableAccess(
  input: Omit<Parameters<typeof previewWithPorts>[0], 'projections' | 'classifyError'> & AgentPluginMcpContext,
  _options = {},
): ReturnType<typeof previewWithPorts> {
  return previewWithPorts(input.projections ? input : { ...input, ...agentPluginMcpPortsOf(input) });
}
