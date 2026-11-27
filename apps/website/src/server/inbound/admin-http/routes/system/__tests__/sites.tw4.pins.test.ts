import { assertIncidentDiagnostics, createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import { assertAdminResponse } from "#src/server/inbound/admin-http/http/__tests__/assert-admin-response";
import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readPersistedActiveSite as readPersistedActiveSiteForTest, resolveNewSiteAdminPassword } from "#src/platform/site-dir/index";
import { registerAdminSitesRoutes, type AdminSitesDeps } from "#src/server/runtime/composition/modules/sites";
import { createCapturingResponse, extractRouteHandler, startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerDevWarmSiteRoute } from "#src/server/inbound/admin-http/routes/system/sites";
import { createLocalSiteSupervisor } from "#src/platform/site-dir/local-site-supervisor";

const route = "/api/admin/v1/workspaces/:workspaceId/system/sites";

test("dev warm start accepts only authenticated, named requests and keeps launch failures private", async t => {
  const token = "fixture-control-token";
  const previous = process.env.TOVU_DEV_WARM_CONTROL_TOKEN;
  process.env.TOVU_DEV_WARM_CONTROL_TOKEN = token;
  t.after(() => {
    if (previous === undefined) delete process.env.TOVU_DEV_WARM_CONTROL_TOKEN;
    else process.env.TOVU_DEV_WARM_CONTROL_TOKEN = previous;
  });
  const attempts: string[] = [];
  const app = express();
  app.use(express.json());
  registerDevWarmSiteRoute({ app, warmServer: async ({ name }) => {
    attempts.push(name);
    if (name === "busy") throw Object.assign(new Error("private host detail"), { code: "SITE_BUSY" });
    if (name === "broken") throw "opaque launch failure";
    return `http://localhost:4318/admin/?site=${name}`;
  } });
  const base = await startTestServer(app, t);
  const post = (name: unknown, controlToken: string) => fetch(`${base}/internal/dev-warm-site`, {
    method: "POST", headers: { "content-type": "application/json", "x-tovu-warm-control": controlToken },
    body: JSON.stringify({ name }),
  });
  const hidden = await post("orchard", "wrong-token");
  assert.deepEqual({ status: hidden.status, body: await hidden.text() }, { status: 404, body: "Not Found" });
  const invalid = await post(7, token);
  assert.deepEqual({ status: invalid.status, body: await invalid.text() }, { status: 400, body: "Bad Request" });
  assert.deepEqual(attempts, []);
  const started = await post("orchard", token);
  assert.deepEqual({ status: started.status, body: await started.json() }, { status: 200, body: { url: "http://localhost:4318/admin/?site=orchard" } });
  const busy = await post("busy", token);
  assert.deepEqual({ status: busy.status, body: await busy.json() }, { status: 409, body: { code: "SITE_BUSY" } });
  const broken = await post("broken", token);
  assert.deepEqual({ status: broken.status, body: await broken.json() }, { status: 409, body: { code: "SITE_START_FAILED" } });
  assert.deepEqual(attempts, ["orchard", "busy", "broken"]);
});

