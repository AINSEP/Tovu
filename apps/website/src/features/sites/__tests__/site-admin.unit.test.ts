import assert from "node:assert/strict";
import test from "node:test";

import { InitDirNotEmptyError, ValidationError, type SiteBinding, type SiteListEntry } from "#src/platform/site-dir/index";

import { activateSite, createSiteForOwner, resolveSiteSwitchBase, SITE_SWITCH_RESTART_INSTRUCTIONS, SITE_SWITCH_RESTARTING_NOTICE } from "../site-admin.js";

/**
 * @file `site-admin.ts` — the create/activate logic the admin Sites routes and the
 * `sites_create_site` / `sites_switch_site` tools share. Fakes only; no real `sites/` folder.
 */

const SWITCHER_BINDING: SiteBinding = { dir: "/repo/sites/served", name: "served", dirOverridden: false, switcherCompatible: true };
const INSTALL_DIR_BINDING: SiteBinding = { dir: "/some/site", name: "some-site", dirOverridden: true, switcherCompatible: false };
const SITE: SiteListEntry = { name: "alpha", dir: "/repo/sites/alpha", displayName: "Alpha", createdAt: "2026-10-05T00:00:00.000Z", active: false };

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
  assert.deepEqual(calls, [[{ name: "beta" }, { cwd: "/repo" }]]);
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
