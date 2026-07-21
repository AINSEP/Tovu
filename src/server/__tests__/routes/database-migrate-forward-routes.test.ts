import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { bootAuthenticated } from "../helpers/http-test-server";
import { createRouteDeps } from "../../app";
import { acquireOperationLock, releaseOperationLock } from "../../../core/operation-lock";
import { registerAuthRoutes, requireAdminSession } from "../../middleware/dev-auth";
import { registerAdminDatabaseMigrateForwardRoutes } from "../../routes/admin/database/migrate-forward";
import type { RouteDeps } from "../../routes/types";

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
    passwordHash: await deps.passwordHasher.hash("bare-pw"),
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

test("database migrate-forward: a stale plan hash at confirm time is rejected before a token is minted", async (t) => {
  const { app } = buildTestApp();
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
