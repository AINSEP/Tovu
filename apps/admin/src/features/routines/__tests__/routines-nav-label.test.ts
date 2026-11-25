import { describe, expect, it } from "vitest";
import { routinesPanelsFor } from "../../../panels";
import { translateAdminNavLabel } from "../../../lib/admin-nav-i18n";

/**
 * @file The Routines panel's sidebar label is keyed by its English text (the AI Assistant way), so
 * the label the panel registers must resolve to a real translation in the Jini nav dictionary rather
 * than falling back to English. Why: a renamed label would silently go untranslated.
 */
describe("Routines nav label", () => {
  const label = routinesPanelsFor({ enabled: true })[0]!.nav!.label;

  it("is translated in non-English locales", () => {
    expect(translateAdminNavLabel({ locale: "de", key: label })).toBe("Routinen");
    expect(translateAdminNavLabel({ locale: "es", key: label })).toBe("Rutinas");
    expect(translateAdminNavLabel({ locale: "ja", key: label })).toBe("ルーティン");
  });

  it("falls back to the English label for an unknown locale and registers nothing while the flag is off", () => {
    expect(translateAdminNavLabel({ locale: "xx", key: label })).toBe("Routines");
    expect(routinesPanelsFor({ enabled: false })).toEqual([]);
  });
});
