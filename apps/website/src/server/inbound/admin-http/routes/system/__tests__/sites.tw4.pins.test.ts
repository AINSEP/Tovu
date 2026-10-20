import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { registerAdminSitesRoutes, type AdminSitesDeps } from "../sites.js";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { createLocalSiteSupervisor } from "#src/platform/site-dir/local-site-supervisor";

const route = "/api/admin/v1/workspaces/:workspaceId/system/sites";
function fixture(overrides: Partial<AdminSitesDeps> = {}, _options = {}) {
  const calls: unknown[] = [];
  const supervisor = createLocalSiteSupervisor({ servingName: "owner", scheme: "http", processPort: {
    isPortFree: async () => true, schedule: () => () => {},
    launch: async () => ({ pid: 10, ready: async () => true, onExit() {}, terminate: async () => {}, killNow() {} }),
  } });
  const deps: AdminSitesDeps = {
    workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "pin" }),
    siteBinding: { name: "owner", dir: "/repo/sites/owner", dirOverridden: false, switcherCompatible: true },
    isSiteSwitcherEnabled: () => true, localSiteSupervisor: supervisor, sitePreviews: null, devRestart: null,
    listSites: () => [{ name: "owner", dir: "/repo/sites/owner", displayName: "Owner", active: true, createdAt: "" }],
    readPersistedActiveSite: () => "queued", listSiteTrash: () => [],
    createSite: async (input, options) => { calls.push({ input, options }); return { name: input.name, dir: "/new", siteId: "new" }; },
    ...overrides,
  };
  const app = express(); registerAdminSitesRoutes(app, deps);
  return { calls, async request({ method = "get", body, workspaceId = "ws" }: { method?: "get" | "post"; body?: unknown; workspaceId?: string | null } = {}, _options = {}) {
    const { res, capture } = createCapturingResponse(); res.locals.principal = { id: "owner" };
    await extractRouteHandler(app, method, route)({ params: { workspaceId }, body, socket: { localPort: 3000 } }, res);
    return capture;
  } };
}

for (const enabled of [true, false]) {
  for (const compatible of [true, false]) {
    for (const restart of [null, { requestRestart() {} }, { canSwitchSite: false, requestRestart() {} }]) {
      for (const dirOverridden of [true, false]) {
        test(`listing pins capabilities: enabled=${enabled}, compatible=${compatible}, restart=${JSON.stringify(restart)}, overridden=${dirOverridden}`, async () => {
          const previews: unknown[] = [];
          const f = fixture({ isSiteSwitcherEnabled: () => enabled,
            siteBinding: { name: "owner", dir: "/missing-owner", switcherCompatible: compatible, dirOverridden },
            devRestart: restart, sitePreviews: { versions: input => { previews.push(input); return { owner: 12 }; }, read: () => null, idle: async () => {} },
          });
          const result = await f.request();
          assert.equal(result.statusCode, 200);
          const body = result.jsonBody as { switchingEnabled: boolean; localManagementEnabled: boolean; canSwitchNow: boolean; previewVersions: unknown; persistedSiteName: unknown; currentSite: { listed: boolean }; trash: unknown[] };
          assert.equal(body.switchingEnabled, enabled);
          assert.equal(body.localManagementEnabled, enabled && compatible);
          assert.equal(body.canSwitchNow, enabled && compatible && restart !== null && !("canSwitchSite" in restart && restart.canSwitchSite === false) && !dirOverridden);
          assert.deepEqual(body.previewVersions, enabled ? { owner: 12 } : {});
          assert.equal(previews.length, enabled ? 1 : 0);
          assert.equal(body.persistedSiteName, compatible ? "queued" : null);
          assert.equal(body.currentSite.listed, false);
          assert.deepEqual(body.trash, []);
        });
      }
    }
  }
}

test("listing without previews preserves registered rows and strips running private fields", async () => {
  const running = { pid: 10, port: 3000, app: "tovu", started: "today", scheme: "http" as const, token: "fixture-lease", privateField: "hidden" };
  const f = fixture({ listSites: () => [
    { name: "owner", dir: "/repo/sites/owner", displayName: "Owner", active: true, createdAt: "", running },
    { name: "other", dir: "/other", displayName: "Other", active: false, createdAt: "" },
  ], listSiteTrash: () => [{ id: "old", name: "old", displayName: "Old" }] });
  const body = (await f.request()).jsonBody as { sites: Array<{ running?: unknown }>; currentSite: { listed: boolean }; previewVersions: unknown; trash: unknown[] };
  assert.equal(body.currentSite.listed, true);
  assert.deepEqual(body.sites[0].running, { pid: 10, port: 3000, app: "tovu", started: "today", scheme: "http" });
  assert.equal(body.sites[1].running, undefined);
  assert.deepEqual(body.previewVersions, {});
  assert.deepEqual(body.trash, [{ id: "old", name: "old", displayName: "Old" }]);
});

