import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/admin-http/request";
import { tSecurity as translateSecurity } from "../../../lib/i18n-common";
import { accessTokenProviderInfo, accessTokenRowProviderInfo, providerGroupSubtitleKeys, type AccessTokenFormFields } from "@jini-ai/admin/security/access-token-providers";
import { providerGroupHandleLabel, tokenRowHandleLabel, ACCESS_TOKEN_PROVIDER_COPY } from "../access-token-copy";
import { ACCESS_TOKEN_CATEGORIES } from "../rules";
import { OTHER_CREDENTIAL_STORES, accessTokensCountText, envNamesFact, maskedTailFact, mediaProviderLabel, otherCredentialMatchesQuery, otherCredentialStoreInfo } from "../other-credential-stores";
import { buildCustomCredentialRows, type RawCustomCredentialSummary } from "@jini-ai/admin/security/access-token-rows";
import { accessTokenReplaceReadyToSave, accessTokenRowReadyToSave, buildAccessTokenConnectionInput, buildAccessTokenUpdatePatch, classifyAccessTokenSubmitError, accessTokenExistingRowReadyToSave } from "../access-token-forms";
import { ACCESS_TOKEN_TEST_PROVIDERS as PROVIDERS } from "./access-token-providers.fixture";


/** A blank form for one provider — every test overrides only the fields it cares about, same
 *  "start from a known-empty baseline" convention `deployment/__tests__/rules.unit.test.ts`'s own
 *  `blankCredentialFields` follows. */
function blankFields(overrides: Partial<AccessTokenFormFields> = {}): AccessTokenFormFields {
  return { ref: { kind: "publish", providerId: "github-pages" }, name: "", token: "", values: {}, username: "", ...overrides };
}

/** The provider entry a form's `ref` names, as the hook passes it alongside the fields. */
function infoFor(ref: AccessTokenFormFields["ref"]) {
  return accessTokenProviderInfo({ providers: PROVIDERS, copy: ACCESS_TOKEN_PROVIDER_COPY, ref });
}

const GITHUB_PAGES_INFO = infoFor({ kind: "publish", providerId: "github-pages" });

describe("category table", () => {
  it("ACCESS_TOKEN_CATEGORIES starts with All, then the five owner-specified buckets, then General", () => {
    expect(ACCESS_TOKEN_CATEGORIES.map((c) => c.id)).toEqual(["all", "source-control", "hosting", "media", "ai", "ops", "general"]);
  });

  it("every Tier 1 provider lands in exactly one non-'all' category", () => {
    for (const provider of PROVIDERS) {
      expect(["source-control", "hosting", "media", "ai", "ops"]).toContain(provider.category);
    }
  });

  it("every Tier 2 store lands in exactly one non-'all' category", () => {
    for (const store of OTHER_CREDENTIAL_STORES) {
      expect(["source-control", "hosting", "media", "ai", "ops"]).toContain(store.category);
    }
  });


});

describe("OTHER_CREDENTIAL_STORES / otherCredentialStoreInfo", () => {
  it("lists all four Tier 2 stores, in the documented order", () => {
    expect(OTHER_CREDENTIAL_STORES.map((s) => s.id)).toEqual(["site-assistant", "admin-byok", "media-provider", "external-mcp"]);
  });

  it("links media provider credentials to the Media screen's External Providers tab", () => {
    expect(otherCredentialStoreInfo({ id: "media-provider" }).screenLabel).toBe("Media · External Providers");
    expect(otherCredentialStoreInfo({ id: "media-provider" }).screenPath).toBe("/media?tab=external-providers");
  });

  it("marks external-mcp as NOT supporting inline Replace", () => {
    expect(otherCredentialStoreInfo({ id: "external-mcp" }).supportsReplace).toBe(false);
  });

  it("marks the three single-apiKey stores as supporting inline Replace", () => {
    for (const id of ["site-assistant", "admin-byok", "media-provider"] as const) {
      expect(otherCredentialStoreInfo({ id }).supportsReplace).toBe(true);
    }
  });

  it("falls back to the first store for an unknown id — same defensive-fallback guarantee as accessTokenProviderInfo", () => {
    // @ts-expect-error deliberately passing an id outside the union to exercise the fallback
    expect(otherCredentialStoreInfo({ id: "not-a-real-store" }).id).toBe("site-assistant");
  });
});

