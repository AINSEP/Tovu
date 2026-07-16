import assert from "node:assert/strict";
import test from "node:test";

import { planRestore } from "../../recovery-orchestrator";

/**
 * @file CIC U-003 (SPEC-019) — `planRestore`'s fresh `costClass` re-check before delegating to
 * `core/gated-mutations.plan()` (C-301; REQ-12, behavior.spec.md §2.2, EC-05).
 *
 * Binding constraints covered:
 * - U-003-B1: `planRestore` calls `db-ops.getCapabilities()` fresh at call time, never reusing a
 *   cached `costClass` value.
 * - U-003-ORD1: the fresh recheck completes and is confirmed not `'unavailable'` before
 *   `core/gated-mutations.plan()` is ever called.
 *
 * Also covers: AC-06 (expensive costClass surfaces cost/disk-estimate gate), AC-13 (plan() preview
 * contents), EC-05 (costClass degrades between list-fetch and plan-call).
 */

function fakeGateway(planResult: unknown = { planId: "plan-1", planHash: "sha256:" + "a".repeat(64) }) {
  const calls: unknown[] = [];
  return {
    calls,
    plan: async (input: unknown) => {
      calls.push(input);
      return { ok: true, value: planResult };
    },
  };
}

test("U-003-B1/ORD1: planRestore calls getCapabilities() fresh and delegates to the gateway when costClass is not 'unavailable'", async () => {
  let capabilitiesCallCount = 0;
  const dbOps = {
    getCapabilities: async () => {
      capabilitiesCallCount++;
      return { costClass: "cheap" as const, restorePointKind: "file-snapshot" as const };
    },
  };
  const gateway = fakeGateway();

  const result = await planRestore({
    deps: { dbOps, gateway },
    input: { principalId: "user-1", principalKind: "user", restorePointId: "rp-1" },
  });

  assert.equal(capabilitiesCallCount, 1, "getCapabilities must be called fresh at plan-call time");
  assert.equal(gateway.calls.length, 1, "the gateway's plan() must be delegated to when costClass is not unavailable");
  assert.equal(result.ok, true);
});

test("U-003-B1/ORD1 (EC-05): given costClass is fresh-rechecked as 'unavailable', planRestore refuses to reach the gateway at all, even if a stale cached value elsewhere said 'cheap'", async () => {
  const dbOps = {
    // Simulates the exact EC-05 scenario: whatever a status-bar fetch cached earlier, this fresh
    // call (which is what planRestore MUST invoke) now reports 'unavailable'.
    getCapabilities: async () => ({ costClass: "unavailable" as const, restorePointKind: "file-snapshot" as const }),
  };
  const gateway = fakeGateway();

  const result = await planRestore({
    deps: { dbOps, gateway },
    input: { principalId: "user-1", principalKind: "user", restorePointId: "rp-1" },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "COST_CLASS_UNAVAILABLE");
  assert.equal(gateway.calls.length, 0, "the gateway's own authorize()/plan() must never be reached once costClass is freshly confirmed unavailable (REQ-12)");
});

test("AC-13: a successful plan() preview includes the target schema version+tag, quiesceIntegrity note, and cost/disk estimate", async () => {
  const dbOps = { getCapabilities: async () => ({ costClass: "cheap" as const, restorePointKind: "file-snapshot" as const }) };
  const gateway = fakeGateway({
    planId: "plan-2",
    planHash: "sha256:" + "b".repeat(64),
    details: {
      targetSchemaVersion: "12",
      targetSchemaTag: "2026-07-10",
      quiesceIntegrity: "chokepoint-only",
      costDiskEstimate: "~40MB",
    },
  });

  const result = await planRestore({
    deps: { dbOps, gateway },
    input: { principalId: "user-1", principalKind: "user", restorePointId: "rp-2" },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    const value = result.value as { details: { targetSchemaVersion: string; quiesceIntegrity: string; costDiskEstimate: string } };
    assert.equal(value.details.targetSchemaVersion, "12");
    assert.equal(value.details.quiesceIntegrity, "chokepoint-only");
    assert.ok(value.details.costDiskEstimate.length > 0);
  }
});

test("AC-06: costClass 'expensive' still reaches the gateway (only 'unavailable' short-circuits)", async () => {
  const dbOps = { getCapabilities: async () => ({ costClass: "expensive" as const, restorePointKind: "file-snapshot" as const }) };
  const gateway = fakeGateway();

  const result = await planRestore({
    deps: { dbOps, gateway },
    input: { principalId: "user-1", principalKind: "user", restorePointId: "rp-3" },
  });

  assert.equal(result.ok, true);
  assert.equal(gateway.calls.length, 1);
});
