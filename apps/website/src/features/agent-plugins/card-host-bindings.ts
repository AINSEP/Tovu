/** Actual UI builders, application identities and namespaces stay bound to this host. */
import { mcpUiCards } from '@jini-ai/ui/mcp-ui/cards';
import { askThenReport } from '@jini-ai/daemon/surface-exchanges';
export const agentPluginCardHost = {
  cards: mcpUiCards, askThenReport,
  connect: { uriNamespace: 'tovu/agent-plugins-connect', toolId: 'agent_plugin_connect', app: { appName: 'tovu-agent-plugins-connect', appVersion: '1' } },
  token: { formApp: { appName: 'tovu-agent-plugins-access-token', appVersion: '1' }, outcomeApp: { appName: 'tovu-agent-plugins-access-token-outcome', appVersion: '1' } },
  destination: { uriNamespace: 'tovu/sign-in-destination', toolId: 'agent_plugin_connect' },
} as const;
