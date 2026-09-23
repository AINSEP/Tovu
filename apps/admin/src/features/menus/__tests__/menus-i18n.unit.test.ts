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
   *  ("Title", "Status", "Trash", "Save", "Label") are all `COMMON_I18N` words in every locale. */
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
 * Regression for the original S-I18N fallback fix — the confirm dialog's own button rendered
 * English in 17 of 21 locales before `t` fell through to `COMMON_I18N`. That button's copy has
 * since moved from "Delete permanently" to "Move to trash" (Trash rewrite, 2026-09-21 — see the
 * `describe` block below), but the fallback mechanism this originally fixed is unrelated to which
 * key the button happens to render and still needs covering.
 */
describe("MENUS_DICT: t() falls back to COMMON_I18N", () => {
  it("translates 'Save' in German even though MENUS_DICT.de never carries it", () => {
    expect(MENUS_DICT.de.Save).toBeUndefined();
    expect(t("de", "Save")).toBe(COMMON_I18N.de.Save);
  });
});

/**
 * Trash rewrite (2026-09-21, `trash-delete-architecture.md`): `Menus.tsx`'s confirm dialog swapped
 * from the "Permanently delete menu?" force-purge ladder to a single "Move to trash?" confirm,
 * matching the Widgets library delete precedent (46fa4e467) verbatim — same three dialog keys plus
 * the shared `TRASH_VERSION_CHANGED` reload message, same translations reused across all 21 locales.
 */
describe("MENUS_DICT: 'Move to trash' confirm dialog copy", () => {
  const LOCALES = [
    "ar", "bn", "de", "es", "fa", "fr", "hi", "hu", "id", "it",
    "ja", "ko", "pl", "pt-BR", "ru", "th", "tr", "uk", "ur", "zh-CN", "zh-TW",
  ];
  const TRASH_KEYS = [
    "Move to trash?",
    "Move to trash",
    'Move "{title}" to trash?',
    "This item changed since you loaded it. Reload and try again.",
  ];

  it.each(LOCALES)("carries every trash-dialog key in %s", (locale) => {
    const missing = TRASH_KEYS.filter((key) => MENUS_DICT[locale]?.[key] === undefined);
    expect(missing).toEqual([]);
  });

  it("no longer carries the removed force-purge dialog keys in any locale", () => {
    const removedKeys = [
      "Delete permanently",
      "Permanently delete menu?",
      "Permanently delete",
      'Permanently delete "{title}"? This cannot be undone.',
    ];
    for (const key of removedKeys) {
      const stillPresent = Object.keys(MENUS_DICT).filter((locale) => key in MENUS_DICT[locale]);
      expect(stillPresent, `${JSON.stringify(key)} should be gone from every locale`).toEqual([]);
    }
  });
});

/**
 * Keys `Menus.tsx`/`MenuEditor.tsx` render that the parity checks above cannot see, because they were
 * missing from EVERY locale block (a key absent everywhere is not "partially present"):
 * - the page description, whose English was edited in place by a4637b788 ("…and assign them to
 *   your theme's menu locations." became "…for your theme's header and footer."), orphaning all 21
 *   translations under the old key;
 * - the item editor's "Advanced" fields from 92494e7c0, which never got translations at all.
 */
describe("MENUS_DICT: copy the menus screens actually render", () => {
  const RENDERED_KEYS = [
    "Build navigation menus for your theme's header and footer.",
    "Advanced",
    "CSS class",
    "Icon",
    "Description",
    "Link rel",
    "Open in new tab",
  ];
  const LOCALES = [
    "ar", "bn", "de", "es", "fa", "fr", "hi", "hu", "id", "it",
    "ja", "ko", "pl", "pt-BR", "ru", "th", "tr", "uk", "ur", "zh-CN", "zh-TW",
  ];

  // Presence, not `t(locale, key) !== key`: fr "Description" is legitimately the same word.
  it.each(LOCALES)("carries every rendered key in %s", (locale) => {
    const untranslated = RENDERED_KEYS.filter(
      (key) => MENUS_DICT[locale]?.[key] === undefined && COMMON_I18N[locale]?.[key] === undefined,
    );
    expect(untranslated).toEqual([]);
  });

  it("no longer carries the orphaned pre-a4637b788 description key", () => {
    const orphan = "Build navigation menus and assign them to your theme's menu locations.";
    expect(Object.keys(MENUS_DICT).filter((locale) => orphan in MENUS_DICT[locale])).toEqual([]);
  });
});
