import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { bootAuthenticated } from "../helpers/http-test-server.js";
import type { RouteDeps } from "../../routes/types.js";
import type { SiteListEntry } from "#src/platform/site-dir/index";

/**
 * @file Admin "Sites" screen — `GET/POST /api/admin/v1/workspaces/:workspaceId/system/sites`,
 * `POST .../system/sites/:name/activate` (`routes/admin/system/sites.ts`). Mirrors
 * `deployment-overview-route.test.ts`'s bare-principal-vs-owner shape for the permission gate,
 * plus the workspace-id 404 check every route in this directory shares.
 *
 * Every `site-registry.ts`/`active-site.ts` call is INJECTED (this route's own DI seams) rather
 * than touching the real filesystem/`sites/` — those functions have their own dedicated unit
 * suites (`site-registry.unit.test.ts`, `active-site.unit.test.ts`, including the "the seeded '/'
 * page actually exists after create" regression). This file proves the HTTP contract only: status
 * codes, response shapes, the auth/capability-flag gate ordering.
 */

const SAMPLE_SITE: SiteListEntry = {
  name: "tovu-com",
  dir: "/repo/sites/tovu-com",
  displayName: "tovu-com",
  createdAt: "2026-01-01T00:00:00.000Z",
  active: true,
};

const SAMPLE_BINDING = { dir: "/repo/sites/tovu-com", name: "tovu-com", dirOverridden: false, switcherCompatible: true };

async function loginAsBarePrincipal(deps: RouteDeps, baseUrl: string): Promise<string> {
  await deps.identityReady;
  const bareId = "bare-principal-sites";
  await deps.principalRepo.save({
    id: bareId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: "No Grants",
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId: bareId,
    workspaceId: deps.workspaceId,
    username: "bare-sites",
    passwordHash: await deps.passwordHasher.hash("bare-pw"),
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "bare-sites", password: "bare-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

test("sites: a mismatched workspaceId in the URL 404s", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-the-real-workspace/system/sites`, { headers: { cookie } });
  assert.equal(res.status, 404);
});

test("sites: an unauthorized principal (no grants) gets 403 on create, not a create attempt", async (t) => {
  const deps: RouteDeps = { ...createRouteDeps(), isSiteSwitcherEnabled: () => true };
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const cookie = await loginAsBarePrincipal(deps, baseUrl);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/sites`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "should-not-be-created" }),
  });
  assert.equal(res.status, 403);
});

test("sites: List — 200 with switchingEnabled + the injected site list, regardless of the flag's value", async (t) => {
  const deps: RouteDeps = {
    ...createRouteDeps(),
    isSiteSwitcherEnabled: () => false,
    listSites: () => [SAMPLE_SITE],
    siteBinding: SAMPLE_BINDING,
    readPersistedActiveSite: () => null,
  };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/sites`, { headers: { cookie } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    switchingEnabled: false,
    // `registration` is added by `includeServingSite` (2026-09-05): every row `listSites` returned
    // is by definition a directory `tovu serve` would accept.
    sites: [{ ...SAMPLE_SITE, registration: "registered" }],
    currentSite: { ...SAMPLE_BINDING, listed: true },
    persistedSiteName: null,
  });
});

test("sites: List — currentSite.listed is FALSE when the served directory is absent from sites[] (the marker-less live site case)", async (t) => {
  const deps: RouteDeps = {
    ...createRouteDeps(),
    isSiteSwitcherEnabled: () => true,
    // A served directory that is not on disk at all (`/repo/...` does not exist here). Distinct
    // from the marker-less-but-real case below, which DOES get a row: `includeServingSite` refuses
    // to invent a card for a folder that is not there, so this stays empty and `listed` stays false.
    listSites: () => [],
    siteBinding: SAMPLE_BINDING,
    readPersistedActiveSite: () => null,
  };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/sites`, { headers: { cookie } });
  const body = await res.json();
  assert.deepEqual(body.sites, []);
  assert.equal(body.currentSite.listed, false);
  assert.equal(body.currentSite.name, "tovu-com");
});

/** A real directory on disk carrying neither `config.json` nor `.site-meta.json` — a byte-for-byte
 *  stand-in for this repo's own `sites/tovu-com`, which is exactly the state the owner is looking
 *  at. Registered with the test runner so it is removed whether the test passes or throws. */
