import { describe, expect, it } from "vitest";
import { mediaCreatedByLabel } from "../rules";
import { MEDIA_DICT, t } from "../media-i18n";

/** Owner dispatch 2026-10-04: asset attribution is read-only and legacy Unknown is localized. */
describe("media creation attribution", () => {
  it("shows the authenticated principal ID verbatim", () => {
    for (const creator of ["owner", "user-2", "assistant-agent", "plugin-key"]) {
      expect(mediaCreatedByLabel({ item: { createdBy: creator }, unknownLabel: "Unknown" })).toBe(creator);
    }
  });
  it("names a known user and keeps the raw id for principals with no user row", () => {
    const userNames = new Map([["7499d195", "leona"]]);
    expect(mediaCreatedByLabel({ item: { createdBy: "7499d195" }, unknownLabel: "Unknown" }, { userNames })).toBe("leona");
    expect(mediaCreatedByLabel({ item: { createdBy: "plugin-key" }, unknownLabel: "Unknown" }, { userNames })).toBe("plugin-key");
    expect(mediaCreatedByLabel({ item: { createdBy: null }, unknownLabel: "Unknown" }, { userNames })).toBe("Unknown");
  });
  it("shows localized unknown for both legacy server omission and NULL", () => {
    expect(mediaCreatedByLabel({ item: {}, unknownLabel: t("es", "Unknown") })).toBe("Desconocido");
    expect(mediaCreatedByLabel({ item: { createdBy: null }, unknownLabel: t("de", "Unknown") })).toBe("Unbekannt");
  });
  it("has both provenance strings in every locale", () => {
    for (const [locale, dictionary] of Object.entries(MEDIA_DICT)) {
      for (const key of ["Created by", "Unknown"]) {
        expect(dictionary[key], `${locale}: ${key}`).toBeTruthy();
        expect(t(locale, key), `${locale}: ${key}`).not.toBe(key);
      }
    }
  });
});
