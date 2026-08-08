import { describe, expect, it } from "vitest";
import { COMMON_I18N } from "../i18n-common";
import { createDictionaryTranslator } from "../dictionary-translator";

/**
 * One parity test for the shared dictionary, regardless of how many locales it grows to —
 * per-locale test cases must NOT be added here as new languages ship (see the language-expansion
 * handoff's standing policy). Adding French means adding an `fr:` block to `i18n-common.ts`; this
 * file keeps verifying structure, not re-asserting every language's literal text.
 */
describe("COMMON_I18N: cross-locale key parity", () => {
  const locales = Object.keys(COMMON_I18N);

  it("has at least one locale", () => {
    expect(locales.length).toBeGreaterThan(0);
  });

  it("ships the exact same key set across every locale block", () => {
    const [firstLocale, ...rest] = locales;
    const referenceKeys = Object.keys(COMMON_I18N[firstLocale]).sort();
    for (const locale of rest) {
      expect(Object.keys(COMMON_I18N[locale]).sort(), `locale ${locale} key set`).toEqual(referenceKeys);
    }
  });

  it("has a non-empty translation for every key in every locale", () => {
    for (const locale of locales) {
      for (const [key, value] of Object.entries(COMMON_I18N[locale])) {
        expect(value.length, `${locale} value for ${JSON.stringify(key)} should not be empty`).toBeGreaterThan(0);
      }
    }
  });
});

describe("createDictionaryTranslator", () => {
  it("prefers the feature dictionary over the common one", () => {
    const t = createDictionaryTranslator({ es: { Save: "Guardar todo" } });
    expect(t("es", "Save")).toBe("Guardar todo");
  });

  it("falls back to COMMON_I18N when the feature dictionary has no entry for the key", () => {
    const t = createDictionaryTranslator({ es: {} });
    expect(t("es", "Save")).toBe(COMMON_I18N.es.Save);
  });

  it("falls back to the raw key when neither dictionary has an entry", () => {
    const t = createDictionaryTranslator({ es: {} });
    expect(t("es", "this key exists nowhere")).toBe("this key exists nowhere");
  });

  it("falls back to the raw key for a locale with no dictionary block at all", () => {
    const t = createDictionaryTranslator({ es: { Save: "Guardar" } });
    expect(t("xx-nonexistent", "Save")).toBe("Save");
  });
});
