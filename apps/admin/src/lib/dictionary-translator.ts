/**
 * @file One shared implementation of the `DICT[locale]?.[key] ?? key` lookup every `*-i18n.ts`
 * file in this app re-implements today. Centralizing it means a locale's fallback behavior
 * (feature dict → shared `COMMON_I18N` → the English key itself, never a raw dictionary-miss
 * placeholder) is defined and tested in exactly one place instead of once per feature file.
 */
import { COMMON_I18N } from "./i18n-common";

export type LocaleDictionary = Record<string, Record<string, string>>;

/**
 * A translator already bound to one locale — the form a component or hook receives by injection.
 *
 * Named because the admin has **two** functions conventionally called `t`, distinguished only by
 * arity: this one-argument bound form, and the two-argument {@link DictionaryTranslator} that
 * `createDictionaryTranslator` returns. Both are `t` at the call site, which is fine to read
 * (`t("+ Add widget")` needs no lookup — the argument is the English copy) but was previously
 * re-declared inline as `t: (key: string) => string` in ~197 places, so nothing named the
 * distinction anywhere. Annotate injected translators with this type rather than repeating the
 * signature; `Translate` is greppable in a way `t` is not.
 */
export type Translate = (key: string) => string;

/** The unbound form: resolves against a locale supplied per call. Prefer handing components a
 *  {@link Translate} bound once by their hook over threading a locale to every call site. */
export type DictionaryTranslator = (locale: string, key: string) => string;

/** Feature dictionaries stay small and feature-specific; this is what lets a feature file skip
 *  redefining Save/Cancel/Delete/etc. — it inherits them from `COMMON_I18N` for free. */
export function createDictionaryTranslator(featureDict: LocaleDictionary): DictionaryTranslator {
  return function t(locale: string, key: string): string {
    return featureDict[locale]?.[key] ?? COMMON_I18N[locale]?.[key] ?? key;
  };
}
