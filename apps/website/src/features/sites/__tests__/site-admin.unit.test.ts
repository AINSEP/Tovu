import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { InitDirNotEmptyError, ValidationError, type SiteBinding, type SiteListEntry } from "#src/platform/site-dir/index";

import { activateSite, createSiteForOwner, resolveSiteSwitchBase, SITE_SWITCH_RESTART_INSTRUCTIONS, SITE_SWITCH_RESTARTING_NOTICE } from "../site-admin.js";

/**
 * @file `site-admin.ts` — the create/activate logic the admin Sites routes and the
 * `sites_create_site` / `sites_switch_site` tools share. Fakes only; no real `sites/` folder.
 */

const SWITCHER_BINDING: SiteBinding = { dir: "/repo/sites/served", name: "served", dirOverridden: false, switcherCompatible: true };
const INSTALL_DIR_BINDING: SiteBinding = { dir: "/some/site", name: "some-site", dirOverridden: true, switcherCompatible: false };
const SITE: SiteListEntry = { name: "alpha", dir: "/repo/sites/alpha", displayName: "Alpha", createdAt: "2026-10-05T00:00:00.000Z", active: false };

for (const port of [53775, 0]) {
  test(`activateSite: a live Desktop target (${port}) refuses before persistence or restart`, () => {
    const url = port > 0 ? "https://localhost:53775/admin/" : null;
    const result = activateSite({ switcherBase: "/repo", name: "alpha", restartNow: true }, {
      listSites: () => [SITE],
      readSiteRunning: ({ dir }) => {
        assert.equal(dir, SITE.dir);
        return { pid: 42, port, app: "Desktop", scheme: "https", started: "2026-10-26T00:00:00Z", token: ["test", "lease"].join("-") };
      },
      persistActiveSite: () => assert.fail("occupied target must not be persisted"),
      devRestart: { requestRestart: () => assert.fail("occupied target must not restart") },
    });
    assert.deepEqual(result, { ok: false, code: "SITE_ALREADY_RUNNING", error: url
      ? "Site 'alpha' is open in the Desktop app at https://localhost:53775/admin/ — close it there or open it in Desktop. Switch refused; the current site is still running."
      : "Site 'alpha' is starting in Desktop. Wait for it to finish starting. Switch refused; the current site is still running.",
      ...(url ? { url } : {}),
    });
  });
}

test("activateSite: saving without a restart still refuses a Desktop target with recovery guidance", () => {
  const result = activateSite({ switcherBase: "/repo", name: "alpha", restartNow: false }, {
    listSites: () => [SITE],
    readSiteRunning: ({ dir }) => {
      assert.equal(dir, SITE.dir);
      return { pid: 42, port: 53775, app: "Desktop", scheme: "http", started: "2026-10-26T00:00:00Z", token: "test-lease" };
    },
    persistActiveSite: () => assert.fail("occupied target must not change the next boot's site"),
    devRestart: { requestRestart: () => assert.fail("occupied target must not restart") },
  });
  assert.deepEqual(result, {
    ok: false, code: "SITE_ALREADY_RUNNING", url: "http://localhost:53775/admin/",
    error: "Site 'alpha' is open in the Desktop app at http://localhost:53775/admin/ — close it there or open it in Desktop. Switch refused; the current site is still running.",
  });
});

test("activateSite: an unreadable running lock fails closed before persistence", () => {
  assert.throws(() => activateSite({ switcherBase: "/repo", name: "alpha" }, {
    listSites: () => [SITE], readSiteRunning: () => { throw new Error("running lock unreadable"); },
    persistActiveSite: () => assert.fail("undecidable ownership must not persist"),
  }), { message: "running lock unreadable" });
});

test("resolveSiteSwitchBase: flag off refuses first, even on an install-dir boot", () => {
  const gate = resolveSiteSwitchBase({ binding: INSTALL_DIR_BINDING, switchingEnabled: false });
  assert.deepEqual(gate, { ok: false, code: "SITE_SWITCHING_DISABLED", error: "site switching is disabled on this deployment" });
});

test("resolveSiteSwitchBase: an install-dir boot refuses SITE_BINDING_NOT_SWITCHABLE", () => {
  const gate = resolveSiteSwitchBase({ binding: INSTALL_DIR_BINDING, switchingEnabled: true });
  assert.equal(gate.ok, false);
  assert.equal(!gate.ok && gate.code, "SITE_BINDING_NOT_SWITCHABLE");
});

