import { afterEach, describe, expect, it, vi } from "vitest";
import { ADMIN_COMMON_I18N } from "@jini-ai/admin/core/i18n-common";
import { COMMON_I18N } from "../i18n-common";

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

});

/** Precedence and the missing-locale guard need a Jini dictionary the real one can never be (one that
 *  collides with the branded key, or lacks a locale), so these re-import `COMMON_I18N` over a mocked
 *  `@jini-ai/admin` module instead of exercising a separate helper. */
describe("COMMON_I18N: composition rules (mocked Jini dictionary)", () => {
  const OLDER_DESTINATION_KEY = "is on an older Tovu and can't overwrite these yet. Update it, then publish again.";
  const TOVU_LOCALES = [
    "es", "de", "it", "zh-CN", "zh-TW", "ar", "fa", "ru", "ja", "id", "pt-BR",
    "ko", "pl", "hu", "fr", "uk", "tr", "th", "hi", "ur", "bn",
  ];

  afterEach(() => {
    vi.doUnmock("@jini-ai/admin/core/i18n-common");
    vi.resetModules();
  });

  async function importOver(jini: Record<string, Record<string, string>>) {
    vi.resetModules();
    vi.doMock("@jini-ai/admin/core/i18n-common", () => ({ ADMIN_COMMON_I18N: jini }));
    return (await import("../i18n-common")).COMMON_I18N;
  }

  it("lets the branded Tovu entry win a key collision and keeps the other Jini entries", async () => {
    const jini = Object.fromEntries(TOVU_LOCALES.map((l) => [l, { Save: `save-${l}`, [OLDER_DESTINATION_KEY]: "generic" }]));
    const composed = await importOver(jini);
    expect(composed.es).toEqual({
      Save: "save-es",
      [OLDER_DESTINATION_KEY]:
        "usa una versión anterior de Tovu y aún no puede sobrescribir estos elementos. Actualízalo y vuelve a publicar.",
    });
  });

  it("exposes Tovu's locales in Tovu's order, ignoring extra or reordered Jini locales", async () => {
    const jini = Object.fromEntries([...TOVU_LOCALES].reverse().concat("xx").map((l) => [l, { Save: l }]));
    expect(Object.keys(await importOver(jini))).toEqual(TOVU_LOCALES);
  });

  it("throws at module load when a Tovu locale is missing from Jini", async () => {
    const jini = Object.fromEntries(TOVU_LOCALES.filter((l) => l !== "bn").map((l) => [l, { Save: l }]));
    await expect(importOver(jini)).rejects.toThrow("common dictionary bn is missing from @jini-ai/admin");
  });
});
