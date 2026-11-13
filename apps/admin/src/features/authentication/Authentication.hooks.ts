import { t as translateForAuthentication } from "./authentication-i18n";

/** Bind this screen's copy to the current locale. */
export function createAuthenticationTranslator({ locale }: { locale: string }, _options = {}) {
  return (key: string): string => translateForAuthentication({ locale, key });
}
