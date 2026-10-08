import { describe, expect, it } from "vitest";
import { sourceControlCredentialSaveErrorMessage, sourceControlCredentialsLoadErrorMessage, t } from "../source-control-i18n";

// Author Checklist / F4.1/F6.2: literal copy, locale fallback and non-default error detail.
describe("Source Control dictionary assembly and error copy", () => {
  it("combines base provider copy with the Access Tokens link translations", () => {
    // Mutation: drop ACCESS_TOKEN_LINK_TRANSLATIONS from the assembly.
    expect(t({ locale: "de", key: "Replace token" })).toBe("Token ersetzen");
    expect(t({ locale: "de", key: "Create access token" })).toBe("Zugriffstoken erstellen");
    expect(t({ locale: "fr", key: "Create access token" })).toBe("Créer un jeton d’accès");
    expect(t({ locale: "xx", key: "Create access token" })).toBe("Create access token");
    expect(t({ locale: "de", key: "extension copy" })).toBe("extension copy");
  });

  it.each(["en", "de", "xx"])("interpolates load and save failures with English fallback in %s", (locale) => {
    // Mutation: replace {error} with a constant, or use the load template for save failures.
    expect(sourceControlCredentialsLoadErrorMessage(locale, "403: denied <Atlas>")).toBe("Could not load source control connections (403: denied <Atlas>).");
    expect(sourceControlCredentialSaveErrorMessage(locale, "token missing for Boreal")).toBe("Could not save this connection (token missing for Boreal).");
  });
});
