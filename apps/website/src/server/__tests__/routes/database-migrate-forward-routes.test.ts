import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated, createCapturingResponse, extractRouteHandler } from "../helpers/http-test-server.js";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { acquireOperationLock, releaseOperationLock } from "#src/contracts/core/operation-lock";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerAdminDatabaseMigrateForwardRoutes } from "../../inbound/admin-http/routes/database/migrate-forward.js";
import type { RouteDeps } from "../../routes/types.js";

/**
 * Registers a principal with a login but no role/policy grants at all — mirrors
 * `admin-media-routes.test.ts`'s `loginAsBarePrincipal`. Proves the AUD-001 fix: `/execute`
 * now rejects an unauthorized caller via an inline `authorize()` check, before ever reaching
 * `executeMigrateForward`'s lock acquisition.
 */
async function loginAsBarePrincipal(deps: RouteDeps, baseUrl: string): Promise<string> {
  await deps.identityReady;
  const bareId = "bare-principal-migrate-forward";
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
    username: "bare-migrate-forward",
    passwordHash: await deps.passwordHasher.hash({ password: "bare-pw" }),
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "bare-migrate-forward", password: "bare-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

/**
 * @file SPEC-017 C-103/C-105 — real-HTTP integration tests for the database `migrate-forward`
 * gated-mutation route triple (this dispatch). Mirrors
 * `taxonomy-merge-term-routes.test.ts`'s pattern.
 */

let grantCounter = 0;

/** Registers a principal holding ONLY the given permission strings, via a workspace-scoped custom
 * policy grant — never the seeded owner, never a role. Mirrors `comments-settings-routes.test.ts`'s
 * `loginWithPermissions` pattern. Used to prove `database.migrate`'s `scopeKind: "instance"` fix
 * (2026-08-12): a principal legitimately holding `database.migrate` within ITS workspace must
 * still be refused, because `executeMutation()`'s `dbOps.captureRestorePoint` call produces a
 * whole-`content.db` backup artifact (every workspace's data, not just the caller's) and feeds a
 * restore-points subsystem `backup.restore` (same `scopeKind` reasoning) treats as instance-wide. */
async function loginWithPermissions(deps: RouteDeps, baseUrl: string, permissions: readonly string[]): Promise<string> {
  await deps.identityReady;
  const suffix = `${++grantCounter}`;
  const principalId = `grant-principal-migrate-forward-${suffix}`;
  const policyId = `grant-policy-migrate-forward-${suffix}`;
  const username = `grant-migrate-forward-${suffix}`;

  await deps.principalRepo.save({
    id: principalId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: `Grants: ${permissions.join(", ")}`,
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId,
    workspaceId: deps.workspaceId,
    username,
    passwordHash: await deps.passwordHasher.hash({ password: "grant-pw" }),
  });
  await deps.policyRepo.save({ id: policyId, workspaceId: deps.workspaceId, name: `grant-policy-${suffix}`, isBuiltin: false, isFrozen: false });
  for (const permission of permissions) {
    await deps.policyPermissionRepo.save({
      id: `grant-pp-${suffix}-${permission}`,
      workspaceId: deps.workspaceId,
      policyId,
      permission,
      resourceType: null,
      constraintJson: null,
    });
  }
  await deps.principalPolicyRepo.save({ id: `grant-link-${suffix}`, workspaceId: deps.workspaceId, principalId, policyId });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: "grant-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}
function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps: RouteDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));

  registerAdminDatabaseMigrateForwardRoutes(app, deps);
  return { app, deps };
}

