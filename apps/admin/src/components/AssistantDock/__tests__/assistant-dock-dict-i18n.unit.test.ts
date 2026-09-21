import { describe, expect, it } from "vitest";

import { COMMON_I18N } from "@/lib/i18n-common";
import { ASSISTANT_DOCK_DICT, t } from "../assistant-dock-i18n";

/**
 * @file `ASSISTANT_DOCK_DICT` cross-locale coverage — same idiom as
 * `taxonomy/__tests__/taxonomy-i18n.unit.test.ts` (read that file's header): `assistant-dock-i18n.ts`
 * exported no module-level `t` for `ASSISTANT_DOCK_DICT` at all before this fix — `App.hooks.tsx`'s
 * `translateAssistantDockLabel` and `AssistantDock.hooks.tsx`'s `useAssistantDockChrome` each built
 * their own no-fallback `ASSISTANT_DOCK_DICT[locale]?.[key] ?? key` closure independently.
 *
 * Named `assistant-dock-dict-i18n` (not `assistant-dock-i18n`) because
 * `__tests__/assistant-dock-i18n.unit.test.ts` already exists and covers the file's OTHER,
 * unrelated dictionary — `CHAT_PANE_I18N_DICT` / `createChatI18nAdapter`, which backs
 * `@jini-ai/chat/react`'s own `I18nAdapter` contract and deliberately passes an unknown key through
 * unchanged (see that file's own `@file` comment and that test's own assertions). This dictionary
 * fix does not touch that one.
 *
 * Added 2026-09-21 alongside the S-I18N fallback fix extension to the rest of the admin app.
 */
describe("ASSISTANT_DOCK_DICT: cross-locale key parity", () => {
  const locales = Object.keys(ASSISTANT_DOCK_DICT);

  it("covers the same 21 locales the rest of this app's feature dictionaries ship", () => {
    const EXPECTED_LOCALES = [
      "ar", "bn", "de", "es", "fa", "fr", "hi", "hu", "id", "it",
      "ja", "ko", "pl", "pt-BR", "ru", "th", "tr", "uk", "ur", "zh-CN", "zh-TW",
    ];
    expect(locales.slice().sort()).toEqual(EXPECTED_LOCALES.slice().sort());
  });

  it("every partially-present key is one COMMON_I18N carries in all 21 locales", () => {
    const allKeys = new Set(locales.flatMap((locale) => Object.keys(ASSISTANT_DOCK_DICT[locale])));
    const unrescuable: string[] = [];
    for (const key of allKeys) {
      const missingIn = locales.filter((locale) => ASSISTANT_DOCK_DICT[locale][key] === undefined);
      if (missingIn.length === 0) continue;
      if (locales.every((locale) => COMMON_I18N[locale]?.[key] !== undefined)) continue;
      unrescuable.push(`${JSON.stringify(key)} missing in ${missingIn.join(",")}`);
    }
    expect(unrescuable).toEqual([]);
  });

  it("has a non-empty translation for every key in every locale", () => {
    for (const locale of locales) {
      for (const [key, value] of Object.entries(ASSISTANT_DOCK_DICT[locale])) {
        expect(value.length, `${locale} value for ${JSON.stringify(key)} should not be empty`).toBeGreaterThan(0);
      }
    }
  });
});

/**
 * Regression for basic words (Cancel, …) rendering English in every non-`es` locale (S-I18N
 * fallback fix). `ASSISTANT_DOCK_DICT.de` never carries "Cancel", but it is a `COMMON_I18N` key in
 * all 21 locales, so `t` must fall through to `COMMON_I18N` instead of returning the raw English key.
 */
describe("ASSISTANT_DOCK_DICT: t() falls back to COMMON_I18N", () => {
  it("translates 'Cancel' in German even though ASSISTANT_DOCK_DICT.de never carries it", () => {
    expect(ASSISTANT_DOCK_DICT.de.Cancel).toBeUndefined();
    expect(t("de", "Cancel")).toBe(COMMON_I18N.de.Cancel);
  });
});
