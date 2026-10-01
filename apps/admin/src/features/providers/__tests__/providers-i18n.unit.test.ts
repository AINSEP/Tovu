import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { PROVIDERS_DICT, t } from "../providers-i18n";
import { COMMON_I18N } from "../../../lib/i18n-common";

/**
 * @file `PROVIDERS_DICT` cross-locale coverage, mirroring `trash/__tests__/trash-i18n.unit.test.ts`'s
 * parity idiom: identical key sets across every locale block, no empty values, and no key that only
 * re-states a `COMMON_I18N` entry.
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

  // Parse actual calls, excluding comments and strings that only look like calls.
  const CALL_SITE_KEYS = new Set<string>();
  for (const file of ["Providers.tsx", "AlwaysAllowPanel.tsx"]) {
    const source = readFileSync(`src/features/providers/${file}`, "utf8");
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "t") {
        const key = node.arguments[file === "Providers.tsx" ? 1 : 0];
        expect(key && ts.isStringLiteralLike(key), `${file}: translation key must be auditable`).toBe(true);
        if (key && ts.isStringLiteralLike(key)) CALL_SITE_KEYS.add(key.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
  expect(CALL_SITE_KEYS.has("Always allow")).toBe(true);

  it("covers every copy string Providers.tsx calls t() with, in every locale", () => {
    for (const locale of locales) {
      for (const key of CALL_SITE_KEYS) {
        expect(PROVIDERS_DICT[locale][key] ?? COMMON_I18N[locale]?.[key], `locale ${locale}, key ${JSON.stringify(key)}`).toBeTruthy();
      }
    }
  });
});

describe("t", () => {
  it("falls back to the English source string for a locale/key with no dictionary entry", () => {
    expect(t("xx", "External MCP")).toBe("External MCP");
  });
});
