import { describe, expect, it } from "vitest";

import { ApiError, type AdminPublishCredentialSummary } from "@/lib/api";
import {
  PUBLISH_CREDENTIAL_ROW_LABEL,
  buildCredentialConnectionInput,
  buildStaticPublishConfig,
  credentialFieldHandleId,
  fieldNameHandleSegment,
  credentialFormReadyToSave,
  fieldHelpText,
  credentialNoun,
  credentialStepSubtitle,
  fieldLabelParts,
  publishConfigFieldHandleId,
  publishTargetById,
  classifyPublishCredentialSubmitError,
  credentialsForProvider,
  daemonStatusLabelKey,
  defaultCredentialForProvider,
  withPromotedDefault,
  credentialVerifyStatusClass,
  deploymentEnvVarNoteKey,
  envVarStatusLabelKey,
  exportRunStatusLabelKey,
  isEnvVarRowUnsafe,
  ownerPasswordLabelKey,
  productionGateLabelKey,
  publishRunStatusLabelKey,
  runStatusTone,
  runtimeModeLabelKey,
  staticPublishFormReadyForPreview,
  staticPublishFormReadyToPublish,
  staticPublishProjectNameCopy,
  staticPublishProjectNameToSend,
} from "../rules";
import { CLOUDFLARE_PAGES_TARGET, GITHUB_PAGES_TARGET, PLAIN_TARGET, PUBLISH_TARGETS, VERCEL_TARGET } from "./publish-targets.fixture";

/**
 * @file `rules.ts` — the Deployment panel's pure label/tone helpers. Every function here returns a
 * dictionary KEY, not translated text (see `rules.ts`'s own file header) — these tests assert the
 * key, matching how `use-page-editor.hooks.ts`'s label helpers are pinned elsewhere in this app.
 */

describe("runtimeModeLabelKey", () => {
  it("maps production to the Production key", () => {
    expect(runtimeModeLabelKey("production")).toBe("Production");
  });
  it("maps local to the Local key", () => {
    expect(runtimeModeLabelKey("local")).toBe("Local");
  });
});

describe("productionGateLabelKey", () => {
  it("reports Passed when the gate applied (production mode, boot already succeeded)", () => {
    expect(productionGateLabelKey({ applicable: true, passed: true })).toBe("Passed");
  });
  it("reports not-applicable when the gate never ran (local mode) — never a false Passed", () => {
    expect(productionGateLabelKey({ applicable: false, passed: false })).toBe("Not applicable (local mode)");
  });
});

describe("daemonStatusLabelKey", () => {
  it("reports no known failure when the daemon hasn't latched a failure", () => {
    expect(daemonStatusLabelKey({ daemonKnownFailed: false })).toBe("No known failure");
  });
  it("reports the known-failure key when it has", () => {
    expect(daemonStatusLabelKey({ daemonKnownFailed: true })).toBe("Known failure — check server logs.");
  });
});

describe("ownerPasswordLabelKey", () => {
  it("warns when the password is still the default", () => {
    expect(ownerPasswordLabelKey({ defaultOwnerPasswordUnsafe: true })).toBe("Still the default — set TOVU_ADMIN_PASSWORD.");
  });
  it("confirms when it's been changed", () => {
    expect(ownerPasswordLabelKey({ defaultOwnerPasswordUnsafe: false })).toBe("Changed from the default.");
  });
});

describe("isEnvVarRowUnsafe", () => {
  it("flags an UNSET owner password as unsafe", () => {
    expect(isEnvVarRowUnsafe({ name: "TOVU_ADMIN_PASSWORD", set: false })).toBe(true);
  });
  it("does not flag a SET owner password", () => {
    expect(isEnvVarRowUnsafe({ name: "TOVU_ADMIN_PASSWORD", set: true })).toBe(false);
  });
  it("does not flag any other unset var — only the password has a real safety consequence at boot", () => {
    expect(isEnvVarRowUnsafe({ name: "TOVU_SITE_KEY", set: false })).toBe(false);
    expect(isEnvVarRowUnsafe({ name: "TOVU_ADMIN_USER", set: false })).toBe(false);
    expect(isEnvVarRowUnsafe({ name: "JINI_AGENT_DAEMON_PORT", set: false })).toBe(false);
  });
});

