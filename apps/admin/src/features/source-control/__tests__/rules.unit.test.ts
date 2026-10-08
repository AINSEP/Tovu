import { describe, expect, it } from "vitest";

import { ApiError, type AdminSourceControlCredentialSummary } from "@/lib/api";
import {
  SOURCE_CONTROL_CREDENTIAL_ROW_LABEL,
  buildSourceControlConnectionInput,
  classifySourceControlCredentialSubmitError,
  defaultSourceControlCredentialForProvider,
  sourceControlCredentialRowReadyToSave,
  sourceControlCredentialsForProvider,
  sourceControlProviderInfoFromDescriptor,
  sourceControlProviders,
  type SourceControlCredentialFormFields,
} from "../rules";
import { FORGE_PROVIDER, GITHUB_PROVIDER, SOURCE_CONTROL_PROVIDER_DESCRIPTORS } from "./source-control-providers.fixture";

/** A blank form for one provider — every test below overrides only the fields it cares about. */
function blankFields(providerId: string): SourceControlCredentialFormFields {
  return { providerId, token: "", values: {} };
}

const GITHUB = sourceControlProviderInfoFromDescriptor(GITHUB_PROVIDER);
const FORGE = sourceControlProviderInfoFromDescriptor(FORGE_PROVIDER);

function credential(overrides: Partial<AdminSourceControlCredentialSummary> = {}): AdminSourceControlCredentialSummary {
  return {
    id: "cred-1",
    providerId: "github",
    label: SOURCE_CONTROL_CREDENTIAL_ROW_LABEL,
    configured: true,
    isDefault: true,
    createdAt: "2026-08-15T10:00:00.000Z",
    updatedAt: "2026-08-15T10:00:00.000Z",
    ...overrides,
  };
}

describe("sourceControlProviderInfoFromDescriptor", () => {
  it("reads the label, guidance, token page and token label from the descriptor, and keeps only non-token fields", () => {
    expect(GITHUB).toEqual({
      id: "github",
      label: "GitHub",
      tokenPageUrl: "https://github.com/settings/personal-access-tokens/new",
      scopeGuidanceKey: "Needs a fine-grained personal access token scoped to just this repository.",
      tokenField: "token",
      tokenLabel: "Access token",
      fields: [],
      listed: true,
    });
    expect(FORGE.fields.map((field) => field.name)).toEqual(["username"]);
  });

  it("gives a descriptor with no credential form a bare token field and no guidance", () => {
    expect(sourceControlProviderInfoFromDescriptor({ id: "plain", label: "Plain" })).toEqual({
      id: "plain", label: "Plain", tokenPageUrl: "", scopeGuidanceKey: "", tokenField: "token", fields: [], listed: true,
    });
  });
});

describe("sourceControlProviders (IRON RULE: a saved connection never drops off the page)", () => {
  it("lists the listed hosts in the server's order", () => {
    expect(sourceControlProviders(SOURCE_CONTROL_PROVIDER_DESCRIPTORS, []).map((p) => [p.id, p.listed])).toEqual([
      ["github", true],
      ["forge", true],
    ]);
  });

  it("appends one bare unlisted entry per saved connection whose host is not listed, named by its id", () => {
    const rows = [credential({ id: "a", providerId: "gitlab" }), credential({ id: "b", providerId: "gitlab" }), credential({ id: "c", providerId: "github" })];
    const providers = sourceControlProviders([GITHUB_PROVIDER], rows);
    expect(providers.map((p) => [p.id, p.label, p.listed])).toEqual([
      ["github", "GitHub", true],
      ["gitlab", "gitlab", false],
    ]);
  });

  it("still lists saved connections' hosts while the host list is missing", () => {
    expect(sourceControlProviders(undefined, [credential({ providerId: "bitbucket" })]).map((p) => p.id)).toEqual(["bitbucket"]);
  });
});

describe("buildSourceControlConnectionInput", () => {
  it("passes the token unchanged to the store when the host declares nothing else", () => {
    expect(buildSourceControlConnectionInput({ ...blankFields("github"), token: "  ghp_abc  " }, GITHUB.fields)).toEqual({ providerId: "github", token: "  ghp_abc  " });
  });

  it("trims ordinary declared fields and drops undeclared or blank ones, preserving the token", () => {
    const input = buildSourceControlConnectionInput({ providerId: "forge", token: " t ", values: { username: " alice ", stray: "x" } }, FORGE.fields);
    expect(input).toEqual({ providerId: "forge", token: " t ", username: "alice" });
    expect(buildSourceControlConnectionInput({ providerId: "forge", token: "t", values: { username: "  " } }, FORGE.fields)).toEqual({ providerId: "forge", token: "t" });
  });

  it("preserves secret fields and canonical keys alongside trimmed ordinary fields", () => {
    const input = buildSourceControlConnectionInput({
      providerId: "forge", token: " t ",
      values: { username: " alice ", password: " p ", blankSecret: "  ", emptySecret: "", optional: "  ", providerId: "other", token: "other", stray: "x" },
    }, [...FORGE.fields, { name: "password", secret: true }, { name: "blankSecret", secret: true }, { name: "emptySecret", secret: true }, { name: "optional" }, { name: "providerId" }, { name: "token" }]);
    expect(input).toEqual({ providerId: "forge", token: " t ", username: "alice", password: " p ", blankSecret: "  " });
  });
});

