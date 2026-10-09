import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registerLocalSitesRoutes, type LocalSitesRouteDeps } from "./local-sites.js";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { createLocalSiteSupervisor, type LocalSiteProcessPort } from "#src/platform/site-dir/local-site-supervisor";

const ROOT = "/api/admin/v1/workspaces/:workspaceId/system/sites";
function fixture() {
  let allowed = true, enabled = true, writes = 0;
  const processPort: LocalSiteProcessPort = { isPortFree: async () => true,
    launch: async () => ({ pid: 123, onExit() {}, ready: async () => true, terminate: async () => {}, killNow() {} }), schedule: () => () => {} };
  const supervisor = createLocalSiteSupervisor({ processPort, servingName: "owner", scheme: "https" });
  const deps: LocalSitesRouteDeps = { workspaceId: "ws", siteBinding: { name: "owner", dir: "/repo/sites/owner", dirOverridden: false, switcherCompatible: true },
    authorize: async () => ({ allowed, reason: "test" }), isSiteSwitcherEnabled: () => enabled, localSiteSupervisor: supervisor,
    siteTrash: { trash({ name }) { writes++; return { name, id: "trash-id", displayName: name }; }, restore() { writes++; }, remove() { writes++; } } };
  const app = express(); registerLocalSitesRoutes({ app, deps });
  async function request(suffix: string, name: string, body: object = {}, workspaceId = "ws") {
    const handler = extractRouteHandler(app, "post", ROOT + suffix);
    const { res, capture } = createCapturingResponse(); res.locals.principal = { id: "operator" };
    await handler({ params: { workspaceId, name }, body }, res);
    return capture;
  }
  return { request, supervisor, writes: () => writes, deny: () => { allowed = false; }, disable: () => { enabled = false; } };
}
test("local routes enforce workspace/auth/capability before process and folder effects", async () => {
  const f = fixture();
  assert.equal((await f.request("/:name/start", "alpha", {}, "wrong")).statusCode, 404);
  f.deny(); assert.equal((await f.request("/:name/start", "alpha")).statusCode, 403);
  assert.deepEqual(f.supervisor.list(), []);
  f.disable(); assert.equal((await f.request("/:name/trash", "alpha", { confirmed: true })).statusCode, 403);
  assert.equal(f.writes(), 0);
});
test("delete refuses serving, starting/running, unconfirmed and malformed names", async () => {
  const f = fixture();
  assert.equal((await f.request("/:name/trash", "owner", { confirmed: true })).statusCode, 409);
  assert.equal((await f.request("/:name/start", "alpha")).statusCode, 200);
  assert.equal((await f.request("/:name/trash", "alpha", { confirmed: true })).statusCode, 409);
  assert.equal((await f.request("/:name/stop", "alpha")).statusCode, 200);
  assert.equal((await f.request("/:name/trash", "alpha")).statusCode, 400);
  assert.equal((await f.request("/:name/trash", "../alpha", { confirmed: true })).statusCode, 400);
  assert.equal(f.writes(), 0);
  assert.equal((await f.request("/:name/trash", "alpha", { confirmed: true })).statusCode, 200);
  assert.equal(f.writes(), 1);
});

test("Trash permanent removal requires explicit checkbox and confirm even for an authorized caller", async () => {
  const app = express(); let removed = false;
  const processPort: LocalSiteProcessPort = { isPortFree: async () => true, launch: async () => { throw new Error("no launch"); }, schedule: () => () => {} };
  const localSiteSupervisor = createLocalSiteSupervisor({ processPort, servingName: "owner", scheme: "http" });
  registerLocalSitesRoutes({ app, deps: { workspaceId: "ws", siteBinding: { name: "owner", dir: "/repo/sites/owner", dirOverridden: false, switcherCompatible: true },
    authorize: async () => ({ allowed: true, reason: "owner" }), isSiteSwitcherEnabled: () => true, localSiteSupervisor,
    siteTrash: { trash() { throw new Error("unused"); }, restore() {}, remove() {
      // Confirmation belongs to the route and directory owner; this fake records only the effect.
      removed = true;
    } } } });
  const handler = extractRouteHandler(app, "post", ROOT + "/trash/:id/delete");
  for (const [checked, confirmed] of [[false, true], [true, false], [true, true]]) {
    const { res, capture } = createCapturingResponse(); res.locals.principal = { id: "owner" };
    await handler({ params: { workspaceId: "ws", id: "alpha--00000000-0000-0000-0000-000000000000" }, body: { confirmed, checked } }, res);
    assert.equal(capture.statusCode, checked && confirmed ? 200 : 400);
    assert.equal(removed, checked && confirmed);
  }
});
