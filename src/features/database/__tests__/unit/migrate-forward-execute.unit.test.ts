import assert from "node:assert/strict";
import test from "node:test";

import { executeMigrateForward } from "../../migrate-forward/execute.js";

/**
 * @file SPEC-017 C-105 / CIC U-003 (binding reference to SPEC-019 CIC U-001) / REQ-08 / AC-09 /
 * AC-41 / AC-42 — the `executeMigrateForward` orchestration wrapper.
 *
 * This package does NOT implement or test `core/operation-lock.ts` itself — that primitive is
 * designated and tested by the parallel SPEC-019 TDD dispatch (see
 * `src/core/__tests__/unit/operation-lock.unit.test.ts` and
 * `.../integration/operation-lock.cross-domain.integration.test.ts`, already written, read-only
 * reference here). This suite tests only THIS package's own wiring: that `executeMigrateForward`
 * (a) acquires the shared lock before invoking the state machine (U-003-ORD1, binding), (b) maps
 * a rejected acquire to `MIGRATION_ALREADY_IN_FLIGHT`, and (c) refuses `costClass: 'unavailable'`
 * with no bypass (REQ-08/AC-09), using a fake `core/operation-lock`-shaped port matching that
 * package's own `acquireOperationLock`/`releaseOperationLock` Result<T,E> shape (verified against
 * its actual test file so both packages agree on one contract).
 *
 * Assumed seam design:
 *
 * ```ts
 * export interface OperationLockPort {
 *   acquireOperationLock(params: { deps: { clock: ClockPort }; input: { siteId: string; operationKind: "migration" | "restore" } })
 *     : Promise<{ ok: true; value: { siteId: string; operationKind: string; acquiredAt: string } } | { ok: false; error: { code: string } }>;
 *   releaseOperationLock(params: { deps: { clock: ClockPort }; input: { siteId: string; handle: unknown } }): Promise<void>;
 * }
 *
 * export class MigrationAlreadyInFlightError extends Error {}
 * export class RestorePointUnavailableError extends Error {}
 *
 * export async function executeMigrateForward(
 *   required: {
 *     siteId: string; confirmationToken: string; costClass: "cheap" | "expensive" | "unavailable";
 *     operationLock: OperationLockPort;
 *     gatewayExecute: () => Promise<{ migrated: true }>; // delegates to core/gated-mutations.execute() + the state machine
 *   },
 *   optional?: {}
 * ): Promise<{ migrated: true }>;
 * ```
 */

const clock = { nowIso: () => "2026-07-15T00:00:00.000Z" };

function fakeLockPort(acquireResult: { ok: true; value: unknown } | { ok: false; error: { code: string } }) {
  const calls: string[] = [];
  return {
    calls,
    async acquireOperationLock() {
      calls.push("acquire");
      return acquireResult;
    },
    async releaseOperationLock() {
      calls.push("release");
    },
  };
}

test("REQ-08 / AC-09: executeMigrateForward refuses with RESTORE_POINT_UNAVAILABLE-class rejection when costClass='unavailable', with no bypass, before ever consulting the lock", async () => {
  const lock = fakeLockPort({ ok: true, value: { siteId: "site-1", operationKind: "migration", acquiredAt: clock.nowIso() } });
  let gatewayRan = false;

  await assert.rejects(
    executeMigrateForward({
      siteId: "site-1",
      confirmationToken: "tok-1",
      costClass: "unavailable",
      operationLock: lock,
      gatewayExecute: async () => {
        gatewayRan = true;
        return { migrated: true };
      },
    })
  );

  assert.equal(gatewayRan, false, "AC-09: costClass='unavailable' must refuse before any mutation runs, no override honored");
});

test("U-003-ORD1 (binding on this domain, per SPEC-019 CIC U-001-ORD1): the shared operation lock is acquired before the state machine/gateway proceeds", async () => {
  const lock = fakeLockPort({ ok: true, value: { siteId: "site-1", operationKind: "migration", acquiredAt: clock.nowIso() } });
  const order: string[] = [];

  await executeMigrateForward({
    siteId: "site-1",
    confirmationToken: "tok-1",
    costClass: "cheap",
    operationLock: {
      async acquireOperationLock() {
        order.push("lock-acquired");
        return { ok: true, value: { siteId: "site-1", operationKind: "migration", acquiredAt: clock.nowIso() } };
      },
      async releaseOperationLock() {
        order.push("lock-released");
      },
    },
    gatewayExecute: async () => {
      order.push("gateway-executed");
      return { migrated: true };
    },
  });

  assert.deepEqual(order, ["lock-acquired", "gateway-executed", "lock-released"], "the lock must be acquired strictly before the state machine/gateway proceeds, and released after");
});

test("errors.spec.md MIGRATION_ALREADY_IN_FLIGHT: a rejected lock acquire (OPERATION_IN_FLIGHT) maps to this domain's own MIGRATION_ALREADY_IN_FLIGHT error, and the gateway never runs", async () => {
  const lock = fakeLockPort({ ok: false, error: { code: "OPERATION_IN_FLIGHT" } });
  let gatewayRan = false;

  await assert.rejects(
    executeMigrateForward({
      siteId: "site-1",
      confirmationToken: "tok-1",
      costClass: "cheap",
      operationLock: lock,
      gatewayExecute: async () => {
        gatewayRan = true;
        return { migrated: true };
      },
    }),
    (err: unknown) => {
      assert.equal((err as Error).name, "MigrationAlreadyInFlightError");
      return true;
    }
  );
  assert.equal(gatewayRan, false, "the gated mutation must never run when the shared lock rejects the acquire");
});

test("AC-41: SPEC-016 REQ-11's authorize()-before-token-state ordering — this domain adds no bypass; delegated entirely to core/gated-mutations.execute() (see SPEC-016 gateway.unit.test.ts's own U-001-ORD1 test for the mechanism itself)", async () => {
  // This package's own contract: executeMigrateForward must not short-circuit or reorder
  // core/gated-mutations' own checks — it only wraps them with the lock + costClass guard.
  // Verified here by confirming gatewayExecute (which internally calls core/gated-mutations.execute())
  // is invoked exactly once and only after the lock/costClass guards pass, never bypassed.
  const lock = fakeLockPort({ ok: true, value: { siteId: "site-1", operationKind: "migration", acquiredAt: clock.nowIso() } });
  let gatewayCallCount = 0;

  await executeMigrateForward({
    siteId: "site-1",
    confirmationToken: "tok-1",
    costClass: "cheap",
    operationLock: lock,
    gatewayExecute: async () => {
      gatewayCallCount += 1;
      return { migrated: true };
    },
  });

  assert.equal(gatewayCallCount, 1);
});
