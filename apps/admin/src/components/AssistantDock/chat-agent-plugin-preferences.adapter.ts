/** Bind the plugin preference to the same per-person ledger and live feed as chat display. */
import { loadNamespaceValues, saveChangedEntries } from '@/lib/ledger-slice';
import { subscribeToSettingsRefresh } from '@/lib/settings-refresh-bus';
import { CHAT_DISPLAY_NAMESPACE, type ChatDisplayLedgerPort } from './chat-display-preferences';
import { loadChatAgentPlugins, saveChatAgentPlugins, type ChatAgentPlugins } from './chat-agent-plugin-preferences';
import { useChatAgentPlugins, type ChatAgentPluginsController, type ChatAgentPluginsPort } from './hooks/use-chat-agent-plugins.hooks';

/** The ledger and settings-feed operations the port is built from; production passes `ledger-slice`'s
 *  and `settings-refresh-bus`'s own functions, tests pass hand-written fakes. */
export interface ChatAgentPluginsPreferenceDeps {
  loadValues: typeof loadNamespaceValues;
  saveEntries: typeof saveChangedEntries;
  subscribe: typeof subscribeToSettingsRefresh;
}

/** Builds the preference port over injected ledger/feed functions. Errors propagate like display saves. */
export function createChatAgentPluginsPreferencePort(
  { loadValues, saveEntries, subscribe }: ChatAgentPluginsPreferenceDeps,
  _optional: Record<string, never> = {},
): ChatAgentPluginsPort {
  const ledger: ChatDisplayLedgerPort = {
    load: ({ namespace }) => loadValues(namespace),
    save: async ({ namespace, scope, candidates }) => { await saveEntries(namespace, scope, candidates); },
  };
  return {
    load: (_input: Record<string, never> = {}, _options = {}) => loadChatAgentPlugins({ port: ledger }),
    save: ({ next, previous }: { next: ChatAgentPlugins; previous: ChatAgentPlugins }, _options = {}) => saveChatAgentPlugins({ next, previous, port: ledger }),
    subscribe: ({ listener }: { listener: () => void }, _options = {}) => subscribe(scope => {
      if (scope === null || scope.includes(CHAT_DISPLAY_NAMESPACE)) listener();
    }),
  };
}

/** Ready for the settings UI's query controller; errors propagate like display saves. */
export const chatAgentPluginsPreferencePort: ChatAgentPluginsPort = createChatAgentPluginsPreferencePort({
  loadValues: loadNamespaceValues,
  saveEntries: saveChangedEntries,
  subscribe: subscribeToSettingsRefresh,
});

/** Composition hook used by the dock; the controller itself only receives an injected port. */
export function useChatAgentPluginsPreference(): ChatAgentPluginsController {
  return useChatAgentPlugins({ port: chatAgentPluginsPreferencePort });
}
