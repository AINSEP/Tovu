/** Home2 review: exercise registered route handlers against the real shared settings owner. */
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { registerSitesHomeRoutes } from "./sites-home.js";
import { createSitesWorkspace } from "#src/platform/site-dir/sites-home";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";

async function fixture(t: TestContext) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sites-settings-routes-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = createSitesWorkspace({}, { homeDir: root, env: {}, platform: "linux", sourceRoots: [] });
  let enabled = true, allowed = true;
  const permissions: string[] = [];
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; next(); });
  registerSitesHomeRoutes({ app, workspace, deps: { workspaceId: "ws", isSiteSwitcherEnabled: () => enabled,
    authorize: async ({ permission }) => { permissions.push(permission); return { allowed, reason: "policy" }; } } });
  const origin = await startTestServer(app, t);
  return { root, workspace, permissions, disable: () => { enabled = false; }, deny: () => { allowed = false; },
    async request(suffix: string, body: unknown = {}, workspaceId = "ws", method: "get" | "put" | "post" = "put") {
      const response = await fetch(`${origin}/api/admin/v1/workspaces/${workspaceId}/system/sites${suffix}`, {
        method: method.toUpperCase(), headers: { "content-type": "application/json" }, ...(method !== "get" ? { body: JSON.stringify(body) } : {}),
      });
      return { statusCode: response.status, jsonBody: await response.json() };
    },
  };
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


test("move action enforces permission/confirmation and refuses a running old-level site", async (t) => {
  const f = await fixture(t), dir = path.join(f.root, "Documents", "Tovu", "alpha");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name: "Alpha", domain: null, port: null }));
  fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId: "alpha-id", templateId: "blank", templateVersion: "1", schemaVersion: 0, schemaTag: "test", createdAt: "date" }));
  f.workspace.registry({}).merge({ entries: [{ id: "alpha-id", name: "Alpha", path: dir, createdBy: "test", lastOpened: null }] });
  assert.equal((await f.request("/alpha/move", {}, "other", "post")).statusCode, 404);
  assert.equal((await f.request("/alpha/move", {}, "ws", "post")).statusCode, 400);
  const live = f.workspace.claim({ path: dir, app: "Desktop", port: 3000 });
  const refused = await f.request("/alpha/move", { confirmed: true }, "ws", "post");
  assert.equal(refused.statusCode, 409); assert.match(refused.jsonBody.error, /Site is running in Desktop/);
  assert.equal(fs.existsSync(dir), true); assert.equal(f.workspace.registry({}).list({})[0]?.path, dir);
  f.workspace.running({ path: dir }).release({ token: live.record.token });
  const moved = await f.request("/alpha/move", { confirmed: true }, "ws", "post");
  assert.equal(moved.statusCode, 200); assert.equal(moved.jsonBody.dir, path.join(f.workspace.home({}), "alpha"));
  assert.equal(fs.existsSync(dir), false); assert.equal(f.workspace.registry({}).list({})[0]?.path, moved.jsonBody.dir);
  f.deny(); assert.equal((await f.request("/alpha/move", { confirmed: true }, "ws", "post")).statusCode, 403);
});
