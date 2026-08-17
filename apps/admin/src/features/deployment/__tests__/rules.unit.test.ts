import { describe, expect, it } from "vitest";

import { ApiError, type AdminPublishCredentialSummary } from "../../../lib/api";
import {
  FULL_SITE_PROVIDERS,
  PUBLISH_CLI_TOOLS,
  PUBLISH_CREDENTIAL_PROVIDERS,
  PUBLISH_CREDENTIAL_ROW_LABEL,
  STATIC_HOSTS,
  STATIC_PUBLISH_TARGETS,
  buildPublishConnectionInput,
  classifyPublishCredentialSubmitError,
  cliInstalledStatus,
  credentialsForProvider,
  daemonStatusLabelKey,
  defaultCredentialForProvider,
  deploymentEnvVarNoteKey,
  exportRunStatusLabelKey,
  isEnvVarRowUnsafe,
  ownerPasswordLabelKey,
  productionGateLabelKey,
  publishAssistantRequest,
  publishAssistantRequestForInstalledTool,
  publishAssistantRequestForTool,
  publishCredentialProviderInfo,
  publishCredentialRowReadyToSave,
  publishRunStatusLabelKey,
  runStatusTone,
  runtimeModeLabelKey,
  staticPublishFormReadyForPreview,
  staticPublishFormReadyToPublish,
  staticPublishProjectNameCopy,
  type PublishCredentialFormFields,
} from "../rules";

/** A blank form for one provider — every test below overrides only the fields it cares about,
 *  same "start from a known-empty baseline" convention the hook itself follows on `startAdd`. */
function blankCredentialFields(providerId: PublishCredentialFormFields["providerId"]): PublishCredentialFormFields {
  return { providerId, token: "", accountId: "" };
}

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
    expect(daemonStatusLabelKey(false)).toBe("No known failure");
  });
  it("reports the known-failure key when it has", () => {
    expect(daemonStatusLabelKey(true)).toBe("Known failure — check server logs.");
  });
});

describe("ownerPasswordLabelKey", () => {
  it("warns when the password is still the default", () => {
    expect(ownerPasswordLabelKey(true)).toBe("Still the default — set TOVU_ADMIN_PASSWORD.");
  });
  it("confirms when it's been changed", () => {
    expect(ownerPasswordLabelKey(false)).toBe("Changed from the default.");
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
    expect(isEnvVarRowUnsafe({ name: "TOVU_INTEGRATIONS_ROOT_KEY", set: false })).toBe(false);
    expect(isEnvVarRowUnsafe({ name: "TOVU_ADMIN_USER", set: false })).toBe(false);
    expect(isEnvVarRowUnsafe({ name: "JINI_AGENT_DAEMON_PORT", set: false })).toBe(false);
  });
});

describe("deploymentEnvVarNoteKey", () => {
  it("returns a distinct note per known var", () => {
    const names = ["TOVU_ADMIN_PASSWORD", "TOVU_ADMIN_USER", "TOVU_INTEGRATIONS_ROOT_KEY", "JINI_AGENT_DAEMON_PORT"];
    const notes = names.map(deploymentEnvVarNoteKey);
    expect(new Set(notes).size).toBe(names.length);
    expect(notes.every((n) => n.length > 0)).toBe(true);
  });

  it("frames the integrations root key as a later warning, not a boot failure — matches the brief's own wording", () => {
    expect(deploymentEnvVarNoteKey("TOVU_INTEGRATIONS_ROOT_KEY")).toMatch(/not required to boot/i);
    expect(deploymentEnvVarNoteKey("TOVU_INTEGRATIONS_ROOT_KEY")).toMatch(/503/);
  });

  it("returns an empty string for an unrecognized name rather than throwing or fabricating a note", () => {
    expect(deploymentEnvVarNoteKey("SOME_UNKNOWN_VAR")).toBe("");
  });
});

describe("FULL_SITE_PROVIDERS", () => {
  it("lists exactly the six providers named in the brief, each planned and each with unique id/description", () => {
    expect(FULL_SITE_PROVIDERS).toHaveLength(6);
    expect(FULL_SITE_PROVIDERS.every((p) => p.status === "planned")).toBe(true);
    expect(new Set(FULL_SITE_PROVIDERS.map((p) => p.id)).size).toBe(6);
    expect(new Set(FULL_SITE_PROVIDERS.map((p) => p.descriptionKey)).size).toBe(6);
  });

  it("puts AWS first — owner's own call, since it's expected to be the most popular provider", () => {
    expect(FULL_SITE_PROVIDERS[0]!.id).toBe("aws");
  });
});