describe("sourceControlCredentialRowReadyToSave", () => {
  it("is false with a blank token", () => {
    expect(sourceControlCredentialRowReadyToSave(blankFields("github"), GITHUB)).toBe(false);
  });

  it("is true once the token alone is filled in when the host declares nothing else", () => {
    expect(sourceControlCredentialRowReadyToSave({ ...blankFields("github"), token: "ghp_abc" }, GITHUB)).toBe(true);
  });

  it("is false until every required declared field is filled, treating whitespace as blank", () => {
    expect(sourceControlCredentialRowReadyToSave({ ...blankFields("forge"), token: "t" }, FORGE)).toBe(false);
    expect(sourceControlCredentialRowReadyToSave({ providerId: "forge", token: "t", values: { username: "   " } }, FORGE)).toBe(false);
    expect(sourceControlCredentialRowReadyToSave({ providerId: "forge", token: "t", values: { username: "alice" } }, FORGE)).toBe(true);
  });

  it("is never ready for an unlisted host", () => {
    const unlisted = sourceControlProviders([], [credential({ providerId: "gitlab" })])[0]!;
    expect(sourceControlCredentialRowReadyToSave({ ...blankFields("gitlab"), token: "glpat" }, unlisted)).toBe(false);
  });

  it("ignores an optional field while still requiring the host's required field", () => {
    const provider = { ...FORGE, fields: [...FORGE.fields, { name: "accountId", label: "Account ID", required: false }] };
    expect(sourceControlCredentialRowReadyToSave({ providerId: "forge", token: "t", values: {} }, provider)).toBe(false);
    expect(sourceControlCredentialRowReadyToSave({ providerId: "forge", token: "t", values: { username: "alice" } }, provider)).toBe(true);
    expect(sourceControlCredentialRowReadyToSave({ providerId: "forge", token: "t", values: { username: "alice", accountId: "  " } }, provider)).toBe(true);
  });
});

describe("sourceControlCredentialsForProvider / defaultSourceControlCredentialForProvider", () => {
  it("filters to just one provider's saved connections", () => {
    const rows = [credential({ id: "a", providerId: "github" }), credential({ id: "b", providerId: "gitlab" })];
    expect(sourceControlCredentialsForProvider(rows, "github").map((c) => c.id)).toEqual(["a"]);
  });

  it("returns undefined when nothing is saved for that provider yet", () => {
    expect(defaultSourceControlCredentialForProvider([], "github")).toBeUndefined();
  });

  it("prefers the row marked isDefault over an earlier non-default row", () => {
    const rows = [
      credential({ id: "old", providerId: "github", isDefault: false }),
      credential({ id: "current", providerId: "github", isDefault: true }),
    ];
    expect(defaultSourceControlCredentialForProvider(rows, "github")?.id).toBe("current");
  });

  it("falls back to the first saved row when none is marked default (defensive read)", () => {
    const rows = [credential({ id: "only", providerId: "github", isDefault: false })];
    expect(defaultSourceControlCredentialForProvider(rows, "github")?.id).toBe("only");
  });
});

describe("classifySourceControlCredentialSubmitError", () => {
  it("classifies a non-ApiError as generic", () => {
    expect(classifySourceControlCredentialSubmitError(new Error("boom"))).toEqual({ kind: "generic" });
  });

  it("classifies a DUPLICATE_LABEL code as duplicate-label", () => {
    const err = new ApiError("dup", 409, "DUPLICATE_LABEL");
    expect(classifySourceControlCredentialSubmitError(err)).toEqual({ kind: "duplicate-label" });
  });

  it("classifies a VALIDATION code, carrying the body's detail text", () => {
    const err = new ApiError("bad request", 400, "VALIDATION", { detail: "token is required" });
    expect(classifySourceControlCredentialSubmitError(err)).toEqual({ kind: "validation", detail: "token is required" });
  });

  it("falls back to the message as detail when a VALIDATION error carries no body.detail", () => {
    const err = new ApiError("bad request", 400, "VALIDATION");
    expect(classifySourceControlCredentialSubmitError(err)).toEqual({ kind: "validation", detail: "bad request" });
  });

  it("classifies any other ApiError as generic", () => {
    const err = new ApiError("server exploded", 500);
    expect(classifySourceControlCredentialSubmitError(err)).toEqual({ kind: "generic" });
  });
});
