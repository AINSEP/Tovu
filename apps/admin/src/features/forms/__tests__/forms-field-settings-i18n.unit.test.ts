import { describe, expect, it } from "vitest";

import { FIELD_SETTINGS_KEYS, FIELD_SETTINGS_TRANSLATIONS, FORMS_FIELD_SETTINGS_I18N } from "../forms-field-settings-i18n";
import { FORMS_DICT, t } from "../forms-i18n";

/**
 * @file The field builder's settings strings are stored as index-aligned lists (one key list, one
 * translation list per locale). A dropped or extra entry would shift every later string onto the
 * wrong control without any error, so this pins list lengths, placeholders and the merge into
 * `FORMS_DICT`.
 */

const PLACEHOLDER = /\{[a-z]+\}/g;
const placeholders = (text: string): string[] => (text.match(PLACEHOLDER) ?? []).sort();

describe("forms field settings i18n", () => {
  it("has 65 unique keys", () => {
    expect(FIELD_SETTINGS_KEYS).toHaveLength(65);
    expect(new Set(FIELD_SETTINGS_KEYS).size).toBe(65);
  });

  it("ships every FORMS_DICT locale, each with exactly one non-empty string per key", () => {
    expect(Object.keys(FIELD_SETTINGS_TRANSLATIONS).sort()).toEqual(Object.keys(FORMS_DICT).sort());
    for (const [locale, values] of Object.entries(FIELD_SETTINGS_TRANSLATIONS)) {
      expect(values, locale).toHaveLength(FIELD_SETTINGS_KEYS.length);
      for (const [index, value] of values.entries()) expect(value.trim(), `${locale} #${index} ${FIELD_SETTINGS_KEYS[index]}`).not.toBe("");
    }
  });

  it("keeps each key's {n}/{name} placeholders, and adds none, in every locale", () => {
    for (const [locale, values] of Object.entries(FIELD_SETTINGS_TRANSLATIONS)) {
      FIELD_SETTINGS_KEYS.forEach((key, index) => {
        expect(placeholders(values[index]!), `${locale} ${key}`).toEqual(placeholders(key));
      });
    }
  });

  it("is merged into FORMS_DICT, so the forms translator serves it", () => {
    for (const locale of Object.keys(FORMS_FIELD_SETTINGS_I18N)) {
      for (const key of FIELD_SETTINGS_KEYS) expect(FORMS_DICT[locale]![key], `${locale} ${key}`).toBe(FORMS_FIELD_SETTINGS_I18N[locale]![key]);
    }
    expect(t({ locale: "es", key: "Dropdown" })).toBe("Desplegable");
    expect(t({ locale: "es", key: 'Settings for field "{name}"' })).toContain("{name}");
  });
});