test("database migrate-forward: plan -> confirm -> execute succeeds end-to-end and records a restore point + ledger row", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const planRes = await fetch(`${baseUrl}/api/admin/v1/database/migrate-forward/plan`, { method: "POST", headers: { cookie } });
  assert.equal(planRes.status, 200);
  const planBody = (await planRes.json()) as { planId: string; planHash: string; details: { costClass: string } };
  assert.equal(planBody.details.costClass, "cheap");

  const confirmRes = await fetch(`${baseUrl}/api/admin/v1/database/migrate-forward/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ planId: planBody.planId, planHash: planBody.planHash }),
  });
  assert.equal(confirmRes.status, 200);
  const { confirmationToken } = (await confirmRes.json()) as { confirmationToken: string };

  const executeRes = await fetch(`${baseUrl}/api/admin/v1/database/migrate-forward/execute`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ confirmationToken }),
  });
  assert.equal(executeRes.status, 200);
  const executed = (await executeRes.json()) as { migrated: true };
  assert.equal(executed.migrated, true);

  const restorePoints = await deps.restorePointsRepo.list();
  assert.equal(restorePoints.length, 1);
  assert.equal(restorePoints[0].trigger, "migrate-forward");

  const ledger = await deps.databaseLedgerRepo.query({ limit: 10 });
  assert.equal(ledger.items.length, 1);
  assert.equal(ledger.items[0].kind, "core.migration");
  assert.equal(ledger.items[0].outcome, "success");
});

test("database migrate-forward: a forged hash is rejected at execute without effects and releases the operation lock", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const planRes = await fetch(`${baseUrl}/api/admin/v1/database/migrate-forward/plan`, { method: "POST", headers: { cookie } });
  const planBody = (await planRes.json()) as { planId: string; planHash: string };

  // confirm() itself doesn't re-derive the plan (only execute() does, per CIC U-001-B3) — so the
  // stale-hash rejection this route triple exercises is at execute() time (below), not confirm()'s
  // own permission-only check. A malformed/forged planHash at confirm time is still accepted by
  // confirm() (it only mints a token bound to whatever hash it's given); the mismatch surfaces
  // when execute() re-derives the live hash and compares.
  const confirmRes = await fetch(`${baseUrl}/api/admin/v1/database/migrate-forward/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ planId: planBody.planId, planHash: "forged-hash-does-not-match-any-real-plan" }),
  });
  assert.equal(confirmRes.status, 200);
  const { confirmationToken } = (await confirmRes.json()) as { confirmationToken: string };

  const executeRes = await fetch(`${baseUrl}/api/admin/v1/database/migrate-forward/execute`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ confirmationToken }),
  });
  assert.equal(executeRes.status, 409);
  const body = (await executeRes.json()) as { code: string };
  assert.equal(body.code, "PLAN_STALE");
  assert.deepEqual(await deps.restorePointsRepo.list(), []);
  assert.deepEqual((await deps.databaseLedgerRepo.query({ limit: 10 })).items, []);

  const validPlan = await fetch(`${baseUrl}/api/admin/v1/database/migrate-forward/plan`, { method: "POST", headers: { cookie } });
  assert.equal(validPlan.status, 200);
  const valid = await validPlan.json() as { planId: string; planHash: string };
  const validConfirm = await fetch(`${baseUrl}/api/admin/v1/database/migrate-forward/confirm`, {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ planId: valid.planId, planHash: valid.planHash }),
  });
  assert.equal(validConfirm.status, 200);
  const confirmed = await validConfirm.json() as { confirmationToken: string };
  const validExecute = await fetch(`${baseUrl}/api/admin/v1/database/migrate-forward/execute`, {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ confirmationToken: confirmed.confirmationToken }),
  });
  assert.equal(validExecute.status, 200, "the rejected execution must release its lock");
  assert.equal((await validExecute.json() as { migrated: boolean }).migrated, true);
  assert.equal((await deps.restorePointsRepo.list()).length, 1);
  assert.equal((await deps.databaseLedgerRepo.query({ limit: 10 })).items.length, 1);
});

