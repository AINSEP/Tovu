/** Host composition for the dock's preferences: shared ledger rules, real API adapter and settings feed. */
import { loadNamespaceValues, saveChangedEntries } from "@/lib/ledger-slice";
import { subscribeToSettingsRefresh } from "@jini-ai/admin/shell/lib/settings-refresh-bus";
import { useFetchQuery, useInvalidate } from "@jini-ai/ui/fetch-query";
import { CHAT_DISPLAY_NAMESPACE, DEFAULT_CHAT_DISPLAY, loadChatDisplayPreferences, saveChatDisplayPreferences, type ChatDisplayLedgerPort } from "@jini-ai/admin/shell/components/AssistantDock/chat-display-preferences";
import {
  useChatDisplayPreferences as usePreferences, type ChatDisplayPreferencesController, type ChatDisplayPreferencesPort,
} from "@jini-ai/admin/shell/components/AssistantDock/hooks/use-chat-display-preferences.hooks";

const ledger: ChatDisplayLedgerPort = {
  load: ({ namespace }) => loadNamespaceValues({ namespace }),
  save: async ({ namespace, scope, candidates }) => { await saveChangedEntries({ namespace, scope, candidates }); },
};

export const defaultChatDisplayPreferencesPort: ChatDisplayPreferencesPort = {
  load: () => loadChatDisplayPreferences({ port: ledger }, {}),
  save: ({ next, previous }, _options = {}) => saveChatDisplayPreferences({ next, previous, port: ledger }, {}),
  subscribeToSettingsRefresh: ({ listener }, _options = {}) =>
    subscribeToSettingsRefresh((scope) => {
      if (scope === null || scope.includes(CHAT_DISPLAY_NAMESPACE)) listener();
    }),
};

/** Composition hook used by the dock; the controller itself only receives an injected port. */
export function useChatDisplayPreferences(): ChatDisplayPreferencesController {
  return usePreferences({
    port: defaultChatDisplayPreferencesPort, namespace: CHAT_DISPLAY_NAMESPACE, defaults: DEFAULT_CHAT_DISPLAY, useFetchQuery, useInvalidate,
  });
}
