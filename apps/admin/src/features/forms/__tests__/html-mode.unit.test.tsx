import { describe, expect, it } from "vitest";
import { FORMS_DICT } from "../forms-i18n";
import { formHtmlEmbed } from "@jini-ai/admin/forms";

describe("HTML form authoring — host dictionary", () => {
  it("translates every new string in all supported locales", () => {
    for (const dictionary of Object.values(FORMS_DICT)) {
      for (const key of ["Builder", "HTML", "Form authoring mode", "Form HTML", "Copy HTML embed", "Copied!", "Could not copy embed", "Send"]) {
        expect(dictionary[key], key).toBeTruthy();
      }
    }
    expect(formHtmlEmbed({ slug: "contact" })).toContain('"mode":"html"');
  });
});
