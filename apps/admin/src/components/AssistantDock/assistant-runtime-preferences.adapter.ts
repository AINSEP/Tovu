/** Bind the runtime preferences to the same per-person ledger and live feed as chat display. */
import { useFetchQuery, useInvalidate } from '@jini-ai/ui/fetch-query';
import { loadNamespaceValues, saveChangedEntries } from '@/lib/ledger-slice';
import { subscribeToSettingsRefresh } from '@jini-ai/admin/shell/lib/settings-refresh-bus';
import { CHAT_DISPLAY_NAMESPACE, type ChatDisplayLedgerPort } from '@jini-ai/admin/shell/components/AssistantDock/chat-display-preferences';
import { DEFAULT_ASSISTANT_RUNTIME_PREFERENCES, loadAssistantRuntimePreferences, saveAssistantRuntimePreferences } from '@jini-ai/admin/shell/components/AssistantDock/assistant-runtime-preferences';
import {
  useAssistantRuntimePreferences, type AssistantRuntimePreferencesController, type AssistantRuntimePreferencesPort,
} from '@jini-ai/admin/shell/components/AssistantDock/hooks/use-assistant-runtime-preferences.hooks';

const ledger: ChatDisplayLedgerPort = {
  load: ({ namespace }) => loadNamespaceValues({ namespace }),
  save: async ({ namespace, scope, candidates }) => { await saveChangedEntries({ namespace, scope, candidates }); },
};

/** Ready for the gear's query controller; errors propagate like display saves. */
export const assistantRuntimePreferencesPort: AssistantRuntimePreferencesPort = {
  load: (_input = {}, _options = {}) => loadAssistantRuntimePreferences({ port: ledger }),
  save: ({ next, previous }, _options = {}) => saveAssistantRuntimePreferences({ port: ledger, next, previous }),
  subscribe: ({ listener }, _options = {}) => subscribeToSettingsRefresh(scope => {
    if (scope === null || scope.includes(CHAT_DISPLAY_NAMESPACE)) listener();
  }),
};

/** Composition hook used by the dock; the controller itself only receives an injected port. */
export function useAssistantRuntimePreferencesPreference(): AssistantRuntimePreferencesController {
  return useAssistantRuntimePreferences({ port: assistantRuntimePreferencesPort, namespace: CHAT_DISPLAY_NAMESPACE, defaults: DEFAULT_ASSISTANT_RUNTIME_PREFERENCES, useFetchQuery, useInvalidate });
}