describe("STATIC_HOSTS", () => {
  it("lists exactly the four static hosts named in the brief", () => {
    expect(STATIC_HOSTS).toEqual(["GitHub Pages", "Vercel", "Netlify", "Cloudflare Pages"]);
  });
});

describe("STATIC_PUBLISH_TARGETS", () => {
  it("lists exactly the four publish targets, matching PUBLISH_CREDENTIAL_PROVIDERS' own id set", () => {
    expect(STATIC_PUBLISH_TARGETS).toHaveLength(4);
    expect(STATIC_PUBLISH_TARGETS.map((target) => target.id)).toEqual(["github-pages", "vercel", "netlify", "cloudflare-pages"]);
    expect(new Set(STATIC_PUBLISH_TARGETS.map((t) => t.id))).toEqual(new Set(PUBLISH_CREDENTIAL_PROVIDERS.map((p) => p.id)));
  });

  it("github-pages and vercel each pair to a real CLI tool id; netlify and cloudflare-pages carry none", () => {
    const gh = STATIC_PUBLISH_TARGETS.find((t) => t.id === "github-pages")!;
    const vercel = STATIC_PUBLISH_TARGETS.find((t) => t.id === "vercel")!;
    const netlify = STATIC_PUBLISH_TARGETS.find((t) => t.id === "netlify")!;
    const cloudflare = STATIC_PUBLISH_TARGETS.find((t) => t.id === "cloudflare-pages")!;
    expect(PUBLISH_CLI_TOOLS.some((tool) => tool.id === gh.cliToolId)).toBe(true);
    expect(PUBLISH_CLI_TOOLS.some((tool) => tool.id === vercel.cliToolId)).toBe(true);
    expect(netlify.cliToolId).toBeUndefined();
    expect(cloudflare.cliToolId).toBeUndefined();
  });
});

describe("cliInstalledStatus", () => {
  it("returns the real per-tool boolean from a live deployClis array", () => {
    const deployClis = [
      { name: "gh", installed: true },
      { name: "vercel", installed: false },
    ];
    expect(cliInstalledStatus(deployClis, "gh")).toBe(true);
    expect(cliInstalledStatus(deployClis, "vercel")).toBe(false);
  });

  it("returns false (never throws or returns undefined) for a name absent from the array", () => {
    expect(cliInstalledStatus([], "gh")).toBe(false);
  });
});

describe("publishAssistantRequestForTool", () => {
  it("names only the ONE tool passed in — never both CLIs in the same sentence", () => {
    const ghTool = PUBLISH_CLI_TOOLS.find((tool) => tool.id === "gh")!;
    const request = publishAssistantRequestForTool(ghTool);
    expect(request).toContain("GitHub CLI");
    expect(request).not.toMatch(/vercel/i);
  });

  it("produces a distinct sentence per tool", () => {
    const [gh, vercel] = PUBLISH_CLI_TOOLS;
    expect(publishAssistantRequestForTool(gh!)).not.toBe(publishAssistantRequestForTool(vercel!));
  });
});

describe("publishAssistantRequestForInstalledTool", () => {
  it("names the tool AND the destination — 'publish with the GitHub CLI' alone is ambiguous once a second GitHub-driven target exists", () => {
    const ghTool = PUBLISH_CLI_TOOLS.find((tool) => tool.id === "gh")!;
    const request = publishAssistantRequestForInstalledTool(ghTool, "GitHub Pages");
    expect(request).toContain("GitHub CLI");
    expect(request).toContain("GitHub Pages");
  });

  it("never asks to install — that sentence belongs to publishAssistantRequestForTool, not this one", () => {
    const ghTool = PUBLISH_CLI_TOOLS.find((tool) => tool.id === "gh")!;
    expect(publishAssistantRequestForInstalledTool(ghTool, "GitHub Pages")).not.toMatch(/install/i);
  });
});

