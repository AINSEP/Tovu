import { describe, expect, it } from "vitest";

import { COMMON_I18N } from "@/lib/i18n-common";
import { MENUS_DICT, t } from "../menus-i18n";

/**
 * @file `MENUS_DICT` cross-locale coverage — same idiom as
 * `taxonomy/__tests__/taxonomy-i18n.unit.test.ts` (read that file's header): `menus-i18n.ts`
 * exported no module-level `t` at all before this fix — `use-menus.hooks.ts` and
 * `use-menu-editor.hooks.ts` each built their own no-fallback `MENUS_DICT[locale]?.[key] ?? key`
 * closure inline.
 *
 * Added 2026-09-21 alongside the S-I18N fallback fix extension to the rest of the admin app.
 */
describe("MENUS_DICT: cross-locale key parity", () => {
  const locales = Object.keys(MENUS_DICT);

  it("covers the same 21 locales the rest of this app's feature dictionaries ship", () => {
    const EXPECTED_LOCALES = [
      "ar", "bn", "de", "es", "fa", "fr", "hi", "hu", "id", "it",
      "ja", "ko", "pl", "pt-BR", "ru", "th", "tr", "uk", "ur", "zh-CN", "zh-TW",
    ];
    expect(locales.slice().sort()).toEqual(EXPECTED_LOCALES.slice().sort());
  });

  /** Same measured state, same rule as `taxonomy/__tests__/taxonomy-i18n.unit.test.ts`'s own
   *  version of this assertion — read its comment. `MENUS_DICT`'s `es` block is a superset (plus
   *  `hi`/`ur`/`bn`, which happen to already carry a few of the same words) whose extra keys
   *  ("Title", "Status", "Trash", "Delete permanently", "Save", "Label") are all `COMMON_I18N`
   *  words in every locale. */
  it("every partially-present key is one COMMON_I18N carries in all 21 locales", () => {
    const allKeys = new Set(locales.flatMap((locale) => Object.keys(MENUS_DICT[locale])));
    const unrescuable: string[] = [];
    for (const key of allKeys) {
      const missingIn = locales.filter((locale) => MENUS_DICT[locale][key] === undefined);
      if (missingIn.length === 0) continue;
      if (locales.every((locale) => COMMON_I18N[locale]?.[key] !== undefined)) continue;
      unrescuable.push(`${JSON.stringify(key)} missing in ${missingIn.join(",")}`);
    }
    expect(unrescuable).toEqual([]);
  });

  it("has a non-empty translation for every key in every locale", () => {
    for (const locale of locales) {
      for (const [key, value] of Object.entries(MENUS_DICT[locale])) {
        expect(value.length, `${locale} value for ${JSON.stringify(key)} should not be empty`).toBeGreaterThan(0);
      }
    }
  });
});

/**
 * Regression for the "Permanently delete menu?" confirm dialog's BUTTON rendering English in 17 of
 * 21 locales (S-I18N fallback fix). `MENUS_DICT.de` never carries "Delete permanently" (only
 * `es`/`hi`/`ur`/`bn` do), but it is a `COMMON_I18N` key in all 21 locales, so `t` must fall through
 * to `COMMON_I18N` instead of returning the raw English key. Menus.tsx calls `t("Delete permanently")`
 * directly for this button.
 */
describe("MENUS_DICT: t() falls back to COMMON_I18N", () => {
  it("translates 'Delete permanently' in German even though MENUS_DICT.de never carries it", () => {
    expect(MENUS_DICT.de["Delete permanently"]).toBeUndefined();
    expect(t("de", "Delete permanently")).toBe(COMMON_I18N.de["Delete permanently"]);
  });

  it("translates 'Save' in German even though MENUS_DICT.de never carries it", () => {
    expect(MENUS_DICT.de.Save).toBeUndefined();
    expect(t("de", "Save")).toBe(COMMON_I18N.de.Save);
  });
});
