/** Host composition for the deleted activation.ts fork; validation and durable writes live in
 * @jini-ai/agent-plugins/lifecycle. Retain one binding so all in-process writers share their queue.
 */
import { createAgentPluginActivations } from "@jini-ai/agent-plugins/lifecycle";
import { createNodeAgentPluginEffects } from "@jini-ai/agent-plugins/lifecycle/node";

export const agentPluginActivations = createAgentPluginActivations(createNodeAgentPluginEffects({}), {
  onEvent: ({ message }) => console.warn(message),
});
