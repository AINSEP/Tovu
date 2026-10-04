import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import type { NextFunction, Request, Response } from "express";

import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminFsFilesCustomRootRoutes, type AdminFsFilesCustomRootDeps } from "../custom-root.js";

/**
 * @file Real-HTTP coverage for the chat composer's folder control:
 * `GET`/`PUT`/`DELETE /api/admin/v1/workspaces/:workspaceId/fs-files/custom-root`. Same lightweight
 * "bare `express()` app, faked `res.locals.principal`, real `fetch` over a real socket" shape as
 * `routes/comments/__tests__/moderate.test.ts` — this route has no repo/service to fake beyond the
 * deps object itself, so no extra call-capturing scaffolding is needed.
 *
 * Every test builds its own fresh `mkdtempSync` `siteDir` and passes it as `storeOptional.siteDir` —
 * `custom-root-store.ts`'s real default (the live site) must never be exercised here.
 */

const WORKSPACE_ID = "workspace-local";
const BASE = `/api/admin/v1/workspaces/${WORKSPACE_ID}/fs-files/custom-root`;

function freshSiteDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-route-site-"));
}

function buildApp(depsOverrides: Partial<AdminFsFilesCustomRootDeps> = {}): express.Express {
  const deps: AdminFsFilesCustomRootDeps = {
    workspaceId: WORKSPACE_ID,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    storeOptional: { siteDir: freshSiteDir() },
    ...depsOverrides,
  };
  const app = express();
  app.use(express.json());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.principal = { id: "test-principal" };
    next();
  });
  registerAdminFsFilesCustomRootRoutes(app, deps);
  return app;
}

test("GET with a mismatched workspaceId 404s", async (t) => {
  const app = buildApp();
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-real/fs-files/custom-root`);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "workspace was not found" });
});

test("GET refuses a denied authorize() with 403 before touching the store", async (t) => {
  const app = buildApp({ authorize: async () => ({ allowed: false, reason: "no-grant" }) });
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${BASE}`);
  assert.equal(res.status, 403);
});

test("GET returns null before anything has been set", async (t) => {
  const app = buildApp();
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${BASE}`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { path: null });
});

test("PUT with a real absolute directory sets it, and GET then reflects it", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-route-"));
  const app = buildApp();
  const baseUrl = await startTestServer(app, t);

  const putRes = await fetch(`${baseUrl}${BASE}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: dir }),
  });
  assert.equal(putRes.status, 200);
  assert.deepEqual(await putRes.json(), { path: fs.realpathSync(dir) });

  const getRes = await fetch(`${baseUrl}${BASE}`);
  assert.deepEqual(await getRes.json(), { path: fs.realpathSync(dir) });
});

test("PUT with a missing 'path' field is a 400 validation error", async (t) => {
  const app = buildApp();
  const baseUrl = await startTestServer(app, t);
  const res = await fetch(`${baseUrl}${BASE}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "VALIDATION_ERROR");
});

test("PUT with a path that does not exist is a 400 with the store's own message, not a 500", async (t) => {
  const app = buildApp();
  const baseUrl = await startTestServer(app, t);
  const missing = path.join(os.tmpdir(), `tovu-custom-root-route-missing-${Date.now()}`);
  const res = await fetch(`${baseUrl}${BASE}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: missing }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.code, "INVALID_PATH");
  assert.match(body.error, /does not exist/);
});