// c7-rev-settings-deploy 2026-09-24: the site key resolves from the env var OR a generated key
// file; the row must say which, and a malformed key must read as a warning, not a neutral "Not set".
describe("envVarStatusLabelKey / isEnvVarRowUnsafe — site key source and validity", () => {
  it("labels a site key resolved from the generated key file", () => {
    expect(envVarStatusLabelKey({ name: "TOVU_SITE_KEY", set: true, source: "file" })).toBe("Set (generated key file)");
  });
  it("labels a site key from the env var as plain Set", () => {
    expect(envVarStatusLabelKey({ name: "TOVU_SITE_KEY", set: true, source: "env" })).toBe("Set");
  });
  it("labels malformed site key material as invalid, and flags the row unsafe", () => {
    const row = { name: "TOVU_SITE_KEY", set: false, source: "env" as const, invalid: true as const };
    expect(envVarStatusLabelKey(row)).toBe("Invalid — the keyring rejects it");
    expect(isEnvVarRowUnsafe(row)).toBe(true);
  });
  it("labels an absent var Not set", () => {
    expect(envVarStatusLabelKey({ name: "TOVU_ADMIN_USER", set: false })).toBe("Not set");
  });
});

// c7-rev-settings-deploy 2026-09-24: "Could not reach GitHub to verify this credential." rendered in
// the success colour — an unverified token must not read as a pass.
describe("credentialVerifyStatusClass", () => {
  const checkedAt = "2026-09-24T00:00:00.000Z";
  it("styles a valid verdict as ok", () => {
    expect(credentialVerifyStatusClass({ verifyError: null, verification: { status: "valid", message: "ok", checkedAt } })).toBe("save-ok");
  });
  it("styles an unreachable verdict as a warning, not ok", () => {
    expect(credentialVerifyStatusClass({ verifyError: null, verification: { status: "unreachable", message: "x", checkedAt } })).toBe("save-warning");
  });
  it("styles an invalid verdict and a request failure as errors", () => {
    expect(credentialVerifyStatusClass({ verifyError: null, verification: { status: "invalid", message: "x", checkedAt } })).toBe("save-error");
    expect(credentialVerifyStatusClass({ verifyError: "network down", verification: undefined })).toBe("save-error");
  });
});

describe("deploymentEnvVarNoteKey", () => {
  it("returns a distinct note per known var", () => {
    const names = ["TOVU_ADMIN_PASSWORD", "TOVU_ADMIN_USER", "TOVU_SITE_KEY", "JINI_AGENT_DAEMON_PORT"];
    const notes = names.map((name) => deploymentEnvVarNoteKey({ name }));
    expect(new Set(notes).size).toBe(names.length);
    expect(notes.every((n) => n.length > 0)).toBe(true);
    expect(deploymentEnvVarNoteKey({ name: "TOVU_ADMIN_PASSWORD" })).toBe("Falls back to a public default.");
    expect(deploymentEnvVarNoteKey({ name: "TOVU_ADMIN_USER" })).toBe('Falls back to "admin".');
    expect(deploymentEnvVarNoteKey({ name: "JINI_AGENT_DAEMON_PORT" })).toBe("Falls back to port 4319.");
  });

  it("states the integrations Site key is boot-blocking in production, with the local-mode 503 fallback noted too", () => {
    expect(deploymentEnvVarNoteKey({ name: "TOVU_SITE_KEY" })).toMatch(/required to boot in production/i);
    expect(deploymentEnvVarNoteKey({ name: "TOVU_SITE_KEY" })).toMatch(/503/);
  });

  it("returns an empty string for an unrecognized name rather than throwing or fabricating a note", () => {
    expect(deploymentEnvVarNoteKey({ name: "SOME_UNKNOWN_VAR" })).toBe("");
  });
});


