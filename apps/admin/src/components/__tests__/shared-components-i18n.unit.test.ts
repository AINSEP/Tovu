import { describe, expect, it } from "vitest";
import { SHARED_COMPONENTS_DICT } from "../shared-components-i18n";
import { COMMON_I18N } from "../../lib/i18n-common";

/**
 * @file `SHARED_COMPONENTS_DICT` cross-locale coverage, mirroring `features/trash/trash-i18n.unit
 * .test.ts`'s parity idiom: identical key sets across every locale block, no empty values, no key
 * that only re-states a `COMMON_I18N` entry, and — this file's own addition, since this dictionary
 * grows incrementally across several commits (Batch D2's commit list) — every key the currently
 * wired call sites actually call `t()`/`interpolate()` with, so "added to source, added to zero
 * locales" (the exact regression `media-i18n.unit.test.ts` guards against) fails here instead of
 * silently rendering English to every other locale.
 *
 * Call sites so far: `Select.tsx` and `WidgetPickerDialog.tsx`/`WidgetPickerDialog.hooks.tsx`
 * (incl. `useWidgetAddControl`), plus this commit's `WidgetConfigFields.tsx` (all five per-type
 * sub-forms, wired at both of its callers — `WidgetPickerDialog.tsx`'s "create new" form and
 * `WidgetInstanceEditor.tsx`). Later Batch D2 commits extend `CALL_SITE_KEYS` as they wire
 * `MediaPickerDialog` and `EmbedInsertControl`.
 */
describe("SHARED_COMPONENTS_DICT: cross-locale key parity", () => {
  const locales = Object.keys(SHARED_COMPONENTS_DICT);

  it("has at least one locale", () => {
    expect(locales.length).toBeGreaterThan(0);
  });

  it("ships the exact same key set across every locale block", () => {
    const [firstLocale, ...rest] = locales;
    const referenceKeys = Object.keys(SHARED_COMPONENTS_DICT[firstLocale]).sort();
    for (const locale of rest) {
      expect(Object.keys(SHARED_COMPONENTS_DICT[locale]).sort(), `locale ${locale} key set`).toEqual(referenceKeys);
    }
  });

  it("has a non-empty translation for every key in every locale", () => {
    for (const locale of locales) {
      for (const [key, value] of Object.entries(SHARED_COMPONENTS_DICT[locale])) {
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
      for (const key of Object.keys(SHARED_COMPONENTS_DICT[locale])) {
        expect(commonKeys.has(key), `SHARED_COMPONENTS_DICT.${locale} redundantly carries COMMON_I18N key ${JSON.stringify(key)}`).toBe(false);
      }
    }
  });

  // Spot-check every key the currently-wired call sites actually call t()/interpolate() with.
  const CALL_SITE_KEYS = [
    // Select.tsx
    "Search options",
    "Search…",
    "No matches",
    "Select…",
    // WidgetPickerDialog.tsx / WidgetAddControl
    "Place a {typeLabel} widget",
    "Use existing",
    "Existing {typeLabel} widgets",
    "Choose a widget…",
    "Use this widget",
    "Create new",
    "Create and place",
    "Widget type",
    // WidgetPickerDialog.hooks.tsx (useExistingInstances / useWidgetPickerDialog / useWidgetAddControl)
    "failed to load existing widgets",
    "Choose an existing widget to use.",
    "Title is required.",
    "failed to create widget",
    "failed to place widget",
    'Widget "{title}" was created but not placed ({detail}). Choose it under Use existing to try again.',
    // WidgetConfigFields.tsx (all five per-type sub-forms)
    "Text",
    "Social links",
    "Link {n}",
    "Platform",
    "e.g. GitHub",
    "URL",
    "https://…",
    "Remove",
    "Add link",
    "Max items",
    "Category term id (optional)",
    "failed to load menus",
    "Loading menus…",
    "Menu",
    "Choose a menu…",
    "failed to load forms",
    "Loading forms…",
    "Form",
    "Choose a form…",
    "Success message (optional)",
    // MediaPickerDialog.tsx / MediaPickerDialog.hooks.tsx
    "Choose an image",
    "Loading media…",
    "failed to load media",
    "No media uploaded yet. Upload an asset from the {link} screen first.",
    "Media",
  ];

  it("covers every copy string this commit's wired call sites call t() with, in every locale", () => {
    for (const locale of locales) {
      for (const key of CALL_SITE_KEYS) {
        expect(SHARED_COMPONENTS_DICT[locale][key], `locale ${locale}, key ${JSON.stringify(key)}`).toBeTruthy();
      }
    }
  });

  it("the call-site key list itself has no accidental duplicates or typos vs. the dictionary", () => {
    const referenceKeys = Object.keys(SHARED_COMPONENTS_DICT[locales[0]]).sort();
    expect(CALL_SITE_KEYS.slice().sort()).toEqual(referenceKeys);
  });
});
