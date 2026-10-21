import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated, createCapturingResponse, extractRouteHandler } from "../helpers/http-test-server.js";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { acquireOperationLock, releaseOperationLock } from "#src/contracts/core/operation-lock";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerAdminRecoveryRestoreRoutes, sendRecoveryError } from "../../inbound/admin-http/routes/recovery/restore.js";
import type { RouteDeps } from "../../routes/types.js";
import { InMemoryMigrationRunsRepo } from "#src/features/database/repo.memory";

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
    passwordHash: await deps.passwordHasher.hash({ password: "bare-pw" }),
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

let grantCounter = 0;

/** Registers a principal holding ONLY the given permission strings, via a workspace-scoped custom
 * policy grant — never the seeded owner, never a role. Mirrors `comments-settings-routes.test.ts`'s
 * `loginWithPermissions` pattern. Used to prove `backup.restore`'s `scopeKind: "instance"` fix
 * (2026-08-12): a principal legitimately holding `backup.restore` within ITS workspace must still
 * be refused, because this ceremony's blast radius (`dbOps.restoreFromArtifact` swaps the whole
 * `content.db` file, which can hold more than one workspace — ADR-007/SPEC-044) is not something a
 * single workspace's grant was ever meant to cover. */
async function loginWithPermissions(deps: RouteDeps, baseUrl: string, permissions: readonly string[]): Promise<string> {
  await deps.identityReady;
  const suffix = `${++grantCounter}`;
  const principalId = `grant-principal-restore-${suffix}`;
  const policyId = `grant-policy-restore-${suffix}`;
  const username = `grant-restore-${suffix}`;

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
    artifactRef: "/snapshots/rp-1.db",
  });
  return "rp-1";
}

test("recovery restore: plan -> confirm -> execute succeeds end-to-end and records a real ledger row", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const restorePointId = await seedRestorePoint(deps);
  await deps.restorePointsRepo.save({ restorePointId: "newer-point", idempotencyKey: "newer-point-key", trigger: "manual",
    createdAt: "2026-07-15T00:05:00.000Z", createdBy: "user-1", artifactRef: "/snapshots/newer.db", watermarkAtCapture: 1 });
  const restoreCalls: Array<{ artifactRef: string }> = [];
  const restore = deps.dbOps.restoreFromArtifact.bind(deps.dbOps);
  deps.dbOps.restoreFromArtifact = async (input) => {
    restoreCalls.push(input);
    return restore(input);
  };
  const append = deps.databaseLedgerRepo.append.bind(deps.databaseLedgerRepo);
  deps.databaseLedgerRepo.append = async (row) => {
    assert.deepEqual(restoreCalls, [{ artifactRef: "/snapshots/rp-1.db" }], "restore the confirmed artifact before recording success");
    return append(row);
  };
  const migrations = new InMemoryMigrationRunsRepo();
  migrations.setNonTerminal({ id: "interrupted-memory-migration", status: "DDL_IN_PROGRESS" });
  const resolved: string[] = [];
  const markResolved = migrations.markResolved.bind(migrations);
  migrations.markResolved = async ({ id }) => {
    resolved.push(id);
    await markResolved({ id });
  };
  deps.migrationRunsRepo = migrations;
  await deps.siteStatusRepo.set(deps.workspaceId, "BLOCKED_PENDING_RECOVERY");

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
  const executed = (await executeRes.json()) as { restoreRunId: string; state: string; databaseTimelineDeepLink?: { intent: string } };
  assert.equal(executed.state, "RESTORED");
  assert.ok(executed.restoreRunId);
  assert.equal(executed.databaseTimelineDeepLink?.intent, "view", "a RESTORED completion attaches the Database Timeline deep link (REQ-16/AC-26)");

  const ledger = await deps.databaseLedgerRepo.query({ limit: 10 });
  assert.equal(ledger.items.length, 1);
  assert.equal(ledger.items[0].kind, "restore.executed");
  assert.equal(ledger.items[0].outcome, "success");
  assert.deepEqual(restoreCalls, [{ artifactRef: "/snapshots/rp-1.db" }]);
  assert.deepEqual(resolved, ["interrupted-memory-migration"]);
  assert.equal(await deps.migrationRunsRepo.findNonTerminalForSite(deps.workspaceId), null);
  assert.equal(await deps.siteStatusRepo.get(deps.workspaceId), "SERVING", "a restore that needs no restart must unblock the running process");
});

