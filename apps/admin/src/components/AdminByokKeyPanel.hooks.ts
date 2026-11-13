import { t as translateForAdminByokKeyPanel } from "./shared-components-i18n";

/** Bind this screen's copy to the current locale. */
export function createAdminByokKeyPanelTranslator({ locale }: { locale: string }, _options = {}) {
  return (key: string): string => translateForAdminByokKeyPanel({ locale, key });
}