test("database migrate-forward: replaying an already-redeemed confirmation token is rejected TOKEN_ALREADY_REDEEMED", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const planRes = await fetch(`${baseUrl}/api/admin/v1/database/migrate-forward/plan`, { method: "POST", headers: { cookie } });
  const planBody = (await planRes.json()) as { planId: string; planHash: string };

  const confirmRes = await fetch(`${baseUrl}/api/admin/v1/database/migrate-forward/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ planId: planBody.planId, planHash: planBody.planHash }),
  });
  const { confirmationToken } = (await confirmRes.json()) as { confirmationToken: string };

  const firstExecuteRes = await fetch(`${baseUrl}/api/admin/v1/database/migrate-forward/execute`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ confirmationToken }),
  });
  assert.equal(firstExecuteRes.status, 200);

  const replayRes = await fetch(`${baseUrl}/api/admin/v1/database/migrate-forward/execute`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ confirmationToken }),
  });
  assert.equal(replayRes.status, 409);
  const body = (await replayRes.json()) as { code: string };
  assert.equal(body.code, "TOKEN_ALREADY_REDEEMED");
});

test("AUD-001 regression: an unauthorized (bare) principal is rejected at /execute before any lock acquisition, with any confirmationToken", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);

  const executeRes = await fetch(`${baseUrl}/api/admin/v1/database/migrate-forward/execute`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: bareCookie },
    body: JSON.stringify({ confirmationToken: "not-a-real-token-and-should-never-be-checked" }),
  });
  assert.equal(executeRes.status, 403);
  const body = (await executeRes.json()) as { code: string; details: { permission: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "database.migrate");

  // No restore point / ledger row was created — proves no mutation occurred. This alone
  // doesn't distinguish "never touched the lock" from "acquired-then-released the lock before
  // rejecting" (both pre- and post-fix code released the lock cleanly); see the next test for
  // the actual ordering proof.
  assert.equal((await deps.restorePointsRepo.list()).length, 0);
  assert.equal((await deps.databaseLedgerRepo.query({ limit: 10 })).items.length, 0);
});

test("AUD-001 regression (ordering proof, ext audit round 2 / Fable): authorize() runs before any lock-acquisition attempt", async (t) => {
  // Observational proof that doesn't require spying on the lock module (Node's mock.module()
  // needs an experimental flag in this repo's Node version): hold the site's operation lock
  // ourselves first, then have a bare (zero-grant) principal hit /execute. Pre-fix, the route
  // reached executeMigrateForward's acquireOperationLock call before ever checking
  // authorization, so it would observe the lock already held and return 409
  // OPERATION_IN_FLIGHT. Post-fix, authorize() rejects before the route ever attempts to
  // acquire the lock, so the pre-held lock is irrelevant and the response is 403 -- the
  // lock-acquisition attempt itself never happens.
  const { app, deps } = buildTestApp();
  const { baseUrl } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);

  const held = await acquireOperationLock({
    deps: { clock: deps.clock },
    input: { siteId: deps.workspaceId, operationKind: "migration" },
  });
  assert.equal(held.ok, true, "test setup: must hold the lock before the request");

  try {
    const executeRes = await fetch(`${baseUrl}/api/admin/v1/database/migrate-forward/execute`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: bareCookie },
      body: JSON.stringify({ confirmationToken: "not-a-real-token-and-should-never-be-checked" }),
    });
    assert.equal(
      executeRes.status,
      403,
      "expected 403 (authorize rejected before ever attempting to acquire the lock) -- a 409 here would mean the route tried to acquire the lock (and found it held) before checking authorization, i.e. AUD-001 has regressed"
    );
    const body = (await executeRes.json()) as { code: string };
    assert.equal(body.code, "FORBIDDEN");
  } finally {
    if (held.ok) {
      await releaseOperationLock({ deps: { clock: deps.clock }, input: { siteId: deps.workspaceId, handle: held.value } });
    }
  }
});

test("instance-scope fix (internal audit, 2026-08-12): a principal holding database.read+database.migrate via an ordinary WORKSPACE-scoped grant -- not the seeded owner -- is refused at plan, confirm, AND execute", async (t) => {
  // Before `buildMigrateForwardHooks` set `scopeKind: "instance"`, this exact grant shape would
  // have succeeded end-to-end: `captureRestorePoint` backs up the WHOLE `content.db` file (every
  // workspace's data), and the restore-points subsystem it feeds is not workspace-partitioned in
  // practice, so a grant scoped to one workspace must never be sufficient to trigger it. Only the
  // seeded owner (`buildOwnerOnlyInstanceAuthorize`) may pass now.
  const { app, deps } = buildTestApp();
  const { baseUrl } = await bootAuthenticated(app, t);
  const workspaceScopedCookie = await loginWithPermissions(deps, baseUrl, ["database.read", "database.migrate"]);

  const planRes = await fetch(`${baseUrl}/api/admin/v1/database/migrate-forward/plan`, {
    method: "POST",
    headers: { cookie: workspaceScopedCookie },
  });
  assert.equal(planRes.status, 403, "a workspace-scoped grant of database.read must not satisfy the instance-scoped read check");
  assert.equal(((await planRes.json()) as { code: string }).code, "NOT_AUTHORIZED");

  // confirm() mints a token bound to whatever planId/planHash it is given (it never re-derives the
  // plan -- only execute() does, per CIC U-001-B3) -- so a workspace-scoped grant can be proven
  // refused here without needing plan() to have actually succeeded first.
  const confirmRes = await fetch(`${baseUrl}/api/admin/v1/database/migrate-forward/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: workspaceScopedCookie },
    body: JSON.stringify({ planId: "arbitrary-plan-id", planHash: "arbitrary-plan-hash" }),
  });
  assert.equal(confirmRes.status, 403, "a workspace-scoped grant of database.migrate must not satisfy the instance-scoped mutate check at confirm()");
  assert.equal(((await confirmRes.json()) as { code: string }).code, "NOT_AUTHORIZED");

  const executeRes = await fetch(`${baseUrl}/api/admin/v1/database/migrate-forward/execute`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: workspaceScopedCookie },
    body: JSON.stringify({ confirmationToken: "not-a-real-token-and-should-never-be-checked" }),
  });
  assert.equal(executeRes.status, 403, "the route's own pre-lock AUD-001 check must also route through the instance-scoped evaluator, not a hardcoded workspace-scoped one");
  const executeBody = (await executeRes.json()) as { code: string; details: { permission: string } };
  assert.equal(executeBody.code, "FORBIDDEN");
  assert.equal(executeBody.details.permission, "database.migrate");
});


