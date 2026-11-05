/** Host composition for the deleted activation.ts fork; validation and durable writes live in
 * @jini-ai/agent-plugins/lifecycle. Retain one binding so all in-process writers share their queue.
 */
import { explicitRootAgentPluginActivations } from "./lifecycle.js";
import { ACTIVATIONS_FILENAME, createVersionedPluginActivationReader } from '@jini-ai/agent-plugins/lifecycle';
import { stat } from 'node:fs/promises';
import path from 'node:path';

// activation.ts was deleted; Jini owns the lifecycle, this host binding owns its effects.
// Install, upload, seed, retirement and UI writes must use the same owner's activation queue.
export const agentPluginActivations = explicitRootAgentPluginActivations;

/** Bind the existing fail-closed activation owner for connection and tool-entry gates.
 * @returns True only for an active verdict; missing activation records retain the lifecycle default.
 * @complexity One existing activation-file read per check, no database or network calls.
 */
export async function isAgentPluginEnabled({ workspaceRoot, pluginId }: { workspaceRoot: string; pluginId: string }, _options = {}): Promise<boolean> {
  return (await agentPluginActivations.resolveAgentPluginActivation({ workspaceRoot, pluginId })).verdict === 'active';
}

/** Bind Jini's versioned point reader to the activation owner's atomic file writes.
 * @returns A scoped callback with one stat per hot call; file contents are read only on change.
 * @throws Filesystem errors except a genuinely absent activation file (the lifecycle default).
 * @complexity O(1) metadata per call, O(a) activation-file read on cache miss for a bytes.
 */
export function createAgentPluginEnabledReader({ workspaceRoot }: { workspaceRoot: string }, _options = {}): (pluginId: string) => Promise<boolean> {
  const reader = createVersionedPluginActivationReader({ ports: {
    revision: async () => {
      try {
        const info = await stat(path.join(workspaceRoot, ACTIVATIONS_FILENAME), { bigint: true });
        return `${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'absent';
        throw error;
      }
    },
    resolve: ({ pluginId }) => isAgentPluginEnabled({ workspaceRoot, pluginId }),
  } });
  return pluginId => reader.isEnabled({ pluginId });
}
