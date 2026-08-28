import assert from "node:assert/strict";
import test from "node:test";

import { createRestorePoint } from "../../restore-points.js";

/**
 * @file REQ-05 (SPEC-019) — `createRestorePoint` as an ordinary `authorize()`-gated mutation,
 * structurally distinct from the gated restore ceremony (C-304).
 *
 * Covers: AC-10 (no plan/confirm/token precedes creation), AC-11 (authorize() before idempotency
 * short-circuit, per SPEC-016 REQ-14).
 */

const NOW = "2026-07-15T00:00:00.000Z";
const clock = { nowIso: () => NOW };
let idCounter = 0;
const ids = { newId: () => `rp-${++idCounter}` };
const alwaysAllow = async () => ({ allowed: true, reason: "matched" });
const alwaysDeny = async () => ({ allowed: false, reason: "no_grant" });

function fakeRepo() {
  const rows: Array<{ restorePointId: string; idempotencyKey: string }> = [];
  return {
    rows,
    save: async (row: { restorePointId: string; idempotencyKey: string }) => {
      rows.push(row);
    },
    findByIdempotencyKey: async (key: string) => rows.find((r) => r.idempotencyKey === key) ?? null,
  };
}

test("AC-10: createRestorePoint succeeds without any plan()/confirm() step or minted token", async () => {
  const repo = fakeRepo();
  let gatewayCalled = false;
  const gateway = {
    plan: async () => {
      gatewayCalled = true;
      return { ok: true, value: {} };
    },
  };

  const result = await createRestorePoint({
    deps: { repo, clock, ids, authorize: alwaysAllow, gateway },
    input: { principalId: "user-1", principalKind: "user", idempotencyKey: "key-1", trigger: "manual", operationInFlight: false },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    const value = result.value as { confirmationToken?: unknown; planId?: unknown };
    assert.equal(value.confirmationToken, undefined);
    assert.equal(value.planId, undefined);
  }
  assert.equal(gatewayCalled, false, "createRestorePoint must never invoke the gateway (REQ-05)");
});

test("AC-11: authorize() runs before the idempotency short-circuit, even on the second identical call", async () => {
  const repo = fakeRepo();
  let authorizeCallCount = 0;
  const authorize = async () => {
    authorizeCallCount++;
    return { allowed: true, reason: "matched" };
  };
  const gateway = { plan: async () => ({ ok: true, value: {} }) };

  await createRestorePoint({
    deps: { repo, clock, ids, authorize, gateway },
    input: { principalId: "user-1", principalKind: "user", idempotencyKey: "key-2", trigger: "manual", operationInFlight: false },
  });
  await createRestorePoint({
    deps: { repo, clock, ids, authorize, gateway },
    input: { principalId: "user-1", principalKind: "user", idempotencyKey: "key-2", trigger: "manual", operationInFlight: false },
  });

  assert.equal(authorizeCallCount, 2, "authorize() must run on every call, including a repeated idempotency key (SPEC-016 REQ-14)");
  assert.equal(repo.rows.length, 1, "the idempotent second call must not create a second row");
});

test("createRestorePoint is rejected FORBIDDEN and writes nothing when the caller is unauthorized", async () => {
  const repo = fakeRepo();
  const gateway = { plan: async () => ({ ok: true, value: {} }) };

  const result = await createRestorePoint({
    deps: { repo, clock, ids, authorize: alwaysDeny, gateway },
    input: { principalId: "user-1", principalKind: "user", idempotencyKey: "key-3", trigger: "manual", operationInFlight: false },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "FORBIDDEN");
  assert.equal(repo.rows.length, 0);
});

test("createRestorePoint rejects with RESTORE_OPERATION_IN_FLIGHT when a restore or migration is already running (REQ-13 extends to creation via onBeforeCreateOrExecute)", async () => {
  const repo = fakeRepo();
  const gateway = { plan: async () => ({ ok: true, value: {} }) };

  const result = await createRestorePoint({
    deps: { repo, clock, ids, authorize: alwaysAllow, gateway },
    input: { principalId: "user-1", principalKind: "user", idempotencyKey: "key-4", trigger: "manual", operationInFlight: true },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "RESTORE_OPERATION_IN_FLIGHT");
  assert.equal(repo.rows.length, 0);
});
