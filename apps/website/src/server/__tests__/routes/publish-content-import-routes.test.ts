import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { confirm as gatewayConfirm, ForbiddenError } from "#src/contracts/core/gated-mutations/gateway";
import { buildGatewayDeps, buildConfirmOnlyHooks } from "#src/contracts/core/gated-mutations/composition";

/**
 * @file Task 7 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 7.
 *
 * Real-HTTP integration tests for the `publish_content` gated import ceremony
 * (`import/{plan,confirm,execute}`), mirroring `taxonomy-merge-term-routes.test.ts`'s and
 * `publish-content-bundles.test.ts`'s own harness. The "agent principal cannot confirm" property
 * is proved at the gateway level directly (last test below), not via HTTP — every route in this
 * codebase's session-cookie auth resolves to a `kind: 'user'` principal (`composition.ts`'s own
 * disclosed narrowing), so an HTTP request literally cannot construct an `agent`-kind caller here.
 */

const WORKSPACE = "workspace-local";

async function startServer(deps: ReturnType<typeof createRouteDeps> = createRouteDeps()) {
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return { deps, server, baseUrl: `http://127.0.0.1:${address.port}` };
}

/** Reads a response body as text exactly once and parses it as JSON, asserting `status` against
 *  that same single read — avoids the classic "Body is unusable: Body has already been read"
 *  double-consume bug a `assert.equal(res.status, N, await res.text())` followed by `res.json()`
 *  would otherwise trigger even on the PASSING path (the template literal always evaluates). */
async function expectJson<T>(res: Response, status: number): Promise<T> {
  const raw = await res.text();
  assert.equal(res.status, status, raw);
  return JSON.parse(raw) as T;
}

async function loginAsOwner(baseUrl: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "tovu-dev" }),
  });
  assert.equal(res.status, 200, await res.text());
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}

/** Creates a post, exports it, and stages the export as an import bundle — a realistic self-import
 *  round trip that needs no hand-built bundle-envelope fixture. */
async function stagePostBundle(baseUrl: string, cookie: string, title: string): Promise<{ bundleId: string; postId: string }> {
  const createRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/posts`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ title }),
  });
  const { post } = await expectJson<{ post: { id: string } }>(createRes, 201);

  const exportRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/export`, { headers: { cookie } });
  const bundle = await expectJson<Record<string, unknown>>(exportRes, 200);

  const stageRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/bundles`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(bundle),
  });
  const { bundleId } = await expectJson<{ bundleId: string }>(stageRes, 201);
  return { bundleId, postId: post.id };
}

async function planAndConfirm(baseUrl: string, cookie: string, bundleId: string): Promise<string> {
  const planRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/import/plan`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ bundleId }),
  });
  const planBody = await expectJson<{ planId: string; planHash: string }>(planRes, 200);

  const confirmRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/import/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ planId: planBody.planId, planHash: planBody.planHash }),
  });
  const { confirmationToken } = await expectJson<{ confirmationToken: string }>(confirmRes, 200);
  return confirmationToken;
}

test("publish-content import: plan -> confirm -> execute reaches the Task 8 seam and captures a restore point first", async (t) => {
  const { deps, server, baseUrl } = await startServer();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const cookie = await loginAsOwner(baseUrl);

  // A fake Task 8 apply port, so this test proves the WIRING (restore point captured, apply seam
  // reached with the right report) rather than Task 8's own not-yet-built apply loop.
  const savedRestorePoints: unknown[] = [];
  const originalSave = deps.restorePointsRepo.save.bind(deps.restorePointsRepo);
  deps.restorePointsRepo.save = async (row) => {
    savedRestorePoints.push(row);
    return originalSave(row);
  };
  let appliedReportRows = -1;
  deps.publishContentApplyPort = {
    applyReport: async ({ report }) => {
      appliedReportRows = report.rows.length;
      return { changeSetIds: ["fake-change-set-1"] };
    },
  };

  const { bundleId } = await stagePostBundle(baseUrl, cookie, "Round trip post");
  const confirmationToken = await planAndConfirm(baseUrl, cookie, bundleId);

  const executeRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/import/execute`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ bundleId, confirmationToken }),
  });
  const executed = await expectJson<{ restorePointId: string; changeSetIds: string[] }>(executeRes, 200);
  assert.ok(executed.restorePointId, "executeMutation must capture and return a restore point id");
  assert.deepEqual(executed.changeSetIds, ["fake-change-set-1"]);
  assert.equal(savedRestorePoints.length, 1, "the restore point must be persisted exactly once, before the apply seam runs");
  // >= 1, not === 1: this hermetic composition's default fixture data already seeds some posts
  // alongside the one this test creates, so the export/report legitimately contains more than one
  // row. The property under test is "the apply seam is reached with a real, non-empty report", not
  // an exact row count.
  assert.ok(appliedReportRows >= 1, "the apply seam must receive the freshly re-derived report");
});

test("publish-content import: a destination edit between confirm and execute is rejected PLAN_STALE, never silently applied", async (t) => {
  const { deps, server, baseUrl } = await startServer();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const cookie = await loginAsOwner(baseUrl);
  deps.publishContentApplyPort = { applyReport: async () => ({ changeSetIds: [] }) };

  const { bundleId, postId } = await stagePostBundle(baseUrl, cookie, "Stale plan post");
  const confirmationToken = await planAndConfirm(baseUrl, cookie, bundleId);

  // Mutate the destination directly (simulating a second author's edit) strictly between confirm
  // and execute — mirrors `taxonomy-merge-term-routes.test.ts`'s identical direct-repo-write pattern.
  const found = await deps.postRepo.findById({ workspaceId: WORKSPACE, id: postId });
  assert.ok(found, "the post created for this fixture must exist");
  await deps.postRepo.save({ ...found, title: "Edited on the destination after confirm", version: found.version + 1, updatedAt: deps.clock.nowIso() });

  const executeRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/import/execute`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ bundleId, confirmationToken }),
  });
  assert.equal(executeRes.status, 409);
  const body = (await executeRes.json()) as { code: string };
  assert.equal(body.code, "PLAN_STALE");

  // Never silently applied: the destination keeps the post-confirm edit, not the bundle's content.
  const after = await deps.postRepo.findById({ workspaceId: WORKSPACE, id: postId });
  assert.equal(after?.title, "Edited on the destination after confirm");
});

