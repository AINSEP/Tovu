import { describe, expect, it } from "vitest";
import type { AdminFormDefinition } from "@/lib/api";
import { formDatesLines } from "@jini-ai/admin/forms";
import { t } from "../forms-i18n";

function form(overrides: Partial<AdminFormDefinition> = {}): AdminFormDefinition {
  return {
    id: "f1",
    workspaceId: "fake-ws",
    name: "Contact",
    slug: "contact",
    fields: [],
    notify: { enabled: false, recipients: [] },
    status: "active",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("forms list dates — host dictionary binding", () => {
  const datedForm = form({ createdAt: "2026-10-04T09:52:00Z", updatedAt: "2026-10-05T14:03:00Z" });
  it("lets the admin locale pick the date order and translate the hover labels", () => {
    expect(formDatesLines({ form: datedForm, locale: "de", t: (key) => t({ locale: "de", key: key }) }, { timeZone: "UTC" })).toEqual([
      { kind: "created", text: "04.10.26, 09:52", dateTime: "2026-10-04T09:52:00.000Z", label: "Erstellt 4. Okt. 2026, 9:52" },
      { kind: "updated", text: "05.10.26, 14:03", dateTime: "2026-10-05T14:03:00.000Z", label: "Aktualisiert 5. Okt. 2026, 14:03" },
    ]);
    expect(formDatesLines({ form: datedForm, locale: "en-GB", t: (key) => key }, { timeZone: "UTC" })[0].text)
      .toBe("04/10/2026, 09:52");
  });
});
