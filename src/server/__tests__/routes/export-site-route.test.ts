import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { createApp, createRouteDeps } from "../../app";
import { bootAuthenticated } from "../helpers/http-test-server";
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

test("export-site: trigger starts a real run (202), a concurrent second trigger gets 409, and the poll settles to an honest completed report", async (t) => {
  const deps: RouteDeps = { ...testRouteDeps() };
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  t.after(() => rmSync(exportOutputDir, { recursive: true, force: true }));

  const trigger = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/${EXPORT_PATH}`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(trigger.status, 202);
  const triggerBody = await trigger.json();
  assert.equal(triggerBody.status, "running");
  assert.equal(triggerBody.outputDir, exportOutputDir);
  assert.equal(triggerBody.finishedAtIso, null);

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
  assert.ok(finalStatusBody.finishedAtIso, "a completed run must carry a finish timestamp");
  const counts = finalStatusBody.counts as { routesSucceeded: number; routesFailed: number };
  assert.ok(counts.routesSucceeded > 0, "the hermetic fixture's own routes must have actually exported");
  assert.equal(counts.routesFailed, 0);
  assert.deepEqual(finalStatusBody.failedRoutes, []);
  assert.deepEqual(finalStatusBody.failedAssets, []);
});
