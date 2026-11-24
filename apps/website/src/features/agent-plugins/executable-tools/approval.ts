import { createAgentPluginDisclosure as createAgentPluginDisclosureWithPorts } from '@jini-ai/agent-plugins/connect/executable';
import { agentPluginDisclosureMessages } from './approval-bindings.js';

/** Same host signature and copy; account freezing remains in the domain implementation. */
export function createAgentPluginDisclosure(required: Omit<Parameters<typeof createAgentPluginDisclosureWithPorts>[0], 'messages'>, optional: Record<string, never> = {}) {
  return createAgentPluginDisclosureWithPorts({ ...required, messages: agentPluginDisclosureMessages }, optional);
}