function fixture(overrides: Partial<AdminSitesDeps> = {}, { incidents = createRouteIncidentReporter() }: { incidents?: ReturnType<typeof createRouteIncidentReporter> } = {}) {
  const routeErrors = incidents.errors;
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
  const app = express(); registerAdminSitesRoutes({ errors: routeErrors, app, deps });
  return { app, calls, async request({ method = "get", body, workspaceId = "ws" }: { method?: "get" | "post"; body?: unknown; workspaceId?: string | null } = {}, _options = {}) {
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
          const body = result.jsonBody as { switchingEnabled: boolean; localManagementEnabled: boolean; canSwitchNow: boolean; previewVersions: unknown; persistedSiteName: unknown; currentSite: { listed: boolean }; trash: unknown[]; starterAdminPassword?: string };
          assert.equal(body.switchingEnabled, enabled);
          // The blank-field starter password is the one creation seeds, and only where creation works.
          assert.equal(body.starterAdminPassword, enabled ? resolveNewSiteAdminPassword({}) : undefined);
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
    assertAdminResponse({ actual: await broken.request({ method }), expected: { statusCode: 500, jsonBody: { error: "internal error", code: "INTERNAL_ERROR" } } }, { failure: {"message":"The site operation could not be completed.","action":"Check the result before repeating this operation. Copy details and report this problem.","step":"site operation"} });
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
  assertAdminResponse({ actual: await f.request({ method: "post", body: { name: "new" } }), expected: {
    statusCode: 500, jsonBody: { error: "internal error", code: "INTERNAL_ERROR" },
  } }, { failure: {"message":"The site operation could not be completed.","action":"Check the result before repeating this operation. Copy details and report this problem.","step":"site operation"} });
});

/** Invoke any sites route on a fixture's app with a hand-built request. */
async function invokeOn(app: express.Express, method: "get" | "post", path: string, req: Record<string, unknown>) {
  const { res, capture } = createCapturingResponse(); res.locals.principal = { id: "owner" };
  await extractRouteHandler(app, method, `${route}${path}`)({ socket: { localPort: 3000 }, ...req }, res);
  return capture;
}

// Route-param guards (`String(req.params.X ?? "")`): absent params read as "" — kept, and covered here.
test("token sign-in plugins and activate 404 an absent workspace param; activate reads an absent name as ''", async () => {
  const persisted: unknown[] = [];
  const { app } = fixture({ persistActiveSite: ((input: unknown) => { persisted.push(input); }) as never });
  for (const [method, path] of [["get", "/token-sign-in-plugins"], ["post", "/:name/activate"]] as const) {
    assert.deepEqual(await invokeOn(app, method, path, { params: {} }), { statusCode: 404, jsonBody: { error: "workspace was not found" } });
  }
  const unnamed = await invokeOn(app, "post", "/:name/activate", { params: { workspaceId: "ws" }, body: {} });
  assert.notEqual(unnamed.statusCode, 200);
  assert.deepEqual(persisted, []);
});

test("token sign-in plugins and activate hide unexpected failures behind a logged generic 500", async () => {
  const incidents = createRouteIncidentReporter();
  const { app } = fixture({
    listTokenSignInPlugins: async () => { throw new Error("SECRET plugin detail"); },
    listSites: () => { throw new Error("SECRET disk detail"); },
  }, { incidents });
  const internal = { statusCode: 500, jsonBody: { error: "internal error", code: "INTERNAL_ERROR" } };
  assertAdminResponse({ actual: await invokeOn(app, "get", "/token-sign-in-plugins", { params: { workspaceId: "ws" } }), expected: internal }, { failure: {"message":"The site operation could not be completed.","action":"Check the result before repeating this operation. Copy details and report this problem.","step":"site operation"} });
  assertAdminResponse({ actual: await invokeOn(app, "post", "/:name/activate", { params: { workspaceId: "ws", name: "other" }, body: {} }), expected: internal }, { failure: {"message":"The site operation could not be completed.","action":"Check the result before repeating this operation. Copy details and report this problem.","step":"site operation"} });
  assertIncidentDiagnostics({ incidents, step: "routes/system/sites", diagnostics: [/SECRET plugin detail/, /SECRET disk detail/] });
  assert.equal(incidents.reports.length, 2);
});

test("trashing the persisted next-launch site re-points the default at the served site; any other site leaves it", async () => {
  const persisted: unknown[] = [];
  let persistedName = "doomed";
  const trashed: unknown[] = [];
  const { app } = fixture({
    readPersistedActiveSite: () => persistedName,
    persistActiveSite: ((input: unknown, options: unknown) => { persisted.push([input, options]); }) as never,
    siteTrash: {
      trash: ((input: { base: string; name: string }) => { trashed.push(input); return { name: input.name }; }) as never,
      restore: (() => { throw new Error("not used"); }) as never, remove: (() => { throw new Error("not used"); }) as never,
    },
  });
  const first = await invokeOn(app, "post", "/:name/trash", { params: { workspaceId: "ws", name: "doomed" }, body: { confirmed: true } });
  assert.equal(first.statusCode, 200, JSON.stringify(first.jsonBody));
  assert.equal(trashed.length, 1);
  const base = (trashed[0] as { base: string }).base;
  assert.deepEqual(persisted, [[{ name: "owner" }, { cwd: base }]]);
  persistedName = "keeper";
  assert.equal((await invokeOn(app, "post", "/:name/trash", { params: { workspaceId: "ws", name: "doomed" }, body: { confirmed: true } })).statusCode, 200);
  assert.equal(persisted.length, 1);
});

test("without an injected persister, trashing the persisted site writes the served site as the next-launch default", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sites-after-trash-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let base = "";
  const { app } = fixture({
    siteBinding: { name: "owner", dir: path.join(root, "sites", "owner"), dirOverridden: false, switcherCompatible: true },
    readPersistedActiveSite: () => "doomed",
    siteTrash: {
      trash: ((input: { base: string; name: string }) => { base = input.base; return { name: input.name }; }) as never,
      restore: (() => { throw new Error("not used"); }) as never, remove: (() => { throw new Error("not used"); }) as never,
    },
  });
  assert.equal((await invokeOn(app, "post", "/:name/trash", { params: { workspaceId: "ws", name: "doomed" }, body: { confirmed: true } })).statusCode, 200);
  assert.equal(readPersistedActiveSiteForTest({ cwd: base }), "owner");
});