describe("runStatusTone", () => {
  it("maps idle to neutral, running to warning, errored to error", () => {
    expect(runStatusTone({ status: "idle" }, { ok: undefined })).toBe("neutral");
    expect(runStatusTone({ status: "running" }, { ok: undefined })).toBe("warning");
    expect(runStatusTone({ status: "errored" }, { ok: undefined })).toBe("error");
  });

  it("maps a completed run to ok when successful and error when ok is explicitly false", () => {
    expect(runStatusTone({ status: "completed" }, { ok: true })).toBe("ok");
    expect(runStatusTone({ status: "completed" }, { ok: undefined })).toBe("ok");
    expect(runStatusTone({ status: "completed" }, { ok: false })).toBe("error");
  });
});

describe("exportRunStatusLabelKey", () => {
  it("reads an undefined run the same as an explicit idle run", () => {
    expect(exportRunStatusLabelKey({ run: undefined })).toBe(exportRunStatusLabelKey({ run: { status: "idle" } }));
    expect(exportRunStatusLabelKey({ run: undefined })).toBe("Not started");
    expect(exportRunStatusLabelKey({ run: { status: "idle" } })).toBe("Not started");
  });

  it("distinguishes a clean finish from one with route failures", () => {
    expect(exportRunStatusLabelKey({ run: { status: "completed", ok: true } })).toBe("Export finished");
    expect(exportRunStatusLabelKey({ run: { status: "completed", ok: false } })).toBe("Finished with failures");
  });

  it("reports running and errored distinctly", () => {
    expect(exportRunStatusLabelKey({ run: { status: "running" } })).toBe("Exporting…");
    expect(exportRunStatusLabelKey({ run: { status: "errored" } })).toBe("Export failed");
  });
});

describe("publishRunStatusLabelKey", () => {
  it("reads an undefined run the same as an explicit idle run", () => {
    expect(publishRunStatusLabelKey({ run: undefined })).toBe(publishRunStatusLabelKey({ run: { status: "idle" } }));
    expect(publishRunStatusLabelKey({ run: undefined })).toBe("Not started");
    expect(publishRunStatusLabelKey({ run: { status: "idle" } })).toBe("Not started");
  });

  it("distinguishes a real success from a completed-but-failed outcome (e.g. no credentials)", () => {
    expect(publishRunStatusLabelKey({ run: { status: "completed", result: { ok: true } as never } })).toBe("Published");
    expect(publishRunStatusLabelKey({ run: { status: "completed", result: { ok: false } as never } })).toBe("Publish failed");
  });

  it("reports running and errored distinctly", () => {
    expect(publishRunStatusLabelKey({ run: { status: "running" } })).toBe("Publishing…");
    expect(publishRunStatusLabelKey({ run: { status: "errored" } })).toBe("Publish failed");
  });
});