test("DELETE clears a previously-set root", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-route-"));
  const app = buildApp();
  const baseUrl = await startTestServer(app, t);

  await fetch(`${baseUrl}${BASE}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: dir }),
  });
  const deleteRes = await fetch(`${baseUrl}${BASE}`, { method: "DELETE" });
  assert.equal(deleteRes.status, 200);
  assert.deepEqual(await deleteRes.json(), { path: null });

  const getRes = await fetch(`${baseUrl}${BASE}`);
  assert.deepEqual(await getRes.json(), { path: null });
});

test("PUT rejects relative and regular-file paths without replacing the configured root", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-invalid-"));
  const siteDir = freshSiteDir();
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(siteDir, { recursive: true, force: true });
  });
  const file = path.join(dir, "ordinary.txt");
  fs.writeFileSync(file, "not a directory");
  const app = buildApp({ storeOptional: { siteDir } });
  const baseUrl = await startTestServer(app, t);
  const put = (root: string) => fetch(`${baseUrl}${BASE}`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: root }),
  });
  assert.equal((await put(dir)).status, 200);
  for (const invalid of [path.relative(process.cwd(), dir), file]) {
    const res = await put(invalid);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, "INVALID_PATH");
    const current = await fetch(`${baseUrl}${BASE}`);
    assert.deepEqual(await current.json(), { path: fs.realpathSync(dir) });
  }
});

for (const method of ["PUT", "DELETE"]) {
  test(`${method} refuses denied authorization without changing the stored root`, async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-denied-"));
    const siteDir = freshSiteDir();
    t.after(() => {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(siteDir, { recursive: true, force: true });
    });
    const allowed = await startTestServer(buildApp({ storeOptional: { siteDir } }), t);
    assert.equal((await fetch(`${allowed}${BASE}`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: dir }),
    })).status, 200);
    const denied = await startTestServer(buildApp({
      storeOptional: { siteDir }, authorize: async () => ({ allowed: false, reason: "no-grant" }),
    }), t);
    const res = await fetch(`${denied}${BASE}`, {
      method, headers: { "content-type": "application/json" }, body: JSON.stringify({ path: os.tmpdir() }),
    });
    assert.equal(res.status, 403);
    const current = await fetch(`${allowed}${BASE}`);
    assert.deepEqual(await current.json(), { path: fs.realpathSync(dir) });
  });
}

test("a previously-set folder survives a fresh route registration against the same siteDir (simulated restart)", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-route-"));
  const siteDir = freshSiteDir();

  const firstApp = buildApp({ storeOptional: { siteDir } });
  const firstBaseUrl = await startTestServer(firstApp, t);
  await fetch(`${firstBaseUrl}${BASE}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: dir }),
  });

  // A brand-new express app + route registration, sharing only `siteDir` — the same shape a fresh
  // `tsx-watch` reload's new process would present, since neither this module nor the route holds any
  // in-memory state of its own.
  const secondApp = buildApp({ storeOptional: { siteDir } });
  const secondBaseUrl = await startTestServer(secondApp, t);
  const res = await fetch(`${secondBaseUrl}${BASE}`);
  assert.deepEqual(await res.json(), { path: fs.realpathSync(dir) });
});

test("GET reports a vanished folder honestly, not as though nothing was ever set", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-route-"));
  const realDir = fs.realpathSync(dir);
  const app = buildApp();
  const baseUrl = await startTestServer(app, t);

  await fetch(`${baseUrl}${BASE}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: dir }),
  });
  fs.rmSync(dir, { recursive: true, force: true });

  const res = await fetch(`${baseUrl}${BASE}`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { path: null, vanished: true, vanishedPath: realDir });
});

test("two workspaces backed by the same siteDir do not share a custom root", async (t) => {
  const siteDir = freshSiteDir();
  const dirA = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-custom-root-route-a-"));

  const appA = buildApp({ workspaceId: WORKSPACE_ID, storeOptional: { siteDir } });
  const baseUrlA = await startTestServer(appA, t);
  await fetch(`${baseUrlA}${BASE}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: dirA }),
  });

  const otherWorkspaceId = "workspace-other";
  const appB = buildApp({ workspaceId: otherWorkspaceId, storeOptional: { siteDir } });
  const baseUrlB = await startTestServer(appB, t);
  const otherBase = `/api/admin/v1/workspaces/${otherWorkspaceId}/fs-files/custom-root`;
  const resB = await fetch(`${baseUrlB}${otherBase}`);
  assert.deepEqual(await resB.json(), { path: null });

  const resA = await fetch(`${baseUrlA}${BASE}`);
  assert.deepEqual(await resA.json(), { path: fs.realpathSync(dirA) });
});
