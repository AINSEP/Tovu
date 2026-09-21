import { describe, expect, it } from "vitest";

import { COMMON_I18N } from "@/lib/i18n-common";
import { WIDGETS_DICT, t } from "../widgets-i18n";

/**
 * @file `WIDGETS_DICT` cross-locale coverage, mirroring `trash/__tests__/trash-i18n.unit.test.ts`'s
 * and `media/__tests__/media-i18n.unit.test.ts`'s parity idiom.
 *
 * Two deliberate differences from the Trash version: `widgets-i18n.ts` exports a bare
 * `DICT[locale]?.[key] ?? key` translator with NO `COMMON_I18N` fallback (unlike
 * `createDictionaryTranslator`, which Trash uses), so
 *  - a key `COMMON_I18N` also carries is NOT dead weight here — it is the only way this screen can
 *    render that string translated, so Trash's "does not duplicate COMMON_I18N" assertion is
 *    inverted for this dict and deliberately absent, and
 *  - a key missing from this dict renders the literal English string, which is exactly what the
 *    CALL_SITE_KEYS block below guards.
 *
 * Added 2026-09-20 during review of 7b95b13ba ("confirm before permanently deleting a trashed
 * widget"): that fix added two keys to all 21 locale blocks by hand, with no test enforcing it.
 */
describe("WIDGETS_DICT: cross-locale key parity", () => {
  const locales = Object.keys(WIDGETS_DICT);

  it("covers the same 21 locales the rest of this app's feature dictionaries ship", () => {
    const EXPECTED_LOCALES = [
      "ar", "bn", "de", "es", "fa", "fr", "hi", "hu", "id", "it",
      "ja", "ko", "pl", "pt-BR", "ru", "th", "tr", "uk", "ur", "zh-CN", "zh-TW",
    ];
    expect(locales.slice().sort()).toEqual(EXPECTED_LOCALES.slice().sort());
  });

  /**
   * Full key-set parity does NOT hold today: the `es` block was written as a superset and carries
   * ~6 keys the other 20 locales lack ("Save", "Status", "Title", "Delete permanently", …). Every
   * one of those is a string `COMMON_I18N` already translates into all 21 locales, so the pending
   * "`WIDGETS_DICT` has no `COMMON_I18N` fallback" fix (`createDictionaryTranslator`, which
   * `trash-i18n.ts` already uses) closes the whole gap without touching this dict.
   *
   * So the rule this asserts is the one that is actually true and worth defending: a key may be
   * absent from some locales ONLY if `COMMON_I18N` carries it in every locale. A new
   * feature-specific string added to one locale block and forgotten in the other 20 has no
   * fallback to rescue it, and fails here by name.
   */
  it("every partially-present key is one COMMON_I18N carries in all 21 locales (the pending fallback fix's scope)", () => {
    const allKeys = new Set(locales.flatMap((locale) => Object.keys(WIDGETS_DICT[locale])));
    const unrescuable: string[] = [];
    for (const key of allKeys) {
      const missingIn = locales.filter((locale) => WIDGETS_DICT[locale][key] === undefined);
      if (missingIn.length === 0) continue;
      if (locales.every((locale) => COMMON_I18N[locale]?.[key] !== undefined)) continue;
      unrescuable.push(`${JSON.stringify(key)} missing in ${missingIn.join(",")}`);
    }
    expect(unrescuable).toEqual([]);
  });

  it("has a non-empty translation for every key in every locale", () => {
    for (const locale of locales) {
      for (const [key, value] of Object.entries(WIDGETS_DICT[locale])) {
        expect(value.length, `${locale} value for ${JSON.stringify(key)} should not be empty`).toBeGreaterThan(0);
      }
    }
  });

  // The keys 7b95b13ba's permanent-delete confirm dialog added or reused from this dict. Without
  // this block, "added to source, added to zero locales" renders English to 20 locales silently —
  // the exact regression `media-i18n.unit.test.ts` guards against for its own purge dialog.
  // `t("Delete permanently")` (the dialog's confirm BUTTON) is deliberately not here: it lives in
  // `es` only, and is covered by `COMMON_I18N` in all 21 — it renders English in the other 20
  // until the fallback fix above lands, which is the state the assertion above pins.
  const PURGE_DIALOG_KEYS = ["Delete permanently?", "Permanently delete", "This cannot be undone."];

  it.each(PURGE_DIALOG_KEYS)("carries %j in every locale (permanent-delete confirm dialog)", (key) => {
    for (const locale of locales) {
      expect(WIDGETS_DICT[locale][key], `${locale} is missing ${JSON.stringify(key)}`).toBeTruthy();
    }
  });
});

/**
 * Regression for the confirm BUTTON rendering English in 20 of 21 locales (S-I18N fallback fix).
 * `t("Delete permanently")` is `es`-only in `WIDGETS_DICT`; `"Save"` is absent from every locale
 * but `es`. Both are `COMMON_I18N` keys in all 21 locales, so `t` must fall through to
 * `COMMON_I18N` instead of returning the raw English key.
 */
describe("WIDGETS_DICT: t() falls back to COMMON_I18N", () => {
  it("translates 'Delete permanently' in German even though WIDGETS_DICT.de never carries it", () => {
    expect(WIDGETS_DICT.de["Delete permanently"]).toBeUndefined();
    expect(t("de", "Delete permanently")).toBe(COMMON_I18N.de["Delete permanently"]);
  });

  it("translates 'Save' in German even though WIDGETS_DICT.de never carries it", () => {
    expect(WIDGETS_DICT.de.Save).toBeUndefined();
    expect(t("de", "Save")).toBe(COMMON_I18N.de.Save);
  });
});