describe("staticPublishFormReadyForPreview / staticPublishFormReadyToPublish", () => {
  it("a preview needs every REQUIRED config field the host's descriptor declares, and nothing else", () => {
    expect(staticPublishFormReadyForPreview({ target: GITHUB_PAGES_TARGET, values: {} })).toBe(false);
    expect(staticPublishFormReadyForPreview({ target: GITHUB_PAGES_TARGET, values: { owner: "octo", repo: " " } })).toBe(false);
    expect(staticPublishFormReadyForPreview({ target: GITHUB_PAGES_TARGET, values: { owner: "octo", repo: "demo" } })).toBe(true);
    expect(staticPublishFormReadyForPreview({ target: VERCEL_TARGET, values: {} })).toBe(true); // teamId is optional
    expect(staticPublishFormReadyForPreview({ target: PLAIN_TARGET, values: {} })).toBe(true);
  });

  it("is never ready before the target list has loaded", () => {
    expect(staticPublishFormReadyForPreview({ target: undefined, values: {} })).toBe(false);
    expect(staticPublishFormReadyToPublish({ target: undefined, values: {}, projectName: "demo" })).toBe(false);
  });

  it("publishing additionally requires a non-blank projectName when the host declares one", () => {
    expect(staticPublishFormReadyToPublish({ target: GITHUB_PAGES_TARGET, values: { owner: "octo", repo: "demo" }, projectName: "" })).toBe(false);
    expect(staticPublishFormReadyToPublish({ target: GITHUB_PAGES_TARGET, values: { owner: "octo", repo: "demo" }, projectName: "  " })).toBe(false);
    expect(staticPublishFormReadyToPublish({ target: GITHUB_PAGES_TARGET, values: { owner: "octo", repo: "demo" }, projectName: "demo" })).toBe(true);
  });

  it("a host that declares no projectName (S3-compatible storage) publishes without one", () => {
    expect(staticPublishFormReadyToPublish({ target: PLAIN_TARGET, values: {}, projectName: "" })).toBe(true);
    expect(staticPublishFormReadyToPublish({ target: PLAIN_TARGET, values: {}, projectName: "stray" })).toBe(true);
  });
});

describe("staticPublishProjectNameToSend", () => {
  it("sends the typed name to a host that declares one", () => {
    expect(staticPublishProjectNameToSend({ target: GITHUB_PAGES_TARGET, projectName: "Publish from Tovu" })).toBe("Publish from Tovu");
  });

  it("sends the host's id to a host that declares none, since the server requires a non-blank value", () => {
    expect(staticPublishProjectNameToSend({ target: PLAIN_TARGET, projectName: "" })).toBe("plain-host");
    expect(staticPublishProjectNameToSend({ target: PLAIN_TARGET, projectName: "stray" })).toBe("plain-host");
  });
});

describe("buildStaticPublishConfig", () => {
  it("sends only the host's declared fields, trimmed, dropping blank ones so the server applies its own default", () => {
    expect(buildStaticPublishConfig(GITHUB_PAGES_TARGET, { owner: " octo ", repo: "demo", branch: "  ", teamId: "stray" })).toEqual({
      target: "github-pages",
      fields: { owner: "octo", repo: "demo" },
    });
    expect(buildStaticPublishConfig(PLAIN_TARGET, { owner: "stray" })).toEqual({ target: "plain-host", fields: {} });
  });
});

describe("staticPublishProjectNameCopy", () => {
  it("uses the host's own label and help when its descriptor names the field", () => {
    expect(staticPublishProjectNameCopy({ target: GITHUB_PAGES_TARGET })).toEqual({
      labelKey: "Commit message",
      helpKey: "Used as the commit message on the gh-pages branch.",
    });
  });

  it("is null for a host that declares no project name, and while the list loads, so the tab shows no field", () => {
    expect(staticPublishProjectNameCopy({ target: PLAIN_TARGET })).toBeNull();
    expect(staticPublishProjectNameCopy({ target: undefined })).toBeNull();
  });

  it("keeps a declared label with no help, leaving helpKey undefined", () => {
    expect(staticPublishProjectNameCopy({ target: { ...PLAIN_TARGET, projectName: { label: "Site name" } } })).toEqual({ labelKey: "Site name", helpKey: undefined });
  });
});

