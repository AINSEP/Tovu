import { describe, expect, it } from "vitest";

import { COMMON_I18N } from "../../../lib/i18n-common";
import { EMAIL_DICT } from "../email-i18n";

/** @file `EMAIL_DICT` parity: the same 21 locales, the same keys in each, no empties, no COMMON repeats. */
describe("EMAIL_DICT", () => {
  const locales = Object.keys(EMAIL_DICT);

  it("covers the same 21 locales as every other feature dictionary", () => {
    expect([...locales].sort()).toEqual(["ar", "bn", "de", "es", "fa", "fr", "hi", "hu", "id", "it", "ja", "ko", "pl", "pt-BR", "ru", "th", "tr", "uk", "ur", "zh-CN", "zh-TW"].sort());
  });

  it("ships the same non-empty keys in every locale and repeats nothing COMMON_I18N carries", () => {
    const reference = Object.keys(EMAIL_DICT.es!).sort();
    for (const locale of locales) {
      expect(Object.keys(EMAIL_DICT[locale]!).sort(), locale).toEqual(reference);
      for (const [key, value] of Object.entries(EMAIL_DICT[locale]!)) {
        expect(value.length, `${locale} ${key}`).toBeGreaterThan(0);
        expect(COMMON_I18N[locale]?.[key], `${locale} repeats COMMON ${key}`).toBeUndefined();
      }
    }
  });
});