for (const [step, bodies] of [
  ["confirm", [undefined, {}, { planId: "id" }, { planId: 7, planHash: "hash" }, { planId: "id", planHash: 7 }]],
  ["execute", [undefined, {}, { confirmationToken: 7 }]],
] as const) {
  test(`migration ${step} rejects malformed bodies before any database effect`, async (t) => {
    const { app, deps } = buildTestApp();
    const { baseUrl, cookie } = await bootAuthenticated(app, t);
    const capture = t.mock.method(deps.dbOps, "captureRestorePoint");
    for (const body of bodies) {
      const response = await fetch(`${baseUrl}/api/admin/v1/database/migrate-forward/${step}`, {
        method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        error: step === "confirm" ? "'planId' and 'planHash' (strings) are required" : "'confirmationToken' (string) is required",
        code: "VALIDATION_ERROR",
      });
    }
    assert.equal(capture.mock.callCount(), 0);
    assert.deepEqual(await deps.restorePointsRepo.list(), []);
  });
}

for (const fault of [new Error("plan read failed"), "private plan failure"]) {
  test(`migration plan maps a capability-read failure (${typeof fault})`, async (t) => {
    const { app, deps } = buildTestApp();
    const { baseUrl, cookie } = await bootAuthenticated(app, t);
    const read = t.mock.method(deps.dbOps, "getCapabilities", async () => { throw fault; });
    const response = await fetch(`${baseUrl}/api/admin/v1/database/migrate-forward/plan`, { method: "POST", headers: { cookie } });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: fault instanceof Error ? fault.message : "internal error", code: "INTERNAL_ERROR" });
    assert.equal(read.mock.callCount(), 1);
    assert.deepEqual(await deps.restorePointsRepo.list(), []);
  });
}


test("migration refuses an unavailable restore capability before any capture", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const capabilities = await deps.dbOps.getCapabilities();
  t.mock.method(deps.dbOps, "getCapabilities", async () => ({ ...capabilities, restorePoint: { ...capabilities.restorePoint, costClass: "unavailable" as const } }));
  const capture = t.mock.method(deps.dbOps, "captureRestorePoint");
  const response = await fetch(`${baseUrl}/api/admin/v1/database/migrate-forward/execute`, {
    method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ confirmationToken: "unused" }),
  });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: `site '${deps.workspaceId}' has costClass 'unavailable' — the in-product forward migrate is refused with no attestation override`,
    code: "RESTORE_POINT_UNAVAILABLE",
  });
  assert.equal(capture.mock.callCount(), 0);
  assert.deepEqual(await deps.restorePointsRepo.list(), []);
});

test("an authorized migration reports the shared operation lock conflict without capturing", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const held = await acquireOperationLock({ deps: { clock: deps.clock }, input: { siteId: deps.workspaceId, operationKind: "restore" } });
  assert.ok(held.ok);
  try {
    const capture = t.mock.method(deps.dbOps, "captureRestorePoint");
    const response = await fetch(`${baseUrl}/api/admin/v1/database/migrate-forward/execute`, {
      method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ confirmationToken: "unused" }),
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "OPERATION_IN_FLIGHT");
    assert.equal(capture.mock.callCount(), 0);
    assert.deepEqual(await deps.restorePointsRepo.list(), []);
  } finally {
    await releaseOperationLock({ deps: { clock: deps.clock }, input: { siteId: deps.workspaceId, handle: held.value } });
  }
});

