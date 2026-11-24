import { t as translateForAiAssistant } from "./ai-assistant-i18n";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { useTovuExecutionPolicy } from "../../hooks/use-tovu-execution-policy.hooks";
import { DEFAULT_EXECUTION_CONFIG } from "../../lib/execution-settings";

/** Bind this screen's copy to the current locale. */
export function createAiAssistantTranslator({ locale }: { locale: string }, _options = {}) {
  return (key: string): string => translateForAiAssistant({ locale, key });
}

/**
 * The host's verdict for `@jini-ai/admin`'s `AssistantDaemonRestart` (its REQUIRED
 * `useRestartAllowedHook`): whether this deployment may run a Local CLI at all. `useExecutionPolicy`
 * is injectable so a test can describe a deployed site without module mocks.
 */
export function useAssistantRestartAllowed(
  { useExecutionPolicy }: { useExecutionPolicy: typeof useTovuExecutionPolicy },
  _options: Record<string, never> = {},
): boolean {
  return useExecutionPolicy({ config: DEFAULT_EXECUTION_CONFIG, locale: useAdminLocale() }).allowed;
}

/** Production binding of {@link useAssistantRestartAllowed} over the real execution policy. */
export function useHostAssistantRestartAllowed(): boolean {
  return useAssistantRestartAllowed({ useExecutionPolicy: useTovuExecutionPolicy });
}
