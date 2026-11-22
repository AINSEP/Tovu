import { describe, expect, it } from "vitest";
import { ADMIN_COMMON_I18N } from "@jini-ai/admin/core/i18n-common";
import { COMMON_I18N, composeCommonDictionary } from "../i18n-common";

import { createDictionaryTranslator } from '@jini-ai/core/text';
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
    const t = createDictionaryTranslator({ featureDictionary: { es: { Save: "Guardar todo" } } }, { commonDictionary: COMMON_I18N });
    expect(t({ locale: "es", key: "Save" })).toBe("Guardar todo");
  });

  it("falls back to COMMON_I18N when the feature dictionary has no entry for the key", () => {
    const t = createDictionaryTranslator({ featureDictionary: { es: {} } }, { commonDictionary: COMMON_I18N });
    expect(t({ locale: "es", key: "Save" })).toBe(COMMON_I18N.es.Save);
  });

  it("falls back to the raw key when neither dictionary has an entry", () => {
    const t = createDictionaryTranslator({ featureDictionary: { es: {} } }, { commonDictionary: COMMON_I18N });
    expect(t({ locale: "es", key: "this key exists nowhere" })).toBe("this key exists nowhere");
  });

  it("falls back to the raw key for a locale with no dictionary block at all", () => {
    const t = createDictionaryTranslator({ featureDictionary: { es: { Save: "Guardar" } } }, { commonDictionary: COMMON_I18N });
    expect(t({ locale: "xx-nonexistent", key: "Save" })).toBe("Save");
  });
});

/** The generic entries come from `@jini-ai/admin`; this app keeps only the product-named one and
 *  composes the two. These pin that composition: the original 21 locales in their original order,
 *  every package entry unchanged, and the one host entry on top. */
describe("COMMON_I18N: composition over ADMIN_COMMON_I18N", () => {
  const OLDER_DESTINATION_KEY = "is on an older Tovu and can't overwrite these yet. Update it, then publish again.";

  it("keeps the original 21 locales in their original order", () => {
    expect(Object.keys(COMMON_I18N)).toEqual([
      "es", "de", "it", "zh-CN", "zh-TW", "ar", "fa", "ru", "ja", "id", "pt-BR",
      "ko", "pl", "hu", "fr", "uk", "tr", "th", "hi", "ur", "bn",
    ]);
  });

  it("carries every package entry unchanged and adds exactly the host-owned key", () => {
    for (const locale of Object.keys(COMMON_I18N)) {
      const { [OLDER_DESTINATION_KEY]: hostValue, ...rest } = COMMON_I18N[locale];
      expect(rest, `${locale} generic entries`).toEqual(ADMIN_COMMON_I18N[locale]);
      expect(hostValue, `${locale} host entry`).toBeTruthy();
    }
  });

  it("keeps the product-named notice out of the package and in this app", () => {
    expect(ADMIN_COMMON_I18N.es[OLDER_DESTINATION_KEY]).toBeUndefined();
    expect(COMMON_I18N.es[OLDER_DESTINATION_KEY]).toBe(
      "usa una versión anterior de Tovu y aún no puede sobrescribir estos elementos. Actualízalo y vuelve a publicar.",
    );
    expect(COMMON_I18N.es.Save).toBe("Guardar");
  });

  it("lets a host entry win a key collision", () => {
    const composed = composeCommonDictionary({
      generic: { es: { Save: "Guardar", Cancel: "Cancelar" } },
      host: { es: { Save: "Guardar todo" } },
    });
    expect(composed).toEqual({ es: { Save: "Guardar todo", Cancel: "Cancelar" } });
  });

  it("follows the host's locale order and throws for a locale the package lacks", () => {
    const composed = composeCommonDictionary({ generic: { es: { a: "1" }, de: { a: "2" } }, host: { de: {}, es: {} } });
    expect(Object.keys(composed)).toEqual(["de", "es"]);
    expect(() => composeCommonDictionary({ generic: {}, host: { xx: {} } })).toThrow("common dictionary xx is missing");
  });
});