test("listing and create keep workspace, permission and exception responses", async () => {
  for (const method of ["get", "post"] as const) {
    for (const workspaceId of ["other", null]) assert.equal((await fixture().request({ method, workspaceId })).statusCode, 404);
    const denied = fixture({ authorize: async () => ({ allowed: false, reason: "denied" }) });
    assert.equal((await denied.request({ method, body: { name: "new" } })).statusCode, 403);
    const broken = fixture({ authorize: async () => { throw new Error("pin"); } });
    assert.deepEqual(await broken.request({ method }), { statusCode: 500, jsonBody: { error: "internal error", code: "INTERNAL_ERROR" } });
  }
});

test("create pins name validation, raw fields, gate refusals and feature refusals", async () => {
  for (const body of [undefined, null, {}, { name: 1 }]) {
    const f = fixture();
    assert.deepEqual(await f.request({ method: "post", body }), { statusCode: 400, jsonBody: { error: "'name' (string) is required", code: "VALIDATION_ERROR" } });
    assert.deepEqual(f.calls, []);
  }
  for (const body of [{ name: "new" }, { name: "new", adminPassword: "chosen password", agentPluginTokens: {} }]) {
    const f = fixture();
    assert.deepEqual(await f.request({ method: "post", body }), { statusCode: 201, jsonBody: { site: { name: "new", dir: "/new", siteId: "new" }, agentPluginTokens: { status: "none", pluginIds: [] } } });
    assert.equal(f.calls.length, 1);
    if ("adminPassword" in body) assert.equal((f.calls[0] as { input: { adminPassword: unknown } }).input.adminPassword, body.adminPassword);
    assert.equal((f.calls[0] as { options: { cwd: string } }).options.cwd, "/repo");
  }
  assert.equal((await fixture().request({ method: "post", body: { name: "new", adminPassword: null } })).statusCode, 400);
  assert.equal((await fixture({ isSiteSwitcherEnabled: () => false }).request({ method: "post" })).statusCode, 403);
  assert.equal((await fixture({ siteBinding: { name: "owner", dir: "/repo", dirOverridden: false, switcherCompatible: false } }).request({ method: "post" })).statusCode, 409);
});

test("listing without a host keeps management unavailable even when the injected capability is on", async () => {
  const previous = process.env.TOVU_ENABLE_SITE_SWITCHER;
  process.env.TOVU_ENABLE_SITE_SWITCHER = "0";
  try {
    const body = (await fixture({ localSiteSupervisor: undefined }).request()).jsonBody as {
      localManagementEnabled: boolean; localSites: unknown[]; trash: unknown[];
    };
    assert.equal(body.localManagementEnabled, false);
    assert.deepEqual(body.localSites, []);
    assert.deepEqual(body.trash, []);
  } finally {
    if (previous === undefined) delete process.env.TOVU_ENABLE_SITE_SWITCHER;
    else process.env.TOVU_ENABLE_SITE_SWITCHER = previous;
  }
});

test("create forwards checked tokens and the new site's key to the explicit sealer port", async () => {
  const checked: unknown[] = [];
  const sealed: unknown[] = [];
  const f = fixture({
    customCredentialsHttpClient: { send: async () => assert.fail("the injected checker owns probing") },
    checkAgentPluginAccessToken: async (deps, input) => {
      assert.equal(deps.workspaceId, "ws");
      checked.push(input);
      return "ok";
    },
    sealPendingAgentPluginTokens: async input => { sealed.push(input); },
  });
  assert.deepEqual(await f.request({ method: "post", body: { name: "new", agentPluginTokens: { notion: " fixture-token " } } }), {
    statusCode: 201, jsonBody: { site: { name: "new", dir: "/new", siteId: "new" }, agentPluginTokens: { status: "saved", pluginIds: ["notion"] } },
  });
  assert.deepEqual(checked, [{ pluginId: "notion", token: "fixture-token" }]);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(sealed, [{ siteDir: "/new", siteKeyId: "new", tokens: { notion: "fixture-token" } }]);
});

test("create reports unexpected creation errors as internal", async () => {
  const f = fixture({ createSite: async () => { throw new Error("pin creation failure"); } });
  assert.deepEqual(await f.request({ method: "post", body: { name: "new" } }), {
    statusCode: 500, jsonBody: { error: "internal error", code: "INTERNAL_ERROR" },
  });
});
