import assert from "node:assert/strict";
import test from "node:test";

import type { Principal, RunRef, SurfaceEmitter } from "@jini-ai/core";
import type { ToolExecutionResult, ToolExecutor } from "@jini-ai/daemon";

import {
  mintToolErrorId,
  readToolErrorId,
  TOOL_ERROR_ID_PATTERN,
  withRedactedToolFailures,
  type ToolFailureRecord,
} from "../tool-failure-redaction.js";

/**
 * @file `tool-failure-redaction.ts` — the decorator that blanks secret-shaped values out of a FAILED
 * tool's error text and mints a copyable `ERR-…` id for the internal ones, per the 2026-09-16 owner
 * decision ("hide secrets only" — a failed tool's error stays visible everywhere, secret-shaped
 * VALUES inside it never do). Uses a stub inner executor so these tests assert the decorator's own
 * contract in isolation from the real `@jini-ai/daemon` executor and registry — the real-stack path
 * is covered by `tool-executor-stack.failure-redaction.test.ts`.
 */

const PRINCIPAL: Principal = { id: "principal-1" };
const RUN: RunRef = { id: "run-1" };
const FIXED_ID = "ERR-AAAA-BBBB-CCCC-DDDD";

const STRIPE_KEY = ["sk", "live", ""].join("_") + "Ab3".repeat(8);
const GHP_TOKEN = "ghp_" + "a1".repeat(18);

function fakeExecutor(result: ToolExecutionResult): ToolExecutor & { calls: number } {
  const executor = {
    calls: 0,
    execute: async (): Promise<ToolExecutionResult> => {
      executor.calls += 1;
      return result;
    },
    resumeConfirmation: () => {},
    cancel: () => {},
    getAuditRecord: () => null,
  };
  return executor as ToolExecutor & { calls: number };
}

function throwingExecutor(error: unknown): ToolExecutor {
  return {
    execute: async () => {
      throw error;
    },
    resumeConfirmation: () => {},
    cancel: () => {},
    getAuditRecord: () => null,
  };
}

test("an internal failure whose text holds secrets is redacted, ID-prefixed, and recorded", async () => {
  const records: ToolFailureRecord[] = [];
  const inner = fakeExecutor({
    executionId: "exec-1",
    status: "failed",
    errorKind: "internal",
    error: `request failed: key=${STRIPE_KEY} Authorization: Bearer ${GHP_TOKEN}`,
  });
  const executor = withRedactedToolFailures(inner, { mintErrorId: () => FIXED_ID, onFailure: (r) => records.push(r) });

  const result = await executor.execute(PRINCIPAL, RUN, "custom_credential_make_request", {});

  assert.match(result.error!, /^Error ERR-[0-9A-F]{4}(-[0-9A-F]{4}){3}: /);
  assert.equal(result.error!.includes(STRIPE_KEY), false);
  assert.equal(result.error!.includes(GHP_TOKEN), false);
  assert.equal(readToolErrorId(result), FIXED_ID);
  assert.equal(records.length, 1);
  assert.deepEqual(records[0], {
    errorId: FIXED_ID,
    toolId: "custom_credential_make_request",
    runId: "run-1",
    principalId: "principal-1",
    executionId: "exec-1",
    redactions: 2,
    message: records[0].message,
  });
  assert.equal(records[0].message.includes(STRIPE_KEY), false);
  assert.equal(records[0].message.includes(GHP_TOKEN), false);
});

test("an internal failure with no secret gives exactly 'Error <ID>: <original>', with redactions: 0", async () => {
  const records: ToolFailureRecord[] = [];
  const inner = fakeExecutor({ executionId: "exec-2", status: "failed", errorKind: "internal", error: "connect ECONNREFUSED 10.0.4.7:443" });
  const executor = withRedactedToolFailures(inner, { mintErrorId: () => FIXED_ID, onFailure: (r) => records.push(r) });

  const result = await executor.execute(PRINCIPAL, RUN, "t", {});

  assert.equal(result.error, `Error ${FIXED_ID}: connect ECONNREFUSED 10.0.4.7:443`);
  assert.equal(records[0].redactions, 0);
});

test("a missing errorKind is treated as internal", async () => {
  const inner = fakeExecutor({ executionId: "exec-3", status: "failed", error: "boom" });
  const executor = withRedactedToolFailures(inner, { mintErrorId: () => FIXED_ID });

  const result = await executor.execute(PRINCIPAL, RUN, "t", {});

  assert.equal(result.error, `Error ${FIXED_ID}: boom`);
  assert.equal(readToolErrorId(result), FIXED_ID);
});

