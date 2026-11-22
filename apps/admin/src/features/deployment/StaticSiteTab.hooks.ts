import { t as translateForStaticSiteTab } from "./deployment-i18n";

/** Bind this screen's copy to the current locale. */
export function createStaticSiteTabTranslator({ locale }: { locale: string }, _options = {}) {
  return (key: string): string => translateForStaticSiteTab({ locale, key });
}

