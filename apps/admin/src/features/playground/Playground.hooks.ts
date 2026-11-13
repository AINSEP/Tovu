import { t as translateForPlayground } from "./playground-i18n";

/** Bind this screen's copy to the current locale. */
export function createPlaygroundTranslator({ locale }: { locale: string }, _options = {}) {
  return (key: string): string => translateForPlayground({ locale, key });
}