describe("credentialFormReadyToSave / buildCredentialConnectionInput", () => {
  const spec = CLOUDFLARE_PAGES_TARGET.credential!;

  it("needs a non-blank token plus every required credential field", () => {
    expect(credentialFormReadyToSave(spec, {})).toBe(false);
    expect(credentialFormReadyToSave(spec, { token: "tok" })).toBe(false);
    expect(credentialFormReadyToSave(spec, { token: " ", accountId: "acct" })).toBe(false);
    expect(credentialFormReadyToSave(spec, { token: "tok", accountId: "acct" })).toBe(true);
  });

  it("reads the token from the descriptor's tokenField, whatever it is named", () => {
    const keyed = { tokenField: "secretKey", fields: [{ name: "secretKey", label: "Secret key", required: true }] };
    expect(credentialFormReadyToSave(keyed, { secretKey: "s" })).toBe(true);
    expect(credentialFormReadyToSave(keyed, { token: "s" })).toBe(false);
  });

  it("builds the connection from declared fields only, trimming ordinary fields and preserving the token for store validation", () => {
    expect(buildCredentialConnectionInput({ providerId: "cloudflare-pages", spec, values: { token: " tok ", accountId: " acct ", stray: "x" } })).toEqual({
      providerId: "cloudflare-pages",
      token: " tok ",
      accountId: "acct",
    });
  });

  it("omits an absent token from the connection while retaining declared account fields", () => {
    expect(buildCredentialConnectionInput({ providerId: "cloudflare-pages", spec, values: { accountId: " acct ", stray: "x" } })).toEqual({
      providerId: "cloudflare-pages",
      accountId: "acct",
    });
  });
});

describe("agent handle ids", () => {
  it("keeps the ids agent tooling already uses for config and credential inputs", () => {
    expect(publishConfigFieldHandleId({ fieldName: "owner" })).toBe("deployment-static-site-publish-owner");
    expect(publishConfigFieldHandleId({ fieldName: "teamId" })).toBe("deployment-static-site-publish-team");
    expect(credentialFieldHandleId({ providerId: "host", fieldName: "token", tokenField: "token" })).toBe("deployment-static-site-credentials-token-host");
    expect(credentialFieldHandleId({ providerId: "host", fieldName: "accountId", tokenField: "token" })).toBe("deployment-static-site-credentials-account-host");
    expect(credentialFieldHandleId({ providerId: "host", fieldName: "region", tokenField: "secretKey" })).toBe("deployment-static-site-credentials-region-host");
  });

  it("hyphenates a camelCase field name, since agentHandle() throws on capitals and one throw blanks the admin", () => {
    // S3-compatible's `accessKeyId` crashed the Static Site tab on 2026-09-29 (seen in the browser).
    expect(credentialFieldHandleId({ providerId: "s3-compatible", fieldName: "accessKeyId", tokenField: "secretAccessKey" })).toBe("deployment-static-site-credentials-access-key-id-s3-compatible");
    expect(publishConfigFieldHandleId({ fieldName: "basePath" })).toBe("deployment-static-site-publish-base-path");
    expect(fieldNameHandleSegment({ fieldName: "publicURL" })).toBe("public-url");
  });
});

describe("credentialNoun / credentialStepSubtitle", () => {
  const spec = (label: string) => ({ tokenField: "token", fields: [{ name: "token", label, required: true, secret: true as const }] });

  it("names the host's own credential mid-sentence, keeping a leading acronym", () => {
    expect(credentialNoun(spec("API token"))).toBe("API token");
    expect(credentialNoun(spec("Secret access key"))).toBe("secret access key");
    expect(credentialNoun({ tokenField: "token", fields: [] })).toBe("access token");
  });

  it("says 'Save your <credential>' unless the workspace cannot reach a terminal", () => {
    const identity = (key: string) => key;
    expect(credentialStepSubtitle({ executionMode: "self-hosted-cli", credential: spec("API token"), translate: identity })).toBe("Save your API token so Tovu can publish on your behalf.");
    expect(credentialStepSubtitle({ executionMode: "hosted-api-only", credential: spec("API token"), translate: identity })).toBe(
      "This workspace can't use your computer's terminal — connecting here is the only way to publish."
    );
  });

  it("fills the host's credential into a translated template", () => {
    const spanish = (key: string) => (key === "Save your {credential} so Tovu can publish on your behalf." ? "Guarda tu {credential} para que Tovu pueda publicar en tu nombre." : key);
    expect(credentialStepSubtitle({ executionMode: "self-hosted-cli", credential: spec("Access token"), translate: spanish })).toBe("Guarda tu access token para que Tovu pueda publicar en tu nombre.");
  });
});