describe("otherCredentialMatchesQuery", () => {
  const store = otherCredentialStoreInfo({ id: "media-provider" });

  it("matches everything when the query is blank", () => {
    expect(otherCredentialMatchesQuery({ store, itemName: undefined, query: "" })).toBe(true);
  });

  it("matches on the store's own label", () => {
    expect(otherCredentialMatchesQuery({ store, itemName: undefined, query: "media provider" })).toBe(true);
  });

  it("matches on the store's purpose subtitle", () => {
    expect(otherCredentialMatchesQuery({ store, itemName: undefined, query: "media" })).toBe(true);
  });

  it("matches on a configured item's own name when given", () => {
    expect(otherCredentialMatchesQuery({ store, itemName: "Cloudinary", query: "cloudinary" })).toBe(true);
  });

  it("does not match an unrelated query", () => {
    expect(otherCredentialMatchesQuery({ store, itemName: "Cloudinary", query: "azure" })).toBe(false);
  });
});

describe("value-fact formatters", () => {
  it("maskedTailFact adds the bullet prefix to a bare tail", () => {
    expect(maskedTailFact({ tail: "7f2a" })).toBe("••••7f2a");
  });

  it("envNamesFact singularizes exactly one variable", () => {
    expect(envNamesFact({ envNames: ["API_KEY"] })).toBe("1 environment variable set");
  });

  it("envNamesFact pluralizes two or more variables", () => {
    expect(envNamesFact({ envNames: ["API_KEY", "API_SECRET"] })).toBe("2 environment variables set");
  });

  it("envNamesFact reports zero as a fact, not blank", () => {
    expect(envNamesFact({ envNames: [] })).toBe("No environment variables set");
  });
});

describe("accessTokensCountText", () => {
  // Whole-sentence templates replaced the old `${totalCount} ${tokenWord} ${translate("saved")}`
  // fragment concatenation (see rules.ts's own doc) — pinning English byte-identical to what that
  // concatenation used to produce, including the plural boundary at exactly 1 and the curly quotes
  // around the query, is what proves the rewrite changed no visible English copy.
  it("stays byte-identical in English for the empty-query, zero-count case", () => {
    expect(accessTokensCountText({ totalCount: 0, matchCount: 0, query: "" })).toBe("0 tokens saved");
  });

  it("stays byte-identical in English for the empty-query singular case", () => {
    expect(accessTokensCountText({ totalCount: 1, matchCount: 1, query: "" })).toBe("1 token saved");
  });

  it("stays byte-identical in English for a searched, plural-total case", () => {
    expect(accessTokensCountText({ totalCount: 5, matchCount: 2, query: "abc" })).toBe("2 of 5 tokens matching “abc”");
  });

  it("stays byte-identical in English for a searched, singular-total case", () => {
    expect(accessTokensCountText({ totalCount: 1, matchCount: 1, query: "abc" })).toBe("1 of 1 token matching “abc”");
  });

  it("ignores leading/trailing whitespace in the query the same way the old check did", () => {
    expect(accessTokensCountText({ totalCount: 3, matchCount: 0, query: "   " })).toBe("3 tokens saved");
  });

  it("renders a full translated German sentence, not glued fragments", () => {
    const translate = (key: string) => translateSecurity({ locale: "de", key: key });
    expect(accessTokensCountText({ totalCount: 0, matchCount: 0, query: "" }, { t: translate })).toBe("0 Tokens gespeichert");
    expect(accessTokensCountText({ totalCount: 1, matchCount: 1, query: "" }, { t: translate })).toBe("1 Token gespeichert");
    expect(accessTokensCountText({ totalCount: 5, matchCount: 2, query: "abc" }, { t: translate })).toBe("2 von 5 Tokens, die zu “abc” passen");
  });

  it("renders a full translated Japanese sentence with the query reordered to the front", () => {
    const translate = (key: string) => translateSecurity({ locale: "ja", key: key });
    expect(accessTokensCountText({ totalCount: 5, matchCount: 2, query: "abc" }, { t: translate })).toBe("「abc」に一致するトークン5件中2件");
  });
});