test("recovery restore: planning an unknown restore point is refused 404 RESTORE_POINT_NOT_FOUND, not deferred to a 500 at execute", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await seedRestorePoint(deps);

  const planRes = await fetch(`${baseUrl}/api/admin/v1/recovery/restore/plan`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ restorePointId: "no-such-point" }),
  });
  assert.equal(planRes.status, 404);
  assert.deepEqual(await planRes.json(), { error: "restore point 'no-such-point' was not found", code: "RESTORE_POINT_NOT_FOUND" });
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
  // Same technique as database-migrate-forward-routes.test.ts's sibling test: hold the site's
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

test("instance-scope fix (internal audit, 2026-08-12): a principal holding backup.read+backup.restore via an ordinary WORKSPACE-scoped grant -- not the seeded owner -- is refused at plan, confirm, AND execute", async (t) => {
  // Before `buildRestoreHooks` set `scopeKind: "instance"`, this exact grant shape would have
  // succeeded end-to-end: `content.db` can hold more than one workspace row (ADR-007/SPEC-044),
  // yet `dbOps.restoreFromArtifact` swaps the whole file, so a grant scoped to one workspace must
  // never be sufficient to approve replacing data belonging to every OTHER workspace that file
  // also holds. Only the seeded owner (`buildOwnerOnlyInstanceAuthorize`) may pass now.
  const { app, deps } = buildTestApp();
  const { baseUrl } = await bootAuthenticated(app, t);
  const restorePointId = await seedRestorePoint(deps);
  const workspaceScopedCookie = await loginWithPermissions(deps, baseUrl, ["backup.read", "backup.restore"]);

  const planRes = await fetch(`${baseUrl}/api/admin/v1/recovery/restore/plan`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: workspaceScopedCookie },
    body: JSON.stringify({ restorePointId }),
  });
  assert.equal(planRes.status, 403, "a workspace-scoped grant of backup.read must not satisfy the instance-scoped read check");
  assert.equal(((await planRes.json()) as { code: string }).code, "NOT_AUTHORIZED");

  // confirm() mints a token bound to whatever planId/planHash it is given (it never re-derives the
  // plan -- only execute() does, per CIC U-001-B3) -- so a workspace-scoped grant can be proven
  // refused here without needing plan() to have actually succeeded first.
  const confirmRes = await fetch(`${baseUrl}/api/admin/v1/recovery/restore/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: workspaceScopedCookie },
    body: JSON.stringify({ planId: "arbitrary-plan-id", planHash: "arbitrary-plan-hash", disclosureAcknowledged: true }),
  });
  assert.equal(confirmRes.status, 403, "a workspace-scoped grant of backup.restore must not satisfy the instance-scoped mutate check at confirm()");
  assert.equal(((await confirmRes.json()) as { code: string }).code, "NOT_AUTHORIZED");

  const executeRes = await fetch(`${baseUrl}/api/admin/v1/recovery/restore/execute`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: workspaceScopedCookie },
    body: JSON.stringify({ confirmationToken: "not-a-real-token-and-should-never-be-checked", restorePointId }),
  });
  assert.equal(executeRes.status, 403, "the route's own pre-lock AUD-001 check must also route through the instance-scoped evaluator, not a hardcoded workspace-scoped one");
  const executeBody = (await executeRes.json()) as { code: string; details: { permission: string } };
  assert.equal(executeBody.code, "NOT_AUTHORIZED");
  assert.equal(executeBody.details.permission, "backup.restore");
});

async function postJson(baseUrl: string, cookie: string, step: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/api/admin/v1/recovery/restore/${step}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

/** The seeded `admin` owner's real principal record — what `requireAdminSession` would have put on
 *  `res.locals` — for the direct-handler tests below. */
async function seededOwnerPrincipal(deps: RouteDeps): Promise<unknown> {
  await deps.identityReady;
  const ownerUser = await deps.userRepo.findByUsername({ workspaceId: deps.workspaceId, username: "admin" });
  assert.ok(ownerUser, "expected the seeded admin user");
  const ownerPrincipal = await deps.principalRepo.findById({ workspaceId: deps.workspaceId, id: ownerUser.principalId });
  assert.ok(ownerPrincipal, "expected the seeded admin principal");
  return ownerPrincipal;
}

test("recovery restore: plan/confirm/execute each reject a missing or non-string required field with 400 VALIDATION_ERROR", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const plan = await postJson(baseUrl, cookie, "plan", { restorePointId: 7 });
  assert.equal(plan.status, 400);
  assert.deepEqual(await plan.json(), { error: "'restorePointId' (string) is required", code: "VALIDATION_ERROR" });

  const confirm = await postJson(baseUrl, cookie, "confirm", { planId: "p-1" });
  assert.equal(confirm.status, 400);
  assert.deepEqual(await confirm.json(), { error: "'planId' and 'planHash' (strings) are required", code: "VALIDATION_ERROR" });

  const confirmNoId = await postJson(baseUrl, cookie, "confirm", { planHash: "h-1" });
  assert.equal(confirmNoId.status, 400);

  const execute = await postJson(baseUrl, cookie, "execute", { confirmationToken: "tok" });
  assert.equal(execute.status, 400);
  assert.deepEqual(await execute.json(), { error: "'confirmationToken' and 'restorePointId' (strings) are required", code: "VALIDATION_ERROR" });

  const executeNoToken = await postJson(baseUrl, cookie, "execute", { restorePointId: "rp-1" });
  assert.equal(executeNoToken.status, 400);
});

/** Real `body-parser` always assigns `req.body` (as `{}` at worst), so each route's `req.body?.`/
 *  `req.body ?? {}` fallback is only reachable by calling the registered handler directly with a
 *  body-less `req` (extractRouteHandler's own doc, `helpers/http-test-server.ts`). */
test("recovery restore: a body-less request (no req.body at all) is a 400 VALIDATION_ERROR on every step, never a TypeError 500", async () => {
  const { app, deps } = buildTestApp();
  const principal = await seededOwnerPrincipal(deps);

  for (const step of ["plan", "confirm", "execute"] as const) {
    const handler = extractRouteHandler(app, "post", `/api/admin/v1/recovery/restore/${step}`);
    const { res, capture } = createCapturingResponse();
    res.locals.principal = principal;
    await handler({}, res);
    assert.equal(capture.statusCode, 400, step);
    assert.equal((capture.jsonBody as { code: string }).code, "VALIDATION_ERROR", step);
  }
});

test("recovery restore: plan surfaces a throwing dbOps capability probe as 500 INTERNAL_ERROR (its message, or a generic one for a non-Error)", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const restorePointId = await seedRestorePoint(deps);

  deps.dbOps.getCapabilities = async () => {
    throw new Error("capabilities probe failed");
  };
  const errorRes = await postJson(baseUrl, cookie, "plan", { restorePointId });
  assert.equal(errorRes.status, 500);
  assert.deepEqual(await errorRes.json(), { error: "capabilities probe failed", code: "INTERNAL_ERROR" });

  deps.dbOps.getCapabilities = async () => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw "not-an-error";
  };
  const nonErrorRes = await postJson(baseUrl, cookie, "plan", { restorePointId });
  assert.equal(nonErrorRes.status, 500);
  assert.deepEqual(await nonErrorRes.json(), { error: "internal error", code: "INTERNAL_ERROR" });
});

test("recovery restore: a gateway error whose code has no mapped status (INTERNAL_ERROR from a throwing restore-points repo) is a 500", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  deps.restorePointsRepo.list = async () => {
    throw new Error("restore-points ledger unreadable");
  };

  const res = await postJson(baseUrl, cookie, "plan", { restorePointId: "rp-1" });
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "restore-points ledger unreadable", code: "INTERNAL_ERROR" });
});

test("recovery restore: confirm reached without a session principal (requireAdminSession not mounted) is a 500 INTERNAL_ERROR naming the miswiring", async () => {
  const { app } = buildTestApp();
  const handler = extractRouteHandler(app, "post", "/api/admin/v1/recovery/restore/confirm");
  const { res, capture } = createCapturingResponse();

  await handler({ body: { planId: "p-1", planHash: "h-1", disclosureAcknowledged: true } }, res);

  assert.equal(capture.statusCode, 500);
  const body = capture.jsonBody as { error: string; code: string };
  assert.equal(body.code, "INTERNAL_ERROR");
  assert.match(body.error, /no principal on res\.locals/);
});

test("recovery restore: execute surfaces a throwing instance-authorization port as 500 INTERNAL_ERROR before any lock is taken", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  deps.gatedMutations.gatewayDeps.authorizeInstance = async () => {
    throw new Error("instance authorizer offline");
  };

  const res = await postJson(baseUrl, cookie, "execute", { confirmationToken: "tok", restorePointId: "rp-1" });
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "instance authorizer offline", code: "INTERNAL_ERROR" });
});

test("sendRecoveryError: a contract-valid payload with no message falls back to its code as the error text", () => {
  const { res, capture } = createCapturingResponse();
  sendRecoveryError(res, { code: "PLAN_STALE" });
  assert.equal(capture.statusCode, 409);
  assert.deepEqual(capture.jsonBody, { error: "PLAN_STALE", code: "PLAN_STALE" });
});
