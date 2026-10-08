/** Host composition for the deleted activation.ts fork; validation and durable writes live in
 * @jini-ai/agent-plugins/lifecycle. Retain one binding so all in-process writers share their queue.
 */
import { agentPluginLifecycle } from "./lifecycle.js";

// activation.ts was deleted; Jini owns the lifecycle, this host binding owns its effects.
// Install, upload, seed, retirement and UI writes must use the same owner's activation queue.
export const agentPluginActivations = agentPluginLifecycle;
