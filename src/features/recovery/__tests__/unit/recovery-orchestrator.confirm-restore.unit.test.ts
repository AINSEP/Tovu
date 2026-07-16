import assert from "node:assert/strict";
import test from "node:test";

import { confirmRestore } from "../../recovery-orchestrator";

/**
 * @file CIC U-002 (SPEC-019) — `confirmRestore`'s disclosure-acknowledgment gate + planId
 * provenance composite predicate (C-302; REQ-08, INV-02, behavior.spec.md §1.2/§2.1).
 *
 * Binding constraint U-002-B1's EXACT wording (audit-corrected, do not test an earlier/simpler
 * reading): `confirmRestore` rejects (mints no token) unless the request carries
 * `disclosureAcknowledged: true` AND `planId` resolves to a plan this server's own `planRestore`
 * actually minted and returned a disclosure for. This is a composite of two checks — the flag AND
 * plan provenance — NOT an invented server-tracked "acknowledgment record"; `state.spec.md`'s own
 * `ACKNOWLEDGE_DISCLOSURE` action is client-only, no server call, so the server cannot verify a
 * human actually read the disclosure text, only that the request carries the flag against a plan
 * the server itself minted (U-002-ORD1).
 *
 * A `FakeGatedMutationGateway` test double stands in for SPEC-016's not-yet-implemented gateway.
 * It tracks which `planId`s its own `plan()` minted, so this test can prove Recovery's
 * `confirmRestore` genuinely delegates plan-provenance verification to the gateway rather than
 * trusting a caller-supplied claim — SPEC-016's own CIC governs the gateway's internal
 * planHash-matching mechanics; this test only proves Recovery's own hook ordering around it.
 */

function fakeGateway() {
  const mintedPlanIds = new Set<string>();
  const confirmCalls: unknown[] = [];
  return {
    confirmCalls,
    plan: async () => {
      const planId = `plan-${mintedPlanIds.size + 1}`;
      mintedPlanIds.add(planId);
      return { ok: true, value: { planId, planHash: "sha256:" + "c".repeat(64) } };
    },
    confirm: async (input: { planId: string; planHash: string }) => {
      confirmCalls.push(input);
      if (!mintedPlanIds.has(input.planId)) {
        return { ok: false, error: { code: "PLAN_STALE" } };
      }
      return { ok: true, value: { confirmationToken: "token-1" } };
    },
  };
}

test("U-002-B1: confirmRestore rejects and never calls gateway.confirm() when disclosureAcknowledged is missing", async () => {
  const gateway = fakeGateway();
  const plan = await gateway.plan();
  assert.equal(plan.ok, true);
  if (!plan.ok) return;

  const result = await confirmRestore({
    deps: { gateway },
    input: {
      principalId: "user-1",
      principalKind: "user",
      planId: plan.value.planId,
      planHash: plan.value.planHash,
      disclosureAcknowledged: undefined as unknown as boolean,
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "VALIDATION_ERROR");
  assert.equal(gateway.confirmCalls.length, 0, "gateway.confirm must never be reached without disclosureAcknowledged===true (INV-02)");
});

test("U-002-B1: confirmRestore rejects when disclosureAcknowledged is a falsy non-true value (e.g. the string 'true')", async () => {
  const gateway = fakeGateway();
  const plan = await gateway.plan();
  assert.equal(plan.ok, true);
  if (!plan.ok) return;

  const result = await confirmRestore({
    deps: { gateway },
    input: {
      principalId: "user-1",
      principalKind: "user",
      planId: plan.value.planId,
      planHash: plan.value.planHash,
      disclosureAcknowledged: "true" as unknown as boolean,
    },
  });

  assert.equal(result.ok, false);
  assert.equal(gateway.confirmCalls.length, 0);
});

test("U-002-B1/ORD1: confirmRestore forwards to gateway.confirm() only when disclosureAcknowledged===true AND the planId was minted by a prior planRestore call", async () => {
  const gateway = fakeGateway();
  const plan = await gateway.plan();
  assert.equal(plan.ok, true);
  if (!plan.ok) return;

  const result = await confirmRestore({
    deps: { gateway },
    input: {
      principalId: "user-1",
      principalKind: "user",
      planId: plan.value.planId,
      planHash: plan.value.planHash,
      disclosureAcknowledged: true,
    },
  });

  assert.equal(gateway.confirmCalls.length, 1);
  assert.equal(result.ok, true);
});

test("U-002-B1 (adversarial): disclosureAcknowledged===true but planId was NEVER minted by this server's own planRestore — Recovery must not bypass the gateway's own provenance rejection", async () => {
  const gateway = fakeGateway();
  // Note: no prior gateway.plan() call — 'forged-plan-id' was never minted.

  const result = await confirmRestore({
    deps: { gateway },
    input: {
      principalId: "user-1",
      principalKind: "user",
      planId: "forged-plan-id",
      planHash: "sha256:" + "d".repeat(64),
      disclosureAcknowledged: true,
    },
  });

  assert.equal(gateway.confirmCalls.length, 1, "Recovery forwards to the gateway (does not short-circuit trust its own copy of provenance)");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, "PLAN_STALE");
});

test("INV-02: a client that bypasses its own UI gate and calls confirmRestore directly, without ever having rendered the disclosure, still cannot mint a token", async () => {
  const gateway = fakeGateway();
  // No planRestore() call preceded this — simulates a modified client or direct API call.
  const result = await confirmRestore({
    deps: { gateway },
    input: {
      principalId: "attacker-1",
      principalKind: "user",
      planId: "never-issued",
      planHash: "sha256:" + "e".repeat(64),
      disclosureAcknowledged: true,
    },
  });

  assert.equal(result.ok, false);
});
