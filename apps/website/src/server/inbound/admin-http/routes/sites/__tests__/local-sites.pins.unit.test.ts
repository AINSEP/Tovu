import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import express from "express";
import { registerLocalSitesRoutes, type LocalSitesRouteDeps } from "../local-sites.js";
import { LocalSiteError, type LocalSiteSupervisorPort, type LocalSiteState } from "#src/platform/site-dir/local-site-supervisor";
import { createCapturingResponse, extractRouteHandler, startTestServer } from "#src/server/__tests__/helpers/http-test-server";

const ROOT = "/api/admin/v1/workspaces/:workspaceId/system/sites";
const STATE: LocalSiteState = { name: "alpha", status: "stopped", pid: null, port: null, daemonPort: null, adminUrl: null };
async function fixture({ t }: { t: TestContext }, { overrides = {}, principal = true }: { overrides?: Partial<LocalSitesRouteDeps>; principal?: boolean } = {}) {
  const calls: unknown[] = [];
  const supervisor: LocalSiteSupervisorPort = {
    async start(input) { calls.push(["start", input]); return STATE; },
    async stop(input) { calls.push(["stop", input]); return STATE; },
    async withStoppedSite({ name, task }) { calls.push(["stopped", name]); return task(); },
    list: () => [], shutdown: async () => {}, killNow() {},
  };
  const deps: LocalSitesRouteDeps = {
    workspaceId: "ws", siteBinding: { name: "owner", dir: "/repo/sites/owner", dirOverridden: false, switcherCompatible: true },
    authorize: async (input) => { calls.push(["authorize", input]); return { allowed: true, reason: "owner" }; },
    isSiteSwitcherEnabled: () => true, localSiteSupervisor: supervisor,
    siteTrash: { trash(input) { calls.push(["trash", input]); return { name: input.name, id: "trash-id", displayName: "Alpha" }; },
      restore(input) { calls.push(["restore", input]); }, remove(input) { calls.push(["remove", input]); } },
    afterTrash(input) { calls.push(["afterTrash", input]); }, ...overrides,
  };
  const app = express(); app.use(express.json());
  app.use((_req, res, next) => { if (principal) res.locals.principal = { id: "operator" }; next(); });
  registerLocalSitesRoutes({ app, deps });
  const origin = await startTestServer(app, t);
  return { app, calls, async request({ suffix = "/alpha/start", body = {}, workspaceId = "ws" } = {}, _options = {}) {
    const response = await fetch(`${origin}/api/admin/v1/workspaces/${workspaceId}/system/sites${suffix}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  } };
}

test("lifecycle gates retain workspace, capability, binding, authorization and host precedence", async (t) => {
  const wrong = await fixture({ t }, { overrides: { isSiteSwitcherEnabled: () => { throw new Error("must not run"); } } });
  assert.deepEqual(await wrong.request({ workspaceId: "wrong" }), { status: 404, body: { error: "workspace was not found" } });
  assert.deepEqual(wrong.calls, []);
  for (const [overrides, status, code] of [
    [{ isSiteSwitcherEnabled: () => false }, 403, "SITE_SWITCHING_DISABLED"],
    [{ siteBinding: { name: "owner", dir: "/repo/sites/owner", dirOverridden: true, switcherCompatible: false } }, 409, "SITE_BINDING_NOT_SWITCHABLE"],
  ] as const) {
    const f = await fixture({ t }, { overrides });
    const response = await f.request(); assert.equal(response.status, status); assert.equal(response.body.code, code); assert.deepEqual(f.calls, []);
  }
  const denied = await fixture({ t }, { overrides: { authorize: async () => ({ allowed: false, reason: "denied" }), localSiteSupervisor: undefined } });
  assert.deepEqual(await denied.request(), { status: 403, body: {
    error: "principal 'operator' is not authorized for 'system.write' (denied)", code: "FORBIDDEN", details: { permission: "system.write", reason: "denied" },
  } }); assert.deepEqual(denied.calls, []);
  const missing = await fixture({ t }, { overrides: { localSiteSupervisor: undefined } });
  assert.deepEqual(await missing.request(), { status: 409, body: { code: "SITE_HOST_UNAVAILABLE", error: "local site host is unavailable" } });
  assert.deepEqual(missing.calls, [["authorize", { principalId: "operator", permission: "system.write", workspaceId: "ws", entityType: "site-registry" }]]);
});

test("lifecycle catches principal/auth failures and sanitizes typed and opaque effect errors", async (t) => {
  const missingPrincipal = await fixture({ t }, { principal: false });
  assert.deepEqual(await missingPrincipal.request(), { status: 500, body: { code: "INTERNAL_ERROR", error: "INTERNAL_ERROR" } });
  assert.deepEqual(missingPrincipal.calls, []);
  const failures: [unknown, number, string][] = [
    [new Error("private connection details"), 500, "INTERNAL_ERROR"], ["opaque", 500, "INTERNAL_ERROR"],
    ...Object.entries({ VALIDATION_ERROR: 400, SITE_CONFIRM_REQUIRED: 400, SITE_NOT_FOUND: 404, SITE_SERVING: 409,
      SITE_RUNNING: 409, SITE_RUNNING_ELSEWHERE: 409, SITE_LIMIT: 409, SITE_ALREADY_EXISTS: 409, SITE_PATH_UNSAFE: 409,
      SITE_STOP_FAILED: 409, SITE_HOST_STOPPING: 500 }).map(([code, status]): [unknown, number, string] => [new LocalSiteError(code), status, code]),
  ];
  for (const [error, status, code] of failures) {
    const f = await fixture({ t }, { overrides: { authorize: async () => { throw error; } } });
    assert.deepEqual(await f.request(), { status, body: { code, error: code } }); assert.deepEqual(f.calls, []);
    const effect = await fixture({ t }, { overrides: { afterTrash: () => { throw error; } } });
    assert.deepEqual(await effect.request({ suffix: "/alpha/trash", body: { confirmed: true } }), { status, body: { code, error: code } });
  }
});

test("lifecycle returns action payloads and defaults only nullish results, preserving mutation order", async (t) => {
  const f = await fixture({ t });
  assert.deepEqual(await f.request(), { status: 200, body: STATE });
  assert.deepEqual(await f.request({ suffix: "/alpha/stop" }), { status: 200, body: STATE });
  assert.deepEqual(await f.request({ suffix: "/alpha/trash", body: { confirmed: true } }), { status: 200, body: { site: { name: "alpha", id: "trash-id", displayName: "Alpha" } } });
  assert.deepEqual(f.calls.slice(-3), [["stopped", "alpha"], ["trash", { base: "/repo", name: "alpha" }], ["afterTrash", { base: "/repo", name: "alpha" }]]);
  assert.deepEqual(await f.request({ suffix: "/trash/alpha--00000000-0000-0000-0000-000000000000/restore" }), { status: 200, body: { ok: true } });
  const noHook = await fixture({ t }, { overrides: { afterTrash: undefined } });
  assert.equal((await noHook.request({ suffix: "/alpha/trash", body: { confirmed: true } })).status, 200);
});

test("lifecycle missing workspace parameter remains a 404", async (t) => {
  const f = await fixture({ t });
  const { res, capture } = createCapturingResponse();
  await extractRouteHandler(f.app, "post", `${ROOT}/:name/start`)({ params: {}, body: {} }, res);
  assert.equal(capture.statusCode, 404); assert.deepEqual(capture.jsonBody, { error: "workspace was not found" }); assert.deepEqual(f.calls, []);
});
