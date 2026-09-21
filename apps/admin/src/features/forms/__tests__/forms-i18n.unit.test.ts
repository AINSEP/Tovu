import { describe, expect, it } from "vitest";

import { COMMON_I18N } from "@/lib/i18n-common";
import { FORMS_DICT } from "../forms-i18n";

/**
 * @file `FORMS_DICT` cross-locale coverage — same idiom and same two deliberate differences from
 * the Trash version as `widgets/__tests__/widgets-i18n.unit.test.ts` (read that file's header:
 * `forms-i18n.ts` also exports a bare `DICT[locale]?.[key] ?? key` translator with no
 * `COMMON_I18N` fallback, so a shared key must be carried locally, and a missing key renders the
 * literal English string).
 *
 * Added 2026-09-20 during review of 84b5ae860 ("confirm submission deletes in a modal"): that fix
 * added two keys to all 21 locale blocks by hand, with no test enforcing it.
 */
describe("FORMS_DICT: cross-locale key parity", () => {
  const locales = Object.keys(FORMS_DICT);

  it("covers the same 21 locales the rest of this app's feature dictionaries ship", () => {
    const EXPECTED_LOCALES = [
      "ar", "bn", "de", "es", "fa", "fr", "hi", "hu", "id", "it",
      "ja", "ko", "pl", "pt-BR", "ru", "th", "tr", "uk", "ur", "zh-CN", "zh-TW",
    ];
    expect(locales.slice().sort()).toEqual(EXPECTED_LOCALES.slice().sort());
  });

  /** Same measured state, same rule, same pending fallback fix as
   *  `widgets/__tests__/widgets-i18n.unit.test.ts`'s own version of this assertion — read its
   *  comment. The `es` block here is likewise a superset whose extra keys are all `COMMON_I18N`
   *  strings ("Cancel", "Save", "Status", …). */
  it("every partially-present key is one COMMON_I18N carries in all 21 locales (the pending fallback fix's scope)", () => {
    const allKeys = new Set(locales.flatMap((locale) => Object.keys(FORMS_DICT[locale])));
    const unrescuable: string[] = [];
    for (const key of allKeys) {
      const missingIn = locales.filter((locale) => FORMS_DICT[locale][key] === undefined);
      if (missingIn.length === 0) continue;
      if (locales.every((locale) => COMMON_I18N[locale]?.[key] !== undefined)) continue;
      unrescuable.push(`${JSON.stringify(key)} missing in ${missingIn.join(",")}`);
    }
    expect(unrescuable).toEqual([]);
  });

  it("has a non-empty translation for every key in every locale", () => {
    for (const locale of locales) {
      for (const [key, value] of Object.entries(FORMS_DICT[locale])) {
        expect(value.length, `${locale} value for ${JSON.stringify(key)} should not be empty`).toBeGreaterThan(0);
      }
    }
  });

  // The keys 84b5ae860's submission-delete confirm dialog added or reused from this dict.
  // `t("Delete permanently")` (its confirm BUTTON) is deliberately not here: FORMS_DICT carries it
  // in no locale at all, so it renders English in 20 of them until the COMMON_I18N fallback fix
  // lands — the state the assertion above pins.
  const DELETE_DIALOG_KEYS = ["Delete submission", "Delete permanently?", "This cannot be undone."];

  it.each(DELETE_DIALOG_KEYS)("carries %j in every locale (submission-delete confirm dialog)", (key) => {
    for (const locale of locales) {
      expect(FORMS_DICT[locale][key], `${locale} is missing ${JSON.stringify(key)}`).toBeTruthy();
    }
  });
});