test("publish-content import: replaying an already-redeemed confirmation token is rejected TOKEN_ALREADY_REDEEMED", async (t) => {
  const { deps, server, baseUrl } = await startServer();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const cookie = await loginAsOwner(baseUrl);
  deps.publishContentApplyPort = { applyReport: async () => ({ changeSetIds: [] }) };

  const { bundleId } = await stagePostBundle(baseUrl, cookie, "Replay token post");
  const confirmationToken = await planAndConfirm(baseUrl, cookie, bundleId);

  // First execute redeems the token (gateway.execute()'s step 5 redeems BEFORE calling
  // executeMutation() — the token is consumed here regardless of whether the apply seam itself
  // succeeds or throws).
  await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/import/execute`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ bundleId, confirmationToken }),
  });

  const replayRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/import/execute`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ bundleId, confirmationToken }),
  });
  assert.equal(replayRes.status, 409);
  const body = (await replayRes.json()) as { code: string };
  assert.equal(body.code, "TOKEN_ALREADY_REDEEMED");
});

test("publish-content import: execute refuses RESTORE_POINT_UNAVAILABLE with no override when the site's restore-point mechanism is unavailable", async (t) => {
  const { deps, server, baseUrl } = await startServer();
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const cookie = await loginAsOwner(baseUrl);

  let captureCalled = false;
  deps.dbOps = {
    ...deps.dbOps,
    getCapabilities: async () => ({ restorePoint: { costClass: "unavailable" as const, kind: "file-snapshot" as const } }),
    captureRestorePoint: async (params) => {
      captureCalled = true;
      return deps.dbOps.captureRestorePoint(params);
    },
  };

  const { bundleId } = await stagePostBundle(baseUrl, cookie, "Unavailable restore post");
  const confirmationToken = await planAndConfirm(baseUrl, cookie, bundleId);

  const executeRes = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/import/execute`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ bundleId, confirmationToken }),
  });
  assert.equal(executeRes.status, 409);
  const body = (await executeRes.json()) as { code: string };
  assert.equal(body.code, "RESTORE_POINT_UNAVAILABLE");
  assert.equal(captureCalled, false, "an unavailable costClass must refuse BEFORE ever attempting to capture a restore point — no override path");
});

test("gated-mutations gateway: an agent principal can never confirm a publish-content import plan", async () => {
  const deps = buildGatewayDeps({
    clock: { nowIso: () => new Date().toISOString() },
    idGen: { newId: () => "plan-1" },
    authorize: async () => ({ allowed: true, reason: "test-always-allow" }),
  });
  const hooks = buildConfirmOnlyHooks({
    domain: "publish_content.import",
    readPermission: "publish_content.read",
    mutatePermission: "publish_content.apply",
    scopeId: WORKSPACE,
  });

  await assert.rejects(
    () =>
      gatewayConfirm({
        deps,
        principalId: "agent-principal-1",
        principalKind: "agent",
        hooks,
        planId: "plan-1",
        planHash: "hash-1",
      }),
    (err: unknown) => err instanceof ForbiddenError && err.reasonCode === "AGENT_CANNOT_CONFIRM"
  );
});