test("resolveSiteSwitchBase: a switcher boot returns the served tree's base", () => {
  assert.deepEqual(resolveSiteSwitchBase({ binding: SWITCHER_BINDING, switchingEnabled: true }), { ok: true, switcherBase: "/repo" });
});

test("createSiteForOwner: creates under the switcher base and reports no tokens", async () => {
  const calls: unknown[] = [];
  const result = await createSiteForOwner(
    { workspaceId: "ws", switcherBase: "/repo", name: "beta" },
    { createSite: async (required, optional) => (calls.push([required, optional]), { name: required.name, dir: "/repo/sites/beta", siteId: "id-1" } as never) },
  );
  assert.deepEqual(calls, [[{ name: "beta", adminPassword: "tovu-dev" }, { cwd: "/repo" }]]);
  assert.deepEqual(result, { ok: true, site: { name: "beta", dir: "/repo/sites/beta", siteId: "id-1" }, agentPluginTokens: { status: "none", pluginIds: [] } });
});

test("createSiteForOwner: a taken name and a bad name become refusals, not throws", async () => {
  const taken = await createSiteForOwner({ workspaceId: "ws", switcherBase: "/repo", name: "beta" }, { createSite: async () => { throw new InitDirNotEmptyError("/repo/sites/beta"); } });
  assert.equal(taken.ok === false && taken.code, "SITE_ALREADY_EXISTS");
  const bad = await createSiteForOwner({ workspaceId: "ws", switcherBase: "/repo", name: "B" }, { createSite: async () => { throw new ValidationError("bad name"); } });
  assert.deepEqual(bad, { ok: false, code: "VALIDATION_ERROR", error: "bad name" });
});

test("createSiteForOwner: an unclassified failure is rethrown for the caller's 500", async () => {
  await assert.rejects(
    () => createSiteForOwner({ workspaceId: "ws", switcherBase: "/repo", name: "beta" }, { createSite: async () => { throw new Error("disk full"); } }),
    /disk full/,
  );
});

test("createSiteForOwner: tokens with no way to seal them are refused before anything is created", async () => {
  let created = false;
  const result = await createSiteForOwner(
    { workspaceId: "ws", switcherBase: "/repo", name: "beta", agentPluginTokens: { notion: "tok" } },
    { createSite: async () => { created = true; return {} as never; } },
  );
  assert.equal(result.ok === false && result.code, "VALIDATION_ERROR");
  assert.equal(created, false);
});

test("activateSite: persists a registered site and returns the restart instructions", () => {
  const persisted: unknown[] = [];
  const result = activateSite(
    { switcherBase: "/repo", name: "alpha" },
    { listSites: () => [SITE], persistActiveSite: (required, optional) => void persisted.push([required, optional]) },
  );
  assert.deepEqual(persisted, [[{ name: "alpha" }, { cwd: "/repo" }]]);
  assert.deepEqual(result, { ok: true, activeSiteName: "alpha", restartRequired: true, restartInstructions: SITE_SWITCH_RESTART_INSTRUCTIONS });
});

test("activateSite: an unknown name refuses SITE_NOT_FOUND and persists nothing", () => {
  let persisted = false;
  const result = activateSite({ switcherBase: "/repo", name: "ghost" }, { listSites: () => [SITE], persistActiveSite: () => { persisted = true; } });
  assert.deepEqual(result, { ok: false, code: "SITE_NOT_FOUND", error: "site 'ghost' was not found" });
  assert.equal(persisted, false);
});

test("activateSite: restartNow with a dev supervisor asks it to restart and says so", () => {
  const requests: unknown[] = [];
  const result = activateSite(
    { switcherBase: "/repo", name: "alpha", restartNow: true },
    { listSites: () => [SITE], persistActiveSite: () => {}, devRestart: { requestRestart: (required) => void requests.push(required) } },
  );
  assert.deepEqual(requests, [{ reason: "switch site to 'alpha'" }]);
  assert.deepEqual(result, { ok: true, activeSiteName: "alpha", restartRequired: true, restartInstructions: SITE_SWITCH_RESTARTING_NOTICE, restarting: true });
});

test("activateSite: restartNow without a supervisor falls back to the restart instructions", () => {
  const result = activateSite({ switcherBase: "/repo", name: "alpha", restartNow: true }, { listSites: () => [SITE], persistActiveSite: () => {}, devRestart: null });
  assert.deepEqual(result, { ok: true, activeSiteName: "alpha", restartRequired: true, restartInstructions: SITE_SWITCH_RESTART_INSTRUCTIONS, restarting: false });
});

