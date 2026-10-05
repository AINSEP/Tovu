import assert from "node:assert/strict";
import test from "node:test";

import { acquireOperationLock, releaseOperationLock } from "#src/contracts/core/operation-lock";
import { executeRestore } from "../../recovery-orchestrator.js";

/**
 * @file CIC U-001-ORD1 (SPEC-019) — `executeRestore` consults the shared `core/operation-lock`
 * before proceeding to the gateway's own domain mutation (C-303; REQ-13, INV-03).
 *
 * Integration-level because this exercises the REAL `core/operation-lock.ts` primitive (not a
 * fake) alongside a fake gateway — the property under test is the ORDERING between the two real
 * modules, which a fully-mocked unit test would not prove.
 *
 * Also covers: AC-21/AC-22 (cross-screen block), AC-26 (completion deep-link), AC-28/EC-07
 * (restore doesn't clear PENDING_MIGRATION), EC-04 (actor-class redemption rejection).
 */

function fakeGateway(executeResult: { restoreRunId: string; state: string } = { restoreRunId: "run-1", state: "QUIESCING" }, tokenOwner = "user-1") {
  const executeCalls: unknown[] = [];
  return {
    executeCalls,
    execute: async (input: { confirmationToken: string; confirmerPrincipalId?: string }) => {
      executeCalls.push(input);
      if (input.confirmerPrincipalId !== tokenOwner) {
        return { ok: false as const, error: { code: "FORBIDDEN" } };
      }
      return { ok: true as const, value: executeResult };
    },
  };
}

test("U-001-ORD1: executeRestore acquires the shared operation lock BEFORE calling the gateway's own execute()", async () => {
  const clock = { nowMs: () => Date.parse("2026-07-15T00:00:00.000Z") };
  const gateway = fakeGateway();
  const siteId = "site-execute-1";

  const result = await executeRestore({
    deps: { gateway, operationLock: { acquireOperationLock, releaseOperationLock }, clock },
    input: { principalId: "user-1", principalKind: "user", confirmationToken: "token-1", siteId },
  });

  assert.equal(result.ok, true);
  assert.equal(gateway.executeCalls.length, 1, "the gateway's execute() must have been reached after the lock was acquired");
  assert.deepEqual(gateway.executeCalls[0], { confirmationToken: "token-1", confirmerPrincipalId: "user-1" });
  if (result.ok) assert.equal(result.value.databaseTimelineDeepLink, undefined);

  // The lock must have been released after a completed attempt, so a fresh acquire now succeeds
  // (proves executeRestore does not leak the lock on the happy path).
  const postAttempt = await acquireOperationLock({ deps: { clock }, input: { siteId, operationKind: "restore" } });
  assert.equal(postAttempt.ok, true);
  if (postAttempt.ok) await releaseOperationLock({ deps: { clock }, input: { siteId, handle: postAttempt.value } });
});