describe("publishAssistantRequest", () => {
  const ghTool = PUBLISH_CLI_TOOLS.find((tool) => tool.id === "gh")!;
  const vercelTool = PUBLISH_CLI_TOOLS.find((tool) => tool.id === "vercel")!;

  // REGRESSION (owner-reported 2026-08-15, "U1"): the row read "Detected on this server" directly
  // above a copy line that still said "Install the GitHub CLI, then confirm it's on my PATH." — this
  // chooser is what makes that combination impossible, keyed on the SAME `installed` boolean the
  // pill renders. Checked against BOTH CLI-backed tools, not only GitHub — deliberately not
  // GitHub-specific, per `publishAssistantRequest`'s own doc in `rules.ts`.
  it("installed: returns the installed-tool sentence, never the install instruction — gh", () => {
    const request = publishAssistantRequest(ghTool, "GitHub Pages", true);
    expect(request).toBe(publishAssistantRequestForInstalledTool(ghTool, "GitHub Pages"));
    expect(request).not.toMatch(/install/i);
  });

  it("installed: returns the installed-tool sentence, never the install instruction — vercel", () => {
    const request = publishAssistantRequest(vercelTool, "Vercel", true);
    expect(request).toBe(publishAssistantRequestForInstalledTool(vercelTool, "Vercel"));
    expect(request).not.toMatch(/install/i);
  });

  it("not installed: returns the install instruction, for either tool", () => {
    expect(publishAssistantRequest(ghTool, "GitHub Pages", false)).toBe(publishAssistantRequestForTool(ghTool));
    expect(publishAssistantRequest(vercelTool, "Vercel", false)).toBe(publishAssistantRequestForTool(vercelTool));
  });
});

describe("runStatusTone", () => {
  it("maps idle to neutral, running to warning, errored to error", () => {
    expect(runStatusTone("idle", undefined)).toBe("neutral");
    expect(runStatusTone("running", undefined)).toBe("warning");
    expect(runStatusTone("errored", undefined)).toBe("error");
  });

  it("maps a completed run to ok when successful and error when ok is explicitly false", () => {
    expect(runStatusTone("completed", true)).toBe("ok");
    expect(runStatusTone("completed", undefined)).toBe("ok");
    expect(runStatusTone("completed", false)).toBe("error");
  });
});

describe("exportRunStatusLabelKey", () => {
  it("reads an undefined run the same as an explicit idle run", () => {
    expect(exportRunStatusLabelKey(undefined)).toBe(exportRunStatusLabelKey({ status: "idle" }));
  });

  it("distinguishes a clean finish from one with route failures", () => {
    expect(exportRunStatusLabelKey({ status: "completed", ok: true })).toBe("Export finished");
    expect(exportRunStatusLabelKey({ status: "completed", ok: false })).toBe("Finished with failures");
  });

  it("reports running and errored distinctly", () => {
    expect(exportRunStatusLabelKey({ status: "running" })).toBe("Exporting…");
    expect(exportRunStatusLabelKey({ status: "errored" })).toBe("Export failed");
  });
});

describe("publishRunStatusLabelKey", () => {
  it("reads an undefined run the same as an explicit idle run", () => {
    expect(publishRunStatusLabelKey(undefined)).toBe(publishRunStatusLabelKey({ status: "idle" }));
  });

  it("distinguishes a real success from a completed-but-failed outcome (e.g. no credentials)", () => {
    expect(publishRunStatusLabelKey({ status: "completed", result: { ok: true } as never })).toBe("Published");
    expect(publishRunStatusLabelKey({ status: "completed", result: { ok: false } as never })).toBe("Publish failed");
  });

  it("reports running and errored distinctly", () => {
    expect(publishRunStatusLabelKey({ status: "running" })).toBe("Publishing…");
    expect(publishRunStatusLabelKey({ status: "errored" })).toBe("Publish failed");
  });
});

describe("staticPublishFormReadyForPreview / staticPublishFormReadyToPublish", () => {
  it("github-pages needs owner AND repo for a preview; every other target needs neither", () => {
    expect(staticPublishFormReadyForPreview("github-pages", { owner: "", repo: "" })).toBe(false);
    expect(staticPublishFormReadyForPreview("github-pages", { owner: "octo", repo: "" })).toBe(false);
    expect(staticPublishFormReadyForPreview("github-pages", { owner: "octo", repo: "demo" })).toBe(true);
    expect(staticPublishFormReadyForPreview("vercel", { owner: "", repo: "" })).toBe(true);
    expect(staticPublishFormReadyForPreview("netlify", { owner: "", repo: "" })).toBe(true);
    expect(staticPublishFormReadyForPreview("cloudflare-pages", { owner: "", repo: "" })).toBe(true);
  });

  it("publishing additionally requires a non-blank projectName for EVERY target", () => {
    expect(staticPublishFormReadyToPublish("github-pages", { owner: "octo", repo: "demo", projectName: "" })).toBe(false);
    expect(staticPublishFormReadyToPublish("github-pages", { owner: "octo", repo: "demo", projectName: "demo" })).toBe(true);
    expect(staticPublishFormReadyToPublish("vercel", { owner: "", repo: "", projectName: "" })).toBe(false);
    expect(staticPublishFormReadyToPublish("vercel", { owner: "", repo: "", projectName: "demo" })).toBe(true);
    expect(staticPublishFormReadyToPublish("netlify", { owner: "", repo: "", projectName: "" })).toBe(false);
    expect(staticPublishFormReadyToPublish("netlify", { owner: "", repo: "", projectName: "my-site" })).toBe(true);
    expect(staticPublishFormReadyToPublish("cloudflare-pages", { owner: "", repo: "", projectName: "" })).toBe(false);
    expect(staticPublishFormReadyToPublish("cloudflare-pages", { owner: "", repo: "", projectName: "my-project" })).toBe(true);
  });
});

