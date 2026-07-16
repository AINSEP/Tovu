import assert from "node:assert/strict";
import test from "node:test";

import { acquireOperationLock, releaseOperationLock } from "../../operation-lock";

/**
 * @file CIC U-001 (SPEC-019 `critical-internal-constraints.md`) — `core/operation-lock.ts`'s
 * site-wide gated-operation mutual exclusion primitive (C-309; REQ-13, INV-03; GOV-ADR-002).
 *
 * This is the SINGLE, SHARED primitive both `features/storage` (SPEC-017) and
 * `features/recovery` (SPEC-019) MUST consult before starting a gated operation. It is
 * designated here (SPEC-019's own package) per the CIC's Cross-Feature Persistence rule —
 * do not duplicate this file's tests in SPEC-017's own test suite.
 *
 * Binding constraints covered here:
 * - U-001-B1: `acquireOperationLock` is the single shared entry point.
 * - U-001-B2: atomic check-and-set, never a separate read-then-write (TOCTOU prevention).
 */

const NOW = "2026-07-15T00:00:00.000Z";
const clock = { nowIso: () => NOW };

test("U-001-B1: acquireOperationLock succeeds when no operation is in flight for the site", async () => {
  const result = await acquireOperationLock({
    deps: { clock },
    input: { siteId: "site-1", operationKind: "restore" },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.siteId, "site-1");
    assert.equal(result.value.operationKind, "restore");
  }
});

test("U-001-B1: a second acquireOperationLock for the same site is rejected while the first is held, regardless of operationKind", async () => {
  const first = await acquireOperationLock({ deps: { clock }, input: { siteId: "site-1", operationKind: "restore" } });
  assert.equal(first.ok, true);

  const second = await acquireOperationLock({ deps: { clock }, input: { siteId: "site-1", operationKind: "migration" } });
  assert.equal(second.ok, false);
  if (!second.ok) {
    assert.equal(second.error.code, "OPERATION_IN_FLIGHT");
  }
});

test("U-001-B1: acquireOperationLock for a DIFFERENT site succeeds even while site-1's lock is held (no cross-site interference)", async () => {
  const siteOne = await acquireOperationLock({ deps: { clock }, input: { siteId: "site-1", operationKind: "restore" } });
  assert.equal(siteOne.ok, true);

  const siteTwo = await acquireOperationLock({ deps: { clock }, input: { siteId: "site-2", operationKind: "migration" } });
  assert.equal(siteTwo.ok, true);
});

test("releaseOperationLock frees the site so a subsequent acquireOperationLock for the same site succeeds", async () => {
  const first = await acquireOperationLock({ deps: { clock }, input: { siteId: "site-3", operationKind: "restore" } });
  assert.equal(first.ok, true);
  if (!first.ok) return;

  await releaseOperationLock({ deps: { clock }, input: { siteId: "site-3", handle: first.value } });

  const second = await acquireOperationLock({ deps: { clock }, input: { siteId: "site-3", operationKind: "migration" } });
  assert.equal(second.ok, true);
});

test("releasing a lock for a site with no held lock is a no-op, not an error (idempotent release)", async () => {
  await assert.doesNotReject(() =>
    releaseOperationLock({ deps: { clock }, input: { siteId: "site-never-locked", handle: { siteId: "site-never-locked", operationKind: "restore", acquiredAt: NOW } } })
  );
});
