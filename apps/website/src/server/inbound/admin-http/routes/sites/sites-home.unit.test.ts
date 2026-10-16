/** Home2 review: exercise registered route handlers against the real shared settings owner. */
import "../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { registerSitesHomeRoutes } from "./sites-home.js";
import { createSitesWorkspace } from "#src/platform/site-dir/sites-home";
import { createCapturingResponse, extractRouteHandler, startTestServer } from "#src/server/__tests__/helpers/http-test-server";

async function fixture(t: TestContext, { useDefaultCapability = false } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sites-settings-routes-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = createSitesWorkspace({}, { homeDir: root, env: {}, platform: "linux", sourceRoots: [] });
  let enabled = true, allowed = true;
  const permissions: string[] = [];
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; next(); });
  registerSitesHomeRoutes({ app, workspace, deps: { workspaceId: "ws", ...(useDefaultCapability ? {} : { isSiteSwitcherEnabled: () => enabled }),
    authorize: async ({ permission }) => { permissions.push(permission); return { allowed, reason: "policy" }; } } });
  const origin = await startTestServer(app, t);
  return { app, root, workspace, permissions, disable: () => { enabled = false; }, deny: () => { allowed = false; },
    async request(suffix: string, body: unknown = {}, workspaceId = "ws", method: "get" | "put" | "post" = "put") {
      const response = await fetch(`${origin}/api/admin/v1/workspaces/${workspaceId}/system/sites${suffix}`, {
        method: method.toUpperCase(), headers: { "content-type": "application/json" }, ...(method !== "get" ? { body: JSON.stringify(body) } : {}),
      });
      return { statusCode: response.status, jsonBody: await response.json() };
    },
  };
}

test("GET sites config returns current settings without creating a settings file", async (t) => {
  const f = await fixture(t);
  const before = f.workspace.config({});
  assert.equal(fs.existsSync(before.configPath), false);

  const response = await f.request("/config", {}, "ws", "get");

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.jsonBody, JSON.parse(JSON.stringify(before)));
  assert.deepEqual(f.permissions, ["system.read"]);
  assert.equal(fs.existsSync(before.configPath), false);
});

test("sites home rejects an omitted path without creating settings", async (t) => {
  const f = await fixture(t);
  const before = f.workspace.config({});

  const response = await f.request("/home", {});

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.jsonBody, { error: "Choose an absolute folder path for sites settings." });
  assert.deepEqual(f.workspace.config({}), before);
  assert.equal(fs.existsSync(before.configPath), false);
});

for (const suffix of ["/config", "/home"]) {
  test(`sites ${suffix} uses the default capability to refuse production folder management`, async (t) => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousSwitcher = process.env.TOVU_ENABLE_SITE_SWITCHER;
    t.after(() => {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousSwitcher === undefined) delete process.env.TOVU_ENABLE_SITE_SWITCHER;
      else process.env.TOVU_ENABLE_SITE_SWITCHER = previousSwitcher;
    });
    process.env.NODE_ENV = "production";
    process.env.TOVU_ENABLE_SITE_SWITCHER = "1";
    const f = await fixture(t, { useDefaultCapability: true });
    const before = f.workspace.config({});
    const handler = extractRouteHandler(f.app, "put", `/api/admin/v1/workspaces/:workspaceId/system/sites${suffix}`);
    const { res, capture } = createCapturingResponse();
    res.locals.principal = { id: "owner" };
    const selected = path.join(f.root, "selected");

    // Invoke directly so a missing default that rejects before the route's try/catch fails
    // immediately instead of leaving an Express 4 HTTP request waiting for a response.
    await handler({ params: { workspaceId: "ws" }, body: suffix === "/config" ? { sitesHome: selected } : { path: selected } }, res);

    assert.equal(capture.statusCode, 403);
    assert.deepEqual(capture.jsonBody, { error: "Local sites management is disabled." });
    assert.deepEqual(f.permissions, []);
    assert.deepEqual(f.workspace.config({}), before);
    assert.equal(fs.existsSync(before.configPath), false);
    assert.equal(fs.existsSync(selected), false);
  });
}

test("settings and home enforce workspace, capability and authz before writes", async (t) => {
  for (const suffix of ["/config", "/home"]) {
    const f = await fixture(t);
    assert.equal((await f.request(suffix, {}, "other")).statusCode, 404); assert.deepEqual(f.permissions, []);
    f.deny(); assert.equal((await f.request(suffix)).statusCode, 403); assert.deepEqual(f.permissions, ["system.write"]);
    f.disable(); assert.equal((await f.request(suffix)).statusCode, 403); assert.deepEqual(f.permissions, ["system.write"]);
    assert.equal(fs.existsSync(f.workspace.config({}).configPath), false);
  }
});
test("both settings paths reject relative, missing-volume and file paths without mutating settings", async (t) => {
  const f = await fixture(t), file = path.join(f.root, "file"); fs.writeFileSync(file, "keep");
  const before = f.workspace.config({});
  for (const value of ["relative", "~/sites", file, path.join(f.root, "unmounted", "Sites")]) {
    for (const [suffix, body] of [["/config", { sitesHome: value }], ["/home", { path: value }]] as const) {
      assert.equal((await f.request(suffix, body)).statusCode, 400); assert.deepEqual(f.workspace.config({}), before);
    }
  }
  assert.equal((await f.request("/config", { siteRoots: [path.join(f.root, "missing-root")] })).statusCode, 400);
  assert.equal((await f.request("/config", { databases: "appData", secret: true })).statusCode, 400);
  assert.equal(fs.existsSync(path.join(f.root, "unmounted")), false);
  const home = path.join(f.root, "new-home");
  assert.equal((await f.request("/config", { sitesHome: home, siteRoots: [f.root], databases: "appData" })).statusCode, 200);
  assert.equal(f.workspace.home({}), home); assert.deepEqual(f.workspace.config({}).siteRoots, [f.root]);
  assert.equal((await f.request("/config", {}, "ws", "get")).statusCode, 200); assert.equal(f.permissions.at(-1), "system.read");
});
