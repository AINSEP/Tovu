import { describe, expect, it } from "vitest";

import { COMMON_I18N } from "@/lib/i18n-common";
import { FORMS_DICT, t } from "../forms-i18n";

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

  // "Move" is deliberately empty in the six object-before-verb locales (ja, ko, tr, hi, ur, bn) —
  // same documented exception `posts-i18n.ts`'s own parity test carries for its identical "Move"
  // fragment (the verb is already embedded in the trailing "to trash? …" fragment that follows the
  // quoted name in those languages, reused verbatim here — T7a, 2026-09-21).
  const DELIBERATELY_EMPTY: Record<string, string[]> = {
    Move: ["ja", "ko", "tr", "hi", "ur", "bn"],
  };

  it("has a non-empty translation for every key in every locale, except documented deliberate exceptions", () => {
    for (const locale of locales) {
      for (const [key, value] of Object.entries(FORMS_DICT[locale])) {
        if (DELIBERATELY_EMPTY[key]?.includes(locale)) continue;
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

  // T7a (2026-09-21): forms and submissions both move to the Trash now — the keys `FormsList.tsx`'s
  // `ConfirmDialog` (row delete) and `FormEditor.tsx`'s `FormSubmissionDetail` `ConfirmDialog`
  // (submission delete) both need. Added to all 21 locale blocks by hand (reusing `posts-i18n.ts`'s
  // already-translated "Move to trash?"/"Move to trash"/"Move"/suffix pair for the row dialog); this
  // is the enforcing test the header comment above says the LAST hand-added key pair shipped without.
  const TRASH_DIALOG_KEYS = [
    "Move to trash?",
    "Move to trash",
    "Move",
    "to trash? It will disappear from the site and from this list.",
    "It will disappear from this list. You can restore it from the Trash.",
  ];

  it.each(TRASH_DIALOG_KEYS)("carries %j in every locale (move-to-trash confirm dialogs)", (key) => {
    for (const locale of locales) {
      expect(FORMS_DICT[locale][key], `${locale} is missing ${JSON.stringify(key)}`).not.toBeUndefined();
    }
  });
});

/**
 * Regression for the confirm BUTTON rendering English in every locale (S-I18N fallback fix).
 * `FORMS_DICT` carries neither "Delete permanently" nor "Save" in any locale, but both are
 * `COMMON_I18N` keys in all 21, so `forms-i18n.ts` needs an exported, fallback-aware `t` (it had
 * none before this fix — both hooks built their own no-fallback lookup inline).
 */
describe("FORMS_DICT: t() falls back to COMMON_I18N", () => {
  it("translates 'Delete permanently' in German even though FORMS_DICT.de never carries it", () => {
    expect(FORMS_DICT.de["Delete permanently"]).toBeUndefined();
    expect(t("de", "Delete permanently")).toBe(COMMON_I18N.de["Delete permanently"]);
  });

  it("translates 'Save' in German even though FORMS_DICT.de never carries it", () => {
    expect(FORMS_DICT.de.Save).toBeUndefined();
    expect(t("de", "Save")).toBe(COMMON_I18N.de.Save);
  });
});
