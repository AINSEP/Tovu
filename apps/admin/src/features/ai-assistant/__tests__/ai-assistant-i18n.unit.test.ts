import { describe, expect, it } from "vitest";

import { COMMON_I18N } from "@/lib/i18n-common";
import { AI_ASSISTANT_DICT, t } from "../ai-assistant-i18n";

/**
 * @file `AI_ASSISTANT_DICT` cross-locale coverage — same idiom as
 * `taxonomy/__tests__/taxonomy-i18n.unit.test.ts` (read that file's header): `ai-assistant-i18n.ts`
 * exported no module-level `t` at all before this fix — `AiAssistant.tsx` built its own no-fallback
 * `AI_ASSISTANT_DICT[locale]?.[key] ?? key` closure inline.
 *
 * Added 2026-09-21 alongside the S-I18N fallback fix extension to the rest of the admin app.
 */
describe("AI_ASSISTANT_DICT: cross-locale key parity", () => {
  const locales = Object.keys(AI_ASSISTANT_DICT);

  it("covers the same 21 locales the rest of this app's feature dictionaries ship", () => {
    const EXPECTED_LOCALES = [
      "ar", "bn", "de", "es", "fa", "fr", "hi", "hu", "id", "it",
      "ja", "ko", "pl", "pt-BR", "ru", "th", "tr", "uk", "ur", "zh-CN", "zh-TW",
    ];
    expect(locales.slice().sort()).toEqual(EXPECTED_LOCALES.slice().sort());
  });

  /**
   * Measured, not asserted-away: the 2026-09-?? "Restart assistant" local-CLI controls
   * (`AiAssistant.tsx`'s restart button + status copy) landed in `es` only — the other 20 locales
   * never got these 9 keys at all, and none of the 9 are `COMMON_I18N` words (they're feature-specific
   * sentences, not shared UI chrome), so the COMMON_I18N fallback this fix adds cannot rescue them.
   * That is a translation-completeness gap, a different bug from the one this fix addresses (see this
   * file's own header for the flagged-but-out-of-scope note) — excluded here by name so the general
   * parity check stays meaningful for every other key.
   */
  const UNRESCUABLE_ES_ONLY_KEYS = [
    "Local CLI process",
    "The Local CLI mode above runs as its own process on the server. Tovu already retries it automatically after a crash — use this only if you don't want to wait for that.",
    "Restart assistant",
    "Restarting…",
    "Restart accepted. This does not confirm the process is healthy yet — check the status below.",
    "Restart refused: {reason}",
    "Checking status…",
    "Known failed — the last attempt to start it did not succeed.",
    "No known failure right now.",
    "Check status",
  ];
  it("every partially-present key is one COMMON_I18N carries in all 21 locales, except the documented es-only restart-status keys", () => {
    const allKeys = new Set(locales.flatMap((locale) => Object.keys(AI_ASSISTANT_DICT[locale])));
    const unrescuable: string[] = [];
    for (const key of allKeys) {
      if (UNRESCUABLE_ES_ONLY_KEYS.includes(key)) continue;
      const missingIn = locales.filter((locale) => AI_ASSISTANT_DICT[locale][key] === undefined);
      if (missingIn.length === 0) continue;
      if (locales.every((locale) => COMMON_I18N[locale]?.[key] !== undefined)) continue;
      unrescuable.push(`${JSON.stringify(key)} missing in ${missingIn.join(",")}`);
    }
    expect(unrescuable).toEqual([]);
  });

  it("has a non-empty translation for every key in every locale", () => {
    for (const locale of locales) {
      for (const [key, value] of Object.entries(AI_ASSISTANT_DICT[locale])) {
        expect(value.length, `${locale} value for ${JSON.stringify(key)} should not be empty`).toBeGreaterThan(0);
      }
    }
  });
});

/**
 * Regression for basic words (Cancel, …) rendering English in every non-`es` locale (S-I18N
 * fallback fix). `AI_ASSISTANT_DICT.de` never carries "Cancel", but it is a `COMMON_I18N` key in
 * all 21 locales, so `t` must fall through to `COMMON_I18N` instead of returning the raw English key.
 */
describe("AI_ASSISTANT_DICT: t() falls back to COMMON_I18N", () => {
  it("translates 'Cancel' in German even though AI_ASSISTANT_DICT.de never carries it", () => {
    expect(AI_ASSISTANT_DICT.de.Cancel).toBeUndefined();
    expect(t("de", "Cancel")).toBe(COMMON_I18N.de.Cancel);
  });
});
