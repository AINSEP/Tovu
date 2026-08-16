import { describe, expect, it } from "vitest";

import { ApiError } from "../../../lib/api";
import {
  ACCESS_TOKEN_PROVIDERS,
  accessTokenNameTaken,
  accessTokenProviderInfo,
  accessTokenProviderMatchesQuery,
  accessTokenReplaceReadyToSave,
  accessTokenRowMatchesQuery,
  accessTokenRowReadyToSave,
  accessTokenRowsForProvider,
  buildAccessTokenConnectionInput,
  buildAccessTokenRows,
  buildAccessTokenUpdatePatch,
  classifyAccessTokenSubmitError,
  planLegacyLabelMigrations,
  type AccessTokenFormFields,
  type AccessTokenRow,
  type RawCredentialSummary,
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

describe("planLegacyLabelMigrations", () => {
  it("plans a rename for every row still carrying its store's sentinel label", () => {
    const rows = buildAccessTokenRows("publish", [rawSummary({ id: "a", providerId: "github-pages", label: "default" })]);
    const plan = planLegacyLabelMigrations(rows);
    expect(plan).toEqual([{ kind: "publish", id: "a", newLabel: "GitHub Pages token" }]);
  });

  it("plans nothing for a row that already has a real, non-sentinel label", () => {
    const rows = buildAccessTokenRows("publish", [rawSummary({ id: "a", label: "Production" })]);
    expect(planLegacyLabelMigrations(rows)).toEqual([]);
  });

  it("mixes both kinds correctly in one combined list", () => {
    const publishRows = buildAccessTokenRows("publish", [rawSummary({ id: "a", providerId: "vercel", label: "default" })]);
    const scRows = buildAccessTokenRows("source-control", [rawSummary({ id: "b", providerId: "github", label: "default" })]);
    const plan = planLegacyLabelMigrations([...publishRows, ...scRows]);
    expect(plan).toEqual([
      { kind: "publish", id: "a", newLabel: "Vercel token" },
      { kind: "source-control", id: "b", newLabel: "GitHub token" },
    ]);
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