test("REQ-13/AC-22: executeRestore rejects with RESTORE_OPERATION_IN_FLIGHT and never reaches the gateway when a migration is already holding the site's lock", async () => {
  const clock = { nowMs: () => Date.parse("2026-07-15T00:00:00.000Z") };
  const gateway = fakeGateway();
  const siteId = "site-execute-2";

  // Simulate Database's migrate-forward already holding the lock (cross-domain contention).
  const migrationHolder = await acquireOperationLock({ deps: { clock }, input: { siteId, operationKind: "migration" } });
  assert.equal(migrationHolder.ok, true);

  const result = await executeRestore({
    deps: { gateway, operationLock: { acquireOperationLock, releaseOperationLock }, clock },
    input: { principalId: "user-1", principalKind: "user", confirmationToken: "token-2", siteId },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "RESTORE_OPERATION_IN_FLIGHT");
  assert.equal(gateway.executeCalls.length, 0, "the gateway must never be reached once the shared lock rejects the attempt (REQ-13)");
});

test("AC-26/REQ-16: a successful executeRestore attaches a deep-link back to the Database Timeline on the response", async () => {
  const clock = { nowMs: () => Date.parse("2026-07-15T00:00:00.000Z") };
  const gateway = fakeGateway({ restoreRunId: "run-2", state: "RESTORED" });
  const siteId = "site-execute-3";

  const result = await executeRestore({
    deps: { gateway, operationLock: { acquireOperationLock, releaseOperationLock }, clock },
    input: { principalId: "user-1", principalKind: "user", confirmationToken: "token-3", siteId },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    const value = result.value as { databaseTimelineDeepLink?: unknown };
    assert.ok(value.databaseTimelineDeepLink, "REQ-16 requires a deep-link back to Database Timeline on RESTORED completion");
    assert.deepEqual(value.databaseTimelineDeepLink, { v: 1, siteId, intent: "view" });
  }
});

test("REQ-18/EC-07: executeRestore's own success path never itself clears PENDING_MIGRATION state", async () => {
  const clock = { nowMs: () => Date.parse("2026-07-15T00:00:00.000Z") };
  const gateway = fakeGateway({ restoreRunId: "run-3", state: "RESTORED" });
  const siteId = "site-execute-4";
  let pendingMigrationClearCalls = 0;
  const pendingMigrationTracker = {
    clearPendingMigration: async () => {
      pendingMigrationClearCalls++;
    },
  };

  await executeRestore({
    deps: { gateway, operationLock: { acquireOperationLock, releaseOperationLock }, clock, pendingMigrationTracker },
    input: { principalId: "user-1", principalKind: "user", confirmationToken: "token-4", siteId },
  });

  assert.equal(pendingMigrationClearCalls, 0, "REQ-18: a restore must never itself clear PENDING_MIGRATION");
});

test("EC-04: an agent redeeming a token whose confirmer does not match its own delegatedBy is rejected with FORBIDDEN", async () => {
  const clock = { nowMs: () => Date.parse("2026-07-15T00:00:00.000Z") };
  const gateway = fakeGateway();
  const siteId = "site-execute-5";

  const result = await executeRestore({
    deps: { gateway, operationLock: { acquireOperationLock, releaseOperationLock }, clock },
    input: {
      principalId: "agent-1",
      principalKind: "agent",
      confirmationToken: "token-for-other-actor",
      siteId,
      delegatedByPrincipalId: "user-not-the-confirmer",
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "FORBIDDEN");
  assert.deepEqual(gateway.executeCalls[0], {
    confirmationToken: "token-for-other-actor",
    confirmerPrincipalId: "user-not-the-confirmer",
  });
  const postAttempt = await acquireOperationLock({ deps: { clock }, input: { siteId, operationKind: "migration" } });
  assert.equal(postAttempt.ok, true, "a rejected redemption must release the site's lock");
  if (postAttempt.ok) await releaseOperationLock({ deps: { clock }, input: { siteId, handle: postAttempt.value } });
});

test("EC-04: an agent can redeem a token owned by its delegator", async () => {
  const clock = { nowMs: () => Date.parse("2026-07-15T00:00:00.000Z") };
  const gateway = fakeGateway();
  const result = await executeRestore({
    deps: { gateway, operationLock: { acquireOperationLock, releaseOperationLock }, clock },
    input: { principalId: "agent-1", principalKind: "agent", delegatedByPrincipalId: "user-1", confirmationToken: "token-1", siteId: "site-execute-agent-match" },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(gateway.executeCalls[0], { confirmationToken: "token-1", confirmerPrincipalId: "user-1" });
});

test("U-001-ORD1: a pending restore holds the shared lock until gateway execution settles", async () => {
  const clock = { nowMs: () => Date.parse("2026-07-15T00:00:00.000Z") };
  const siteId = "site-execute-pending";
  let enterGateway!: () => void;
  const entered = new Promise<void>((resolve) => { enterGateway = resolve; });
  let finishGateway!: () => void;
  const pending = new Promise<void>((resolve) => { finishGateway = resolve; });
  const gateway = {
    execute: async () => {
      enterGateway();
      await pending;
      return { ok: true as const, value: { restoreRunId: "run-pending", state: "QUIESCING" } };
    },
  };
  const restore = executeRestore({
    deps: { gateway, operationLock: { acquireOperationLock, releaseOperationLock }, clock },
    input: { principalId: "user-1", principalKind: "user", confirmationToken: "token-1", siteId },
  });
  await entered;
  try {
    const competing = await acquireOperationLock({ deps: { clock }, input: { siteId, operationKind: "migration" } });
    if (competing.ok) await releaseOperationLock({ deps: { clock }, input: { siteId, handle: competing.value } });
    assert.equal(competing.ok, false, "migration must be blocked while the restore gateway is pending");
  } finally {
    finishGateway();
    await restore;
  }
  const postAttempt = await acquireOperationLock({ deps: { clock }, input: { siteId, operationKind: "migration" } });
  assert.equal(postAttempt.ok, true);
  if (postAttempt.ok) await releaseOperationLock({ deps: { clock }, input: { siteId, handle: postAttempt.value } });
});

test("U-001: a throwing gateway releases the shared operation lock", async () => {
  const clock = { nowMs: () => Date.parse("2026-07-15T00:00:00.000Z") };
  const siteId = "site-execute-throw";
  const failure = new Error("restore gateway failed");
  const gateway = { execute: async () => { throw failure; } };
  await assert.rejects(executeRestore({
    deps: { gateway, operationLock: { acquireOperationLock, releaseOperationLock }, clock },
    input: { principalId: "user-1", principalKind: "user", confirmationToken: "token-1", siteId },
  }), (error) => error === failure);
  const postAttempt = await acquireOperationLock({ deps: { clock }, input: { siteId, operationKind: "migration" } });
  assert.equal(postAttempt.ok, true, "exception unwinding must release the site's lock");
  if (postAttempt.ok) await releaseOperationLock({ deps: { clock }, input: { siteId, handle: postAttempt.value } });
});
