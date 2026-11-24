import type { AuthenticationSettingsShellProps } from "@jini-ai/admin/screens/authentication/authentication-host-slots";
import { I18nProvider, SETTINGS_DIALOG_DICTIONARIES, SettingsDialogShell } from "@jini-ai/ui";
import "@jini-ai/ui/settings-dialog.css";
import "@jini-ai/admin/screens/authentication/authentication.css";

/**
 * @file The host's bindings for the Jini Authentication screen — what Tovu injects besides its
 * hooks, product name, provider catalog and secret input: the inline settings-dialog shell, inside
 * the shell's own i18n provider (the shell's chrome copy is its own dictionary, independent of the
 * admin locale) and with the shell's stylesheet plus this page's `jini-source-config-*` rules loaded.
 */

/** `@jini-ai/ui`'s settings shell as the Authentication page's `SettingsShell` slot. */
export function AuthenticationSettingsShell(props: AuthenticationSettingsShellProps) {
  return (
    <I18nProvider
      initialLocale="en"
      dictionaries={SETTINGS_DIALOG_DICTIONARIES}
      fallbackLocale="en"
      syncDocumentAttributes={false}
    >
      <SettingsDialogShell {...props} tabs={[...props.tabs]} />
    </I18nProvider>
  );
}
