import { describe, expect, it } from "vitest";
import { t, permissionRemoveBodyParts } from "../roles-i18n";

/**
 * @file `roles-i18n.ts` — there was no dictionary test for this feature before C1. Scoped narrowly
 * to the strings C1 added (the "Remove permission?" title and the `permissionRemoveBodyParts`
 * sentence halves), rather than a full cross-locale parity sweep, so pre-existing dictionary drift
 * elsewhere in `ROLES_DICT` does not fail this file (`ROLES_DICT` itself is not exported — every
 * assertion here goes through the same `t`/`permissionRemoveBodyParts` a caller actually uses).
 */
const LOCALES = [
  "es", "id", "de", "zh-CN", "zh-TW", "pt-BR", "ru", "fa", "ar", "ja", "ko",
  "pl", "hu", "fr", "uk", "tr", "th", "it", "hi", "ur", "bn",
];

describe('t(locale, "Remove permission?") — C1', () => {
  for (const locale of LOCALES) {
    it(`translates for ${locale}`, () => {
      const translated = t(locale, "Remove permission?");
      expect(translated.length).toBeGreaterThan(0);
      expect(translated).not.toBe("Remove permission?");
    });
  }
});

describe("permissionRemoveBodyParts — C1", () => {
  const en = permissionRemoveBodyParts("en");

  for (const locale of LOCALES) {
    it(`has a non-empty, translated prefix/suffix for ${locale}`, () => {
      const parts = permissionRemoveBodyParts(locale);
      expect(parts.prefix.length).toBeGreaterThan(0);
      expect(parts.suffix.length).toBeGreaterThan(0);
      expect(parts.prefix).not.toBe(en.prefix);
      expect(parts.suffix).not.toBe(en.suffix);
    });
  }

  it("falls back to English for an unrecognized locale", () => {
    expect(permissionRemoveBodyParts("xx")).toEqual(en);
  });
});
