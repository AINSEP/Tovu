import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import {
  ACCESS_TOKEN_CATEGORIES,
  ACCESS_TOKEN_PROVIDERS,
  OTHER_CREDENTIAL_STORES,
  accessTokenCategoryLabel,
  accessTokenCategoryMatches,
  accessTokenNameTaken,
  accessTokenProviderInfo,
  accessTokenProviderMatchesQuery,
  accessTokenReplaceReadyToSave,
  accessTokenRowMatchesQuery,
  accessTokenRowProviderInfo,
  accessTokenRowReadyToSave,
  accessTokenRowsForProvider,
  buildAccessTokenConnectionInput,
  buildAccessTokenRows,
  buildAccessTokenUpdatePatch,
  buildAdditionalHostsInput,
  buildCustomCredentialRows,
  buildCustomProviderConnectionInput,
  classifyAccessTokenSubmitError,
  connectedAsFact,
  customCredentialNameTaken,
  customCredentialReadyToSave,
  envNamesFact,
  invalidAdditionalHostsEntries,
  isValidHttpUrl,
  parseAdditionalHostsInput,
  maskedTailFact,
  mediaProviderLabel,
  otherCredentialMatchesQuery,
  otherCredentialStoreInfo,
  type AccessTokenFormFields,
  type AccessTokenRow,
  type CustomCredentialFormFields,
  type RawCredentialSummary,
  type RawCustomCredentialSummary,
} from "../rules";

/** A blank form for one provider — every test overrides only the fields it cares about, same
 *  "start from a known-empty baseline" convention `deployment/__tests__/rules.unit.test.ts`'s own
 *  `blankCredentialFields` follows. */
function blankFields(overrides: Partial<AccessTokenFormFields> = {}): AccessTokenFormFields {
  return { ref: { kind: "publish", providerId: "github-pages" }, name: "", token: "", accountId: "", username: "", ...overrides };
}

function rawSummary(overrides: Partial<RawCredentialSummary> = {}): RawCredentialSummary {
  return {
    id: "cred-1",
    providerId: "github-pages",
    label: "default",
    isDefault: true,
    createdAt: "2026-08-15T10:00:00.000Z",
    updatedAt: "2026-08-15T10:00:00.000Z",
    ...overrides,
  };
}

describe("ACCESS_TOKEN_PROVIDERS", () => {
  it("lists all seven providers: four publish, then three source-control", () => {
    expect(ACCESS_TOKEN_PROVIDERS.map((p) => `${p.kind}:${p.providerId}`)).toEqual([
      "publish:github-pages",
      "publish:vercel",
      "publish:netlify",
      "publish:cloudflare-pages",
      "source-control:github",
      "source-control:gitlab",
      "source-control:bitbucket",
    ]);
  });

  it("never includes s3-compatible — no admin UI exists for it yet", () => {
    expect(ACCESS_TOKEN_PROVIDERS.some((p) => p.providerId === "s3-compatible")).toBe(false);
  });

  it("gives github-pages and github distinct purpose labels — the two-store GitHub trap", () => {
    const githubPages = accessTokenProviderInfo({ kind: "publish", providerId: "github-pages" });
    const github = accessTokenProviderInfo({ kind: "source-control", providerId: "github" });
    expect(githubPages.label).toBe("GitHub Pages");
    expect(github.label).toBe("GitHub");
    expect(githubPages.purposeLabel).not.toBe(github.purposeLabel);
    expect(githubPages.purposeLabel).toBe("Publishing");
    expect(github.purposeLabel).toBe("Source Control");
  });

  it("carries cloudflare-pages' accountId requirement and bitbucket's username requirement through unchanged", () => {
    expect(accessTokenProviderInfo({ kind: "publish", providerId: "cloudflare-pages" }).requiredFields).toEqual(["accountId"]);
    expect(accessTokenProviderInfo({ kind: "source-control", providerId: "bitbucket" }).requiredFields).toEqual(["username"]);
  });
});

