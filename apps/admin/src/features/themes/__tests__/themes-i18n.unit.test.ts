import { describe, expect, it } from "vitest";

import { COMMON_I18N } from "@/lib/i18n-common";
import { t } from "../themes-i18n";

// `THEMES_DICT` is not exported (unlike `TAXONOMY_DICT`), so this suite reaches every locale's
// keys through `t()` instead of the dictionary object directly.
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