describe("staticPublishProjectNameCopy", () => {
  it("gives each of the four targets a distinct label naming what the field really is", () => {
    const copies = (["github-pages", "vercel", "netlify", "cloudflare-pages"] as const).map(staticPublishProjectNameCopy);
    expect(new Set(copies.map((c) => c.labelKey)).size).toBe(4);
    expect(new Set(copies.map((c) => c.helpKey)).size).toBe(4);
  });

  it("github-pages calls it a commit message, never a 'project name' — the field is not a project on GitHub", () => {
    expect(staticPublishProjectNameCopy("github-pages").labelKey).toBe("Commit message");
  });

  it("netlify calls its resource a 'site', matching Netlify's own terminology, not Vercel's/Cloudflare's 'project'", () => {
    expect(staticPublishProjectNameCopy("netlify").labelKey).toMatch(/site/i);
  });

  it("vercel and cloudflare-pages each name their own provider in the label — never a generic, unattributed 'Project name'", () => {
    expect(staticPublishProjectNameCopy("vercel").labelKey).toMatch(/vercel/i);
    expect(staticPublishProjectNameCopy("cloudflare-pages").helpKey).toMatch(/cloudflare/i);
  });
});

describe("PUBLISH_CREDENTIAL_PROVIDERS", () => {
  it("lists exactly the four providers the brief names, each with a unique id and a token page", () => {
    expect(PUBLISH_CREDENTIAL_PROVIDERS).toHaveLength(4);
    expect(new Set(PUBLISH_CREDENTIAL_PROVIDERS.map((p) => p.id)).size).toBe(4);
    expect(PUBLISH_CREDENTIAL_PROVIDERS.every((p) => p.tokenPageUrl.startsWith("https://"))).toBe(true);
  });

  it("matches the v2 contract's verified field split — a credential holds the secret plus only the account scoping with nowhere else to live", () => {
    // GitHub Pages' owner/repo and Vercel's teamId are NOT credential fields — they already live on
    // the publish target config (AdminStaticPublishConfig), chosen per run.
    expect(publishCredentialProviderInfo("github-pages").requiredFields).toEqual([]);
    expect(publishCredentialProviderInfo("vercel").requiredFields).toEqual([]);
    expect(publishCredentialProviderInfo("netlify").requiredFields).toEqual([]);
    // Cloudflare Pages is the ONLY provider with a second field — accountId, hard required, since
    // Cloudflare Pages has no per-run publish target this could otherwise live on.
    expect(publishCredentialProviderInfo("cloudflare-pages").requiredFields).toEqual(["accountId"]);
  });

  it("publishCredentialProviderInfo falls back to the first entry for an unrecognized id, never throws", () => {
    expect(publishCredentialProviderInfo("not-a-real-provider" as never)).toBe(PUBLISH_CREDENTIAL_PROVIDERS[0]);
  });
});

describe("buildPublishConnectionInput", () => {
  it("github-pages: sends only token, trimmed — owner/repo/branch belong to publish config, not a credential", () => {
    const fields = { ...blankCredentialFields("github-pages"), token: " ghp_abc " };
    expect(buildPublishConnectionInput(fields)).toEqual({ providerId: "github-pages", token: "ghp_abc" });
  });

  it("vercel: sends only token, trimmed — teamId belongs to publish config, not a credential", () => {
    const fields = { ...blankCredentialFields("vercel"), token: " tok " };
    expect(buildPublishConnectionInput(fields)).toEqual({ providerId: "vercel", token: "tok" });
    expect(buildPublishConnectionInput(fields)).not.toHaveProperty("teamId");
  });

  it("netlify: sends only token, trimmed", () => {
    expect(buildPublishConnectionInput({ ...blankCredentialFields("netlify"), token: " tok " })).toEqual({
      providerId: "netlify",
      token: "tok",
    });
  });

  it("cloudflare-pages: always sends accountId (required, trimmed) alongside token — no projectName, that's inert on the credential", () => {
    const fields = { ...blankCredentialFields("cloudflare-pages"), token: "tok", accountId: " acct-1 " };
    expect(buildPublishConnectionInput(fields)).toEqual({ providerId: "cloudflare-pages", token: "tok", accountId: "acct-1" });
    expect(buildPublishConnectionInput(fields)).not.toHaveProperty("projectName");
  });
});