describe("fieldHelpText", () => {
  it("shows the person-facing userHelp over the agent's help", () => {
    expect(fieldHelpText({ field: { name: "owner", label: "Owner", help: "Never guess it.", userHelp: "The account that owns the repository." } })).toBe(
      "The account that owns the repository."
    );
  });

  it("reads a credential form's guidance the same way: userHelp over help", () => {
    expect(fieldHelpText({ field: { help: "Ask me for the steps.", userHelp: "Create the bucket first.", tokenField: "token", fields: [] } })).toBe("Create the bucket first.");
    expect(fieldHelpText({ field: { help: "Needs an API token.", tokenField: "token", fields: [] } })).toBe("Needs an API token.");
  });

  it("falls back to help, and to nothing when a field has neither", () => {
    expect(fieldHelpText({ field: { name: "branch", label: "Branch", help: "Defaults to gh-pages." } })).toBe("Defaults to gh-pages.");
    expect(fieldHelpText({ field: { name: "repo", label: "Repository" } })).toBeUndefined();
  });
});

describe("publishTargetById / fieldLabelParts", () => {
  it("finds a listed target and returns undefined for an unknown id or an unloaded list", () => {
    expect(publishTargetById({ targets: PUBLISH_TARGETS, id: "vercel" })).toBe(VERCEL_TARGET);
    expect(publishTargetById({ targets: PUBLISH_TARGETS, id: "nope" })).toBeUndefined();
    expect(publishTargetById({ targets: undefined, id: "vercel" })).toBeUndefined();
  });

  it("adds the optional suffix key only to optional fields", () => {
    expect(fieldLabelParts({ name: "owner", label: "Owner", required: true })).toEqual({ label: "Owner", suffixKey: null });
    expect(fieldLabelParts({ name: "branch", label: "Branch" })).toEqual({ label: "Branch", suffixKey: "(optional)" });
  });
});

describe("credentialsForProvider", () => {
  function credential(overrides: Partial<AdminPublishCredentialSummary> = {}): AdminPublishCredentialSummary {
    return {
    credentialType: "vendor", worksFor: [],
      id: "cred-1",
      providerId: "github-pages",
      label: "label",
      configured: true,
      isDefault: true,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      accountLabel: null,
      ...overrides,
    };
  }

  it("returns only the credentials matching the given providerId, in the original order", () => {
    const gh = credential({ id: "cred-1", providerId: "github-pages" });
    const vercel1 = credential({ id: "cred-2", providerId: "vercel", isDefault: true });
    const vercel2 = credential({ id: "cred-3", providerId: "vercel", isDefault: false });
    expect(credentialsForProvider([gh, vercel1, vercel2], "vercel")).toEqual([vercel1, vercel2]);
  });

  it("returns an empty array when this workspace has no credential for the provider — never throws", () => {
    expect(credentialsForProvider([], "netlify")).toEqual([]);
    expect(credentialsForProvider([credential({ providerId: "github-pages" })], "netlify")).toEqual([]);
  });
});

describe("withPromotedDefault", () => {
  function credential(overrides: Partial<AdminPublishCredentialSummary> = {}): AdminPublishCredentialSummary {
    return {
    credentialType: "vendor", worksFor: [],
      id: "cred-1",
      providerId: "github-pages",
      label: PUBLISH_CREDENTIAL_ROW_LABEL,
      configured: true,
      isDefault: false,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      accountLabel: null,
      ...overrides,
    };
  }

  it("swaps in the server's summary, un-defaults the same provider's other rows, and leaves other providers alone", () => {
    const oldDefault = credential({ id: "gh-a", isDefault: true });
    const chosen = credential({ id: "gh-b" });
    const vercel = credential({ id: "v-1", providerId: "vercel", isDefault: true });
    const promoted = { ...chosen, isDefault: true, updatedAt: "2026-09-20T00:00:00.000Z" };

    expect(withPromotedDefault([oldDefault, chosen, vercel], promoted)).toEqual([{ ...oldDefault, isDefault: false }, promoted, vercel]);
  });
});