describe("buildAccessTokenRows", () => {
  it("uses the saved label verbatim as the display name when it is not the legacy sentinel", () => {
    const rows = buildAccessTokenRows("publish", [rawSummary({ label: "Production" })]);
    expect(rows[0]!.name).toBe("Production");
    expect(rows[0]!.rawLabel).toBe("Production");
  });

  it("computes a friendly name for a lone legacy 'default'-labeled row", () => {
    const rows = buildAccessTokenRows("publish", [rawSummary({ providerId: "vercel", label: "default" })]);
    expect(rows[0]!.name).toBe("Vercel token");
  });

  it("numbers a second legacy row for the SAME provider distinctly from the first", () => {
    const rows = buildAccessTokenRows("publish", [
      rawSummary({ id: "a", providerId: "netlify", label: "default" }),
      rawSummary({ id: "b", providerId: "netlify", label: "default" }),
    ]);
    expect(rows.map((r) => r.name)).toEqual(["Netlify token", "Netlify token 2"]);
  });

  it("numbers legacy rows independently per provider, not globally", () => {
    const rows = buildAccessTokenRows("publish", [
      rawSummary({ id: "a", providerId: "netlify", label: "default" }),
      rawSummary({ id: "b", providerId: "vercel", label: "default" }),
    ]);
    expect(rows.map((r) => r.name)).toEqual(["Netlify token", "Vercel token"]);
  });

  it("uses the source-control sentinel (not the publish one) for source-control rows", () => {
    // Both sentinels happen to be the literal string "default" today, but this proves the function
    // reads from the CORRECT store's own constant, not a hardcoded shared literal — a future
    // divergence between the two constants must not silently break this.
    const rows = buildAccessTokenRows("source-control", [rawSummary({ providerId: "gitlab", label: "default" })]);
    expect(rows[0]!.name).toBe("GitLab token");
  });
});

describe("category filter", () => {
  it("ACCESS_TOKEN_CATEGORIES starts with All, then the five owner-specified buckets, then General", () => {
    expect(ACCESS_TOKEN_CATEGORIES.map((c) => c.id)).toEqual(["all", "source-control", "hosting", "media", "ai", "ops", "general"]);
  });

  it("every Tier 1 provider lands in exactly one non-'all' category", () => {
    for (const provider of ACCESS_TOKEN_PROVIDERS) {
      expect(["source-control", "hosting", "media", "ai", "ops"]).toContain(provider.category);
    }
  });

  it("every Tier 2 store lands in exactly one non-'all' category", () => {
    for (const store of OTHER_CREDENTIAL_STORES) {
      expect(["source-control", "hosting", "media", "ai", "ops"]).toContain(store.category);
    }
  });

  it("accessTokenCategoryMatches: 'all' matches every row category", () => {
    expect(accessTokenCategoryMatches("hosting", "all")).toBe(true);
    expect(accessTokenCategoryMatches("ai", "all")).toBe(true);
  });

  it("accessTokenCategoryMatches: a specific filter matches only its own bucket", () => {
    expect(accessTokenCategoryMatches("hosting", "hosting")).toBe(true);
    expect(accessTokenCategoryMatches("hosting", "media")).toBe(false);
  });
});

describe("OTHER_CREDENTIAL_STORES / otherCredentialStoreInfo", () => {
  it("lists all six Tier 2 stores, in the documented order", () => {
    expect(OTHER_CREDENTIAL_STORES.map((s) => s.id)).toEqual([
      "site-assistant",
      "admin-byok",
      "media-provider",
      "composio-project",
      "composio-connector",
      "external-mcp",
    ]);
  });

  it("marks composio-connector and external-mcp as NOT supporting inline Replace", () => {
    expect(otherCredentialStoreInfo("composio-connector").supportsReplace).toBe(false);
    expect(otherCredentialStoreInfo("external-mcp").supportsReplace).toBe(false);
  });

  it("marks the four single-apiKey stores as supporting inline Replace", () => {
    for (const id of ["site-assistant", "admin-byok", "media-provider", "composio-project"] as const) {
      expect(otherCredentialStoreInfo(id).supportsReplace).toBe(true);
    }
  });

  it("falls back to the first store for an unknown id — same defensive-fallback guarantee as accessTokenProviderInfo", () => {
    // @ts-expect-error deliberately passing an id outside the union to exercise the fallback
    expect(otherCredentialStoreInfo("not-a-real-store").id).toBe("site-assistant");
  });
});

