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
 *
 * `useI18n()`'s `{ locale, setLocale }` pair is injected — see `useX(dependencies)` / `useWiredX()`
 * on `assistant-chats-port.hooks.ts` — rather than called directly, so a test can describe "the
 * provider's locale disagrees with the prop" without mounting a real `I18nProvider`.
 * `useWiredSettingsLocaleSync` below is the zero-argument pair `SettingsUi.tsx` actually mounts.
 */

export interface SettingsLocaleSyncHookProps {
  locale: string;
}

/** What this hook needs from `useI18n()` — just the two fields it reads/calls, not the whole
 *  provider surface. */
export interface SettingsLocaleSyncDependencies {
  activeLocale: string;
  setLocale: (locale: string) => void;
}

/** @complexity O(1) — one equality check per render, no iteration. */
export function useSettingsLocaleSync(
  { locale }: SettingsLocaleSyncHookProps,
  { activeLocale, setLocale }: SettingsLocaleSyncDependencies,
): void {
  useEffect(() => {
    if (activeLocale !== locale) setLocale(locale);
  }, [locale, activeLocale, setLocale]);
}

/**
 * Binds the real `useI18n()` — the zero-dependency half of the `useX(dependencies)` / `useWiredX()`
 * pair, so `SettingsUi.tsx` composes this and a test composes {@link useSettingsLocaleSync}
 * directly with a fake `setLocale`.
 */
export function useWiredSettingsLocaleSync(props: SettingsLocaleSyncHookProps): void {
  const { locale: activeLocale, setLocale } = useI18n();
  useSettingsLocaleSync(props, { activeLocale, setLocale });
}
