import { createDictionaryTranslator as createPackageTranslator, type LocaleDictionary } from "@jini-ai/ui/panel-kit";
import { COMMON_I18N } from "./i18n-common";

// Fallback/injected-translator rationale: Jini/packages/ui/src/features/i18n/dictionary-translator.ts.
export type { LocaleDictionary, Translate } from "@jini-ai/ui/panel-kit";
export type DictionaryTranslator = (locale: string, key: string) => string;

/** Bind the common Tovu dictionary and preserve feature-first fallback and caller shape.
 *
 * Pre-extraction host rationale (historical names below describe the original layout).
 * The shared implementation and its active lifecycle constraints now live in Jini; Tovu keeps
 * this provenance so the adapter does not erase policy, bug history or the reasons for thresholds.
 *
 * @file One shared implementation of the `DICT[locale]?.[key] ?? key` lookup every `*-i18n.ts`
 * file in this app re-implements today. Centralizing it means a locale's fallback behavior
 * (feature dict → shared `COMMON_I18N` → the English key itself, never a raw dictionary-miss
 * placeholder) is defined and tested in exactly one place instead of once per feature file.
 *
 * A translator already bound to one locale — the form a component or hook receives by injection.
 *
 * Named because the admin has **two** functions conventionally called `t`, distinguished only by
 * arity: this one-argument bound form, and the two-argument {@link DictionaryTranslator} that
 * `createDictionaryTranslator` returns. Both are `t` at the call site, which is fine to read
 * (`t("+ Add widget")` needs no lookup — the argument is the English copy) but was previously
 * re-declared inline as `t: (key: string) => string` in ~197 places, so nothing named the
 * distinction anywhere. Annotate injected translators with this type rather than repeating the
 * signature; `Translate` is greppable in a way `t` is not.
 *
 *  The unbound form: resolves against a locale supplied per call. Prefer handing components a
 *  {@link Translate} bound once by their hook over threading a locale to every call site.
 *
 *  Feature dictionaries stay small and feature-specific; this is what lets a feature file skip
 *  redefining Save/Cancel/Delete/etc. — it inherits them from `COMMON_I18N` for free.
 */
export function createDictionaryTranslator(featureDict: LocaleDictionary): BoundDictionaryTranslator {
  const translate = createPackageTranslator({ featureDictionary: featureDict }, { commonDictionary: COMMON_I18N });
  return Object.assign((locale: string, key: string) => translate({ locale, key }), { dictionary: featureDict });
}

/** A translator that also exposes the feature dictionary it reads. The lookup's English fallback
 *  hides a locale left untranslated, so `untranslated-copy.unit.test.ts` reads every module's
 *  dictionary through this property — most feature dictionaries are module-private. */
export type BoundDictionaryTranslator = DictionaryTranslator & { readonly dictionary: LocaleDictionary };
