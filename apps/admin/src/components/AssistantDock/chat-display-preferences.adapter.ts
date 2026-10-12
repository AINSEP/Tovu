/** Host composition for the dock's preferences: shared ledger rules, real API adapter and settings feed. */
import { loadNamespaceValues, saveChangedEntries } from "@/lib/ledger-slice";
import { subscribeToSettingsRefresh } from "@/lib/settings-refresh-bus";
import { CHAT_DISPLAY_NAMESPACE, loadChatDisplayPreferences, saveChatDisplayPreferences, type ChatDisplayLedgerPort } from "./chat-display-preferences";
import { useChatDisplayPreferences as usePreferences, type ChatDisplayPreferencesController, type ChatDisplayPreferencesPort } from "./hooks/use-chat-display-preferences.hooks";

const ledger: ChatDisplayLedgerPort = {
  load: ({ namespace }) => loadNamespaceValues(namespace),
  save: async ({ namespace, scope, candidates }) => { await saveChangedEntries(namespace, scope, candidates); },
};

export const defaultChatDisplayPreferencesPort: ChatDisplayPreferencesPort = {
  load: () => loadChatDisplayPreferences({ port: ledger }, {}),
  save: (next, previous) => saveChatDisplayPreferences({ next, previous, port: ledger }, {}),
  subscribeToSettingsRefresh: (listener) =>
    subscribeToSettingsRefresh((scope) => {
      if (scope === null || scope.includes(CHAT_DISPLAY_NAMESPACE)) listener();
    }),
};

/** Composition hook used by the dock; the controller itself only receives an injected port. */
export function useChatDisplayPreferences(): ChatDisplayPreferencesController {
  return usePreferences(defaultChatDisplayPreferencesPort);
}
