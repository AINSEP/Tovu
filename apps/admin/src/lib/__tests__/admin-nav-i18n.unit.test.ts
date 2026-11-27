import { ADMIN_NAV_DICT } from "@jini-ai/admin/shell/lib/admin-nav-i18n";
import { expect, it } from "vitest";
import { translateAdminNavLabel } from "../admin-nav-i18n";

it.each([
  ["es", "Storage", "Almacenamiento"],
  ["ja", "Storage", "ストレージ"],
  ["en", "Storage", "Storage"],
  ["zz", "Storage", "Storage"],
] as const)("renders the Storage navigation label in %s", (locale, key, label) => {
  expect(translateAdminNavLabel({ locale, key })).toBe(label);
});

it("adds a non-empty Storage translation without losing any shared nav labels in supported locales", () => {
  const locales = Object.entries(ADMIN_NAV_DICT);
  expect(locales.map(([locale]) => locale)).toContain("es");
  for (const [locale, labels] of locales) {
    const storage = translateAdminNavLabel({ locale, key: "Storage" });
    expect(storage.trim(), locale).not.toBe("");
    expect(storage, locale).not.toBe("Storage");
    for (const [key, label] of Object.entries(labels)) {
      if (key === "Storage") continue;
      expect(translateAdminNavLabel({ locale, key }), `${locale} ${key}`).toBe(label);
    }
  }
});
