import "../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registerAdminSitesRoutes, type AdminSitesDeps } from "../system/sites.js";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { createLocalSiteSupervisor } from "#src/platform/site-dir/local-site-supervisor";

test("Sites snapshot exposes the injected host and Trash; trashing the default restores the serving default", async () => {
  const localSiteSupervisor = createLocalSiteSupervisor({ servingName: "owner", scheme: "https", processPort: {
    isPortFree: async () => true, schedule: () => () => {},
    launch: async () => ({ pid: 10, ready: async () => true, onExit() {}, terminate: async () => {}, killNow() {} }),
  } });
  await localSiteSupervisor.start({ name: "alpha" });
  let persisted = "alpha";
  const deps: AdminSitesDeps = {
    createSite: async () => { throw new Error("unexpected site creation"); },
    workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "owner" }),
    siteBinding: { name: "owner", dir: "/repo/sites/owner", dirOverridden: false, switcherCompatible: true },
    isSiteSwitcherEnabled: () => true, localSiteSupervisor,
    listSites: () => [{ name: "owner", dir: "/repo/sites/owner", displayName: "Owner", active: true, createdAt: "" }],
    readPersistedActiveSite: () => persisted,
    persistActiveSite: ({ name }, options) => { assert.equal(options?.cwd, "/repo"); persisted = name; },
    listSiteTrash: ({ base }) => { assert.equal(base, "/repo"); return [{ id: "old-id", name: "old", displayName: "Old" }]; },
    siteTrash: { trash: ({ name }) => ({ name, id: "new-id", displayName: name }), restore() {}, remove() {} },
    devRestart: { canSwitchSite: true, requestRestart() {} },
  };
  const app = express(); registerAdminSitesRoutes(app, deps);
  const root = "/api/admin/v1/workspaces/:workspaceId/system/sites";
  const get = extractRouteHandler(app, "get", root);
  const response = createCapturingResponse(); response.res.locals.principal = { id: "operator" };
  await get({ params: { workspaceId: "ws" } }, response.res);
  assert.equal(response.capture.statusCode, 200);
  const snapshot = response.capture.jsonBody as { localManagementEnabled: boolean; canSwitchNow: boolean; localSites: Array<{ name: string; port: number }>; trash: Array<{ name: string }> };
  assert.equal(snapshot.localManagementEnabled, true); assert.equal(snapshot.canSwitchNow, true);
  assert.equal(snapshot.localSites[0].name, "alpha"); assert.equal(snapshot.localSites[0].port, 3101);
  assert.equal(snapshot.trash[0].name, "old");
  await localSiteSupervisor.stop({ name: "alpha" });
  const trash = extractRouteHandler(app, "post", root + "/:name/trash");
  const removal = createCapturingResponse(); removal.res.locals.principal = { id: "operator" };
  await trash({ params: { workspaceId: "ws", name: "alpha" }, body: { confirmed: true } }, removal.res);
  assert.equal(removal.capture.statusCode, 200); assert.equal(persisted, "owner");
});

