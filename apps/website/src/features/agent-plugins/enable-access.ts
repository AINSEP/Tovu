/** Tovu compatibility shim (A8 seam, A9 move). The portable body lives in `@jini-ai/agent-plugins/connect` and
 * requires the host's projection pair, trust rule and refusal copy; only these legacy entries, whose
 * frozen callers pass none of them, bind Tovu's: the pair via `agentPluginMcpPortsOf`, the trust rule
 * from `capability-projection.ts` and the copy below. A caller that already carries projections keeps
 * its own pair (same function and error identity). */
import type { AgentPluginToolGrant, AgentPluginDeclaredTools } from '@jini-ai/agent-plugins/lifecycle';
import { previewAgentPluginEnableAccess as previewWithPorts, validatedAgentPluginToolGrant as validatedWithPorts, type AgentPluginEnableAccessMessages } from '@jini-ai/agent-plugins/connect';
import { agentPluginMcpProjectionPorts, withAgentPluginMcpPorts, withOverrides } from './mcp-host-bindings.js';
import { classifyAgentPluginMcpServerTrust } from './capability-projection.js';
import { tovuFederationMessages } from './federate-mcp.js';
import type { AgentPluginMcpContext, AgentPluginMcpProjectionPorts } from './service-ports.js';
export { storedAgentPluginGrants } from '@jini-ai/agent-plugins/connect';

/** Tovu's refusal copy (names Tovu's settings screen). Bytes unchanged from the pre-move body. */
export const tovuEnableAccessMessages: AgentPluginEnableAccessMessages = {
  ...tovuFederationMessages,
  combinedGrantRejected: ({ detail }) => `The plugin's combined tool grant cannot be saved: ${detail}. Review its tool selection with external_mcp_save before enabling it.`,
  sourceConfiguredSeparately: ({ connectionId }) => `The '${connectionId}' connection was configured separately or points somewhere else. Open Settings → External MCP and review this connection’s address before connecting the plugin again. Its saved sign-in was kept.`,
};

export function validatedAgentPluginToolGrant(
  required: { current: AgentPluginToolGrant; declared: AgentPluginDeclaredTools },
  options: { reason?: 'sign-in' | 'owner-enable'; ports?: AgentPluginMcpProjectionPorts } = {},
): AgentPluginToolGrant | null {
  return validatedWithPorts(required, { ...options, ports: options.ports ?? agentPluginMcpProjectionPorts, messages: tovuEnableAccessMessages });
}

export function previewAgentPluginEnableAccess(
  input: Omit<Parameters<typeof previewWithPorts>[0], 'projections' | 'classifyError' | 'classifyTrust' | 'messages'> & AgentPluginMcpContext,
  _options = {},
): ReturnType<typeof previewWithPorts> {
  return previewWithPorts(withOverrides(withAgentPluginMcpPorts(input), { classifyTrust: classifyAgentPluginMcpServerTrust, messages: tovuEnableAccessMessages }));
}
