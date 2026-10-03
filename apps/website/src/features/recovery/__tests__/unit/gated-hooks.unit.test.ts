import assert from "node:assert/strict";
import test from "node:test";
import { buildRestoreHooks, RestorePointNotFoundError, toRecoveryResult, type BuildRestoreHooksInput } from "../../gated-hooks.js";
import { ForbiddenError, PlanStaleError } from "../../../../contracts/core/gated-mutations/gateway.js";
import { TokenAlreadyRedeemedError, TokenExpiredError } from "../../../../contracts/core/gated-mutations/token.js";

for (const [error, expected] of [
  [new ForbiddenError({ message: "no restore grant", reasonCode: "NO_GRANT" }), { code: "NO_GRANT", message: "no restore grant" }],
  [new PlanStaleError({ message: "changed plan" }), { code: "PLAN_STALE", message: "changed plan" }],
  [new TokenExpiredError({ message: "expired token" }), { code: "TOKEN_EXPIRED", message: "expired token" }],
  [new TokenAlreadyRedeemedError({ message: "spent token" }), { code: "TOKEN_ALREADY_REDEEMED", message: "spent token" }],
  [new Error("disk failed"), { code: "INTERNAL_ERROR", message: "disk failed" }],
  ["untyped failure", { code: "INTERNAL_ERROR", message: "internal error" }],
] as const) {
  test(`recovery result maps ${expected.code}: ${expected.message}`, async () => {
    assert.deepEqual(await toRecoveryResult(async () => { throw error; }), { ok: false, error: expected });
  });
}
test("recovery result returns the successful value intact", async () => {
  assert.deepEqual(await toRecoveryResult(async () => ({ state: "RESTORED", restartRequired: true })),
    { ok: true, value: { state: "RESTORED", restartRequired: true } });
});

function harness(options: { missing?: boolean; failRestore?: boolean; restartRequired?: boolean; interrupted?: boolean } = {}) {
  const trace: unknown[] = [];
  let seq = 0;
  const input: BuildRestoreHooksInput = {
    workspaceId: "ws", actorId: "operator", restorePointId: "chosen", clock: { nowIso: () => "2026-10-01T12:00:00.000Z" }, idGen: { newId: () => `id-${++seq}` },
    restorePointsRepo: { list: async () => options.missing ? [] : [
      { id: "decoy", createdAt: "newer", artifactRef: "/snapshots/decoy.db" },
      { id: "chosen", createdAt: "older", artifactRef: "/snapshots/chosen.db" },
    ] },
    dbOps: { restoreFromArtifact: async (request) => {
      assert.deepEqual(request, { artifactRef: "/snapshots/chosen.db" });
      trace.push(["restore", request]);
      if (options.failRestore) throw new Error("restore failed");
      return { restartRequired: options.restartRequired ?? true };
    } },
    databaseLedgerRepo: { append: async (row) => { trace.push(["ledger", row]); } },
    migrationRunsRepo: {
      findNonTerminalForSite: async (workspaceId) => {
        assert.equal(workspaceId, "ws");
        return options.interrupted ? { id: "interrupted", status: "DDL_IN_PROGRESS" } as never : null;
      },
      markResolved: async (request) => { trace.push(["resolve", request]); },
    },
    siteStatus: { get: async () => "BLOCKED_PENDING_RECOVERY", set: async (workspaceId, status) => { trace.push(["status", workspaceId, status]); } },
  };
  const hooks = buildRestoreHooks(input);
  return { trace, execute: async () => hooks.executeMutation(await hooks.computePlan()) };
}
test("a missing restore point performs no physical restore, ledger write, or recovery unblock", async () => {
  const h = harness({ missing: true });
  await assert.rejects(h.execute(), RestorePointNotFoundError);
  assert.deepEqual(h.trace, []);
});
test("a failed physical restore records no success and never resolves an interrupted migration", async () => {
  const h = harness({ failRestore: true, interrupted: true });
  await assert.rejects(h.execute(), { message: "restore failed" });
  assert.deepEqual(h.trace, [["restore", { artifactRef: "/snapshots/chosen.db" }]]);
});
for (const restartRequired of [true, false]) {
  test(`restore records the selected artifact before resolving a migration; restartRequired=${restartRequired} governs the live gate`, async () => {
    const h = harness({ restartRequired, interrupted: true });
    assert.deepEqual(await h.execute(), { restoreRunId: "id-1", state: "RESTORED", restartRequired });
    assert.deepEqual(h.trace, [
      ["restore", { artifactRef: "/snapshots/chosen.db" }],
      ["ledger", { id: "id-2", kind: "restore.executed", restorePointId: "chosen", outcome: "success",
        detailJson: `{"restoreRunId":"id-1","restartRequired":${restartRequired}}`, actorWorkspaceId: "ws", actorId: "operator", createdAt: "2026-10-01T12:00:00.000Z" }],
      ["resolve", { id: "interrupted" }],
      ...(restartRequired ? [] : [["status", "ws", "SERVING"]]),
    ]);
  });
}
test("restore without an interrupted migration records success without changing the live gate", async () => {
  const h = harness({ restartRequired: false });
  assert.deepEqual(await h.execute(), { restoreRunId: "id-1", state: "RESTORED", restartRequired: false });
  assert.deepEqual(h.trace.map((entry) => (entry as unknown[])[0]), ["restore", "ledger"]);
});
