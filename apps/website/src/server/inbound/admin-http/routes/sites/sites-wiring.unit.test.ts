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
