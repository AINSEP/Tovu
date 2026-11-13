import { t as translateForUserInterfaceSettingsPanel } from "./settings-interface-i18n";

/** Bind this screen's copy to the current locale. */
export function createUserInterfaceSettingsPanelTranslator({ locale }: { locale: string }, _options = {}) {
  return (key: string): string => translateForUserInterfaceSettingsPanel({ locale, key });
}
