import { describe, expect, it } from "vitest";

import {
  FULL_SITE_PROVIDERS,
  STATIC_HOSTS,
  daemonStatusLabelKey,
  deploymentEnvVarNoteKey,
  isEnvVarRowUnsafe,
  ownerPasswordLabelKey,
  productionGateLabelKey,
  runtimeModeLabelKey,
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
});

describe("STATIC_HOSTS", () => {
  it("lists exactly the four static hosts named in the brief", () => {
    expect(STATIC_HOSTS).toEqual(["GitHub Pages", "Vercel", "Netlify", "Cloudflare Pages"]);
  });
});