test("activateSite: TOVU_SITE_DIR set means no pointless restart, and the reason is given", () => {
  let requested = false;
  const result = activateSite(
    { switcherBase: "/repo", name: "alpha", restartNow: true, dirOverridden: true },
    { listSites: () => [SITE], persistActiveSite: () => {}, devRestart: { requestRestart: () => { requested = true; } } },
  );
  assert.equal(requested, false);
  assert.equal(result.ok && result.restarting, false);
  assert.match(result.ok ? result.restartInstructions : "", /TOVU_SITE_DIR is set/);
});

test("activateSite: an unknown name never restarts", () => {
  let requested = false;
  activateSite({ switcherBase: "/repo", name: "ghost", restartNow: true }, { listSites: () => [SITE], persistActiveSite: () => {}, devRestart: { requestRestart: () => { requested = true; } } });
  assert.equal(requested, false);
});

test("createSiteForOwner refuses malformed tokens before checking or creating", async () => {
  assert.deepEqual(await createSiteForOwner({ workspaceId: "ws", switcherBase: "/repo", name: "beta", agentPluginTokens: [] }, {
    createSite: async () => assert.fail("invalid tokens must not create a site"),
    checkAgentPluginAccessToken: async () => assert.fail("invalid tokens must not be checked"),
  }), { ok: false, code: "VALIDATION_ERROR", error: "'agentPluginTokens' must map plugin ids to token strings" });
});

test("createSiteForOwner refuses tokens without a guarded HTTP client", async () => {
  assert.deepEqual(await createSiteForOwner({ workspaceId: "ws", switcherBase: "/repo", name: "beta", agentPluginTokens: { notion: "tok" } }, {
    createSite: async () => assert.fail("unsupported token must not create a site"),
    checkAgentPluginAccessToken: async () => assert.fail("no unguarded token check"),
    sealPendingAgentPluginTokens: async () => assert.fail("no unchecked tokens saved"),
  }), { ok: false, code: "AGENT_PLUGIN_TOKEN_UNSUPPORTED", pluginId: "notion", error: "Notion can't be connected with an access token here. Leave it empty and connect it later from chat. No site was created." });
});

test("createSiteForOwner checks tokens before creation and seals trimmed tokens for the new site's key", async () => {
  const events: unknown[] = [];
  const httpClient = { request: async () => assert.fail("the injected checker owns probing") } as never;
  const result = await createSiteForOwner({ workspaceId: "ws", switcherBase: "/repo", name: "beta", adminPassword: "explicit-password", agentPluginTokens: { notion: " tok " } }, {
    customCredentialsHttpClient: httpClient,
    checkAgentPluginAccessToken: async (deps, input) => {
      assert.equal(deps.workspaceId, "ws"); assert.equal(deps.httpClient, httpClient);
      events.push(["checked", input]); return "ok";
    },
    createSite: async (required, optional) => {
      events.push(["created", required, optional]); return { name: "beta", dir: "/new/site", siteId: "new-key" } as never;
    },
    sealPendingAgentPluginTokens: async (input) => { events.push(["sealed", input]); },
  });
  assert.deepEqual(events, [
    ["checked", { pluginId: "notion", token: "tok" }],
    ["created", { name: "beta", adminPassword: "explicit-password" }, { cwd: "/repo" }],
    ["sealed", { siteDir: "/new/site", siteKeyId: "new-key", tokens: { notion: "tok" } }],
  ]);
  assert.deepEqual(result, { ok: true, site: { name: "beta", dir: "/new/site", siteId: "new-key" }, agentPluginTokens: { status: "saved", pluginIds: ["notion"] } });
});

test("createSiteForOwner refuses an invalid checked token before writing anything", async () => {
  const result = await createSiteForOwner({ workspaceId: "ws", switcherBase: "/repo", name: "beta", agentPluginTokens: { notion: "bad-token" } }, {
    customCredentialsHttpClient: {} as never, checkAgentPluginAccessToken: async () => "invalid",
    createSite: async () => assert.fail("invalid token must not create a site"),
    sealPendingAgentPluginTokens: async () => assert.fail("invalid token must not be sealed"),
  });
  assert.deepEqual(result, { ok: false, code: "AGENT_PLUGIN_TOKEN_INVALID", pluginId: "notion", error: "That Notion access token didn't work. Check it, or leave it empty and connect Notion later from chat. No site was created." });
});

