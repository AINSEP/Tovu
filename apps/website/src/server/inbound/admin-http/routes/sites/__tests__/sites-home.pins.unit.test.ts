import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { registerSitesHomeRoutes } from "../sites-home.js";
import { createSitesWorkspace, type SitesWorkspace } from "#src/platform/site-dir/sites-home";
import type { AdminSitesDeps } from "../../system/sites.js";
import { createCapturingResponse, extractRouteHandler, startTestServer } from "#src/server/__tests__/helpers/http-test-server";

type Deps = Pick<AdminSitesDeps, "workspaceId" | "authorize" | "isSiteSwitcherEnabled">;
async function fixture({ t }: { t: TestContext }, { overrides = {}, workspaceOverrides = {}, principal = true }: {
  overrides?: Partial<Deps>; workspaceOverrides?: Partial<SitesWorkspace>; principal?: boolean;
} = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sites-home-pins-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = { ...createSitesWorkspace({}, { homeDir: root, env: {}, platform: "linux", sourceRoots: [] }), ...workspaceOverrides };
  const permissions: string[] = [];
  const deps: Deps = { workspaceId: "ws", isSiteSwitcherEnabled: () => true,
    authorize: async ({ permission }) => { permissions.push(permission); return { allowed: true, reason: "owner" }; }, ...overrides };
  const app = express(); app.use(express.json());
  app.use((_req, res, next) => { if (principal) res.locals.principal = { id: "owner" }; next(); });
  registerSitesHomeRoutes({ app, deps, workspace });
  const origin = await startTestServer(app, t);
  return { app, root, workspace, permissions, async request({ suffix = "/config", method = "put", body = {}, workspaceId = "ws" }: {
    suffix?: string; method?: "get" | "put"; body?: unknown; workspaceId?: string;
  } = {}, _options = {}) {
    const response = await fetch(`${origin}/api/admin/v1/workspaces/${workspaceId}/system/sites${suffix}`, {
      method: method.toUpperCase(), headers: { "content-type": "application/json" }, ...(method === "get" ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  } };
}

const ROUTES = [{ suffix: "/config", method: "get" }, { suffix: "/config", method: "put" }, { suffix: "/home", method: "put" }] as const;
for (const route of ROUTES) {
  test(`${route.method} ${route.suffix} preserves admission order and permission`, async (t) => {
    const wrong = await fixture({ t }, { overrides: { isSiteSwitcherEnabled: () => { throw new Error("must not run"); } } });
    assert.deepEqual(await wrong.request({ ...route, workspaceId: "wrong" }), { status: 404, body: { error: "workspace was not found" } });
    assert.deepEqual(wrong.permissions, []);
    const disabled = await fixture({ t }, { overrides: { isSiteSwitcherEnabled: () => false } });
    assert.deepEqual(await disabled.request(route), { status: 403, body: { error: "Local sites management is disabled." } });
    assert.deepEqual(disabled.permissions, []);
    const denied = await fixture({ t }, { overrides: { authorize: async () => ({ allowed: false, reason: "denied" }) } });
    const permission = route.method === "get" ? "system.read" : "system.write";
    assert.deepEqual(await denied.request(route), { status: 403, body: {
      error: `principal 'owner' is not authorized for '${permission}' (denied)`, code: "FORBIDDEN", details: { permission, reason: "denied" },
    } });
    const missingPrincipal = await fixture({ t }, { principal: false });
    assert.deepEqual(await missingPrincipal.request(route), { status: 500, body: {
      error: "getAuthedPrincipal: no principal on res.locals — requireAdminSession must run before this route",
    } }); assert.deepEqual(missingPrincipal.permissions, []);
    const success = await fixture({ t });
    const body = route.suffix === "/home" ? { path: success.root } : {};
    assert.equal((await success.request({ ...route, body })).status, 200); assert.deepEqual(success.permissions, [permission]);
    const { res, capture } = createCapturingResponse();
    await extractRouteHandler(success.app, route.method, `/api/admin/v1/workspaces/:workspaceId/system/sites${route.suffix}`)({ params: {} }, res);
    assert.equal(capture.statusCode, 404); assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
  });
}

for (const { label, error, readMessage, saveMessage, homeMessage } of [
  { label: "Error", error: new Error("private failure detail"), readMessage: "private failure detail", saveMessage: "private failure detail", homeMessage: "private failure detail" },
  { label: "opaque", error: "opaque", readMessage: "Could not read sites settings.", saveMessage: "Could not save sites settings.", homeMessage: "Could not save sites home." },
]) {
  test(`settings routes retain ${label} boundaries and fallback messages`, async (t) => {
    const read = await fixture({ t }, { workspaceOverrides: { config: () => { throw error; } } });
    assert.deepEqual(await read.request({ method: "get" }), { status: 500, body: { error: readMessage } });
    const save = await fixture({ t }, { workspaceOverrides: { updateConfig: () => { throw error; } } });
    assert.deepEqual(await save.request(), { status: 400, body: { error: saveMessage } });
    const home = await fixture({ t }, { workspaceOverrides: { setHome: () => { throw error; } } });
    assert.deepEqual(await home.request({ suffix: "/home", body: { path: home.root } }), { status: 500, body: { error: homeMessage } });
    for (const route of ROUTES) {
      const auth = await fixture({ t }, { overrides: { authorize: async () => { throw error; } } });
      assert.deepEqual(await auth.request(route), { status: 500, body: { error: route.suffix === "/home" ? homeMessage : readMessage } });
    }
  });
}

test("directory validation retains absolute/nonempty/NUL, type, directory and mounted-parent checks", async (t) => {
  const f = await fixture({ t });
  const file = path.join(f.root, "file"); fs.writeFileSync(file, "keep");
  const invalid = "Choose an absolute folder path for sites settings.";
  const missing = path.join(f.root, "unmounted", "sites");
  const absentRoot = path.join(f.root, "absent-root");
  const unavailable = ({ directory }: { directory: string }, _options = {}) => `Sites folder is unavailable: ${directory}. Mount it or choose an existing local folder.`;
  for (const [value, message] of [[null, invalid], [false, invalid], ["", invalid], ["   ", invalid], ["relative", invalid],
    [f.root + "\0", invalid], [file, "Sites folder must be a directory."], [missing, unavailable({ directory: missing })]] as const) {
    for (const [suffix, body] of [["/config", { sitesHome: value }], ["/home", { path: value }]] as const) {
      assert.deepEqual(await f.request({ suffix, body }), { status: 400, body: { error: message } });
    }
  }
  assert.deepEqual(await f.request({ suffix: "/home" }), { status: 400, body: { error: invalid } });
  assert.deepEqual(await f.request({ body: { siteRoots: [absentRoot] } }), { status: 400, body: { error: unavailable({ directory: absentRoot }) } });
  const home = path.join(f.root, "new-home");
  assert.equal((await f.request({ body: { sitesHome: home, siteRoots: [f.root] } })).status, 200);
  assert.equal(f.workspace.home({}), home); assert.deepEqual(f.workspace.config({}).siteRoots, [f.root]);
  assert.deepEqual(await f.request({ suffix: "/home", body: { path: f.root } }), { status: 200, body: { home: f.root } });
  assert.equal(fs.existsSync(path.join(f.root, "unmounted")), false);
});

test("directory probe errors keep their original message or route-specific fallback", async (t) => {
  const f = await fixture({ t });
  for (const error of [Object.assign(new Error("access denied"), { code: "EACCES" }), "opaque"]) {
    const probe = t.mock.method(fs, "statSync", () => { throw error; });
    try {
      assert.deepEqual(await f.request({ body: { sitesHome: f.root } }), { status: 400, body: { error: error instanceof Error ? error.message : "Could not save sites settings." } });
      assert.deepEqual(await f.request({ suffix: "/home", body: { path: f.root } }), { status: 400, body: { error: error instanceof Error ? error.message : "Invalid sites home." } });
    } finally { probe.mock.restore(); }
  }
});

test("settings expose raw Error details (reported, not fixed)", async (t) => {
  const f = await fixture({ t }, { workspaceOverrides: { config: () => { throw new Error("private storage location"); } } });
  assert.deepEqual(await f.request({ method: "get" }), { status: 500, body: { error: "private storage location" } });
});
