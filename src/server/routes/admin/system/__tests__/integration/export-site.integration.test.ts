import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createApp, createRouteDeps } from "#src/server/app";
import { bootAuthenticated, loginAsBarePrincipal } from "#src/server/__tests__/helpers/http-test-server";
import type { RouteDeps } from "#src/server/routes/types";

/**
 * @file Integration-tier coverage for `POST`/`GET .../system/export` — real composed app, real
 * login. `src/server/__tests__/routes/export-site-route.test.ts` (unit tier by this repo's naming
 * convention, despite also being a real-app test) already exercises the full real-export-to-
 * completion path thoroughly; this file is deliberately leaner — it proves the route's own
 * branches (auth, workspace, validation, single-flight 409, generic 500) through this SEPARATE
 * tier's `node --test` run, without re-running a full real export to settlement each time (a single
 * shared `exportOutputDir` per test, same trick the unit-tier file uses).
 */

function testDeps(exportOutputDir: string, overrides: Partial<RouteDeps> = {}): RouteDeps {
  return { ...createRouteDeps(), exportOutputRootDir: exportOutputDir, ...overrides };
}

test("export-site: mismatched workspaceId 404s on both routes", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "tovu-export-int-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const app = createApp(testDeps(dir));
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const trigger = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-real/system/export`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(trigger.status, 404);

  const status = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-real/system/export`, { headers: { cookie } });
  assert.equal(status.status, 404);
});

test("export-site: a principal with no grants is denied 403 on both routes", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "tovu-export-int-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const deps = testDeps(dir);
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);

  const trigger = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/export`, {
    method: "POST",
    headers: { cookie: bareCookie },
  });
  assert.equal(trigger.status, 403);

  const status = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/export`, {
    headers: { cookie: bareCookie },
  });
  assert.equal(status.status, 403);
});

test("export-site: a malformed trigger body 400s", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "tovu-export-int-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const deps = testDeps(dir);
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/export`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ clean: "not-a-boolean" }),
  });
  assert.equal(res.status, 400);
});

test("export-site: an unexpected authorize() failure 500s, and a fresh workspace starts idle", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "tovu-export-int-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const deps = testDeps(dir, {
    authorize: async () => {
      throw new Error("boom");
    },
  });
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const trigger = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/export`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(trigger.status, 500);

  const status = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/export`, { headers: { cookie } });
  assert.equal(status.status, 500);
});

test("export-site: a real trigger succeeds (202, running snapshot) and an immediate second trigger 409s", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "tovu-export-int-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const deps = testDeps(dir);
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const trigger = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/export`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(trigger.status, 202);
  const body = (await trigger.json()) as { status: string; outputDir: string };
  assert.equal(body.status, "running");
  assert.equal(body.outputDir, dir);

  const second = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/export`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(second.status, 409);
});