test("createSiteForOwner uses the real checker to refuse an unbundled plugin", async () => {
  const result = await createSiteForOwner({ workspaceId: "ws", switcherBase: "/repo", name: "beta", agentPluginTokens: { "coverage-no-such-plugin": "tok" } }, {
    customCredentialsHttpClient: { request: async () => assert.fail("unbundled plugins have no probe URL") } as never,
    createSite: async () => assert.fail("unbundled token must not create a site"), sealPendingAgentPluginTokens: async () => assert.fail("unchecked token"),
  });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.code, "AGENT_PLUGIN_TOKEN_UNSUPPORTED");
  assert.equal(!result.ok && result.pluginId, "coverage-no-such-plugin");
});

for (const failure of [new Error("disk full"), "volume offline"]) {
  test(`createSiteForOwner keeps the created site and reports failed token storage: ${String(failure)}`, async (t) => {
    const diagnostics = t.mock.method(console, "error", () => {});
    const result = await createSiteForOwner({ workspaceId: "ws", switcherBase: "/repo", name: "beta", agentPluginTokens: { notion: "tok" } }, {
      customCredentialsHttpClient: {} as never, checkAgentPluginAccessToken: async () => "unavailable",
      createSite: async () => ({ name: "beta", dir: "/new/site", siteId: "new-key" }) as never,
      sealPendingAgentPluginTokens: async () => { throw failure; },
    });
    assert.deepEqual(result, { ok: true, site: { name: "beta", dir: "/new/site", siteId: "new-key" }, agentPluginTokens: { status: "failed", pluginIds: ["notion"] } });
    assert.deepEqual(diagnostics.mock.calls.map(call => call.arguments), [[`[system/sites] the new site's access tokens could not be stored: ${failure instanceof Error ? failure.message : failure}`]]);
  });
}

test("createSiteForOwner defaults to the real name validator without creating an invalid site", async () => {
  assert.deepEqual(await createSiteForOwner({ workspaceId: "ws", switcherBase: "/unused", name: "../invalid" }), {
    ok: false, code: "VALIDATION_ERROR", error: "createSite: name must be 1..100 lowercase letters, digits, and dashes",
  });
});

test("activateSite persists through the real writer in the supplied temporary base", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-site-admin-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const result = activateSite({ switcherBase: dir, name: "alpha", restartNow: true }, { listSites: () => [SITE] });
  assert.deepEqual(result, { ok: true, activeSiteName: "alpha", restartRequired: true, restartInstructions: SITE_SWITCH_RESTART_INSTRUCTIONS, restarting: false });
  assert.equal(await readFile(path.join(dir, ".env"), "utf8"), "TOVU_SITE=alpha\n");
  assert.deepEqual(activateSite({ switcherBase: dir, name: "coverage-no-such-site" }), { ok: false, code: "SITE_NOT_FOUND", error: "site 'coverage-no-such-site' was not found" });
});

test("activateSite respects a supervisor that cannot switch sites", () => {
  const persisted: unknown[] = [];
  assert.deepEqual(activateSite({ switcherBase: "/repo", name: "alpha", restartNow: true }, {
    listSites: () => [SITE], persistActiveSite: (input) => { persisted.push(input); },
    devRestart: { canSwitchSite: false, requestRestart: () => assert.fail("incapable supervisor must not restart") },
  }), { ok: true, activeSiteName: "alpha", restartRequired: true, restartInstructions: SITE_SWITCH_RESTART_INSTRUCTIONS, restarting: false });
  assert.deepEqual(persisted, [{ name: "alpha" }]);
});

test("switching to the actual current site skips its own lease and only cancels a pending selection", () => {
  const persisted: { name: string }[] = [];
  assert.deepEqual(activateSite({ switcherBase: "/repo", name: "alpha", currentSiteName: "alpha", restartNow: true }, {
    listSites: () => [SITE],
    readSiteRunning: () => assert.fail("the current site's own lease is expected"),
    persistActiveSite: (input) => { persisted.push(input); },
    devRestart: { requestRestart: () => assert.fail("must not restart") },
  }), { ok: true, activeSiteName: "alpha", restartRequired: false, restartInstructions: "This site is already active.", restarting: false });
  assert.deepEqual(persisted, [{ name: "alpha" }]);
});