test("a validation failure is redacted with no ID minted and onFailure never called", async () => {
  const records: ToolFailureRecord[] = [];
  const inner = fakeExecutor({
    executionId: "exec-4",
    status: "failed",
    errorKind: "validation",
    error: "MEMBERS_NOT_FOUND: member 'x' was not found",
  });
  const executor = withRedactedToolFailures(inner, { mintErrorId: () => FIXED_ID, onFailure: (r) => records.push(r) });

  const result = await executor.execute(PRINCIPAL, RUN, "t", {});

  assert.equal(result.error, "MEMBERS_NOT_FOUND: member 'x' was not found");
  assert.equal(readToolErrorId(result), undefined);
  assert.equal(records.length, 0);
});

test("a validation failure whose message holds a secret is still blanked, with no ID", async () => {
  const inner = fakeExecutor({ executionId: "exec-5", status: "failed", errorKind: "validation", error: `bad key: ${STRIPE_KEY}` });
  const executor = withRedactedToolFailures(inner, { mintErrorId: () => FIXED_ID });

  const result = await executor.execute(PRINCIPAL, RUN, "t", {});

  assert.equal(result.error!.includes(STRIPE_KEY), false);
  assert.equal(readToolErrorId(result), undefined);
});

test("every non-failed status is returned strictly unchanged", async () => {
  const statuses = ["completed", "denied", "timed-out", "cancelled", "confirmation-denied"] as const;
  for (const status of statuses) {
    const original: ToolExecutionResult = { executionId: "exec-6", status, output: { a: 1 } };
    const inner = fakeExecutor(original);
    const executor = withRedactedToolFailures(inner, { mintErrorId: () => FIXED_ID });

    const result = await executor.execute(PRINCIPAL, RUN, "t", {});

    assert.strictEqual(result, original, `status '${status}' must be returned as the exact same object`);
  }
});

test("the inner executor throwing is rethrown untouched, and onFailure is never called", async () => {
  const records: ToolFailureRecord[] = [];
  const boom = new Error("unknown tool \"typo\"");
  const executor = withRedactedToolFailures(throwingExecutor(boom), { onFailure: (r) => records.push(r) });

  const thrown = await executor.execute(PRINCIPAL, RUN, "typo", {}).then(
    () => null,
    (e: unknown) => e,
  );

  assert.equal(thrown, boom);
  assert.equal(records.length, 0);
});

test("with the default minter, two internal failures get two different IDs, and both match the pattern", async () => {
  const inner1 = fakeExecutor({ executionId: "e1", status: "failed", errorKind: "internal", error: "boom 1" });
  const inner2 = fakeExecutor({ executionId: "e2", status: "failed", errorKind: "internal", error: "boom 2" });

  const r1 = await withRedactedToolFailures(inner1).execute(PRINCIPAL, RUN, "t", {});
  const r2 = await withRedactedToolFailures(inner2).execute(PRINCIPAL, RUN, "t", {});

  const id1 = readToolErrorId(r1)!;
  const id2 = readToolErrorId(r2)!;
  assert.notEqual(id1, id2);
  assert.match(id1, TOOL_ERROR_ID_PATTERN);
  assert.match(id2, TOOL_ERROR_ID_PATTERN);
});

test("mintToolErrorId always matches TOOL_ERROR_ID_PATTERN", () => {
  for (let i = 0; i < 20; i += 1) assert.match(mintToolErrorId(), TOOL_ERROR_ID_PATTERN);
});

test("an onFailure that throws still returns the redacted result", async () => {
  const inner = fakeExecutor({ executionId: "exec-7", status: "failed", errorKind: "internal", error: "boom" });
  const executor = withRedactedToolFailures(inner, {
    mintErrorId: () => FIXED_ID,
    onFailure: () => {
      throw new Error("sink exploded");
    },
  });

  const result = await executor.execute(PRINCIPAL, RUN, "t", {});

  assert.equal(result.error, `Error ${FIXED_ID}: boom`);
});

test("resumeConfirmation, cancel and getAuditRecord delegate straight through", () => {
  const calls: string[] = [];
  const record = { executionId: "e", toolId: "t", principalId: "p", runId: "r", events: [] };
  const inner = {
    execute: async () => ({ executionId: "e", status: "completed" as const }),
    resumeConfirmation: (id: string, decision: string) => calls.push(`resume:${id}:${decision}`),
    cancel: (id: string) => calls.push(`cancel:${id}`),
    getAuditRecord: (id: string) => {
      calls.push(`get:${id}`);
      return record;
    },
  } as unknown as ToolExecutor;

  const executor = withRedactedToolFailures(inner);
  executor.resumeConfirmation("e", "confirm");
  executor.cancel("e");

  assert.equal(executor.getAuditRecord("e"), record);
  assert.deepEqual(calls, ["resume:e:confirm", "cancel:e", "get:e"]);
});

// Present only so `SurfaceEmitter` is exercised as a type — the decorator must forward the exact
// argument list `inner.execute` declares, `emitSurface` included, with no narrowing.
void (async () => {
  const emit: SurfaceEmitter = async () => {};
  const inner = fakeExecutor({ executionId: "e", status: "completed" });
  await withRedactedToolFailures(inner).execute(PRINCIPAL, RUN, "t", {}, undefined, emit);
})();