describe("defaultCredentialForProvider", () => {
  function credential(overrides: Partial<AdminPublishCredentialSummary> = {}): AdminPublishCredentialSummary {
    return {
    credentialType: "vendor", worksFor: [],
      id: "cred-1",
      providerId: "github-pages",
      label: PUBLISH_CREDENTIAL_ROW_LABEL,
      configured: true,
      isDefault: true,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      accountLabel: null,
      ...overrides,
    };
  }

  it("returns undefined when this provider has no saved connection — never throws", () => {
    expect(defaultCredentialForProvider([], "vercel")).toBeUndefined();
  });

  it("returns the sole saved connection for a provider with exactly one", () => {
    const gh = credential({ id: "cred-1", providerId: "github-pages" });
    expect(defaultCredentialForProvider([gh], "github-pages")).toBe(gh);
  });

  it("picks the DEFAULT row when a provider has more than one saved connection — never the first-created or an arbitrary one", () => {
    const old = credential({ id: "cred-1", providerId: "vercel", label: "Old", isDefault: false });
    const current = credential({ id: "cred-2", providerId: "vercel", label: "New", isDefault: true });
    expect(defaultCredentialForProvider([old, current], "vercel")).toBe(current);
  });

  it("falls back to the first saved row as a defensive read when none is marked default (data predating this UI)", () => {
    const first = credential({ id: "cred-1", providerId: "netlify", isDefault: false });
    expect(defaultCredentialForProvider([first], "netlify")).toBe(first);
  });
});

describe("classifyPublishCredentialSubmitError", () => {
  it("recognizes DUPLICATE_LABEL via e.message (the dispatched contract's own shape: { error: 'DUPLICATE_LABEL' }, no separate code)", () => {
    const err = new ApiError({ message: "DUPLICATE_LABEL", status: 409 });
    expect(classifyPublishCredentialSubmitError({ e: err })).toEqual({ kind: "duplicate-label" });
  });

  it("recognizes DUPLICATE_LABEL via e.code too (this codebase's usual { error, code } shape)", () => {
    const err = new ApiError({ message: "A credential with this label already exists.", status: 409 }, { code: "DUPLICATE_LABEL" });
    expect(classifyPublishCredentialSubmitError({ e: err })).toEqual({ kind: "duplicate-label" });
  });

  it("recognizes VALIDATION and surfaces body.detail when present", () => {
    const err = new ApiError({ message: "VALIDATION", status: 400 }, { code: undefined, body: { error: "VALIDATION", detail: "accountId is required for cloudflare-pages" } });
    expect(classifyPublishCredentialSubmitError({ e: err })).toEqual({ kind: "validation", detail: "accountId is required for cloudflare-pages" });
  });

  it("VALIDATION without a body.detail falls back to the error message itself, never throws or drops the failure", () => {
    const err = new ApiError({ message: "VALIDATION", status: 400 });
    expect(classifyPublishCredentialSubmitError({ e: err })).toEqual({ kind: "validation", detail: "VALIDATION" });
  });

  it("falls through to 'generic' for an unrecognized ApiError and for a non-ApiError rejection", () => {
    expect(classifyPublishCredentialSubmitError({ e: new ApiError({ message: "request failed (500)", status: 500 }) })).toEqual({ kind: "generic" });
    expect(classifyPublishCredentialSubmitError({ e: new Error("network down") })).toEqual({ kind: "generic" });
    expect(classifyPublishCredentialSubmitError({ e: "not even an Error" })).toEqual({ kind: "generic" });
  });
});
