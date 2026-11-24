/** Host composition for the deleted activation.ts fork; validation and durable writes live in
 * @jini-ai/agent-plugins/lifecycle. Retain one binding so all in-process writers share their queue.
 */
import { explicitRootAgentPluginActivations } from "./lifecycle.js";

// activation.ts was deleted; Jini owns the lifecycle, this host binding owns its effects.
// Install, upload, seed, retirement and UI writes must use the same owner's activation queue.
// The revision-checked reader lives in @jini-ai/agent-plugins/site/activation-effects; callers inject
// `agentPluginActivations.resolveAgentPluginActivation` from here.
export const agentPluginActivations = explicitRootAgentPluginActivations;

/** Bind the existing fail-closed activation owner for connection and tool-entry gates.
 * @returns True only for an active verdict; missing activation records retain the lifecycle default.
 * @complexity One existing activation-file read per check, no database or network calls.
 */
export async function isAgentPluginEnabled({ workspaceRoot, pluginId }: { workspaceRoot: string; pluginId: string }, _options = {}): Promise<boolean> {
  return (await agentPluginActivations.resolveAgentPluginActivation({ workspaceRoot, pluginId })).verdict === 'active';
}
