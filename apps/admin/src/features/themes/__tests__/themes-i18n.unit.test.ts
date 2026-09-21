import { describe, expect, it } from "vitest";

import { COMMON_I18N } from "@/lib/i18n-common";
import { THEMES_DICT, t } from "../themes-i18n";

const LOCALES = [
  "ar", "bn", "de", "es", "fa", "fr", "hi", "hu", "id", "it",
  "ja", "ko", "pl", "pt-BR", "ru", "th", "tr", "uk", "ur", "zh-CN", "zh-TW",
];

/**
 * @file `THEMES_DICT` cross-locale key parity for the theme-preview-modal keys `eacb43fd5` added.
 * That commit put `"Close preview"` and `"{id} theme preview"` in only 18 of the file's 21 locale
 * blocks — `zh-CN`, `zh-TW`, and `pt-BR` were skipped even though those blocks already exist in the
 * file (their `"You already have a theme called {id}."` key proves the block is present). `t()`
 * falls back to the literal English key when a locale's block omits a key and `COMMON_I18N` does not
 * carry it either — neither of these two keys is in `COMMON_I18N` — so this asserts translated
 * value !== source string for every locale, catching a silent English fallback that a mere
 * `!== undefined` check on the dictionary would miss.
 *
 * Added 2026-09-21 verifying the fix dispatched after `eacb43fd5` shipped the gap.
 */
describe("themes-i18n: theme preview modal key parity across all 21 locales", () => {
  it.each(LOCALES)('translates "Close preview" for locale %s', (locale) => {
    expect(t(locale, "Close preview")).not.toBe("Close preview");
  });

  it.each(LOCALES)('translates "{id} theme preview" for locale %s', (locale) => {
    expect(t(locale, "{id} theme preview")).not.toBe("{id} theme preview");
  });
});

/**
 * Whole-dictionary checks, same idiom as `taxonomy/__tests__/taxonomy-i18n.unit.test.ts`. The two
 * `it.each` blocks above pin only the two preview-modal keys: deleting any OTHER key from one
 * locale, or building `t` without the `COMMON_I18N` fallback, passed this file before these were
 * added.
 */
describe("THEMES_DICT: cross-locale key parity", () => {
  const locales = Object.keys(THEMES_DICT);

  it("covers the same 21 locales the rest of this app's feature dictionaries ship", () => {
    expect(locales.slice().sort()).toEqual(LOCALES.slice().sort());
  });

  it("every partially-present key is one COMMON_I18N carries in all 21 locales", () => {
    const allKeys = new Set(locales.flatMap((locale) => Object.keys(THEMES_DICT[locale])));
    const unrescuable: string[] = [];
    for (const key of allKeys) {
      const missingIn = locales.filter((locale) => THEMES_DICT[locale][key] === undefined);
      if (missingIn.length === 0) continue;
      if (locales.every((locale) => COMMON_I18N[locale]?.[key] !== undefined)) continue;
      unrescuable.push(`${JSON.stringify(key)} missing in ${missingIn.join(",")}`);
    }
    expect(unrescuable).toEqual([]);
  });

  it("has a non-empty translation for every key in every locale", () => {
    for (const locale of locales) {
      for (const [key, value] of Object.entries(THEMES_DICT[locale])) {
        expect(value.length, `${locale} value for ${JSON.stringify(key)} should not be empty`).toBeGreaterThan(0);
      }
    }
  });
});

describe("THEMES_DICT: t() falls back to COMMON_I18N", () => {
  it("translates 'Cancel' in German even though THEMES_DICT.de never carries it", () => {
    expect(THEMES_DICT.de.Cancel).toBeUndefined();
    expect(t("de", "Cancel")).toBe(COMMON_I18N.de.Cancel);
  });
});
