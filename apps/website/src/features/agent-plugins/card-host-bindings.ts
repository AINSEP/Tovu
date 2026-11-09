/** Actual UI builders, application identities and namespaces stay bound to this host. */
import { mcpUiCards } from '@jini-ai/ui/mcp-ui/cards';
import { askThenReport } from '@jini-ai/daemon/surface-exchanges';
import { resolveAgentPluginCardIdentity, type AgentPluginCardIdentity } from '@jini-ai/agent-plugins/connect';
/** Tovu's card identity: resolves to ui://tovu/agent-plugins-connect/<id>, ui://tovu/sign-in-destination/<id>
 * and the tovu-agent-plugins-* apps at version 1 (bytes unchanged). */
export const tovuAgentPluginCardIdentity: AgentPluginCardIdentity = {
  uriNamespace: 'tovu',
  appNames: { connect: 'tovu-agent-plugins-connect', tokenForm: 'tovu-agent-plugins-access-token', tokenOutcome: 'tovu-agent-plugins-access-token-outcome' },
};
export const agentPluginCardHost = {
  cards: mcpUiCards, askThenReport,
  ...resolveAgentPluginCardIdentity({ cardIdentity: tovuAgentPluginCardIdentity, toolId: 'agent_plugin_connect' }),
} as const;
