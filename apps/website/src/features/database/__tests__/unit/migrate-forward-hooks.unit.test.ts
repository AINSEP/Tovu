import assert from "node:assert/strict";
import test from "node:test";

import { buildMigrateForwardHooks, type MigrateForwardDbOpsPort } from "../../gated-hooks.js";

/**
 * @file fix-plan-web-high-2026-09-24.md row 2: `buildMigrateForwardHooks`'s `executeMutation()`
 * captured a real restore point via `dbOps.captureRestorePoint()` but then persisted the row with a
 * hard-coded `costClass: "cheap"` / `kind: "file-snapshot"` and no `artifactRef` at all — so the
 * saved restore point could never be resolved back to the artifact it was actually captured to,
 * making the migrate-forward restore point unrestorable regardless of what `getCapabilities()`
 * actually reported. This suite is the RED/GREEN proof that `executeMutation()` reads
 * `getCapabilities()` fresh (not cached from `computePlan()`) and saves the real
 * `artifactRef`/`costClass`/`kind` it just captured.
 */

const CLOCK = { nowIso: () => "2026-09-24T00:00:00.000Z" };

function fakeIdGen(ids: string[]) {
  let i = 0;
  return { newId: () => ids[i++] ?? `id-${i}` };
}

function fakeDbOps(): MigrateForwardDbOpsPort {
  return {
    async getCapabilities() {
      return { restorePoint: { costClass: "expensive", kind: "file-snapshot" } };
    },
    async captureRestorePoint() {
      return { artifactRef: "/snap/rp-1.db", watermarkAtCapture: 7 };
    },
  };
}

test("row 2: executeMutation() persists the restore point with the REAL artifactRef, costClass and kind it just captured", async () => {
  const saved: Array<Record<string, unknown>> = [];
  const hooks = buildMigrateForwardHooks({
    workspaceId: "ws-1",
    actorId: "actor-1",
    clock: CLOCK,
    idGen: fakeIdGen(["rp-1", "ledger-1"]),
    dbOps: fakeDbOps(),
    restorePointsRepo: {
      async save(row) {
        saved.push(row);
      },
    },
    databaseLedgerRepo: {
      async append() {
        // not under test here
      },
    },
  });

  await hooks.executeMutation({ planHash: "hash-1", details: { costClass: "expensive", siteId: "ws-1" } });

  assert.equal(saved.length, 1, "exactly one restore point row must be saved");
  const row = saved[0]!;
  assert.equal(row.artifactRef, "/snap/rp-1.db", "the saved row must carry the REAL artifactRef captureRestorePoint returned, not omit it");
  assert.equal(row.costClass, "expensive", "costClass must come from getCapabilities(), not a hard-coded 'cheap'");
  assert.equal(row.kind, "file-snapshot", "kind must come from getCapabilities()");
  assert.equal(row.watermarkAtCapture, 7);
});

test("row 2: getCapabilities() is read fresh inside executeMutation(), not reused from computePlan()", async () => {
  const capabilitiesCalls: string[] = [];
  let capabilityCallCount = 0;
  const saved: Array<Record<string, unknown>> = [];

  const dbOps: MigrateForwardDbOpsPort = {
    async getCapabilities() {
      capabilityCallCount += 1;
      capabilitiesCalls.push(`call-${capabilityCallCount}`);
      // Second call (inside executeMutation) reports a DIFFERENT costClass than the first (inside
      // computePlan) — CIC U-003: the plan/execute boundary must never cache this value.
      return { restorePoint: { costClass: capabilityCallCount === 1 ? "cheap" : "expensive", kind: "file-snapshot" } };
    },
    async captureRestorePoint() {
      return { artifactRef: "/snap/rp-2.db", watermarkAtCapture: 9 };
    },
  };

  const hooks = buildMigrateForwardHooks({
    workspaceId: "ws-1",
    actorId: "actor-1",
    clock: CLOCK,
    idGen: fakeIdGen(["rp-2", "ledger-2"]),
    dbOps,
    restorePointsRepo: {
      async save(row) {
        saved.push(row);
      },
    },
    databaseLedgerRepo: {
      async append() {},
    },
  });

  await hooks.computePlan();
  await hooks.executeMutation({ planHash: "hash-1", details: { costClass: "cheap", siteId: "ws-1" } });

  assert.equal(capabilityCallCount, 2, "computePlan() and executeMutation() must each call getCapabilities() fresh");
  assert.equal(saved[0]?.costClass, "expensive", "executeMutation() must save the value IT read, not the stale computePlan() value");
});
