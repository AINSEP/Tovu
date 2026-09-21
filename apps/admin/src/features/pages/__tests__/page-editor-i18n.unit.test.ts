import { describe, expect, it } from "vitest";
import { PAGE_EDITOR_DICT } from "../page-editor-i18n";
import { COMMON_I18N } from "../../../lib/i18n-common";

/**
 * @file `PAGE_EDITOR_DICT` cross-locale coverage, mirroring `features/trash/__tests__/trash-i18n.
 * unit.test.ts`'s idiom (same `createDictionaryTranslator` + `COMMON_I18N` fallback shape as
 * `TRASH_DICT`, unlike `WIDGETS_DICT`/`FORMS_DICT`/`COLLECTIONS_DICT`'s bare-dict variant in
 * `widgets-i18n.unit.test.ts` and its two siblings from 374f10812). `PAGE_EDITOR_DICT` was the last
 * of this app's feature dictionaries with no parity test at all, so "added to source, added to zero
 * locales" (the exact class of bug this test caught below) was unguarded here.
 */
describe("PAGE_EDITOR_DICT: cross-locale key parity", () => {
  const locales = Object.keys(PAGE_EDITOR_DICT);

  it("has at least one locale", () => {
    expect(locales.length).toBeGreaterThan(0);
  });

  it("ships the exact same key set across every locale block", () => {
    const [firstLocale, ...rest] = locales;
    const referenceKeys = Object.keys(PAGE_EDITOR_DICT[firstLocale]).sort();
    for (const locale of rest) {
      expect(Object.keys(PAGE_EDITOR_DICT[locale]).sort(), `locale ${locale} key set`).toEqual(referenceKeys);
    }
  });

  it("has a non-empty translation for every key in every locale", () => {
    for (const locale of locales) {
      for (const [key, value] of Object.entries(PAGE_EDITOR_DICT[locale])) {
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
      for (const key of Object.keys(PAGE_EDITOR_DICT[locale])) {
        expect(commonKeys.has(key), `PAGE_EDITOR_DICT.${locale} redundantly carries COMMON_I18N key ${JSON.stringify(key)}`).toBe(false);
      }
    }
  });

  // Spot-check every key `use-page-editor.hooks.ts`/`rules.ts` actually call `t(locale, key)` with
  // (`pageSaveSuccessMessage`'s two branches and `pagePartialSaveMessage`'s `PAGE_PARTIAL_SAVE_COPY`
  // included), so a key added to one locale but not the rest fails here instead of silently
  // rendering English everywhere else.
  const CALL_SITE_KEYS = [
    "failed to load page",
    "failed to save page",
    "failed to delete page",
    "could not re-read the current version — your changes are still here, try again",
    "Saved",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.",
  ];

  it("covers every copy string use-page-editor.hooks.ts/rules.ts call t(locale, key) with, in every locale", () => {
    for (const locale of locales) {
      for (const key of CALL_SITE_KEYS) {
        expect(PAGE_EDITOR_DICT[locale][key], `locale ${locale}, key ${JSON.stringify(key)}`).toBeTruthy();
      }
    }
  });

  it("the call-site key list itself has no accidental duplicates or typos vs. the dictionary", () => {
    const referenceKeys = Object.keys(PAGE_EDITOR_DICT[locales[0]]).sort();
    expect(CALL_SITE_KEYS.slice().sort()).toEqual(referenceKeys);
  });
});
