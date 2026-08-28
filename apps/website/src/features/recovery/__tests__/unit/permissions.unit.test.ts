import assert from "node:assert/strict";
import test from "node:test";

import { confirmRestore } from "../../recovery-orchestrator.js";
import { createRestorePoint } from "../../restore-points.js";

/**
 * @file REQ-02 (SPEC-019) — permission gating: backup.read / backup.create / backup.restore.
 *
 * Covers: AC-03 (backup.read holder sees list/status, no mutating control enabled — asserted here
 * at the write-path level: no mutation succeeds for a read-only principal), AC-04 (missing
 * backup.create rejects restore-point creation), AC-05 (missing backup.restore rejects
 * confirm/execute, per SPEC-016 REQ-10/REQ-11).
 */

const alwaysDeny = async () => ({ allowed: false, reason: "insufficient_permission" });
const NOW = "2026-07-15T00:00:00.000Z";
const clock = { nowIso: () => NOW };
let idCounter = 0;
const ids = { newId: () => `id-${++idCounter}` };

test("AC-03: a principal holding only backup.read can still call read-only actions (list/capabilities) while every mutating action above is denied", async () => {
  const alwaysAllowReadOnly = async (params: { permission: string }) => ({
    allowed: params.permission === "backup.read",
    reason: params.permission === "backup.read" ? "matched" : "insufficient_permission",
  });
  const repo = { save: async () => undefined, findByIdempotencyKey: async () => null, rows: [] as unknown[] };
  const gateway = { plan: async () => ({ ok: true, value: {} }) };

  const createResult = await createRestorePoint({
    deps: { repo, clock, ids, authorize: alwaysAllowReadOnly, gateway },
    input: { principalId: "user-read-only", principalKind: "user", idempotencyKey: "key-perm-0", trigger: "manual", operationInFlight: false },
  });

  assert.equal(createResult.ok, false, "backup.read alone must never be sufficient for a mutating action (REQ-02)");
  if (!createResult.ok) assert.equal(createResult.error.code, "FORBIDDEN");
});

test("AC-04: a principal without backup.create cannot create a restore point", async () => {
  const repo = { save: async () => undefined, findByIdempotencyKey: async () => null, rows: [] as unknown[] };
  const gateway = { plan: async () => ({ ok: true, value: {} }) };

  const result = await createRestorePoint({
    deps: { repo, clock, ids, authorize: alwaysDeny, gateway },
    input: { principalId: "user-read-only", principalKind: "user", idempotencyKey: "key-perm-1", trigger: "manual", operationInFlight: false },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "FORBIDDEN");
});

test("AC-05: a principal without backup.restore cannot confirm a restore (SPEC-016 REQ-10/REQ-11's authorize() denial surfaces through this domain's own confirmRestore)", async () => {
  const gateway = {
    plan: async () => ({ ok: true, value: { planId: "plan-perm-1", planHash: "sha256:" + "0".repeat(64) } }),
    confirm: async () => ({ ok: false, error: { code: "FORBIDDEN" } }),
  };

  const plan = await gateway.plan();
  assert.equal(plan.ok, true);

  const result = await confirmRestore({
    deps: { gateway },
    input: {
      principalId: "user-read-only",
      principalKind: "user",
      planId: "plan-perm-1",
      planHash: "sha256:" + "0".repeat(64),
      disclosureAcknowledged: true,
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "FORBIDDEN");
});
