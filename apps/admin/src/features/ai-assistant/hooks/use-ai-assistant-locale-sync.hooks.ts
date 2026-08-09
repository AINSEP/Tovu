import { useEffect } from "react";
import { useI18n } from "@jini-ai/ui";

/**
 * @file Bridges `useAdminLocale()`'s live value to the `I18nProvider` mounted in `AiAssistant.tsx`,
 * so `@jini-ai/ui`'s own components (`ByokProviderForm`, `SettingsDialogShell`) keep following the
 * operator's Language setting after the initial render, not just at mount.
 *
 * Same logic as `features/settings/hooks/use-settings-locale-sync.hooks.ts` (not imported from
 * there — this feature owns its own hook, per this app's per-feature `hooks/` convention; the two
 * are identical by coincidence of both bridging the same upstream contract, not by a shared
 * dependency). See that file's own header for why `I18nProvider` needs this at all: `initialLocale`
 * is read once, at mount, via a lazy `useState` initializer — not a controlled prop — so a locale
 * change after mount would otherwise only take effect on the next full remount.
 */

export interface AiAssistantLocaleSyncHookProps {
  locale: string;
}

/** @complexity O(1) — one equality check per render, no iteration. */
export function useAiAssistantLocaleSync({ locale }: AiAssistantLocaleSyncHookProps): void {
  const { locale: activeLocale, setLocale } = useI18n();
  useEffect(() => {
    if (activeLocale !== locale) setLocale(locale);
  }, [locale, activeLocale, setLocale]);
}
