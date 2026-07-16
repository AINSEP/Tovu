import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated } from "../helpers/http-test-server";
import { createRouteDeps } from "../../app";
import { acquireOperationLock, releaseOperationLock } from "../../../core/operation-lock";
import { registerAuthRoutes, requireAdminSession } from "../../middleware/dev-auth";
import { registerAdminRecoveryRestoreRoutes } from "../../routes/admin/recovery/restore";
import type { RouteDeps } from "../../routes/types";

/**
 * Registers a principal with a login but no role/policy grants at all — mirrors
 * `admin-media-routes.test.ts`'s `loginAsBarePrincipal`. Proves the AUD-001 fix: `/execute`
 * now rejects an unauthorized caller via an inline `authorize()` check, before ever reaching
 * `executeRestore`'s lock acquisition.
 */
async function loginAsBarePrincipal(deps: RouteDeps, baseUrl: string): Promise<string> {
  await deps.identityReady;
  const bareId = "bare-principal-restore";
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
    username: "bare-restore",
    passwordHash: await deps.passwordHasher.hash("bare-pw"),
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "bare-restore", password: "bare-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

/**
 * @file SPEC-019 C-301/C-302/C-303 — real-HTTP integration tests for the recovery `restore`
 * gated-mutation route triple (this dispatch). Mirrors
 * `taxonomy-merge-term-routes.test.ts`'s pattern.
 */
function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));

  registerAdminRecoveryRestoreRoutes(app, deps);
  return { app, deps };
}

async function seedRestorePoint(deps: RouteDeps): Promise<string> {
  await deps.restorePointsRepo.save({
    restorePointId: "rp-1",
    idempotencyKey: "rp-1-key",
    trigger: "manual",
    createdAt: "2026-07-15T00:00:00.000Z",
    createdBy: "user-1",
    costClass: "cheap",
    kind: "file-snapshot",
    watermarkAtCapture: 0,
  });
  return "rp-1";
}

test("recovery restore: plan -> confirm -> execute succeeds end-to-end and records a real ledger row", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const restorePointId = await seedRestorePoint(deps);

  const planRes = await fetch(`${baseUrl}/api/admin/v1/recovery/restore/plan`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ restorePointId }),
  });
  assert.equal(planRes.status, 200);
  const planBody = (await planRes.json()) as { planId: string; planHash: string };

  const confirmRes = await fetch(`${baseUrl}/api/admin/v1/recovery/restore/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ planId: planBody.planId, planHash: planBody.planHash, disclosureAcknowledged: true }),
  });
  assert.equal(confirmRes.status, 200);
  const { confirmationToken } = (await confirmRes.json()) as { confirmationToken: string };
  assert.ok(confirmationToken);

  const executeRes = await fetch(`${baseUrl}/api/admin/v1/recovery/restore/execute`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ confirmationToken, restorePointId }),
  });
  assert.equal(executeRes.status, 200);
  const executed = (await executeRes.json()) as { restoreRunId: string; state: string; storageTimelineDeepLink?: { intent: string } };
  assert.equal(executed.state, "RESTORED");
  assert.ok(executed.restoreRunId);
  assert.equal(executed.storageTimelineDeepLink?.intent, "view", "a RESTORED completion attaches the Storage Timeline deep link (REQ-16/AC-26)");

  const ledger = await deps.storageLedgerRepo.query({ limit: 10 });
  assert.equal(ledger.items.length, 1);
  assert.equal(ledger.items[0].kind, "restore.executed");
  assert.equal(ledger.items[0].outcome, "success");
});

test("recovery restore: confirm without disclosureAcknowledged===true mints no token (INV-02)", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const restorePointId = await seedRestorePoint(deps);

  const planRes = await fetch(`${baseUrl}/api/admin/v1/recovery/restore/plan`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ restorePointId }),
  });
  const planBody = (await planRes.json()) as { planId: string; planHash: string };

  const confirmRes = await fetch(`${baseUrl}/api/admin/v1/recovery/restore/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ planId: planBody.planId, planHash: planBody.planHash, disclosureAcknowledged: "true" }),
  });
  assert.equal(confirmRes.status, 400);
  const body = (await confirmRes.json()) as { code: string };
  assert.equal(body.code, "VALIDATION_ERROR");
});