test("migration refuses an expired confirmation without capturing or recording a migration", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const prefix = `${baseUrl}/api/admin/v1/database/migrate-forward`;
  const planned = await fetch(`${prefix}/plan`, { method: "POST", headers: { cookie } });
  assert.equal(planned.status, 200);
  const { planId, planHash } = await planned.json();
  const confirmed = await fetch(`${prefix}/confirm`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ planId, planHash }) });
  assert.equal(confirmed.status, 200);
  const { confirmationToken } = await confirmed.json();
  const future = deps.gatedMutations.gatewayDeps.clock.nowMs() + 60 * 60 * 1000;
  t.mock.method(deps.gatedMutations.gatewayDeps.clock, "nowMs", () => future);
  const capture = t.mock.method(deps.dbOps, "captureRestorePoint");
  const response = await fetch(`${prefix}/execute`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ confirmationToken }) });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "TOKEN_EXPIRED");
  assert.equal(capture.mock.callCount(), 0);
  assert.deepEqual(await deps.restorePointsRepo.list(), []);
  assert.deepEqual((await deps.databaseLedgerRepo.query({ limit: 10 })).items, []);
});

for (const failure of [new Error("token store unavailable"), "private token failure"]) {
  test(`migration confirm maps failed token persistence (${typeof failure})`, async (t) => {
    const { app, deps } = buildTestApp();
    const { baseUrl, cookie } = await bootAuthenticated(app, t);
    const response = await fetch(`${baseUrl}/api/admin/v1/database/migrate-forward/plan`, { method: "POST", headers: { cookie } });
    assert.equal(response.status, 200);
    const { planId, planHash } = await response.json();
    const save = t.mock.method(deps.gatedMutations.gatewayDeps.tokens, "save", async () => { throw failure; });
    const confirmed = await fetch(`${baseUrl}/api/admin/v1/database/migrate-forward/confirm`, {
      method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ planId, planHash }),
    });
    assert.equal(confirmed.status, 500);
    assert.deepEqual(await confirmed.json(), { error: failure instanceof Error ? failure.message : "internal error", code: "INTERNAL_ERROR" });
    assert.equal(save.mock.callCount(), 1);
    assert.equal(await deps.gatedMutations.gatewayDeps.tokens.count(), 0);
    assert.deepEqual(await deps.restorePointsRepo.list(), []);
  });
}

/** Seeded owner principal, for the direct handler calls below that skip the session middleware. */
async function seededOwner(deps: RouteDeps): Promise<{ id: string }> {
  await deps.identityReady;
  const ownerUser = await deps.userRepo.findByUsername({ workspaceId: deps.workspaceId, username: "admin" });
  assert.ok(ownerUser, "expected the seeded admin user");
  const ownerPrincipal = await deps.principalRepo.findById({ workspaceId: deps.workspaceId, id: ownerUser.principalId });
  assert.ok(ownerPrincipal, "expected the seeded admin principal");
  return ownerPrincipal;
}

/** `req.body ?? {}`: real body-parser always assigns `req.body`, so a hand-built request with no
 *  `body` key is the only way to reach the guard (same convention as `content-types-routes.test.ts`). */
for (const [suffix, expectedError] of [
  ["confirm", "'planId' and 'planHash' (strings) are required"],
  ["execute", "'confirmationToken' (string) is required"],
] as const) {
  test(`database migrate-forward ${suffix}: a request with no body at all is a 400 VALIDATION_ERROR, not a crash`, async () => {
    const { app, deps } = buildTestApp();
    const handler = extractRouteHandler(app, "post", `/api/admin/v1/database/migrate-forward/${suffix}`);
    const { res, capture } = createCapturingResponse();
    res.locals.principal = await seededOwner(deps);

    await handler({ params: {} }, res);

    assert.equal(capture.statusCode, 400);
    assert.deepEqual(capture.jsonBody, { error: expectedError, code: "VALIDATION_ERROR" });
  });
}

test("database migrate-forward execute: a non-Error throw is a 500 with the generic message", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  deps.dbOps.getCapabilities = async () => {
    throw "capability probe offline";
  };

  const res = await fetch(`${baseUrl}/api/admin/v1/database/migrate-forward/execute`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ confirmationToken: "token" }),
  });
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "internal error", code: "INTERNAL_ERROR" });
});
