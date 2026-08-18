import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { createApp, createRouteDeps } from "../../app";
import { bootAuthenticated, createCapturingResponse, extractRouteHandler } from "../helpers/http-test-server";
import type { RouteDeps } from "../../routes/types";

/**
 * @file Admin Deployment panel → Static Site tab — `POST`/`GET /api/admin/v1/workspaces/:workspaceId/
 * system/export`. Same bare-principal-vs-owner + workspace-id-404 shape as
 * `deployment-overview-route.test.ts`, plus this route's own trigger+status contract: `202` on
 * trigger, `409` on a second trigger while one is running, and the final polled snapshot proving a
 * real export ran (not a fabricated "ok").
 *
 * `RouteDeps.exportOutputRootDir` is pointed at a throwaway temp directory for this whole file (via
 * {@link testRouteDeps} below, module-level, not per-test) rather than the real `infra/export`
 * default — this suite actually runs `exportSite` against the hermetic `createRouteDeps()` fixture
 * and must not write into the checked-out repo.
 *
 * `currentRun` (the route module's process-local run slot) is shared mutable state across every
 * test in this FILE, same as any singleton `node:test` exercises without a reset hook — tests below
 * are ordered so each one's precondition is true given only the file's own prior tests, and the
 * final test polls to a settled (non-"running") state before finishing so no run is ever left
 * in-flight for a hypothetical later test to trip over.
 */

const exportOutputDir = mkdtempSync(path.join(tmpdir(), "tovu-export-route-test-"));

const EXPORT_PATH = "system/export";

/** The hermetic fixture, with `exportOutputRootDir` redirected to this file's own throwaway temp
 *  dir — `startExportRun` reads this `RouteDeps` field instead of `process.env.TOVU_EXPORT_DIR`
 *  (export-run.ts no longer reads env vars at all), so overriding it here is what keeps this
 *  suite's real `exportSite` writes off the checked-out repo. */
function testRouteDeps(): RouteDeps {
  return { ...createRouteDeps(), exportOutputRootDir: exportOutputDir };
}

