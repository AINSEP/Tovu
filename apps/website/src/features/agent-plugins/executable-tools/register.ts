import { registerAgentPluginExecutableTools as registerAgentPluginExecutableToolsWithPorts } from '@jini-ai/agent-plugins/connect/executable';
import { bindExecutableToolRegistration, type AgentPluginExecutableRegistrationHostInput } from './host-bindings.js';

/** Legacy host entry: dependency wiring stays in Tovu, tool execution remains in the generic registrar. */
export function registerAgentPluginExecutableTools(required: AgentPluginExecutableRegistrationHostInput, optional: Record<string, never> = {}) {
  return registerAgentPluginExecutableToolsWithPorts(bindExecutableToolRegistration(required), optional);
}