function mkServedButUnregisteredDir(t: { after: (fn: () => void) => void }): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-sites-route-"));
  const dir = path.join(root, "sites", "tovu-com");
  fs.mkdirSync(dir, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return dir;
}

test("sites: List — the served directory appears in sites[] as `unregistered` even though listSites() drops it", async (t) => {
  const dir = mkServedButUnregisteredDir(t);
  const deps: RouteDeps = {
    ...createRouteDeps(),
    isSiteSwitcherEnabled: () => true,
    // The real gap the owner reported: the folder is plainly being served, and `listSites` returns
    // nothing because `readSiteDir` requires both marker files.
    listSites: () => [],
    siteBinding: { dir, name: "tovu-com", dirOverridden: false, switcherCompatible: true },
    readPersistedActiveSite: () => null,
  };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/sites`, { headers: { cookie } });
  const body = await res.json();

  assert.equal(body.sites.length, 1, "the site being served must not be missing from its own listing");
  assert.equal(body.sites[0].name, "tovu-com");
  assert.equal(body.sites[0].dir, dir);
  assert.equal(body.sites[0].active, true, "it is genuinely the live binding, so the card shows an active state");
  assert.equal(body.sites[0].registration, "unregistered", "the card must still be able to say `tovu serve` would refuse this folder");
  assert.equal(
    body.currentSite.listed,
    false,
    "`listed` keeps its original meaning — whether the served dir is a REGISTERED site — even though sites[] now carries a row for it",
  );
});

test("sites: List — a served directory that IS registered reports registration:'registered' and listed:true", async (t) => {
  const deps: RouteDeps = {
    ...createRouteDeps(),
    isSiteSwitcherEnabled: () => true,
    listSites: () => [SAMPLE_SITE],
    siteBinding: SAMPLE_BINDING,
    readPersistedActiveSite: () => null,
  };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/sites`, { headers: { cookie } });
  const body = await res.json();

  assert.equal(body.sites.length, 1, "an already-listed served site must not be duplicated by the composer");
  assert.equal(body.sites[0].registration, "registered");
  assert.equal(body.currentSite.listed, true);
});

test("sites: Activate — an `unregistered` served name is STILL a 404, because the write path keeps using the strict listSites()", async (t) => {
  const dir = mkServedButUnregisteredDir(t);
  let called = false;
  const deps: RouteDeps = {
    ...createRouteDeps(),
    isSiteSwitcherEnabled: () => true,
    listSites: () => [],
    siteBinding: { dir, name: "tovu-com", dirOverridden: false, switcherCompatible: true },
    persistActiveSite: () => {
      called = true;
    },
  };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/sites/tovu-com/activate`, {
    method: "POST",
    headers: { cookie },
  });

  assert.equal(res.status, 404, "showing a folder in the listing must not silently make it activatable");
  assert.deepEqual(await res.json(), { error: "site 'tovu-com' was not found", code: "SITE_NOT_FOUND" });
  assert.equal(called, false, "nothing may be persisted for a directory tovu serve would refuse");
});

test("sites: List — reports a pending persisted choice and the TOVU_SITE_DIR override that would defeat it", async (t) => {
  const deps: RouteDeps = {
    ...createRouteDeps(),
    isSiteSwitcherEnabled: () => true,
    listSites: () => [SAMPLE_SITE],
    siteBinding: { ...SAMPLE_BINDING, dirOverridden: true },
    readPersistedActiveSite: () => "second-site",
  };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/sites`, { headers: { cookie } });
  const body = await res.json();
  assert.equal(body.persistedSiteName, "second-site");
  assert.equal(body.currentSite.dirOverridden, true);
});

