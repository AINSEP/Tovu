import { describe, expect, it } from "vitest";

import type { AdminPublishTargetDescriptor, AdminSourceControlProviderDescriptor } from "../api";
import { descriptorText, localizePublishTargets, localizeSourceControlProviders } from "../descriptor-i18n";

/**
 * @file A plugin descriptor's own text in the viewer's locale, from the `i18n` block the plugin ships
 * (`{ locale: { English: translation } }`), falling back to the English it declares.
 */

const I18N = { es: { Owner: "Propietario" }, pt: { Owner: "Dono" }, "pt-BR": { Owner: "Proprietário" } };

describe("descriptorText", () => {
  it("uses the exact locale's translation", () => {
    expect(descriptorText(I18N, "es", "Owner")).toBe("Propietario");
    expect(descriptorText(I18N, "pt-BR", "Owner")).toBe("Proprietário");
  });

  it("falls back to the base language, then to the English", () => {
    expect(descriptorText(I18N, "pt-PT", "Owner")).toBe("Dono");
    expect(descriptorText(I18N, "de", "Owner")).toBe("Owner");
    expect(descriptorText(I18N, "es", "Branch")).toBe("Branch");
    expect(descriptorText(undefined, "es", "Owner")).toBe("Owner");
  });
});

describe("localizePublishTargets", () => {
  const target: AdminPublishTargetDescriptor = {
    id: "github-pages",
    label: "GitHub Pages",
    configFields: [{ name: "owner", label: "Owner", required: true, help: "agent hint", userHelp: "person hint" }],
    projectName: { label: "Commit message", help: "Used as the commit message." },
    credential: {
      vendorLabel: "the storage provider",
      help: "Needs a token.",
      userHelp: "Get a token first.",
      tokenField: "token",
      tokenPageUrl: "https://example.com/tokens",
      fields: [{ name: "token", label: "Access token", required: true, secret: true }],
    },
    i18n: {
      es: {
        Owner: "Propietario",
        "person hint": "pista",
        "Commit message": "Mensaje de commit",
        "the storage provider": "el proveedor de almacenamiento",
        "Needs a token.": "Necesita un token.",
        "Get a token first.": "Consigue un token primero.",
        "Access token": "Token de acceso",
      },
    },
  };

  it("translates every person-facing string and leaves ids, names and URLs alone", () => {
    const [localized] = localizePublishTargets([target], "es")!;
    expect(localized).toEqual({
      ...target,
      configFields: [{ name: "owner", label: "Propietario", required: true, help: "agent hint", userHelp: "pista" }],
      projectName: { label: "Mensaje de commit", help: "Used as the commit message." },
      credential: {
        vendorLabel: "el proveedor de almacenamiento",
        help: "Necesita un token.",
        userHelp: "Consigue un token primero.",
        tokenField: "token",
        tokenPageUrl: "https://example.com/tokens",
        fields: [{ name: "token", label: "Token de acceso", required: true, secret: true }],
      },
    });
  });

  it("returns the descriptors unchanged in English, and undefined while not loaded", () => {
    expect(localizePublishTargets([target], "en")).toEqual([target]);
    expect(localizePublishTargets(undefined, "es")).toBeUndefined();
  });
});

describe("localizeSourceControlProviders", () => {
  it("translates the host's guidance and field labels", () => {
    const provider: AdminSourceControlProviderDescriptor = {
      id: "github",
      label: "GitHub",
      credential: { help: "Needs a fine-grained token.", tokenField: "token", fields: [{ name: "token", label: "Access token", required: true, secret: true }] },
      i18n: { de: { "Needs a fine-grained token.": "Benötigt ein Token.", "Access token": "Zugriffstoken" } },
    };
    expect(localizeSourceControlProviders([provider], "de")).toEqual([
      {
        ...provider,
        credential: { help: "Benötigt ein Token.", tokenField: "token", fields: [{ name: "token", label: "Zugriffstoken", required: true, secret: true }] },
      },
    ]);
  });
});