test("recovery restore: a stale plan (restorePointId changed between confirm and execute) is rejected PLAN_STALE", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const restorePointId = await seedRestorePoint(deps);
  await deps.restorePointsRepo.save({
    restorePointId: "rp-2",
    idempotencyKey: "rp-2-key",
    trigger: "manual",
    createdAt: "2026-07-15T00:05:00.000Z",
    createdBy: "user-1",
    costClass: "cheap",
    kind: "file-snapshot",
    watermarkAtCapture: 1,
  });

  const planRes = await fetch(`${baseUrl}/api/admin/v1/recovery/restore/plan`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ restorePointId }),
  });
  const planBody = (await planRes.json()) as { planId: string; planHash: string };

  const confirmRes = await fetch(`${baseUrl}/api/admin/v1/recovery/restore/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ planId: planBody.planId, planHash: planBody.planHash, disclosureAcknowledged: true }),
  });
  const { confirmationToken } = (await confirmRes.json()) as { confirmationToken: string };

  // Execute against a DIFFERENT restorePointId than the one planned/confirmed — the live-recomputed
  // hash diverges from the redeemed token's, so this must fail closed rather than silently restore
  // the wrong snapshot.
  const executeRes = await fetch(`${baseUrl}/api/admin/v1/recovery/restore/execute`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ confirmationToken, restorePointId: "rp-2" }),
  });
  assert.equal(executeRes.status, 409);
  const body = (await executeRes.json()) as { code: string };
  assert.equal(body.code, "PLAN_STALE");
});

test("recovery restore: replaying an already-redeemed confirmation token is rejected TOKEN_ALREADY_REDEEMED", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const restorePointId = await seedRestorePoint(deps);

  const planRes = await fetch(`${baseUrl}/api/admin/v1/recovery/restore/plan`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ restorePointId }),
  });
  const planBody = (await planRes.json()) as { planId: string; planHash: string };

  const confirmRes = await fetch(`${baseUrl}/api/admin/v1/recovery/restore/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ planId: planBody.planId, planHash: planBody.planHash, disclosureAcknowledged: true }),
  });
  const { confirmationToken } = (await confirmRes.json()) as { confirmationToken: string };

  const firstExecuteRes = await fetch(`${baseUrl}/api/admin/v1/recovery/restore/execute`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ confirmationToken, restorePointId }),
  });
  assert.equal(firstExecuteRes.status, 200);

  const replayRes = await fetch(`${baseUrl}/api/admin/v1/recovery/restore/execute`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ confirmationToken, restorePointId }),
  });
  assert.equal(replayRes.status, 409);
  const body = (await replayRes.json()) as { code: string };
  assert.equal(body.code, "TOKEN_ALREADY_REDEEMED");
});

test("AUD-001 regression: an unauthorized (bare) principal is rejected at /execute before any lock acquisition, with any confirmationToken", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);

  const executeRes = await fetch(`${baseUrl}/api/admin/v1/recovery/restore/execute`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: bareCookie },
    body: JSON.stringify({ confirmationToken: "not-a-real-token-and-should-never-be-checked", restorePointId: "rp-1" }),
  });
  assert.equal(executeRes.status, 403);
  const body = (await executeRes.json()) as { code: string; details: { permission: string } };
  assert.equal(body.code, "NOT_AUTHORIZED");
  assert.equal(body.details.permission, "backup.restore");
  // Note (ext audit round 2 / Fable): pre-fix code ALSO produced code "NOT_AUTHORIZED" via the
  // gateway's own rejection (just after acquiring/releasing the lock) -- `details.permission`'s
  // presence is this test's only real discriminator. See the next test for a status-code-level
  // proof (403 vs 409) that doesn't depend on response-shape details.
});

test("AUD-001 regression (ordering proof, ext audit round 2 / Fable): authorize() runs before any lock-acquisition attempt", async (t) => {
  // Same technique as storage-migrate-forward-routes.test.ts's sibling test: hold the site's
  // operation lock ourselves first, then have a bare (zero-grant) principal hit /execute.
  // Pre-fix, the route reached executeRestore's acquireOperationLock call before ever checking
  // authorization, so it would observe the lock already held and return 409
  // RESTORE_OPERATION_IN_FLIGHT. Post-fix, authorize() rejects before the route ever attempts
  // to acquire the lock, so the response is 403 regardless of the pre-held lock.
  const { app, deps } = buildTestApp();
  const { baseUrl } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);

  const held = await acquireOperationLock({
    deps: { clock: deps.clock },
    input: { siteId: deps.workspaceId, operationKind: "restore" },
  });
  assert.equal(held.ok, true, "test setup: must hold the lock before the request");

  try {
    const executeRes = await fetch(`${baseUrl}/api/admin/v1/recovery/restore/execute`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: bareCookie },
      body: JSON.stringify({ confirmationToken: "not-a-real-token-and-should-never-be-checked", restorePointId: "rp-1" }),
    });
    assert.equal(
      executeRes.status,
      403,
      "expected 403 (authorize rejected before ever attempting to acquire the lock) -- a 409 here would mean the route tried to acquire the lock (and found it held) before checking authorization, i.e. AUD-001 has regressed"
    );
    const body = (await executeRes.json()) as { code: string };
    assert.equal(body.code, "NOT_AUTHORIZED");
  } finally {
    if (held.ok) {
      await releaseOperationLock({ deps: { clock: deps.clock }, input: { siteId: deps.workspaceId, handle: held.value } });
    }
  }
});
