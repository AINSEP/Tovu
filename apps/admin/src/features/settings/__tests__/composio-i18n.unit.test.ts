import { describe, expect, it } from "vitest";
import { COMPOSIO_DICT } from "../composio-i18n";
import { COMMON_I18N } from "../../../lib/i18n-common";

/**
 * @file `COMPOSIO_DICT` cross-locale coverage, mirroring `trash/__tests__/trash-i18n.unit.test.ts`'s
 * parity idiom: identical key sets across every locale block, no empty values, the same 21-locale
 * roster the rest of this app's feature dictionaries ship, and no key that only re-states a
 * `COMMON_I18N` entry ("Save"/"Saving…" stay in `COMMON_I18N` — see `composio-i18n.ts`'s own header).
 *
 * Security finding #6 (Low, 2026-09-20 terra review): `ComposioKeyField` had no `t()` call at all —
 * this file, plus the call-site list below, is what would have caught "added a string to the
 * component, added it to zero locales."
 */
describe("COMPOSIO_DICT: cross-locale key parity", () => {
  const locales = Object.keys(COMPOSIO_DICT);

  it("has at least one locale", () => {
    expect(locales.length).toBeGreaterThan(0);
  });

  it("ships the exact same key set across every locale block", () => {
    const [firstLocale, ...rest] = locales;
    const referenceKeys = Object.keys(COMPOSIO_DICT[firstLocale]).sort();
    for (const locale of rest) {
      expect(Object.keys(COMPOSIO_DICT[locale]).sort(), `locale ${locale} key set`).toEqual(referenceKeys);
    }
  });

  it("has a non-empty translation for every key in every locale", () => {
    for (const locale of locales) {
      for (const [key, value] of Object.entries(COMPOSIO_DICT[locale])) {
        expect(value.length, `${locale} value for ${JSON.stringify(key)} should not be empty`).toBeGreaterThan(0);
      }
    }
  });

  it("covers the same 21 locales the rest of this app's feature dictionaries ship", () => {
    const EXPECTED_LOCALES = [
      "ar", "bn", "de", "es", "fa", "fr", "hi", "hu", "id", "it",
      "ja", "ko", "pl", "pt-BR", "ru", "th", "tr", "uk", "ur", "zh-CN", "zh-TW",
    ];
    expect(locales.sort()).toEqual(EXPECTED_LOCALES.sort());
  });

  it("does not duplicate a COMMON_I18N entry (that would create two places to update and let them drift)", () => {
    for (const locale of locales) {
      const commonKeys = new Set(Object.keys(COMMON_I18N[locale] ?? {}));
      for (const key of Object.keys(COMPOSIO_DICT[locale])) {
        expect(commonKeys.has(key), `COMPOSIO_DICT.${locale} redundantly carries COMMON_I18N key ${JSON.stringify(key)}`).toBe(false);
      }
    }
  });

  // Every copy string `ComposioKeyField.tsx`/`use-composio-key-field.hooks.ts` actually calls
  // t()/composioT() with — "Save"/"Saving…" excluded, since those resolve through COMMON_I18N.
  const CALL_SITE_KEYS = [
    "Composio API key",
    "Save a Composio API key to load the live connector catalog and connect accounts.",
    "A key ending in {tail} is saved. Paste a new one to replace it.",
    "Clear",
    "Replace saved key",
  ];

  it("covers every copy string ComposioKeyField.tsx calls t() with, in every locale", () => {
    for (const locale of locales) {
      for (const key of CALL_SITE_KEYS) {
        expect(COMPOSIO_DICT[locale][key], `locale ${locale}, key ${JSON.stringify(key)}`).toBeTruthy();
      }
    }
  });

  it("the call-site key list itself has no accidental duplicates or typos vs. the dictionary", () => {
    const referenceKeys = Object.keys(COMPOSIO_DICT[locales[0]]).sort();
    expect(CALL_SITE_KEYS.slice().sort()).toEqual(referenceKeys);
  });
});