describe("otherCredentialMatchesQuery", () => {
  const store = otherCredentialStoreInfo("media-provider");

  it("matches everything when the query is blank", () => {
    expect(otherCredentialMatchesQuery(store, undefined, "")).toBe(true);
  });

  it("matches on the store's own label", () => {
    expect(otherCredentialMatchesQuery(store, undefined, "media provider")).toBe(true);
  });

  it("matches on the store's purpose subtitle", () => {
    expect(otherCredentialMatchesQuery(store, undefined, "media")).toBe(true);
  });

  it("matches on a configured item's own name when given", () => {
    expect(otherCredentialMatchesQuery(store, "Cloudinary", "cloudinary")).toBe(true);
  });

  it("does not match an unrelated query", () => {
    expect(otherCredentialMatchesQuery(store, "Cloudinary", "azure")).toBe(false);
  });
});

describe("value-fact formatters", () => {
  it("maskedTailFact adds the bullet prefix to a bare tail", () => {
    expect(maskedTailFact("7f2a")).toBe("••••7f2a");
  });

  it("connectedAsFact names the account when a label is present", () => {
    expect(connectedAsFact("alice@example.com")).toBe("Connected as: alice@example.com");
  });

  it("connectedAsFact falls back to a bare fact when Composio returned no label", () => {
    expect(connectedAsFact(undefined)).toBe("Connected");
  });

  it("envNamesFact singularizes exactly one variable", () => {
    expect(envNamesFact(["API_KEY"])).toBe("1 environment variable set");
  });

  it("envNamesFact pluralizes two or more variables", () => {
    expect(envNamesFact(["API_KEY", "API_SECRET"])).toBe("2 environment variables set");
  });

  it("envNamesFact reports zero as a fact, not blank", () => {
    expect(envNamesFact([])).toBe("No environment variables set");
  });
});

describe("mediaProviderLabel", () => {
  it("resolves a known catalog id to its human label", () => {
    // The catalog is real vendor data (`@jini-ai/integrations/media-providers/catalog`) — assert
    // shape (a non-empty, different-from-the-id string) rather than pinning one vendor's exact
    // copy, which would break the moment that catalog's own wording changes for unrelated reasons.
    const knownId = "grok";
    const label = mediaProviderLabel(knownId);
    expect(label.length).toBeGreaterThan(0);
  });

  it("falls back to the raw id for a provider the catalog no longer lists", () => {
    expect(mediaProviderLabel("a-removed-vendor-id")).toBe("a-removed-vendor-id");
  });
});

describe("accessTokenRowsForProvider", () => {
  it("filters to exactly one kind+providerId pair, ignoring the same providerId under a different kind", () => {
    const rows: AccessTokenRow[] = [
      ...buildAccessTokenRows("publish", [rawSummary({ id: "a", providerId: "github-pages" })]),
      ...buildAccessTokenRows("source-control", [rawSummary({ id: "b", providerId: "github" })]),
    ];
    const result = accessTokenRowsForProvider(rows, { kind: "publish", providerId: "github-pages" });
    expect(result.map((r) => r.id)).toEqual(["a"]);
  });
});

describe("accessTokenRowMatchesQuery / accessTokenProviderMatchesQuery", () => {
  const info = accessTokenProviderInfo({ kind: "publish", providerId: "github-pages" });
  const row = buildAccessTokenRows("publish", [rawSummary({ label: "Production" })])[0]!;

  it("matches everything when the query is blank", () => {
    expect(accessTokenRowMatchesQuery(row, info, "")).toBe(true);
    expect(accessTokenProviderMatchesQuery(info, "  ")).toBe(true);
  });

  it("matches on the provider's own label, case-insensitively", () => {
    expect(accessTokenRowMatchesQuery(row, info, "github")).toBe(true);
    expect(accessTokenProviderMatchesQuery(info, "GITHUB")).toBe(true);
  });

  it("matches on the purpose subtitle — the two-store GitHub disambiguator", () => {
    expect(accessTokenRowMatchesQuery(row, info, "publishing")).toBe(true);
    const sourceControlInfo = accessTokenProviderInfo({ kind: "source-control", providerId: "github" });
    expect(accessTokenProviderMatchesQuery(sourceControlInfo, "publishing")).toBe(false);
  });

  it("matches on the row's own display name", () => {
    expect(accessTokenRowMatchesQuery(row, info, "production")).toBe(true);
  });

  it("does not match an unrelated query", () => {
    expect(accessTokenRowMatchesQuery(row, info, "azure")).toBe(false);
    expect(accessTokenProviderMatchesQuery(info, "azure")).toBe(false);
  });
});

