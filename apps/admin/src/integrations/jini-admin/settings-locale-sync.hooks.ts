import { useI18n } from "@jini-ai/ui";
import { useSettingsLocaleSync, type SettingsLocaleSyncHookProps } from "@jini-ai/admin/screens/settings/hooks/use-settings-locale-sync.hooks";

/**
 * Host binding for Jini's settings locale sync: binds the real `useI18n()` — the zero-dependency
 * half of the `useX(dependencies)` / `useWiredX()` pair, so `SettingsUi.tsx` composes this and a
 * test composes `useSettingsLocaleSync` directly with a fake `setLocale`. The pure effect lives in
 * `@jini-ai/admin/screens/settings/hooks/use-settings-locale-sync.hooks`; the UI library binding
 * stays here because the admin package never imports the host's UI library hooks.
 */
export function useWiredSettingsLocaleSync(props: SettingsLocaleSyncHookProps): void {
  const { locale: activeLocale, setLocale } = useI18n();
  useSettingsLocaleSync(props, { activeLocale, setLocale });
}