describe("publishCredentialRowReadyToSave", () => {
  it("requires a non-blank token — a blank token is never ready to save, connected or not", () => {
    const fields = { ...blankCredentialFields("vercel"), token: "" };
    expect(publishCredentialRowReadyToSave(fields)).toBe(false);
    expect(publishCredentialRowReadyToSave({ ...fields, token: "   " })).toBe(false);
  });

  it("github-pages/vercel/netlify need nothing beyond a non-blank token — no per-provider field left to gate on", () => {
    expect(publishCredentialRowReadyToSave({ ...blankCredentialFields("github-pages"), token: "tok" })).toBe(true);
    expect(publishCredentialRowReadyToSave({ ...blankCredentialFields("vercel"), token: "tok" })).toBe(true);
    expect(publishCredentialRowReadyToSave({ ...blankCredentialFields("netlify"), token: "tok" })).toBe(true);
  });

  it("cloudflare-pages requires accountId too, even with a non-blank token", () => {
    const cf = { ...blankCredentialFields("cloudflare-pages"), token: "tok" };
    expect(publishCredentialRowReadyToSave(cf)).toBe(false);
    expect(publishCredentialRowReadyToSave({ ...cf, accountId: "acct-1" })).toBe(true);
  });

  it("there is no add-vs-edit distinction left — the exact same fields are ready or not ready regardless of whether the row is already connected", () => {
    // publishCredentialRowReadyToSave itself has no notion of "connected"; StaticSiteTab.tsx reads
    // that separately off `row.saved`. This test only pins that the gate's own answer for one fixed
    // set of fields never varies by an argument it no longer takes.
    const fields = { ...blankCredentialFields("github-pages"), token: "tok" };
    expect(publishCredentialRowReadyToSave(fields)).toBe(true);
    expect(publishCredentialRowReadyToSave({ ...fields })).toBe(true);
  });
});

describe("credentialsForProvider", () => {
  function credential(overrides: Partial<AdminPublishCredentialSummary> = {}): AdminPublishCredentialSummary {
    return {
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

describe("defaultCredentialForProvider", () => {
  function credential(overrides: Partial<AdminPublishCredentialSummary> = {}): AdminPublishCredentialSummary {
    return {
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
    const err = new ApiError("DUPLICATE_LABEL", 409);
    expect(classifyPublishCredentialSubmitError(err)).toEqual({ kind: "duplicate-label" });
  });

  it("recognizes DUPLICATE_LABEL via e.code too (this codebase's usual { error, code } shape)", () => {
    const err = new ApiError("A credential with this label already exists.", 409, "DUPLICATE_LABEL");
    expect(classifyPublishCredentialSubmitError(err)).toEqual({ kind: "duplicate-label" });
  });

  it("recognizes VALIDATION and surfaces body.detail when present", () => {
    const err = new ApiError("VALIDATION", 400, undefined, { error: "VALIDATION", detail: "accountId is required for cloudflare-pages" });
    expect(classifyPublishCredentialSubmitError(err)).toEqual({ kind: "validation", detail: "accountId is required for cloudflare-pages" });
  });

  it("VALIDATION without a body.detail falls back to the error message itself, never throws or drops the failure", () => {
    const err = new ApiError("VALIDATION", 400);
    expect(classifyPublishCredentialSubmitError(err)).toEqual({ kind: "validation", detail: "VALIDATION" });
  });

  it("falls through to 'generic' for an unrecognized ApiError and for a non-ApiError rejection", () => {
    expect(classifyPublishCredentialSubmitError(new ApiError("request failed (500)", 500))).toEqual({ kind: "generic" });
    expect(classifyPublishCredentialSubmitError(new Error("network down"))).toEqual({ kind: "generic" });
    expect(classifyPublishCredentialSubmitError("not even an Error")).toEqual({ kind: "generic" });
  });
});
