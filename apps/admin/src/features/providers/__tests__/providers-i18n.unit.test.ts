import { describe, expect, it } from "vitest";
import { PROVIDERS_DICT, composioGateCopy, t } from "../providers-i18n";
import { COMMON_I18N } from "../../../lib/i18n-common";

/**
 * @file `PROVIDERS_DICT` cross-locale coverage, mirroring `trash/__tests__/trash-i18n.unit.test.ts`'s
 * parity idiom: identical key sets across every locale block, no empty values, and no key that only
 * re-states a `COMMON_I18N` entry.
 *
 * 2026-09-20 platform review, Finding 3: `composioGateCopy` is the new export this fix adds — the
 * three `ConnectorGate` `gate` strings `Providers.tsx` used to pass as raw English literals. See
 * `providers-i18n.ts`'s header, "EXCEPTION" note, for why these three keys exist here at all when the
 * rest of the Composio tab is translated by Jini's own `I18nProvider`.
 */
describe("PROVIDERS_DICT: cross-locale key parity", () => {
  const locales = Object.keys(PROVIDERS_DICT);

  it("has at least one locale", () => {
    expect(locales.length).toBeGreaterThan(0);
  });

  it("ships the exact same key set across every locale block", () => {
    const [firstLocale, ...rest] = locales;
    const referenceKeys = Object.keys(PROVIDERS_DICT[firstLocale]).sort();
    for (const locale of rest) {
      expect(Object.keys(PROVIDERS_DICT[locale]).sort(), `locale ${locale} key set`).toEqual(referenceKeys);
    }
  });

  it("has a non-empty translation for every key in every locale", () => {
    for (const locale of locales) {
      for (const [key, value] of Object.entries(PROVIDERS_DICT[locale])) {
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

  // `Providers`/`Media` are documented pre-existing leftovers (this file's own header) — excluded
  // from the "no COMMON_I18N duplicate" rule rather than silently dropped, per this test's own
  // mirrored precedent in `trash-i18n.unit.test.ts` allowing a documented deviation.
  it("does not duplicate a COMMON_I18N entry (that would create two places to update and let them drift)", () => {
    for (const locale of locales) {
      const commonKeys = new Set(Object.keys(COMMON_I18N[locale] ?? {}));
      for (const key of Object.keys(PROVIDERS_DICT[locale])) {
        expect(commonKeys.has(key), `PROVIDERS_DICT.${locale} redundantly carries COMMON_I18N key ${JSON.stringify(key)}`).toBe(false);
      }
    }
  });

  // Spot-check every key Providers.tsx actually calls t()/composioGateCopy() with, so "added to
  // source, added to zero locales" would fail here instead of silently rendering English everywhere.
  const CALL_SITE_KEYS = [
    "Integrations",
    "Add-Ons",
    "Outside connections in both directions — external MCP tool servers, Composio accounts, this install's own MCP server, and outbound webhooks.",
    "External MCP",
    "Add your Composio API key to continue",
    "Paste your key above to load available integrations.",
    "Get API Key",
  ];

  it("covers every copy string Providers.tsx calls t()/composioGateCopy() with, in every locale", () => {
    for (const locale of locales) {
      for (const key of CALL_SITE_KEYS) {
        expect(PROVIDERS_DICT[locale][key], `locale ${locale}, key ${JSON.stringify(key)}`).toBeTruthy();
      }
    }
  });
});

describe("composioGateCopy", () => {
  it("returns exactly the three English source literals for 'en'", () => {
    expect(composioGateCopy("en")).toEqual({
      title: "Add your Composio API key to continue",
      body: "Paste your key above to load available integrations.",
      ctaLabel: "Get API Key",
    });
  });

  it("returns the Spanish translation for 'es'", () => {
    expect(composioGateCopy("es").title).toBe("Añade tu clave de API de Composio para continuar");
    expect(composioGateCopy("es").body).toBe("Pega tu clave arriba para cargar las integraciones disponibles.");
    expect(composioGateCopy("es").ctaLabel).toBe("Obtener clave de API");
  });

  it("t() falls back to the English source string for a locale/key with no dictionary entry", () => {
    expect(t("xx", "Add your Composio API key to continue")).toBe("Add your Composio API key to continue");
  });
});
