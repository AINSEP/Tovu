import { createAgentPluginStateStore as createPersistedStateStore } from '@jini-ai/agent-plugins/admin-surfaces';
import { bindPluginStatePersistence, PLUGIN_STATE_UNAVAILABLE_MESSAGE, type PluginStateHostInput } from './plugin-state-bindings.js';
import type { AgentPluginStateStore } from '@jini-ai/agent-plugins/admin-surfaces';

/** The old host signature binds its original vault and exact persisted scope/format. */
export function createAgentPluginStateStore(required: PluginStateHostInput, _optional: Record<string, never> = {}): AgentPluginStateStore {
  return createPersistedStateStore({ persistence: bindPluginStatePersistence(required), workspaceId: required.workspaceId, messages: { unavailable: PLUGIN_STATE_UNAVAILABLE_MESSAGE } });
}
