import { useEffect } from "react";
import { useI18n } from "@jini-ai/ui";

/**
 * @file `SettingsLocaleSync`'s locale-bridging effect, so `SettingsLocaleSync` in `SettingsUi.tsx`
 * is only markup (a `null`-returning wrapper).
 *
 * Extracted verbatim. Bridges the `core.language.locale` setting (loaded/persisted by the
 * `language` slice, via Tovu's own `content.db`) to the mounted `I18nProvider`'s active locale.
 *
 * `I18nProvider` has no *controlled* `locale` prop — only `initialLocale`, read once at mount via
 * a lazy `useState` initializer — so a locale picked in `LanguageTab` (which calls
 * `onSelectLocale` → the `language` slice's `onChange`, not `useI18n().setLocale`) would otherwise
 * only take effect on the next full remount, not immediately. This hook exists only to keep the
 * two locale sources of truth in sync after the first render, so Tovu's own persistence stays the
 * one real source and the provider's internal state just follows it.
 */

export interface SettingsLocaleSyncHookProps {
  locale: string;
}

/** @complexity O(1) — one equality check per render, no iteration. */
export function useSettingsLocaleSync({ locale }: SettingsLocaleSyncHookProps): void {
  const { locale: activeLocale, setLocale } = useI18n();
  useEffect(() => {
    if (activeLocale !== locale) setLocale(locale);
  }, [locale, activeLocale, setLocale]);
}
