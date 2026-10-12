import { describe, expect, it } from "vitest";

import { FORMS_LEAVE_GUARD_KEYS, FORMS_LEAVE_GUARD_TRANSLATIONS } from "../forms-leave-guard-i18n";
import { FORMS_DICT, t } from "../forms-i18n";

/**
 * @file The form editor's unsaved-changes modal and the field dialog's CSS-classes tip are stored
 * as index-aligned lists; a dropped entry would shift a string onto the wrong control silently.
 */
describe("forms leave-guard i18n", () => {
  it("ships every FORMS_DICT locale with one non-empty string per key", () => {
    expect(Object.keys(FORMS_LEAVE_GUARD_TRANSLATIONS).sort()).toEqual(Object.keys(FORMS_DICT).sort());
    for (const [locale, values] of Object.entries(FORMS_LEAVE_GUARD_TRANSLATIONS)) {
      expect(values, locale).toHaveLength(FORMS_LEAVE_GUARD_KEYS.length);
      for (const value of values) expect(value.trim(), locale).not.toBe("");
    }
  });

  it("keeps the code tokens in the CSS-classes tip untranslated", () => {
    const tip = FORMS_LEAVE_GUARD_KEYS[4];
    for (const [locale, values] of Object.entries(FORMS_LEAVE_GUARD_TRANSLATIONS)) {
      for (const token of ["md:col-span-2", "aria-*", "data-*", "onclick"]) expect(values[4], `${locale} ${tip}`).toContain(token);
    }
  });

  it("is merged into FORMS_DICT, so the forms translator serves it", () => {
    expect(t({ locale: "es", key: "Discard unsaved changes?" })).toBe("¿Descartar los cambios sin guardar?");
    expect(t({ locale: "de", key: "Keep editing" })).toBe("Weiter bearbeiten");
  });
});
