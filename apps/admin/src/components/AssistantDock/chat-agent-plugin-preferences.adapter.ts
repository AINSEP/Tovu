/** Bind the plugin preference to the same per-person ledger and live feed as chat display. */
import { loadNamespaceValues, saveChangedEntries } from '@/lib/ledger-slice';
import { subscribeToSettingsRefresh } from '@/lib/settings-refresh-bus';
import { CHAT_DISPLAY_NAMESPACE, type ChatDisplayLedgerPort } from './chat-display-preferences';
import { loadChatAgentPlugins, saveChatAgentPlugins, type ChatAgentPlugins } from './chat-agent-plugin-preferences';
import { useChatAgentPlugins, type ChatAgentPluginsController, type ChatAgentPluginsPort } from './hooks/use-chat-agent-plugins.hooks';
const ledger: ChatDisplayLedgerPort = {
  load: ({ namespace }) => loadNamespaceValues(namespace),
  save: async ({ namespace, scope, candidates }) => { await saveChangedEntries(namespace, scope, candidates); },
};
/** Ready for the settings UI's query controller; errors propagate like display saves. */
export const chatAgentPluginsPreferencePort: ChatAgentPluginsPort = {
  load: (_input: Record<string, never> = {}, _options = {}) => loadChatAgentPlugins({ port: ledger }),
  save: ({ next, previous }: { next: ChatAgentPlugins; previous: ChatAgentPlugins }, _options = {}) => saveChatAgentPlugins({ next, previous, port: ledger }),
  subscribe: ({ listener }: { listener: () => void }, _options = {}) => subscribeToSettingsRefresh(scope => {
    if (scope === null || scope.includes(CHAT_DISPLAY_NAMESPACE)) listener();
  }),
};
/** Composition hook used by the dock; the controller itself only receives an injected port. */
export function useChatAgentPluginsPreference(): ChatAgentPluginsController {
  return useChatAgentPlugins({ port: chatAgentPluginsPreferencePort });
}
