import { describe, expect, it } from "vitest";

import { COMMON_I18N } from "@/lib/i18n-common";
import { DASHBOARD_DICT, t } from "../dashboard-i18n";

/**
 * @file `DASHBOARD_DICT` cross-locale coverage — same idiom as
 * `taxonomy/__tests__/taxonomy-i18n.unit.test.ts` (read that file's header): `dashboard-i18n.ts`
 * exported a bare `DICT[locale]?.[key] ?? key` translator with no `COMMON_I18N` fallback before
 * this fix.
 *
 * Scope note (per the S-I18N fallback dispatch): this is ONLY the fallback-mechanism switch.
 * `rules.ts`'s `postsStatMeta`/`pagesStatMeta`/`commentsStatMeta` stat-card meta lines stay English
 * on purpose — see this dictionary's own header — and are untouched by this fix.
 *
 * Added 2026-09-21 alongside the S-I18N fallback fix extension to the rest of the admin app.
 */
describe("DASHBOARD_DICT: cross-locale key parity", () => {
  const locales = Object.keys(DASHBOARD_DICT);

  it("covers the same 21 locales the rest of this app's feature dictionaries ship", () => {
    const EXPECTED_LOCALES = [
      "ar", "bn", "de", "es", "fa", "fr", "hi", "hu", "id", "it",
      "ja", "ko", "pl", "pt-BR", "ru", "th", "tr", "uk", "ur", "zh-CN", "zh-TW",
    ];
    expect(locales.slice().sort()).toEqual(EXPECTED_LOCALES.slice().sort());
  });

  it("every partially-present key is one COMMON_I18N carries in all 21 locales", () => {
    const allKeys = new Set(locales.flatMap((locale) => Object.keys(DASHBOARD_DICT[locale])));
    const unrescuable: string[] = [];
    for (const key of allKeys) {
      const missingIn = locales.filter((locale) => DASHBOARD_DICT[locale][key] === undefined);
      if (missingIn.length === 0) continue;
      if (locales.every((locale) => COMMON_I18N[locale]?.[key] !== undefined)) continue;
      unrescuable.push(`${JSON.stringify(key)} missing in ${missingIn.join(",")}`);
    }
    expect(unrescuable).toEqual([]);
  });

  it("has a non-empty translation for every key in every locale", () => {
    for (const locale of locales) {
      for (const [key, value] of Object.entries(DASHBOARD_DICT[locale])) {
        expect(value.length, `${locale} value for ${JSON.stringify(key)} should not be empty`).toBeGreaterThan(0);
      }
    }
  });
});

/**
 * Regression for basic words (Save, Cancel, …) rendering English in 20 of 21 locales (S-I18N
 * fallback fix). `DASHBOARD_DICT.de` carries neither "Save" nor "Cancel" — both are `COMMON_I18N`
 * keys in all 21 locales, so `t` must fall through to `COMMON_I18N` instead of returning the raw
 * English key.
 */
describe("DASHBOARD_DICT: t() falls back to COMMON_I18N", () => {
  it("translates 'Save' in German even though DASHBOARD_DICT.de never carries it", () => {
    expect(DASHBOARD_DICT.de.Save).toBeUndefined();
    expect(t("de", "Save")).toBe(COMMON_I18N.de.Save);
  });

  it("translates 'Cancel' in German even though DASHBOARD_DICT.de never carries it", () => {
    expect(DASHBOARD_DICT.de.Cancel).toBeUndefined();
    expect(t("de", "Cancel")).toBe(COMMON_I18N.de.Cancel);
  });
});
