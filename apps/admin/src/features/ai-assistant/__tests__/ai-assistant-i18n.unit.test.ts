import { describe, expect, it } from "vitest";

import { PERMANENT_DELETE_TOOLS, PERMANENT_DELETE_DANGERS } from "@/lib/assistant-permanent-deletes";
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

  it("translates panel visibility and the distinct model save action in every admin locale", () => {
    for (const locale of locales) for (const key of ["Open the assistant panel", "Save model settings", "Loading saved settings…", "Could not load saved settings."]) {
      expect(t({ locale, key }), `${locale}: ${key}`).not.toBe(key);
    }
  });

  it("covers the same 21 locales the rest of this app's feature dictionaries ship", () => {
    const EXPECTED_LOCALES = [
      "ar", "bn", "de", "es", "fa", "fr", "hi", "hu", "id", "it",
      "ja", "ko", "pl", "pt-BR", "ru", "th", "tr", "uk", "ur", "zh-CN", "zh-TW",
    ];
    expect(locales.slice().sort()).toEqual(EXPECTED_LOCALES.slice().sort());
  });

  /** The "Restart assistant" local-CLI controls' 10 keys once shipped in `es` only and were excluded
   *  here by name; they are now translated in all 21 locales, so no key is exempt from this check. */
  it("every partially-present key is one COMMON_I18N carries in all 21 locales", () => {
    const allKeys = new Set(locales.flatMap((locale) => Object.keys(AI_ASSISTANT_DICT[locale])));
    const unrescuable: string[] = [];
    for (const key of allKeys) {
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
        // German/Portuguese use the established technical noun "Gateways" unchanged.
        if (key === "Gateways" && ["de", "pt-BR"].includes(locale)) continue;
        expect(value, `${locale} must translate ${JSON.stringify(key)}`).not.toBe(key);
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
    expect(t({ locale: "de", key: "Cancel" })).toBe(COMMON_I18N.de.Cancel);
  });
});


describe("subagent owner consent and dock status translations", () => {
  const keys = [
    "Allow the admin assistant to spawn subagents",
    "Off by default. Applies to Claude CLI runs only; BYOK and other CLIs are unaffected. Changes apply to new runs; existing subagents may continue.",
    "Only the owner can change subagent access.", "Loading subagent settings…", "Waiting for confirmation or saving…",
    "Security risk: subagents can act independently.", "Subagents inherit the assistant's bypassed permissions.",
    "You may not see what they do; the chat does not show subagent tool calls.", "Cost and machine load multiply with each subagent.",
    "Allow the assistant to spawn subagents?", "Allow subagents", "failed to save subagent access",
    "Subagents: on", "Subagents: unknown",
  ];
  it("translates every new string in all 21 locales without English fallback", () => {
    for (const locale of Object.keys(AI_ASSISTANT_DICT)) for (const key of keys) {
      expect(AI_ASSISTANT_DICT[locale][key], `${locale}: ${key}`).toBeTruthy();
      expect(t({ locale, key })).not.toBe(key);
    }
    expect(t({ locale: "es", key: "Subagents: unknown" })).toBe("Subagentes: estado desconocido");
    expect(t({ locale: "de", key: "Allow subagents" })).toBe("Unteragenten erlauben");
  });
});

describe("permanent-delete owner grant translations", () => {
  it("translates the full checklist, risks, dialog and status copy in every shipped locale", () => {
    const keys = [
      "Allow permanent deletes from chat",
      "Off by default. Only checked tools are allowed. Each delete still requires a human confirmation of the exact targets. Prefer Trash.",
      "Only the owner can change permanent delete access.", "Loading permanent delete settings…",
      "Allowed permanent deletes", "Select all", "Select none", "Open admin screen",
      "No Tovu admin screen for this operation.", "Content purges", "Settings deletes",
      "Waiting for confirmation or saving…", "Allow permanent deletes from chat?", "Allow permanent deletes",
      "failed to save permanent delete access", ...PERMANENT_DELETE_TOOLS.map(tool => tool.label), ...PERMANENT_DELETE_DANGERS,
    ];
    for (const locale of Object.keys(AI_ASSISTANT_DICT)) for (const key of keys) {
      expect(AI_ASSISTANT_DICT[locale][key], `${locale}: ${key}`).toBeTruthy();
      expect(t({ locale, key })).not.toBe(key);
    }
    expect(t({ locale: "es", key: "Allow permanent deletes" })).toBe("Permitir eliminaciones permanentes");
    expect(t({ locale: "de", key: "Select none" })).toBe("Keine auswählen");
  });
});