describe("mediaProviderLabel", () => {
  it("resolves a known catalog id to its human label", () => {
    // Pin the display contract; a raw-id fallback must not masquerade as a catalog hit.
    const knownId = "grok";
    const label = mediaProviderLabel({ providerId: knownId });
    expect(label.length).toBeGreaterThan(0);
    expect(label).toBe("xAI Grok Imagine");
    expect(label).not.toBe(knownId);
  });

  it("falls back to the raw id for a provider the catalog no longer lists", () => {
    expect(mediaProviderLabel({ providerId: "a-removed-vendor-id" })).toBe("a-removed-vendor-id");
  });
});
describe("accessTokenRowReadyToSave (Create flow)", () => {
  it("is not ready with a blank name, even with a token typed", () => {
    expect(accessTokenRowReadyToSave({ fields: blankFields({ token: "tok" }), info: GITHUB_PAGES_INFO })).toBe(false);
  });

  it("is not ready with a blank token, even with a name typed", () => {
    expect(accessTokenRowReadyToSave({ fields: blankFields({ name: "Production" }), info: GITHUB_PAGES_INFO })).toBe(false);
  });

  it("is ready once both are filled, for a provider needing no extra field", () => {
    expect(accessTokenRowReadyToSave({ fields: blankFields({ name: "Production", token: "tok" }), info: GITHUB_PAGES_INFO })).toBe(true);
  });

  it("stays not-ready for cloudflare-pages until Account ID is also filled", () => {
    const ref = { kind: "publish" as const, providerId: "cloudflare-pages" };
    expect(accessTokenRowReadyToSave({ fields: blankFields({ ref, name: "Production", token: "tok" }), info: infoFor(ref) })).toBe(false);
    expect(accessTokenRowReadyToSave({ fields: blankFields({ ref, name: "Production", token: "tok", values: { accountId: "acct-1" } }), info: infoFor(ref) })).toBe(true);
  });
});

describe("accessTokenReplaceReadyToSave (Replace flow)", () => {
  it("is not ready with everything blank — nothing to send", () => {
    expect(accessTokenReplaceReadyToSave({ fields: blankFields({ name: "" }), currentName: "Production", info: GITHUB_PAGES_INFO })).toBe(false);
  });

  it("is ready for a rename-only save: new name, blank token", () => {
    expect(accessTokenReplaceReadyToSave({ fields: blankFields({ name: "New Name" }), currentName: "Production", info: GITHUB_PAGES_INFO })).toBe(true);
  });

  it("is NOT ready when the name is unchanged and the token is blank — no diff to send", () => {
    expect(accessTokenReplaceReadyToSave({ fields: blankFields({ name: "Production" }), currentName: "Production", info: GITHUB_PAGES_INFO })).toBe(false);
  });

  it("is ready when a new site key is typed, name unchanged, for a provider needing no extra field", () => {
    expect(accessTokenReplaceReadyToSave({ fields: blankFields({ name: "Production", token: "tok" }), currentName: "Production", info: GITHUB_PAGES_INFO })).toBe(true);
  });

  it("requires cloudflare-pages' accountId whenever a NEW token is typed, even on replace", () => {
    const ref = { kind: "publish" as const, providerId: "cloudflare-pages" };
    expect(accessTokenReplaceReadyToSave({ fields: blankFields({ ref, name: "Production", token: "tok" }), currentName: "Production", info: infoFor(ref) })).toBe(false);
    expect(accessTokenReplaceReadyToSave({ fields: blankFields({ ref, name: "Production", token: "tok", values: { accountId: "a" } }), currentName: "Production", info: infoFor(ref) })).toBe(true);
  });
});