test("sites: Create — flag OFF refuses with 403 SITE_SWITCHING_DISABLED, and never calls createSite", async (t) => {
  let called = false;
  const deps: RouteDeps = {
    ...createRouteDeps(),
    isSiteSwitcherEnabled: () => false,
    createSite: () => {
      called = true;
      throw new Error("must not be called when the flag is off");
    },
  };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/sites`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "new-site" }),
  });
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: "site switching is disabled on this deployment", code: "SITE_SWITCHING_DISABLED" });
  assert.equal(called, false);
});

test("sites: Create — flag ON but siteBinding.switcherCompatible false (install-dir boot) refuses with 409 SITE_BINDING_NOT_SWITCHABLE, and never calls createSite", async (t) => {
  let called = false;
  const deps: RouteDeps = {
    ...createRouteDeps(),
    isSiteSwitcherEnabled: () => true,
    siteBinding: { ...SAMPLE_BINDING, switcherCompatible: false },
    createSite: () => {
      called = true;
      throw new Error("must not be called when siteBinding is not switcher-compatible");
    },
  };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/sites`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "new-site" }),
  });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, "SITE_BINDING_NOT_SWITCHABLE");
  assert.equal(called, false);
});

test("sites: Create — flag ON, seeded owner, 201 with the created site's name/dir/siteId", async (t) => {
  const deps: RouteDeps = {
    ...createRouteDeps(),
    isSiteSwitcherEnabled: () => true,
    createSite: (required: { name: string }) => ({ name: required.name, dir: `/repo/sites/${required.name}`, siteId: "generated-id" }),
  };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/sites`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "new-site" }),
  });
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { site: { name: "new-site", dir: "/repo/sites/new-site", siteId: "generated-id" } });
});

test("sites: Create — a missing 'name' in the body is a 400 VALIDATION_ERROR, before createSite is ever called", async (t) => {
  let called = false;
  const deps: RouteDeps = {
    ...createRouteDeps(),
    isSiteSwitcherEnabled: () => true,
    createSite: () => {
      called = true;
      throw new Error("must not be called");
    },
  };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/sites`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "VALIDATION_ERROR");
  assert.equal(called, false);
});

test("sites: Activate — flag OFF refuses with 403 SITE_SWITCHING_DISABLED, and never persists", async (t) => {
  let called = false;
  const deps: RouteDeps = {
    ...createRouteDeps(),
    isSiteSwitcherEnabled: () => false,
    listSites: () => [SAMPLE_SITE],
    persistActiveSite: () => {
      called = true;
    },
  };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/sites/tovu-com/activate`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: "site switching is disabled on this deployment", code: "SITE_SWITCHING_DISABLED" });
  assert.equal(called, false);
});

test("sites: Activate — flag ON but siteBinding.switcherCompatible false (install-dir boot) refuses with 409 SITE_BINDING_NOT_SWITCHABLE, and never persists", async (t) => {
  let called = false;
  const deps: RouteDeps = {
    ...createRouteDeps(),
    isSiteSwitcherEnabled: () => true,
    siteBinding: { ...SAMPLE_BINDING, switcherCompatible: false },
    listSites: () => [SAMPLE_SITE],
    persistActiveSite: () => {
      called = true;
    },
  };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/sites/tovu-com/activate`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, "SITE_BINDING_NOT_SWITCHABLE");
  assert.equal(called, false, "an install-dir boot must never persist an Activate choice against an unrelated sites/ tree");
});

test("sites: Activate — a name not present in listSites() is a 404 SITE_NOT_FOUND, and never persists", async (t) => {
  let called = false;
  const deps: RouteDeps = {
    ...createRouteDeps(),
    isSiteSwitcherEnabled: () => true,
    listSites: () => [SAMPLE_SITE],
    persistActiveSite: () => {
      called = true;
    },
  };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/sites/does-not-exist/activate`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "site 'does-not-exist' was not found", code: "SITE_NOT_FOUND" });
  assert.equal(called, false);
});

test("sites: Activate — an existing site, flag ON, persists via persistActiveSite and returns restart instructions, never killing anything", async (t) => {
  const persistCalls: Array<{ name: string }> = [];
  const deps: RouteDeps = {
    ...createRouteDeps(),
    isSiteSwitcherEnabled: () => true,
    listSites: () => [SAMPLE_SITE, { ...SAMPLE_SITE, name: "second-site", active: false }],
    persistActiveSite: (required: { name: string }) => {
      persistCalls.push(required);
    },
  };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/sites/second-site/activate`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.activeSiteName, "second-site");
  assert.equal(body.restartRequired, true);
  assert.match(body.restartInstructions, /npm run dev/);
  assert.deepEqual(persistCalls, [{ name: "second-site" }]);
});
