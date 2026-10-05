import assert from "node:assert/strict";
import test from "node:test";

import { acquireOperationLock, releaseOperationLock } from "#src/contracts/core/operation-lock";
import { confirmRestore, executeRestore, planRestore } from "../../recovery-orchestrator.js";

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
  const tokens = new Set<string>();
  return {
    calls,
    plan: async () => {
      calls.push("plan");
      const planId = "plan-ceremony-1";
      mintedPlanIds.add(planId);
      return { ok: true as const, value: { planId, planHash: "sha256:" + "f".repeat(64) } };
    },
    confirm: async (input: { planId: string }) => {
      calls.push("confirm");
      if (!mintedPlanIds.has(input.planId)) return { ok: false as const, error: { code: "PLAN_STALE" } };
      tokens.add("token-ceremony-1");
      return { ok: true as const, value: { confirmationToken: "token-ceremony-1" } };
    },
    execute: async (input: { confirmationToken: string; confirmerPrincipalId?: string }) => {
      calls.push("execute");
      if (!tokens.delete(input.confirmationToken) || input.confirmerPrincipalId !== "user-1")
        return { ok: false as const, error: { code: "FORBIDDEN" } };
      return { ok: true as const, value: { restoreRunId: "run-ceremony-1", state: "RESTORING" } };
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

  assert.deepEqual(confirm, { ok: true, value: { confirmationToken: "token-ceremony-1" } });
  const executed = await executeRestore({
    deps: { gateway, operationLock: { acquireOperationLock, releaseOperationLock }, clock: { nowMs: () => Date.parse("2026-10-03T00:00:00Z") } },
    input: { principalId: "user-1", principalKind: "user", confirmationToken: (confirm.value as { confirmationToken: string }).confirmationToken, siteId: "ceremony-site" },
  });
  assert.deepEqual(executed, { ok: true, value: { restoreRunId: "run-ceremony-1", state: "RESTORING" } });
  assert.deepEqual(gateway.calls, ["plan", "confirm", "execute"]);
});

test("AC-12: the RecoveryOrchestrator module exposes exactly plan/confirm/execute as separate functions — no combined single-call restore function exists", async () => {
  const module = await import("../../recovery-orchestrator.js");
  assert.deepEqual(Object.entries(module).filter(([, value]) => typeof value === "function").map(([name]) => name).sort(),
    ["confirmRestore", "executeRestore", "planRestore"]);
});

test("unplanned confirmation and unconfirmed execution are refused through the orchestrator", async () => {
  const gateway = fakeGateway();
  assert.deepEqual(await confirmRestore({ deps: { gateway }, input: {
    principalId: "user-1", principalKind: "user", planId: "not-minted", planHash: "sha256:" + "f".repeat(64), disclosureAcknowledged: true,
  } }), { ok: false, error: { code: "PLAN_STALE" } });
  assert.deepEqual(await executeRestore({
    deps: { gateway, operationLock: { acquireOperationLock, releaseOperationLock }, clock: { nowMs: () => 0 } },
    input: { principalId: "user-1", principalKind: "user", confirmationToken: "not-minted", siteId: "unconfirmed-site" },
  }), { ok: false, error: { code: "FORBIDDEN" } });
});
