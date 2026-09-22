import { describe, expect, it } from "vitest";
import { TRASH_DICT } from "../trash-i18n";
import { COMMON_I18N } from "../../../lib/i18n-common";

/**
 * @file `TRASH_DICT` cross-locale coverage, mirroring `lib/__tests__/i18n-common.unit.test.ts`'s and
 * `media/__tests__/media-i18n.unit.test.ts`'s parity idiom: identical key sets across every locale
 * block, no empty values, and — this feature's own addition — no key that only re-states a
 * `COMMON_I18N` entry (a duplicate is dead weight that can silently drift from the shared value; the
 * whole point of `createDictionaryTranslator`'s fallback chain is that a feature dict does not need
 * to repeat what `COMMON_I18N` already carries).
 */
describe("TRASH_DICT: cross-locale key parity", () => {
  const locales = Object.keys(TRASH_DICT);

  it("has at least one locale", () => {
    expect(locales.length).toBeGreaterThan(0);
  });

  it("ships the exact same key set across every locale block", () => {
    const [firstLocale, ...rest] = locales;
    const referenceKeys = Object.keys(TRASH_DICT[firstLocale]).sort();
    for (const locale of rest) {
      expect(Object.keys(TRASH_DICT[locale]).sort(), `locale ${locale} key set`).toEqual(referenceKeys);
    }
  });

  it("has a non-empty translation for every key in every locale", () => {
    for (const locale of locales) {
      for (const [key, value] of Object.entries(TRASH_DICT[locale])) {
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
      for (const key of Object.keys(TRASH_DICT[locale])) {
        expect(commonKeys.has(key), `TRASH_DICT.${locale} redundantly carries COMMON_I18N key ${JSON.stringify(key)}`).toBe(false);
      }
    }
  });

  // Spot-check every key Trash.tsx / rules.ts / use-trash.hooks.ts actually call t()/interpolate()
  // with, so "added to source, added to zero locales" (the exact regression media-i18n.unit.test.ts
  // guards against) would fail here instead of silently rendering English to every other locale.
  const CALL_SITE_KEYS = [
    "Select every item shown",
    'Select "{title}"',
    "Restore",
    "Refresh",
    "Refreshing…",
    "Delete permanently?",
    "{count} item(s) will be deleted permanently. This cannot be undone.",
    "Deleted",
    "Deleted by",
    "Deleted user",
    "Unknown",
    "System",
    "AI",
    "Days left",
    "{count} selected",
    "Loading the Trash…",
    "The Trash is empty.",
    "Load more",
    "Loading…",
    "Deleted items stay here for 60 days, then are removed automatically.",
    "Deleted items from every section appear here, except Collection entries and Theme files.",
    "Post",
    "Comment",
    "Media",
    "Redirect",
    "Form",
    "Form submission",
    "Widget",
    "Menu",
    "Term",
    "Taxonomy",
    "Plugin",
    "Shared across all workspaces on this site.",
    "Restored.",
    "Nothing was restored.",
    "Nothing was deleted.",
    "Deleted permanently.",
    "You do not have permission for this item.",
    "It is no longer in the Trash.",
    "It was already gone.",
    "It changed since it was deleted. Reload and try again.",
    "Its section is not installed, so it cannot be handled here.",
    "failed to load the Trash",
    "failed to restore",
    "failed to delete permanently",
  ];

  it("covers every copy string Trash.tsx/rules.ts/use-trash.hooks.ts call t() with, in every locale", () => {
    for (const locale of locales) {
      for (const key of CALL_SITE_KEYS) {
        expect(TRASH_DICT[locale][key], `locale ${locale}, key ${JSON.stringify(key)}`).toBeTruthy();
      }
    }
  });

  it("the call-site key list itself has no accidental duplicates or typos vs. the dictionary", () => {
    const referenceKeys = Object.keys(TRASH_DICT[locales[0]]).sort();
    expect(CALL_SITE_KEYS.slice().sort()).toEqual(referenceKeys);
  });
});
