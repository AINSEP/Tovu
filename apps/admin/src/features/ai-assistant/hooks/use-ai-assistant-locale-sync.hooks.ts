import { useI18n } from "@jini-ai/ui";
import {
  useAiAssistantLocaleSync,
  type AiAssistantLocaleSyncHookProps,
} from "@jini-ai/admin/screens/assistant-settings/use-ai-assistant-locale-sync.hooks";

/**
 * @file Host binding for the AI Assistant locale-sync hook: feeds `useAdminLocale()`'s live value
 * (the `locale` prop) and the real `useI18n()` pair into Jini's `useAiAssistantLocaleSync`, so
 * `@jini-ai/ui`'s own components (`ByokProviderForm`, `SettingsDialogShell`) inside the
 * `I18nProvider` mounted in `AiAssistant.tsx` keep following the operator's Language setting after
 * the initial render. The sync rule and its rationale live with the Jini hook; this file only
 * picks the provider. Same shape as `features/settings/hooks/use-settings-locale-sync.hooks.ts`.
 */
export function useWiredAiAssistantLocaleSync(props: AiAssistantLocaleSyncHookProps): void {
  const { locale: activeLocale, setLocale } = useI18n();
  useAiAssistantLocaleSync({ locale: props.locale, activeLocale, setLocale });
}