describe("buildAccessTokenConnectionInput", () => {
  it("uses the default token field for a publish provider with no credential spec", () => {
    const ref = { kind: "publish" as const, providerId: "unlisted-host" };
    const info = accessTokenProviderInfo({ providers: [], copy: ACCESS_TOKEN_PROVIDER_COPY, ref });
    expect(buildAccessTokenConnectionInput({ fields: blankFields({ ref, name: "Backup", token: "exact-token" }), info })).toEqual({ providerId: "unlisted-host", token: "exact-token" });
  });

  it("dispatches to the publish builder for a publish ref", () => {
    const input = buildAccessTokenConnectionInput({ fields: blankFields({ name: "x", token: " ghp_abc " }), info: GITHUB_PAGES_INFO });
    expect(input).toEqual({ providerId: "github-pages", token: " ghp_abc " });
  });

  it("dispatches to the source-control builder for a source-control ref", () => {
    const ref = { kind: "source-control" as const, providerId: "bitbucket" };
    const input = buildAccessTokenConnectionInput({ fields: blankFields({ ref, name: "x", token: "tok", values: { username: " alice " } }), info: infoFor(ref) });
    expect(input).toEqual({ providerId: "bitbucket", token: "tok", username: "alice" });
  });
});

describe("buildAccessTokenUpdatePatch", () => {
  it("sends a label-only patch when only the name changed", () => {
    const patch = buildAccessTokenUpdatePatch({ fields: blankFields({ name: "New Name" }), nameChanged: true, hasToken: false, info: GITHUB_PAGES_INFO });
    expect(patch).toEqual({ label: "New Name" });
  });

  it("sends a connection-only patch when only the token changed", () => {
    const patch = buildAccessTokenUpdatePatch({ fields: blankFields({ name: "Same", token: "tok" }), nameChanged: false, hasToken: true, info: GITHUB_PAGES_INFO });
    expect(patch).toEqual({ connection: { providerId: "github-pages", token: "tok" } });
  });

  it("sends both when both changed", () => {
    const patch = buildAccessTokenUpdatePatch({ fields: blankFields({ name: "New Name", token: "tok" }), nameChanged: true, hasToken: true, info: GITHUB_PAGES_INFO });
    expect(patch).toEqual({ label: "New Name", connection: { providerId: "github-pages", token: "tok" } });
  });
});

describe("classifyAccessTokenSubmitError", () => {
  it("recognizes a legacy duplicate marker in the message when the code is absent", () => {
    expect(classifyAccessTokenSubmitError({ e: new ApiError({ message: "DUPLICATE_LABEL", status: 409 }) })).toEqual({ kind: "duplicate-label" });
  });

  it.each([undefined, {}, { detail: 42 }])("uses the validation message when no string detail exists in %j", (body) => {
    expect(classifyAccessTokenSubmitError({ e: new ApiError({ message: "Token rejected", status: 400 }, { code: "VALIDATION", body }) })).toEqual({ kind: "validation", detail: "Token rejected" });
  });

  it("classifies a DUPLICATE_LABEL ApiError", () => {
    expect(classifyAccessTokenSubmitError({ e: new ApiError({ message: "dup", status: 409 }, { code: "DUPLICATE_LABEL" }) })).toEqual({ kind: "duplicate-label" });
  });

  it("classifies a VALIDATION ApiError, preferring body.detail over the message", () => {
    const err = new ApiError({ message: "bad request", status: 400 }, { code: "VALIDATION", body: { detail: "token is required" } });
    expect(classifyAccessTokenSubmitError({ e: err })).toEqual({ kind: "validation", detail: "token is required" });
  });

  it("falls back to generic for a non-ApiError", () => {
    expect(classifyAccessTokenSubmitError({ e: new Error("network down") })).toEqual({ kind: "generic" });
  });

  it("falls back to generic for an ApiError whose code matches neither known marker", () => {
    expect(classifyAccessTokenSubmitError({ e: new ApiError({ message: "internal error", status: 500 }, { code: "SECRET_STORE_UNCONFIGURED" }) })).toEqual({ kind: "generic" });
  });
});

/** A blank custom-provider form — every test overrides only the fields it cares about, same
 *  convention {@link blankFields} follows for the catalog providers' own form shape. */
