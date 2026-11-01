import "../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import express from "express";
import { createNodeDurableJsonPorts } from "@jini-ai/platform/fs";
import { createSitesWorkspace } from "#src/platform/site-dir/sites-home";
import { dispatchJsonRequest } from "#src/server/__tests__/helpers/in-process-http";
import { registerSitesHomeRoutes } from "./sites-home.js";

const BASE = "/api/admin/v1/workspaces/ws/system/sites";
const KEY = "sk-" + "a".repeat(40);

function fixture(t: TestContext, { failWrite = false, env = {} }: { failWrite?: boolean; env?: NodeJS.ProcessEnv } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "sites-home-errors-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const ports = createNodeDurableJsonPorts({});
  if (failWrite) ports.filesystem.renameSync = () => { throw new Error(`storage failed ${KEY}`); };
  const workspace = createSitesWorkspace({}, { homeDir: root, env, platform: "linux", sourceRoots: [], ports });
  const logs: unknown[][] = [], reports: Error[] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { logs.push(args); });
  const app = express();
  app.use((_req, res, next) => {
    res.locals.principal = { id: "owner" };
    res.locals.adminFailureTracker = { error: ({ error }: { error: Error }) => { reports.push(error); } }; next();
  });
  registerSitesHomeRoutes({ app, workspace, deps: { workspaceId: "ws", isSiteSwitcherEnabled: () => true, authorize: async () => ({ allowed: true, reason: "owner" }) } });
  return { app, workspace, root, logs, reports };
}

test("sites config validation refusals retain their safe 400 messages without logging incidents", async (t) => {
  const f = fixture(t);
  for (const [patch, message] of [
    [{ databases: "wrong" }, 'databases must be "inSite" or "appData".'],
    [{ extra: true }, "Unknown user config setting."],
    [null, "User config must be an object."],
    [{ siteRoots: "wrong" }, "siteRoots must be an array of directory paths."],
    [{ sitesHome: "relative" }, "Choose an absolute folder path for sites settings."],
  ] as const) {
    assert.deepEqual(await dispatchJsonRequest(f.app, "PUT", `${BASE}/config`, patch), { status: 400, body: { error: message } });
  }
  assert.deepEqual([f.logs, f.reports], [[], []]);
  assert.equal(fs.existsSync(f.workspace.config({}).configPath), false);
});

for (const fault of ["write", "stat"] as const) {
  test(`sites config ${fault} failures are redacted correlated 500s rather than public validation errors`, async (t) => {
    const f = fixture(t, { failWrite: fault === "write" });
    const selected = path.join(f.root, "next");
    if (fault === "stat") {
      const original = fs.statSync;
      t.mock.method(fs, "statSync", (...args: Parameters<typeof fs.statSync>) => {
        if (args[0] === selected) throw new Error(`inspection failed ${KEY}`);
        return Reflect.apply(original, fs, args);
      });
    }
    const response = await dispatchJsonRequest(f.app, "PUT", `${BASE}/config`, fault === "write" ? { databases: "appData" } : { sitesHome: selected });
    assert.equal(response.status, 500);
    const body = response.body as { code: string; errorId: string; error: string };
    assert.equal(body.code, "INTERNAL_ERROR");
    assert.match(body.errorId, /^[a-f0-9-]{36}$/);
    assert.ok(body.error.includes(body.errorId));
    assert.equal(JSON.stringify(response).includes(KEY), false);
    assert.equal(f.logs.length, 1); assert.equal(f.reports.length, 1);
    assert.ok(JSON.stringify(f.logs).includes(body.errorId));
    assert.equal(JSON.stringify(f.logs).includes(KEY), false);
    assert.match(JSON.stringify(f.logs), /REDACTED/);
    assert.equal(f.reports[0].message.includes(KEY), false);
    assert.equal(fs.existsSync(f.workspace.config({}).configPath), false);
  });
}

test("both sites settings paths retain directory validation as 400 and redact unexpected inspection failures", async (t) => {
  const f = fixture(t), file = path.join(f.root, "file"), selected = path.join(f.root, "next");
  fs.writeFileSync(file, "keep");
  for (const [suffix, patch] of [["/config", { sitesHome: file }], ["/home", { path: file }]] as const) {
    assert.deepEqual(await dispatchJsonRequest(f.app, "PUT", BASE + suffix, patch), { status: 400, body: { error: "Sites folder must be a directory." } });
  }
  const original = fs.statSync;
  t.mock.method(fs, "statSync", (...args: Parameters<typeof fs.statSync>) => {
    if (args[0] === selected) throw new Error(`inspection failed ${KEY}`);
    return Reflect.apply(original, fs, args);
  });
  const response = await dispatchJsonRequest(f.app, "PUT", `${BASE}/home`, { path: selected });
  assert.equal(response.status, 500);
  assert.equal(JSON.stringify(response).includes(KEY), false);
  assert.equal(f.logs.length, 1);
});