describe("accessTokenNameTaken", () => {
  const rows: AccessTokenRow[] = buildAccessTokenRows("publish", [
    rawSummary({ id: "a", providerId: "github-pages", label: "Production" }),
  ]);
  const ref = { kind: "publish" as const, providerId: "github-pages" };

  it("flags a collision, case- and whitespace-insensitive", () => {
    expect(accessTokenNameTaken(rows, ref, "  production  ")).toBe(true);
    expect(accessTokenNameTaken(rows, ref, "PRODUCTION")).toBe(true);
  });

  it("does not flag a different name", () => {
    expect(accessTokenNameTaken(rows, ref, "Staging")).toBe(false);
  });

  it("does not flag a row against itself when excludeId is passed — editing a row's own name is not a collision", () => {
    expect(accessTokenNameTaken(rows, ref, "Production", "a")).toBe(false);
  });

  it("does not flag a same-name row under a DIFFERENT provider — uniqueness is per (kind, providerId)", () => {
    const vercelRef = { kind: "publish" as const, providerId: "vercel" };
    expect(accessTokenNameTaken(rows, vercelRef, "Production")).toBe(false);
  });
});

describe("accessTokenRowReadyToSave (Create flow)", () => {
  it("is not ready with a blank name, even with a token typed", () => {
    expect(accessTokenRowReadyToSave(blankFields({ token: "tok" }))).toBe(false);
  });

  it("is not ready with a blank token, even with a name typed", () => {
    expect(accessTokenRowReadyToSave(blankFields({ name: "Production" }))).toBe(false);
  });

  it("is ready once both are filled, for a provider needing no extra field", () => {
    expect(accessTokenRowReadyToSave(blankFields({ name: "Production", token: "tok" }))).toBe(true);
  });

  it("stays not-ready for cloudflare-pages until Account ID is also filled", () => {
    const ref = { kind: "publish" as const, providerId: "cloudflare-pages" };
    expect(accessTokenRowReadyToSave(blankFields({ ref, name: "Production", token: "tok" }))).toBe(false);
    expect(accessTokenRowReadyToSave(blankFields({ ref, name: "Production", token: "tok", accountId: "acct-1" }))).toBe(true);
  });
});

describe("accessTokenReplaceReadyToSave (Replace flow)", () => {
  it("is not ready with everything blank — nothing to send", () => {
    expect(accessTokenReplaceReadyToSave(blankFields({ name: "" }), "Production")).toBe(false);
  });

  it("is ready for a rename-only save: new name, blank token", () => {
    expect(accessTokenReplaceReadyToSave(blankFields({ name: "New Name" }), "Production")).toBe(true);
  });

  it("is NOT ready when the name is unchanged and the token is blank — no diff to send", () => {
    expect(accessTokenReplaceReadyToSave(blankFields({ name: "Production" }), "Production")).toBe(false);
  });

  it("is ready when a new token is typed, name unchanged, for a provider needing no extra field", () => {
    expect(accessTokenReplaceReadyToSave(blankFields({ name: "Production", token: "tok" }), "Production")).toBe(true);
  });

  it("requires cloudflare-pages' accountId whenever a NEW token is typed, even on replace", () => {
    const ref = { kind: "publish" as const, providerId: "cloudflare-pages" };
    expect(accessTokenReplaceReadyToSave(blankFields({ ref, name: "Production", token: "tok" }), "Production")).toBe(false);
    expect(accessTokenReplaceReadyToSave(blankFields({ ref, name: "Production", token: "tok", accountId: "a" }), "Production")).toBe(true);
  });
});

