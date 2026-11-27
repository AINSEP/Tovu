import { expect, it } from "vitest";
import { COMMON_I18N } from "@/lib/i18n-common";
import { buildStorageDictionary, STORAGE_DICT, STORAGE_KEYS } from "../storage-i18n";

it("rejects a truncated translation row before it can ship missing labels", () => {
  expect(() => buildStorageDictionary({ rows: { fr: "Stockage|Nettoyé automatiquement" } }))
    .toThrow(/^Storage copy for fr has 2 entries, expected \d+\.$/);
});

it("publishes nonempty Storage labels for every source key in each admin locale", () => {
  expect(Object.keys(STORAGE_DICT).sort()).toEqual(Object.keys(COMMON_I18N).sort());
  expect(STORAGE_KEYS).toContain("Storage");
  for (const [locale, dictionary] of Object.entries(STORAGE_DICT)) {
    expect(Object.keys(dictionary).sort(), locale).toEqual([...STORAGE_KEYS].sort());
    for (const [key, value] of Object.entries(dictionary)) {
      expect(value.trim(), `${locale}: ${key}`).not.toBe("");
    }
  }
  expect(STORAGE_DICT.fr.Storage).toBe("Stockage");
});