const ROOT = "/api/admin/v1/workspaces/:workspaceId/system/sites";
function handOverFixture(overrides: Partial<AdminSitesDeps> & { activeRuns?: () => Promise<boolean> } = {}) {
  // One probe per settle: a scheduler that re-runs immediately would never yield the event loop.
  const probes: Array<() => void> = [];
  const localSiteSupervisor = createLocalSiteSupervisor({ servingName: "owner", scheme: "https", processPort: {
    isPortFree: async () => true, schedule: ({ run }) => { probes.push(run); return () => {}; },
    launch: async () => ({ pid: 10, ready: async () => true, onExit() {}, terminate: async () => {}, killNow() {} }),
  } });
  const restarts: string[] = []; let persisted = "owner";
  const { activeRuns, ...rest } = overrides;
  const deps: AdminSitesDeps = {
    createSite: async () => { throw new Error("unexpected site creation"); },
    workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "owner" }),
    siteBinding: { name: "owner", dir: "/repo/sites/owner", dirOverridden: false, switcherCompatible: true },
    isSiteSwitcherEnabled: () => true, localSiteSupervisor, sitePreviews: null,
    listSites: () => [{ name: "owner", dir: "/repo/sites/owner", displayName: "Owner", active: true, createdAt: "" },
      { name: "beta", dir: "/repo/sites/beta", displayName: "Beta", active: false, createdAt: "" }],
    readSiteRunning: () => null, readPersistedActiveSite: () => persisted, listSiteTrash: () => [],
    persistActiveSite: ({ name }) => { persisted = name; },
    devRestart: { canSwitchSite: true, requestRestart: async ({ reason }) => { restarts.push(reason); return { accepted: true as const }; } },
    ...(activeRuns ? { chatRunLedger: { hasActiveRuns: activeRuns } } : {}),
    ...rest,
  };
  const app = express(); registerAdminSitesRoutes(app, deps);
  async function list() {
    const response = createCapturingResponse(); response.res.locals.principal = { id: "operator" };
    await extractRouteHandler(app, "get", ROOT)({ params: { workspaceId: "ws" } }, response.res);
    return (response.capture.jsonBody as { stopServing: unknown }).stopServing;
  }
  async function stopServing(name: string, body: object = { confirmed: true }) {
    const response = createCapturingResponse(); response.res.locals.principal = { id: "operator" };
    await extractRouteHandler(app, "post", ROOT + "/:name/stop-serving")({ params: { workspaceId: "ws", name }, body }, response.res);
    return response.capture;
  }
  const untilRunning = async () => { for (const run of probes.splice(0)) run(); await new Promise(resolve => setImmediate(resolve)); };
  return { list, stopServing, localSiteSupervisor, restarts, persisted: () => persisted, untilRunning };
}

test("the listing names who would take over the serving address, and warns about a running chat", async () => {
  const f = handOverFixture({ activeRuns: async () => true });
  assert.deepEqual(await f.list(), { available: true, target: null, chatRunning: true });
  await f.localSiteSupervisor.start({ name: "beta" }); await f.untilRunning();
  assert.deepEqual(await f.list(), { available: true, target: "beta", chatRunning: true });
});

test("a chat check that fails warns instead of hiding a possible running chat", async () => {
  const f = handOverFixture({ activeRuns: async () => { throw new Error("db locked"); } });
  assert.deepEqual(await f.list(), { available: true, target: null, chatRunning: true });
});

test("a host with no restart channel cannot hand the address over", async () => {
  const f = handOverFixture({ devRestart: null });
  assert.deepEqual(await f.list(), { available: false, target: null, chatRunning: false });
  assert.equal((await f.stopServing("owner")).statusCode, 409);
});

test("Stop on the serving site moves the address to the running site through the restart path", async () => {
  const f = handOverFixture();
  await f.localSiteSupervisor.start({ name: "beta" }); await f.untilRunning();
  assert.equal((await f.stopServing("owner", {})).statusCode, 400);
  const capture = await f.stopServing("owner");
  assert.equal(capture.statusCode, 200);
  assert.deepEqual([(capture.jsonBody as { activeSiteName: string }).activeSiteName, (capture.jsonBody as { restarting: boolean }).restarting], ["beta", true]);
  assert.equal(f.persisted(), "beta");
  assert.deepEqual(f.restarts, ["stop 'owner' and serve 'beta'"]);
});

test("Stop with nothing running says so with its own code, and refuses a site this server is not serving", async () => {
  const f = handOverFixture();
  const none = await f.stopServing("owner");
  assert.equal(none.statusCode, 409);
  assert.equal((none.jsonBody as { code: string }).code, "SITE_NO_SWITCH_TARGET");
  assert.equal((await f.stopServing("beta")).statusCode, 409);
  assert.deepEqual(f.restarts, []);
});