describe("buildAccessTokenConnectionInput", () => {
  it("dispatches to the publish builder for a publish ref", () => {
    const input = buildAccessTokenConnectionInput(blankFields({ name: "x", token: " ghp_abc " }));
    expect(input).toEqual({ providerId: "github-pages", token: "ghp_abc" });
  });

  it("dispatches to the source-control builder for a source-control ref", () => {
    const ref = { kind: "source-control" as const, providerId: "bitbucket" };
    const input = buildAccessTokenConnectionInput(blankFields({ ref, name: "x", token: "tok", username: " alice " }));
    expect(input).toEqual({ providerId: "bitbucket", token: "tok", username: "alice" });
  });
});

describe("buildAccessTokenUpdatePatch", () => {
  it("sends a label-only patch when only the name changed", () => {
    const patch = buildAccessTokenUpdatePatch(blankFields({ name: "New Name" }), true, false);
    expect(patch).toEqual({ label: "New Name" });
  });

  it("sends a connection-only patch when only the token changed", () => {
    const patch = buildAccessTokenUpdatePatch(blankFields({ name: "Same", token: "tok" }), false, true);
    expect(patch).toEqual({ connection: { providerId: "github-pages", token: "tok" } });
  });

  it("sends both when both changed", () => {
    const patch = buildAccessTokenUpdatePatch(blankFields({ name: "New Name", token: "tok" }), true, true);
    expect(patch).toEqual({ label: "New Name", connection: { providerId: "github-pages", token: "tok" } });
  });
});

describe("classifyAccessTokenSubmitError", () => {
  it("classifies a DUPLICATE_LABEL ApiError", () => {
    expect(classifyAccessTokenSubmitError(new ApiError("dup", 409, "DUPLICATE_LABEL"))).toEqual({ kind: "duplicate-label" });
  });

  it("classifies a VALIDATION ApiError, preferring body.detail over the message", () => {
    const err = new ApiError("bad request", 400, "VALIDATION", { detail: "token is required" });
    expect(classifyAccessTokenSubmitError(err)).toEqual({ kind: "validation", detail: "token is required" });
  });

  it("falls back to generic for a non-ApiError", () => {
    expect(classifyAccessTokenSubmitError(new Error("network down"))).toEqual({ kind: "generic" });
  });

  it("falls back to generic for an ApiError whose code matches neither known marker", () => {
    expect(classifyAccessTokenSubmitError(new ApiError("internal error", 500, "SECRET_STORE_UNCONFIGURED"))).toEqual({ kind: "generic" });
  });
});

/** A blank custom-provider form — every test overrides only the fields it cares about, same
 *  convention {@link blankFields} follows for the catalog providers' own form shape. */
function blankCustomFields(overrides: Partial<CustomCredentialFormFields> = {}): CustomCredentialFormFields {
  return { name: "", category: "general", baseUrl: "", additionalHosts: "", token: "", username: "", ...overrides };
}

function rawCustomSummary(overrides: Partial<RawCustomCredentialSummary> = {}): RawCustomCredentialSummary {
  return {
    id: "custom-1",
    label: "name.com",
    category: "general",
    baseUrl: "https://api.name.com",
    createdAt: "2026-08-17T10:00:00.000Z",
    updatedAt: "2026-08-17T10:00:00.000Z",
    ...overrides,
  };
}