describe("host provider copy", () => {
  it("labels deploy hosts 'Hosting' and source-control hosts 'Source control' — letter for letter the category chips' own labels", () => {
    const githubPages = accessTokenProviderInfo({ providers: PROVIDERS, copy: ACCESS_TOKEN_PROVIDER_COPY, ref: { kind: "publish", providerId: "github-pages" } });
    const github = accessTokenProviderInfo({ providers: PROVIDERS, copy: ACCESS_TOKEN_PROVIDER_COPY, ref: { kind: "source-control", providerId: "github" } });
    expect(githubPages.purposeLabel).toBe("Hosting");
    expect(github.purposeLabel).toBe("Source control");
    const chip = (id: string) => ACCESS_TOKEN_CATEGORIES.find((c) => c.id === id)!.label;
    expect(githubPages.purposeLabel).toBe(chip("hosting"));
    expect(github.purposeLabel).toBe(chip("source-control"));
  });

  it("uses General and the host's custom-credential guidance for a custom row without category metadata", () => {
    const [row] = buildCustomCredentialRows({ raws: [{ id: "custom-1", label: "Legacy provider", createdAt: "", updatedAt: "" } as RawCustomCredentialSummary] });
    const info = accessTokenRowProviderInfo({ providers: PROVIDERS, copy: ACCESS_TOKEN_PROVIDER_COPY, row: row! });
    expect(info.purposeLabel).toBe("General");
    expect(info.scopeGuidanceKey).toBe("Paste the access token this provider issued from its own dashboard.");
    expect(providerGroupSubtitleKeys({ info, copy: ACCESS_TOKEN_PROVIDER_COPY })).toEqual(["Custom credential", "General"]);
  });

  it("'Custom credential' is translated in every admin locale", () => {
    for (const locale of ["es", "id", "de", "zh-CN", "zh-TW", "pt-BR", "ru", "fa", "ar", "ja", "ko", "pl", "hu", "fr", "uk", "tr", "th", "it", "hi", "ur", "bn"]) {
      expect(translateSecurity({ locale: locale, key: "Custom credential" }), locale).not.toBe("Custom credential");
    }
  });
});

describe("providerGroupHandleLabel / tokenRowHandleLabel", () => {
  it("providerGroupHandleLabel names the provider and reports the connected count", () => {
    const info = GITHUB_PAGES_INFO;
    expect(providerGroupHandleLabel({ info, connectedCount: 3 })).toBe(`${info.label}'s saved access tokens — 3 connected`);
  });

  it("providerGroupHandleLabel reports zero connected the same way as any other count", () => {
    const info = GITHUB_PAGES_INFO;
    expect(providerGroupHandleLabel({ info, connectedCount: 0 })).toBe(`${info.label}'s saved access tokens — 0 connected`);
  });

  it("tokenRowHandleLabel joins the row's own name and its provider's label", () => {
    expect(tokenRowHandleLabel({ name: "Production", providerLabel: "GitHub Pages" })).toBe("Production — GitHub Pages, connected");
  });
});
function blankCustomRowFields(overrides: Partial<AccessTokenFormFields> = {}): AccessTokenFormFields {
  return { ref: { kind: "custom", providerId: "custom-1" }, name: "", token: "", values: {}, username: "", ...overrides };
}

describe("accessTokenExistingRowReadyToSave — the Replace form's gate, picked by row kind (terra review 2026-09-20 #3)", () => {
  /** The custom gate reads the row, never the provider entry. */
  const CUSTOM_INFO = infoFor({ kind: "custom", providerId: "name.com" });

  it("a custom row uses the custom gate: a username-only change is ready", () => {
    expect(accessTokenExistingRowReadyToSave({ fields: blankCustomRowFields({ name: "name.com", username: "new-user" }), row: { kind: "custom", name: "name.com", username: "old-user" }, info: CUSTOM_INFO })).toBe(true);
    expect(accessTokenExistingRowReadyToSave({ fields: blankCustomRowFields({ name: "name.com", username: "old-user" }), row: { kind: "custom", name: "name.com", username: "old-user" }, info: CUSTOM_INFO })).toBe(false);
  });

  it("a catalog row keeps the catalog gate: a username with no token and no rename is NOT ready", () => {
    const fields: AccessTokenFormFields = { ref: { kind: "source-control", providerId: "bitbucket" }, name: "Team", token: "", values: { username: "bb-user" }, username: "" };
    const info = infoFor(fields.ref);
    expect(accessTokenExistingRowReadyToSave({ fields, row: { kind: "source-control", name: "Team", username: undefined }, info })).toBe(false);
    expect(accessTokenExistingRowReadyToSave({ fields: { ...fields, name: "Team 2" }, row: { kind: "source-control", name: "Team", username: undefined }, info })).toBe(true);
  });
});
