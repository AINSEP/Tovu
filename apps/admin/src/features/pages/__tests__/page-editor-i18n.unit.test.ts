import { describe, expect, it } from "vitest";
import { PAGE_EDITOR_DICT, t } from "../page-editor-i18n";
import { PAGE_EXTERNAL_CHANGE_MESSAGE } from "../rules";
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

  // Hook/error keys stored directly in the Page editor dictionary. Shared words such as
  // Save/Saving…/Delete deliberately stay in COMMON_I18N and are therefore absent here.
  const CALL_SITE_KEYS = [
    "failed to load page",
    "failed to save page",
    "failed to delete page",
    "could not re-read the current version — your changes are still here, try again",
    "Saved",
    "Saved title, slug, and status. This page's body uses the document editor and can't be edited here yet.",
    "Title, slug and status saved, but the page content wasn't. Your content is still here — press Save to retry.",
    // rules.ts: pageAutosaveStaleBasisMessage / pageVersionConflictMessage
    "Someone else saved this while you were editing — you were working from version {baseVersion}, so autosaving has paused and nothing you type now is being stored. Your changes were NOT saved, and are still here in the editor. Reload to pick up their version and resume autosaving; copy anything you want to keep first.",
    "Someone else saved this while you were editing — you were working from {basis}, and {current} is now stored. Your changes were NOT saved, and are still here in the editor. Saving again will replace their version.",
    "the version you loaded",
    "a newer version",
    "version {version}",
  ];

  it("covers every hook/error copy key in every locale", () => {
    for (const locale of locales) {
      for (const key of CALL_SITE_KEYS) {
        expect(PAGE_EDITOR_DICT[locale][key], `locale ${locale}, key ${JSON.stringify(key)}`).toBeTruthy();
      }
    }
  });

  it("the hook/error call-site key list has no accidental duplicates or typos vs. the dictionary", () => {
    const referenceKeys = Object.keys(PAGE_EDITOR_DICT[locales[0]]).sort();
    expect(CALL_SITE_KEYS.slice().sort()).toEqual(referenceKeys);
  });

  it("translates every PageEditor markup key in every locale through the page translator", () => {
    const MARKUP_KEYS = [
      "Pages", "Content", "Edit page", "Ask the assistant to build this page, or edit the HTML directly.",
      "Draft", "Published", "Publish", "Save", "Saving…", "Delete", "Restore", "Discard",
      "Save anyway", "Keep editing", "Load latest", "Keep my edits", "Preview width", "Template",
      "No template — HTML only", "Serves only this page's HTML. No theme styles, scripts, header or footer.",
      "Theme default", "No templates for this theme", "Loading editor…", "Page title", "Untitled",
      "URL slug", "view ↗", "Editor view", "Move", "Move to trash?", "Move to trash",
      "to trash? It will disappear from the site and from this list.", "Page HTML",
      "This page has no HTML yet. Ask the assistant to build it, or write some here.",
      "Loading the theme's styles…", "Exit full screen (Esc)", "Show full screen", "Exit full screen",
      "Page preview", "Loading pages…",
    ];
    for (const locale of locales) {
      for (const key of MARKUP_KEYS) expect(t(locale, key), `${locale}, key ${JSON.stringify(key)}`).toBeTruthy();
    }
  });
});

describe("PAGE_EXTERNAL_CHANGE_MESSAGE", () => {
  it("is translated in every locale, not left in English", () => {
    for (const locale of ["es", "de", "fr", "ja", "ar", "zh-CN"]) {
      expect(t(locale, PAGE_EXTERNAL_CHANGE_MESSAGE), locale).not.toBe(PAGE_EXTERNAL_CHANGE_MESSAGE);
    }
  });
});
