/**
 * @file One shared implementation of the `DICT[locale]?.[key] ?? key` lookup every `*-i18n.ts`
 * file in this app re-implements today. Centralizing it means a locale's fallback behavior
 * (feature dict → shared `COMMON_I18N` → the English key itself, never a raw dictionary-miss
 * placeholder) is defined and tested in exactly one place instead of once per feature file.
 */
import { COMMON_I18N } from "./i18n-common";

export type LocaleDictionary = Record<string, Record<string, string>>;

/** Feature dictionaries stay small and feature-specific; this is what lets a feature file skip
 *  redefining Save/Cancel/Delete/etc. — it inherits them from `COMMON_I18N` for free. */
export function createDictionaryTranslator(featureDict: LocaleDictionary) {
  return function t(locale: string, key: string): string {
    return featureDict[locale]?.[key] ?? COMMON_I18N[locale]?.[key] ?? key;
  };
}
