import { describe, expect, it } from "vitest";

import {
  FULL_SITE_PROVIDERS,
  PUBLISH_CLI_TOOLS,
  STATIC_HOSTS,
  STATIC_PUBLISH_TARGETS,
  cliInstalledStatus,
  daemonStatusLabelKey,
  deploymentEnvVarNoteKey,
  exportRunStatusLabelKey,
  isEnvVarRowUnsafe,
  ownerPasswordLabelKey,
  productionGateLabelKey,
  publishAssistantRequestForTool,
  publishRunStatusLabelKey,
  runStatusTone,
  runtimeModeLabelKey,
  staticPublishFormReadyForPreview,
  staticPublishFormReadyToPublish,
} from "../rules";

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
  it("lists exactly the two publish targets, each paired to its own CLI tool id", () => {
    expect(STATIC_PUBLISH_TARGETS).toHaveLength(2);
    expect(STATIC_PUBLISH_TARGETS.map((target) => target.id)).toEqual(["github-pages", "vercel"]);
    for (const target of STATIC_PUBLISH_TARGETS) {
      expect(PUBLISH_CLI_TOOLS.some((tool) => tool.id === target.cliToolId)).toBe(true);
    }
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
  it("github-pages needs owner AND repo for a preview; vercel needs neither", () => {
    expect(staticPublishFormReadyForPreview("github-pages", { owner: "", repo: "" })).toBe(false);
    expect(staticPublishFormReadyForPreview("github-pages", { owner: "octo", repo: "" })).toBe(false);
    expect(staticPublishFormReadyForPreview("github-pages", { owner: "octo", repo: "demo" })).toBe(true);
    expect(staticPublishFormReadyForPreview("vercel", { owner: "", repo: "" })).toBe(true);
  });

  it("publishing additionally requires a non-blank projectName for BOTH targets", () => {
    expect(staticPublishFormReadyToPublish("github-pages", { owner: "octo", repo: "demo", projectName: "" })).toBe(false);
    expect(staticPublishFormReadyToPublish("github-pages", { owner: "octo", repo: "demo", projectName: "demo" })).toBe(true);
    expect(staticPublishFormReadyToPublish("vercel", { owner: "", repo: "", projectName: "" })).toBe(false);
    expect(staticPublishFormReadyToPublish("vercel", { owner: "", repo: "", projectName: "demo" })).toBe(true);
  });
});