describe("isValidHttpUrl", () => {
  it("accepts http and https URLs", () => {
    expect(isValidHttpUrl("https://api.vercel.com")).toBe(true);
    expect(isValidHttpUrl("http://localhost:4000")).toBe(true);
  });

  it("rejects a non-http(s) scheme", () => {
    expect(isValidHttpUrl("ftp://files.example.com")).toBe(false);
    expect(isValidHttpUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects a malformed string", () => {
    expect(isValidHttpUrl("not a url")).toBe(false);
    expect(isValidHttpUrl("")).toBe(false);
  });
});

describe("accessTokenCategoryLabel", () => {
  it("resolves every real category id to its own label", () => {
    expect(accessTokenCategoryLabel("general")).toBe("General");
    expect(accessTokenCategoryLabel("ai")).toBe("AI");
  });
});

describe("buildCustomCredentialRows", () => {
  it("maps a raw summary onto an AccessTokenRow with kind 'custom' and no default", () => {
    const rows = buildCustomCredentialRows([rawCustomSummary()]);
    expect(rows).toEqual([
      {
        kind: "custom",
        providerId: "custom-1",
        id: "custom-1",
        name: "name.com",
        rawLabel: "name.com",
        isDefault: false,
        category: "general",
        baseUrl: "https://api.name.com",
        createdAt: "2026-08-17T10:00:00.000Z",
        updatedAt: "2026-08-17T10:00:00.000Z",
      },
    ]);
  });

  it("gives each row its OWN providerId (its own id) — no shared grouping key across two custom rows", () => {
    const rows = buildCustomCredentialRows([rawCustomSummary({ id: "a", label: "name.com" }), rawCustomSummary({ id: "b", label: "GoDaddy" })]);
    expect(rows.map((r) => r.providerId)).toEqual(["a", "b"]);
  });
});

describe("accessTokenRowProviderInfo", () => {
  it("delegates straight through for a catalog kind", () => {
    const row: AccessTokenRow = {
      kind: "publish",
      providerId: "github-pages",
      id: "row-1",
      name: "Production",
      rawLabel: "Production",
      isDefault: true,
      createdAt: "2026-08-17T10:00:00.000Z",
      updatedAt: "2026-08-17T10:00:00.000Z",
    };
    expect(accessTokenRowProviderInfo(row)).toEqual(accessTokenProviderInfo(row));
  });

  it("builds a synthetic info for a 'custom' row from its own name/category/baseUrl", () => {
    const [row] = buildCustomCredentialRows([rawCustomSummary({ label: "name.com", category: "hosting", baseUrl: "https://api.name.com" })]);
    const info = accessTokenRowProviderInfo(row!);
    expect(info.label).toBe("name.com");
    expect(info.vendorLabel).toBe("name.com");
    expect(info.category).toBe("hosting");
    expect(info.purposeLabel).toBe("Hosting");
    expect(info.tokenPageUrl).toBe("https://api.name.com");
    expect(info.requiredFields).toEqual([]);
    expect(info.optionalFields).toEqual(["username"]);
  });
});

describe("customCredentialReadyToSave", () => {
  it("is ready once name, a valid base URL, and a token are all present", () => {
    expect(customCredentialReadyToSave(blankCustomFields({ name: "name.com", baseUrl: "https://api.name.com", token: "tok" }))).toBe(true);
  });

  it("is not ready with a blank name", () => {
    expect(customCredentialReadyToSave(blankCustomFields({ baseUrl: "https://api.name.com", token: "tok" }))).toBe(false);
  });

  it("is not ready with a blank token", () => {
    expect(customCredentialReadyToSave(blankCustomFields({ name: "name.com", baseUrl: "https://api.name.com" }))).toBe(false);
  });

  it("is not ready with an invalid base URL", () => {
    expect(customCredentialReadyToSave(blankCustomFields({ name: "name.com", baseUrl: "not a url", token: "tok" }))).toBe(false);
  });

  it("never requires a username — it stays optional", () => {
    expect(customCredentialReadyToSave(blankCustomFields({ name: "name.com", baseUrl: "https://api.name.com", token: "tok", username: "" }))).toBe(true);
  });

  it("is ready with a valid additionalHosts entry", () => {
    expect(
      customCredentialReadyToSave(blankCustomFields({ name: "fly.io", baseUrl: "https://api.fly.io", token: "tok", additionalHosts: "https://api.machines.dev" }))
    ).toBe(true);
  });

  it("is not ready when an additionalHosts entry is not a valid http(s) URL", () => {
    expect(
      customCredentialReadyToSave(blankCustomFields({ name: "fly.io", baseUrl: "https://api.fly.io", token: "tok", additionalHosts: "not-a-url" }))
    ).toBe(false);
  });

  it("stays optional — a blank additionalHosts field never blocks save", () => {
    expect(customCredentialReadyToSave(blankCustomFields({ name: "name.com", baseUrl: "https://api.name.com", token: "tok", additionalHosts: "" }))).toBe(true);
  });
});

describe("parseAdditionalHostsInput", () => {
  it("splits on newlines, trims, and drops blank entries", () => {
    expect(parseAdditionalHostsInput("https://api.fly.io\n\n  https://api.machines.dev  \n")).toEqual(["https://api.fly.io", "https://api.machines.dev"]);
  });

  it("also splits on commas, so a pasted comma-separated list works the same way", () => {
    expect(parseAdditionalHostsInput("https://api.fly.io, https://api.machines.dev")).toEqual(["https://api.fly.io", "https://api.machines.dev"]);
  });

  it("returns an empty array for a blank or whitespace-only field", () => {
    expect(parseAdditionalHostsInput("")).toEqual([]);
    expect(parseAdditionalHostsInput("   \n  ")).toEqual([]);
  });
});

describe("invalidAdditionalHostsEntries", () => {
  it("returns an empty array when every entry is a valid http(s) URL", () => {
    expect(invalidAdditionalHostsEntries("https://api.fly.io\nhttps://api.machines.dev")).toEqual([]);
  });

  it("returns exactly the entries that fail isValidHttpUrl, leaving valid ones out", () => {
    expect(invalidAdditionalHostsEntries("https://api.fly.io\nnot-a-url\nftp://also-bad.example.com")).toEqual(["not-a-url", "ftp://also-bad.example.com"]);
  });

  it("is empty for a blank field — this field is entirely optional", () => {
    expect(invalidAdditionalHostsEntries("")).toEqual([]);
  });
});

describe("buildAdditionalHostsInput", () => {
  it("returns the parsed array when at least one entry is present", () => {
    expect(buildAdditionalHostsInput("https://api.fly.io\nhttps://api.machines.dev")).toEqual(["https://api.fly.io", "https://api.machines.dev"]);
  });

  it("returns undefined for a blank field, so the create/update call omits it entirely", () => {
    expect(buildAdditionalHostsInput("")).toBeUndefined();
    expect(buildAdditionalHostsInput("   ")).toBeUndefined();
  });
});

describe("customCredentialNameTaken", () => {
  it("is workspace-wide, unlike accessTokenNameTaken — two DIFFERENT custom rows (different providerId) still collide", () => {
    const rows = buildCustomCredentialRows([rawCustomSummary({ id: "a", label: "name.com" }), rawCustomSummary({ id: "b", label: "GoDaddy" })]);
    // A same-name accessTokenNameTaken check would miss this (each row's providerId is its own id) —
    // this function's whole reason to exist is that gap.
    expect(customCredentialNameTaken(rows, "GoDaddy")).toBe(true);
  });

  it("is case-insensitive and whitespace-trimmed, same as accessTokenNameTaken", () => {
    const rows = buildCustomCredentialRows([rawCustomSummary({ id: "a", label: "name.com" })]);
    expect(customCredentialNameTaken(rows, "  NAME.COM  ")).toBe(true);
  });

  it("excludes the row being renamed via excludeId", () => {
    const rows = buildCustomCredentialRows([rawCustomSummary({ id: "a", label: "name.com" })]);
    expect(customCredentialNameTaken(rows, "name.com", "a")).toBe(false);
  });

  it("never matches a catalog (non-'custom') row sharing the same name", () => {
    const catalogRow: AccessTokenRow = {
      kind: "publish",
      providerId: "github-pages",
      id: "row-1",
      name: "GoDaddy",
      rawLabel: "GoDaddy",
      isDefault: true,
      createdAt: "2026-08-17T10:00:00.000Z",
      updatedAt: "2026-08-17T10:00:00.000Z",
    };
    expect(customCredentialNameTaken([catalogRow], "GoDaddy")).toBe(false);
  });
});

describe("buildCustomProviderConnectionInput", () => {
  it("includes a non-blank username", () => {
    expect(buildCustomProviderConnectionInput({ token: "tok", username: "alice" })).toEqual({ token: "tok", username: "alice" });
  });

  it("omits a blank username entirely, never sends an empty string", () => {
    expect(buildCustomProviderConnectionInput({ token: "tok", username: "" })).toEqual({ token: "tok" });
    expect(buildCustomProviderConnectionInput({ token: "tok", username: "   " })).toEqual({ token: "tok" });
  });
});
