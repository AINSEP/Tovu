import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

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

/** Same technique as `admin/integrations/__tests__/integration/create-delete-pause.integration.test.ts`'s
 *  identical helper — see its comment for why: `export-site.ts`'s `String(req.params.workspaceId ??
 *  "")` fallbacks (both routes have their own) are unreachable through any real HTTP request
 *  (Express's own router guarantees the route segment is populated whenever this handler is
 *  dispatched to at all), so the only way to genuinely execute the `??` side is to reach into the
 *  REAL composed app's router stack and call the registered handler directly with a hand-built
 *  `req`. Also used for `parseTriggerRequestBody`'s `body === undefined || body === null`
 *  short-circuit: `body-parser`'s `express.json()` middleware unconditionally does `req.body =
 *  req.body || {}` (verified directly in `node_modules/body-parser/lib/types/json.js`) before this
 *  route ever sees the request, so `req.body` can never actually be `undefined`/`null` coming
 *  through the real app either — same "provably unreachable via real HTTP, reachable via a forced
 *  direct call" shape. */
interface ExpressHandlerLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: { handle: (req: unknown, res: unknown) => unknown }[];
  };
}
interface ExpressAppWithRouter {
  _router: { stack: ExpressHandlerLayer[] };
}

/** `export-site.ts` registers `POST` and `GET` on the exact same path string, so matching by path
 *  alone (as the sibling `create-delete-pause.integration.test.ts` helper does, safely, since none
 *  of ITS routes share a path) would silently always return whichever method was registered FIRST
 *  (`POST`, here) -- verified directly: Express keeps one router-stack layer per (path, method)
 *  pair, each with its own `route.methods`, so the method must be part of the lookup. */
function extractHandler(
  app: ReturnType<typeof createApp>,
  method: "get" | "post",
  path: string
): (req: unknown, res: unknown) => unknown {
  const stack = (app as unknown as ExpressAppWithRouter)._router.stack;
  const layer = stack.find((l) => l.route?.path === path && l.route.methods[method]);
  if (!layer?.route) throw new Error(`${method.toUpperCase()} route '${path}' was not found in the router stack`);
  return layer.route.stack[0].handle;
}

function fakeRes(): { res: unknown; getStatus: () => number | undefined; getBody: () => unknown } {
  let statusCode: number | undefined;
  let body: unknown;
  const res = {
    locals: { principal: { id: "forced-input-test-principal" } },
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(payload: unknown) {
      body = payload;
      return res;
    },
  };
  return { res, getStatus: () => statusCode, getBody: () => body };
}

const EXPORT_PATH = "/api/admin/v1/workspaces/:workspaceId/system/export";

/** `currentRun` (the route module's process-local single-flight run slot, see `export-site.ts`'s
 *  own file header) is shared mutable state across every test in this FILE, same as any singleton
 *  `node:test` exercises without a reset hook -- every test below that starts a real run polls it
 *  to a settled (non-"running") state before finishing, same discipline as the sibling unit-tier
 *  `export-site-route.test.ts`, so no run is ever left in-flight for a later test in this file to
 *  trip over (observed directly: without this, a later test's own trigger 409s against the PRIOR
 *  test's still-running export instead of exercising its own branch). */
async function waitForSettled(
  baseUrl: string,
  cookie: string,
  workspaceId: string
): Promise<{ status: string; [key: string]: unknown }> {
  let body: { status: string; [key: string]: unknown } = { status: "running" };
  for (let attempt = 0; attempt < 100 && body.status === "running"; attempt++) {
    await delay(50);
    const poll = await fetch(`${baseUrl}/api/admin/v1/workspaces/${workspaceId}/system/export`, { headers: { cookie } });
    assert.equal(poll.status, 200);
    body = (await poll.json()) as typeof body;
  }
  assert.notEqual(body.status, "running", `export did not settle in time: ${JSON.stringify(body)}`);
  return body;
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

  await waitForSettled(baseUrl, cookie, deps.workspaceId);
});

test("export-site: a non-string basePath 400s", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "tovu-export-int-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const deps = testDeps(dir);
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/export`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ basePath: 123 }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "'basePath' must be a string");
});

test("export-site: a JSON array trigger body 400s", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "tovu-export-int-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const deps = testDeps(dir);
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/export`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify([]),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "request body must be a JSON object");
});

test("export-site: a valid non-blank basePath is accepted (202)", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "tovu-export-int-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const deps = testDeps(dir);
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/export`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ basePath: "custom-base" }),
  });
  assert.equal(res.status, 202);
  const body = (await res.json()) as { status: string };
  assert.equal(body.status, "running");

  await waitForSettled(baseUrl, cookie, deps.workspaceId);
});

test("export-site: GET status succeeds (200) and reflects a just-triggered running export", async (t) => {
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

  const status = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/export`, { headers: { cookie } });
  assert.equal(status.status, 200);
  const body = (await status.json()) as { status: string; outputDir: string | null };
  assert.equal(body.outputDir, dir);

  await waitForSettled(baseUrl, cookie, deps.workspaceId);
});

test("export-site: POST `req.params.workspaceId ?? \"\"` fallback, forced via a direct handler call on the REAL composed app (Express itself can never leave a required :workspaceId segment unset) -- still 404s as a mismatch", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "tovu-export-int-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const app = createApp(testDeps(dir));
  const handler = extractHandler(app, "post", EXPORT_PATH);
  const { res, getStatus, getBody } = fakeRes();

  await handler({ params: {}, body: {} }, res);

  assert.equal(getStatus(), 404);
  assert.deepEqual(getBody(), { error: "workspace was not found" });
});

test("export-site: GET `req.params.workspaceId ?? \"\"` fallback, forced via a direct handler call on the REAL composed app -- still 404s as a mismatch", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "tovu-export-int-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const app = createApp(testDeps(dir));
  const handler = extractHandler(app, "get", EXPORT_PATH);
  const { res, getStatus, getBody } = fakeRes();

  await handler({ params: {} }, res);

  assert.equal(getStatus(), 404);
  assert.deepEqual(getBody(), { error: "workspace was not found" });
});

test("export-site: `body === undefined || body === null` short-circuit in parseTriggerRequestBody, forced via a direct handler call -- `express.json()` always defaults `req.body` to `{}` on any real request (verified in body-parser's own source), so the only way to genuinely pass `undefined` through is a forced direct call -- still starts a clean, non-basePath run (202)", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "tovu-export-int-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const deps = testDeps(dir, { authorize: async () => ({ allowed: true, reason: "matched" }) });
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const handler = extractHandler(app, "post", EXPORT_PATH);
  const { res, getStatus, getBody } = fakeRes();

  await handler({ params: { workspaceId: deps.workspaceId }, body: undefined }, res);

  assert.equal(getStatus(), 202);
  assert.equal((getBody() as { status: string }).status, "running");

  await waitForSettled(baseUrl, cookie, deps.workspaceId);
});
