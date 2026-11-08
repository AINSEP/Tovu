import type { AgentPluginDisclosureMessages } from '@jini-ai/agent-plugins/connect';
export const TOOL_WITHDRAWN_MESSAGE = 'This plugin tool is no longer available (the plugin was disabled or reloaded). Nothing was changed.';
export const NOT_CONNECTED_MESSAGE = 'The connection this tool uses is not connected. Reconnect the account in the plugin settings and retry. Nothing was changed.';
/** Exact approval-card copy belongs to the host; the generic disclosure freezes the same accounts. */
export const agentPluginDisclosureMessages: AgentPluginDisclosureMessages = {
  withdrawn: TOOL_WITHDRAWN_MESSAGE, notConnected: NOT_CONNECTED_MESSAGE, accountLabel: 'Account', affectsLabel: 'Affects',
};
