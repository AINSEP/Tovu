import { useMemo } from "react";
import { createDictionaryTranslator, type Translate } from "@jini-ai/ui/panel-kit";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { COMMON_I18N } from "../../lib/i18n-common";
import { CONSENT_DICT } from "./consent-dictionary";

/**
 * @file Copy for Administration → Cookie Consent. One dictionary per locale serves both this page
 * and the Jini field sections it renders (they take the same English-keyed `dictionary`), so a
 * label reads the same wherever it appears.
 */

const translate = createDictionaryTranslator({ featureDictionary: CONSENT_DICT }, { commonDictionary: COMMON_I18N });

export interface ConsentTranslation {
  t: Translate;
  /** The locale's entries, for the Jini sections' `dictionary` prop; English falls through. */
  dictionary: Readonly<Record<string, string>>;
}

/** Binds both to the admin's resolved locale. @complexity O(1) per lookup. */
export function useConsentTranslate(): ConsentTranslation {
  const locale = useAdminLocale();
  return useMemo(() => ({ t: (key: string) => translate({ locale, key }), dictionary: CONSENT_DICT[locale] ?? {} }), [locale]);
}
