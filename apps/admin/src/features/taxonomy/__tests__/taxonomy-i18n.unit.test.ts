import { describe, expect, it } from "vitest";

import { COMMON_I18N } from "@/lib/i18n-common";
import { TAXONOMY_DICT, t } from "../taxonomy-i18n";

/**
 * @file `TAXONOMY_DICT` cross-locale coverage — same idiom as
 * `widgets/__tests__/widgets-i18n.unit.test.ts` (read that file's header): `taxonomy-i18n.ts`
 * exported a bare `DICT[locale]?.[key] ?? key` translator with no `COMMON_I18N` fallback before
 * this fix, so a shared key had to be carried locally, and a missing key rendered the literal
 * English string.
 *
 * Added 2026-09-21 alongside the S-I18N fallback fix for widgets/forms/collections — the
 * `plan-content2.md` sibling defect flagged the same shape here, and this file did not exist yet.
 */
describe("TAXONOMY_DICT: cross-locale key parity", () => {
  const locales = Object.keys(TAXONOMY_DICT);

  it("covers the same 21 locales the rest of this app's feature dictionaries ship", () => {
    const EXPECTED_LOCALES = [
      "ar", "bn", "de", "es", "fa", "fr", "hi", "hu", "id", "it",
      "ja", "ko", "pl", "pt-BR", "ru", "th", "tr", "uk", "ur", "zh-CN", "zh-TW",
    ];
    expect(locales.slice().sort()).toEqual(EXPECTED_LOCALES.slice().sort());
  });

  /** Same measured state, same rule as `widgets/__tests__/widgets-i18n.unit.test.ts`'s own version
   *  of this assertion — read its comment. The `es` block here is likewise a superset whose extra
   *  keys are all `COMMON_I18N` strings ("Cancel", "Save", "Status", …). */
  it("every partially-present key is one COMMON_I18N carries in all 21 locales", () => {
    const allKeys = new Set(locales.flatMap((locale) => Object.keys(TAXONOMY_DICT[locale])));
    const unrescuable: string[] = [];
    for (const key of allKeys) {
      const missingIn = locales.filter((locale) => TAXONOMY_DICT[locale][key] === undefined);
      if (missingIn.length === 0) continue;
      if (locales.every((locale) => COMMON_I18N[locale]?.[key] !== undefined)) continue;
      unrescuable.push(`${JSON.stringify(key)} missing in ${missingIn.join(",")}`);
    }
    expect(unrescuable).toEqual([]);
  });

  it("has a non-empty translation for every key in every locale", () => {
    for (const locale of locales) {
      for (const [key, value] of Object.entries(TAXONOMY_DICT[locale])) {
        expect(value.length, `${locale} value for ${JSON.stringify(key)} should not be empty`).toBeGreaterThan(0);
      }
    }
  });
});

/**
 * Regression for basic words (Save, Cancel, …) rendering English in 20 of 21 locales (S-I18N
 * fallback fix). `TAXONOMY_DICT.de` carries neither "Save" nor "Cancel" — both are `COMMON_I18N`
 * keys in all 21 locales, so `t` must fall through to `COMMON_I18N` instead of returning the raw
 * English key.
 */
describe("TAXONOMY_DICT: t() falls back to COMMON_I18N", () => {
  it("translates 'Save' in German even though TAXONOMY_DICT.de never carries it", () => {
    expect(TAXONOMY_DICT.de.Save).toBeUndefined();
    expect(t("de", "Save")).toBe(COMMON_I18N.de.Save);
  });

  it("translates 'Cancel' in German even though TAXONOMY_DICT.de never carries it", () => {
    expect(TAXONOMY_DICT.de.Cancel).toBeUndefined();
    expect(t("de", "Cancel")).toBe(COMMON_I18N.de.Cancel);
  });
});