async function loginAsBarePrincipal(deps: RouteDeps, baseUrl: string): Promise<string> {
  await deps.identityReady;
  const bareId = "bare-principal-export-site";
  await deps.principalRepo.save({
    id: bareId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: "No Grants",
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId: bareId,
    workspaceId: deps.workspaceId,
    username: "bare-export-site",
    passwordHash: await deps.passwordHasher.hash("bare-pw"),
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "bare-export-site", password: "bare-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

test("export-site: an unauthorized principal (no grants) gets 403 on both the trigger and the status poll", async (t) => {
  const deps: RouteDeps = { ...testRouteDeps() };
  const app = createApp(deps);
  const { baseUrl } = await bootAuthenticated(app, t);
  const cookie = await loginAsBarePrincipal(deps, baseUrl);

  const trigger = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${EXPORT_PATH}`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(trigger.status, 403);

  const status = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${EXPORT_PATH}`, { headers: { cookie } });
  assert.equal(status.status, 403);
});

test("export-site: a mismatched workspaceId in the URL 404s on both routes", async (t) => {
  const deps: RouteDeps = { ...testRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const trigger = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-the-real-workspace/${EXPORT_PATH}`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(trigger.status, 404);

  const status = await fetch(`${baseUrl}/api/admin/v1/workspaces/not-the-real-workspace/${EXPORT_PATH}`, { headers: { cookie } });
  assert.equal(status.status, 404);
});

test("export-site: workspaceId can never actually be undefined through real routing on either route (a matched `:workspaceId` segment is always a populated string) -- their `?? \"\"` fallbacks are reached by calling the real handlers directly, the same type-bypass technique a `default: throw` exhaustiveness guard would need", async () => {
  const deps: RouteDeps = { ...testRouteDeps() };
  const app = createApp(deps);
  const routePath = `/api/admin/v1/workspaces/:workspaceId/${EXPORT_PATH}`;

  const postHandler = extractRouteHandler(app, "post", routePath);
  {
    const { res, capture } = createCapturingResponse();
    const req = { params: { workspaceId: undefined }, body: {} } as unknown as Parameters<typeof postHandler>[0];
    await postHandler(req, res);
    assert.equal(capture.statusCode, 404);
    assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
  }

  const getHandler = extractRouteHandler(app, "get", routePath);
  {
    const { res, capture } = createCapturingResponse();
    const req = { params: { workspaceId: undefined } } as unknown as Parameters<typeof getHandler>[0];
    await getHandler(req, res);
    assert.equal(capture.statusCode, 404);
    assert.deepEqual(capture.jsonBody, { error: "workspace was not found" });
  }
});

test("export-site: the status poll starts idle before any trigger has run in this process", async (t) => {
  const deps: RouteDeps = { ...testRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${EXPORT_PATH}`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { status: "idle", startedAtIso: null, finishedAtIso: null, outputDir: null });
});

test("export-site: a malformed trigger body 400s and never starts a run", async (t) => {
  const deps: RouteDeps = { ...testRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${EXPORT_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ clean: "yes" }),
  });
  assert.equal(res.status, 400);
});

test("export-site: a non-object (array) trigger body 400s -- 'request body must be a JSON object'", async (t) => {
  const deps: RouteDeps = { ...testRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${EXPORT_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(["not", "an", "object"]),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /must be a JSON object/);
});

test("export-site: a 'basePath' of the wrong type 400s", async (t) => {
  const deps: RouteDeps = { ...testRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${EXPORT_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ basePath: 12345 }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /'basePath' must be a string/);
});

test("export-site: authorize() throwing (not just denying) 500s on both the trigger and the status poll, and never touches the run state", async (t) => {
  const deps: RouteDeps = {
    ...testRouteDeps(),
    authorize: async () => {
      throw new Error("boom");
    },
  };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const trigger = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${EXPORT_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(trigger.status, 500);

  const status = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${EXPORT_PATH}`, { headers: { cookie } });
  assert.equal(status.status, 500);
});

test("export-site: trigger starts a real run (202), honors a real 'basePath', a concurrent second trigger gets 409, and the poll settles to an honest completed report", async (t) => {
  const deps: RouteDeps = { ...testRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  t.after(() => rmSync(exportOutputDir, { recursive: true, force: true }));

  // A real, valid, non-blank `basePath` (the GitHub Pages PROJECT-site case, per this route's own
  // file-header doc) -- exercises `normalizeBasePath`'s "keep it" branch and
  // `parseTriggerRequestBody`'s matching `{ basePath }` spread, neither of which any other test in
  // this file reaches (they only ever send no body, an invalid-type basePath, or omit it).
  const trigger = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${EXPORT_PATH}`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ basePath: "/preview" }),
  });
  assert.equal(trigger.status, 202);
  const triggerBody = await trigger.json();
  assert.equal(triggerBody.status, "running");
  assert.equal(triggerBody.outputDir, exportOutputDir);
  assert.equal(triggerBody.finishedAtIso, null);
  // `basePath` is only ever present once `status` is `"completed"` (`ExportRunSnapshot`'s own
  // doc) -- the immediate "running" snapshot never carries it, so it's checked below instead.
  assert.equal(triggerBody.basePath, undefined);

  // Fired immediately, no delay — the real export is still mid-flight (it drives multiple real
  // HTTP round trips against its own in-process listener, see `site-exporter.ts`), so this must
  // observe "already running", never silently queue or silently drop the second request.
  const second = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${EXPORT_PATH}`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(second.status, 409);

  let finalStatusBody: { status: string; [key: string]: unknown } = { status: "running" };
  for (let attempt = 0; attempt < 100 && finalStatusBody.status === "running"; attempt++) {
    await delay(50);
    const poll = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${EXPORT_PATH}`, { headers: { cookie } });
    assert.equal(poll.status, 200);
    finalStatusBody = await poll.json();
  }

  assert.equal(finalStatusBody.status, "completed", `export did not settle in time: ${JSON.stringify(finalStatusBody)}`);
  assert.equal(finalStatusBody.ok, true);
  assert.equal(finalStatusBody.outputDir, exportOutputDir);
  assert.equal(finalStatusBody.basePath, "/preview", "the completed report must carry the basePath the trigger was given");
  assert.ok(finalStatusBody.finishedAtIso, "a completed run must carry a finish timestamp");
  const counts = finalStatusBody.counts as { routesSucceeded: number; routesFailed: number };
  assert.ok(counts.routesSucceeded > 0, "the hermetic fixture's own routes must have actually exported");
  assert.equal(counts.routesFailed, 0);
  assert.deepEqual(finalStatusBody.failedRoutes, []);
  assert.deepEqual(finalStatusBody.failedAssets, []);
});

test("export-site: req.body can never actually be undefined through this app's real composition (the global express.json() in app.ts always defaults it to {}) -- parseTriggerRequestBody's `body === undefined` branch is reached by calling the real handler directly with an explicitly undefined body, the same type-bypass technique a `default: throw` exhaustiveness guard would need; the trigger still starts a real, honest export", async (t) => {
  const ownOutputDir = mkdtempSync(path.join(tmpdir(), "tovu-export-route-test-bypass-"));
  t.after(() => rmSync(ownOutputDir, { recursive: true, force: true }));
  const deps: RouteDeps = {
    ...testRouteDeps(),
    exportOutputRootDir: ownOutputDir,
    // No `requireAdminSession` middleware runs on a directly-invoked handler, and the fake
    // principal below isn't a real seeded identity the real `authorize()` would recognize -- stub
    // it permissive, same technique the other route test files' isolated (non-createApp) suites use.
    authorize: async () => ({ allowed: true, reason: "matched" }),
  };
  const app = createApp(deps);
  const routePath = `/api/admin/v1/workspaces/:workspaceId/${EXPORT_PATH}`;
  const postHandler = extractRouteHandler(app, "post", routePath);
  const getHandler = extractRouteHandler(app, "get", routePath);

  const { res: triggerRes, capture: triggerCapture } = createCapturingResponse();
  triggerRes.locals.principal = { id: "test-principal" };
  const triggerReq = {
    params: { workspaceId: deps.workspaceId },
    body: undefined,
  } as unknown as Parameters<typeof postHandler>[0];
  await postHandler(triggerReq, triggerRes);
  assert.equal(triggerCapture.statusCode, 202, JSON.stringify(triggerCapture.jsonBody));
  assert.equal((triggerCapture.jsonBody as { status: string }).status, "running");

  let finalStatusBody: { status: string; [key: string]: unknown } = { status: "running" };
  for (let attempt = 0; attempt < 100 && finalStatusBody.status === "running"; attempt++) {
    await delay(50);
    const { res: pollRes, capture: pollCapture } = createCapturingResponse();
    pollRes.locals.principal = { id: "test-principal" };
    const pollReq = { params: { workspaceId: deps.workspaceId } } as unknown as Parameters<typeof getHandler>[0];
    await getHandler(pollReq, pollRes);
    assert.equal(pollCapture.statusCode, 200);
    finalStatusBody = pollCapture.jsonBody as typeof finalStatusBody;
  }

  assert.equal(finalStatusBody.status, "completed", `export did not settle in time: ${JSON.stringify(finalStatusBody)}`);
  assert.equal(finalStatusBody.ok, true);
  assert.equal(finalStatusBody.outputDir, ownOutputDir);
});
