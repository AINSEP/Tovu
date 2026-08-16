import { describe, expect, it } from "vitest";

import { ApiError } from "../../../lib/api";
import type { AdminSourceControlCredentialSummary } from "../types";
import {
  SOURCE_CONTROL_CREDENTIAL_ROW_LABEL,
  SOURCE_CONTROL_PROVIDERS,
  buildSourceControlConnectionInput,
  classifySourceControlCredentialSubmitError,
  defaultSourceControlCredentialForProvider,
  sourceControlCredentialRowReadyToSave,
  sourceControlCredentialsForProvider,
  sourceControlProviderInfo,
  type SourceControlCredentialFormFields,
} from "../rules";

/** A blank form for one provider — every test below overrides only the fields it cares about, same
 *  "start from a known-empty baseline" convention `deployment/__tests__/rules.unit.test.ts`'s own
 *  `blankCredentialFields` follows. */
function blankFields(providerId: SourceControlCredentialFormFields["providerId"]): SourceControlCredentialFormFields {
  return { providerId, token: "", username: "" };
}

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

describe("SOURCE_CONTROL_PROVIDERS", () => {
  it("lists GitHub, GitLab, Bitbucket in that order — GitHub first per the brief", () => {
    expect(SOURCE_CONTROL_PROVIDERS.map((provider) => provider.id)).toEqual(["github", "gitlab", "bitbucket"]);
  });

  it("requires no extra field for GitHub or GitLab", () => {
    expect(sourceControlProviderInfo("github").requiredFields).toEqual([]);
    expect(sourceControlProviderInfo("gitlab").requiredFields).toEqual([]);
  });

  it("requires a username for Bitbucket alongside the universal token", () => {
    expect(sourceControlProviderInfo("bitbucket").requiredFields).toEqual(["username"]);
  });
});

describe("sourceControlProviderInfo", () => {
  it("looks up a provider by id", () => {
    expect(sourceControlProviderInfo("gitlab").label).toBe("GitLab");
  });
});

describe("buildSourceControlConnectionInput", () => {
  it("builds a github connection with only the trimmed token", () => {
    const input = buildSourceControlConnectionInput({ providerId: "github", token: "  ghp_abc  ", username: "" });
    expect(input).toEqual({ providerId: "github", token: "ghp_abc" });
  });

  it("builds a gitlab connection with only the trimmed token", () => {
    const input = buildSourceControlConnectionInput({ providerId: "gitlab", token: "glpat-xyz", username: "" });
    expect(input).toEqual({ providerId: "gitlab", token: "glpat-xyz" });
  });

  it("builds a bitbucket connection with both the trimmed token AND the trimmed username", () => {
    const input = buildSourceControlConnectionInput({ providerId: "bitbucket", token: " app-pw ", username: " alice " });
    expect(input).toEqual({ providerId: "bitbucket", token: "app-pw", username: "alice" });
  });
});

describe("sourceControlCredentialRowReadyToSave", () => {
  it("is false with a blank token, regardless of provider", () => {
    expect(sourceControlCredentialRowReadyToSave(blankFields("github"))).toBe(false);
  });

  it("is true for GitHub/GitLab once the token alone is filled in", () => {
    expect(sourceControlCredentialRowReadyToSave({ ...blankFields("github"), token: "ghp_abc" })).toBe(true);
    expect(sourceControlCredentialRowReadyToSave({ ...blankFields("gitlab"), token: "glpat-xyz" })).toBe(true);
  });

  it("is false for Bitbucket with a token but no username", () => {
    expect(sourceControlCredentialRowReadyToSave({ ...blankFields("bitbucket"), token: "app-pw" })).toBe(false);
  });

  it("is true for Bitbucket only once both token and username are filled in", () => {
    expect(sourceControlCredentialRowReadyToSave({ providerId: "bitbucket", token: "app-pw", username: "alice" })).toBe(true);
  });

  it("treats a whitespace-only username as blank for Bitbucket", () => {
    expect(sourceControlCredentialRowReadyToSave({ providerId: "bitbucket", token: "app-pw", username: "   " })).toBe(false);
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
