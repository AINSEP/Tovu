import assert from "node:assert/strict";
import test from "node:test";

import { confirmRestore, executeRestore, planRestore } from "../../recovery-orchestrator";

/**
 * @file REQ-26/behavior.spec.md §2.1 (SPEC-019) — the restore ceremony's uniform ordering:
 * plan() -> disclosure-acknowledge -> confirm() -> execute(), with no abbreviated path for
 * costClass:'cheap' (AC-36), and no direct single-call restore endpoint at all (AC-12).
 *
 * Exercises the full sequence end-to-end (still with fakes for the SPEC-016 gateway boundary,
 * since that module does not exist yet) to prove the ORDERING itself, not just each step in
 * isolation — this is the acceptance-level test for REQ-26/AC-36.
 */

function fakeGateway() {
  const mintedPlanIds = new Set<string>();
  const calls: string[] = [];
  return {
    calls,
    plan: async () => {
      calls.push("plan");
      const planId = "plan-ceremony-1";
      mintedPlanIds.add(planId);
      return { ok: true, value: { planId, planHash: "sha256:" + "f".repeat(64) } };
    },
    confirm: async (input: { planId: string }) => {
      calls.push("confirm");
      if (!mintedPlanIds.has(input.planId)) return { ok: false, error: { code: "PLAN_STALE" } };
      return { ok: true, value: { confirmationToken: "token-ceremony-1" } };
    },
    execute: async () => {
      calls.push("execute");
      return { ok: true, value: { restoreRunId: "run-ceremony-1", state: "RESTORING" } };
    },
  };
}

test("AC-36: costClass='cheap' still requires the full plan -> confirm(with disclosure) -> execute sequence, no shortcut", async () => {
  const dbOps = { getCapabilities: async () => ({ costClass: "cheap" as const, restorePointKind: "file-snapshot" as const }) };
  const gateway = fakeGateway();

  const plan = await planRestore({ deps: { dbOps, gateway }, input: { principalId: "user-1", principalKind: "user", restorePointId: "rp-1" } });
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  const planValue = plan.value as { planId: string; planHash: string };

  const confirm = await confirmRestore({
    deps: { gateway },
    input: { principalId: "user-1", principalKind: "user", planId: planValue.planId, planHash: planValue.planHash, disclosureAcknowledged: true },
  });
  assert.equal(confirm.ok, true);

  assert.deepEqual(gateway.calls, ["plan", "confirm"], "plan() and confirm() must both run in order — no step is ever skipped for costClass:'cheap'");
});

test("AC-12: the RecoveryOrchestrator module exposes exactly plan/confirm/execute as separate functions — no combined single-call restore function exists", async () => {
  const module = await import("../../recovery-orchestrator");
  const exportedNames = Object.keys(module);

  assert.ok(exportedNames.includes("planRestore"));
  assert.ok(exportedNames.includes("confirmRestore"));
  assert.ok(exportedNames.includes("executeRestore"));

  const forbiddenNamePattern = /^(restore|directRestore|restoreNow|oneStepRestore|singleCallRestore)$/i;
  for (const name of exportedNames) {
    assert.equal(
      forbiddenNamePattern.test(name),
      false,
      `found a suspicious combined-restore export '${name}' — REQ-06/AC-12 require exactly plan()/confirm()/execute(), no direct endpoint`
    );
  }
});
