import assert from "node:assert/strict";
import test from "node:test";

import type { Principal, RunRef, SurfaceEmitter } from "@jini-ai/core";
import type { ToolExecutionResult, ToolExecutor } from "@jini-ai/daemon";

import {
  mintToolErrorId,
  readToolErrorId,
  TOOL_ERROR_ID_PATTERN,
  withRedactedToolFailures,
} from "../tool-recovery-preset.js";

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

function fakeExecutor(result: ToolExecutionResult): ToolExecutor & { calls: number; arguments: Parameters<ToolExecutor["execute"]>[] } {
  const executor = {
    calls: 0,
    arguments: [] as Parameters<ToolExecutor["execute"]>[],
    execute: async (...args: Parameters<ToolExecutor["execute"]>): Promise<ToolExecutionResult> => {
      executor.calls += 1;
      executor.arguments.push(args);
      return result;
    },
    resumeConfirmation: () => {},
    cancel: () => {},
    getAuditRecord: () => null,
  };
  return executor;
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

test("standalone withRedactedToolFailures still redacts and stamps an id", async (t) => {
  // It has no reporter: recording is the daemon observation layer's job (P4-J4). Any console write
  // here would be the removed global `[tool-failure]` sink coming back as a second, unowned record.
  const errors = t.mock.method(console, "error", () => {});
  const warnings = t.mock.method(console, "warn", () => {});
  const inner = fakeExecutor({
    executionId: "exec-1",
    status: "failed",
    errorKind: "internal",
    error: `request failed: key=${STRIPE_KEY} Authorization: Bearer ${GHP_TOKEN}`,
  });
  const executor = withRedactedToolFailures({ inner: inner }, { mintErrorId: () => FIXED_ID });

  const result = await executor.execute({ principal: PRINCIPAL, run: RUN, toolId: "custom_credential_make_request", input: {} });

  assert.match(result.error!, /^Error ERR-[0-9A-F]{4}(-[0-9A-F]{4}){3}: /);
  assert.equal(result.error!.includes(STRIPE_KEY), false);
  assert.equal(result.error!.includes(GHP_TOKEN), false);
  assert.equal(readToolErrorId({ result: result }, {}), FIXED_ID);
  assert.equal(errors.mock.callCount(), 0, "the standalone adapter must not record on its own");
  assert.equal(warnings.mock.callCount(), 0);
});

test("an internal failure with no secret gives exactly 'Error <ID>: <original>'", async () => {
  const inner = fakeExecutor({ executionId: "exec-2", status: "failed", errorKind: "internal", error: "connect ECONNREFUSED 10.0.4.7:443" });
  const executor = withRedactedToolFailures({ inner: inner }, { mintErrorId: () => FIXED_ID });

  const result = await executor.execute({ principal: PRINCIPAL, run: RUN, toolId: "t", input: {} });

  assert.equal(result.error, `Error ${FIXED_ID}: connect ECONNREFUSED 10.0.4.7:443`);
});

test("a missing errorKind is treated as internal", async () => {
  const inner = fakeExecutor({ executionId: "exec-3", status: "failed", error: "boom" });
  const executor = withRedactedToolFailures({ inner: inner }, { mintErrorId: () => FIXED_ID });

  const result = await executor.execute({ principal: PRINCIPAL, run: RUN, toolId: "t", input: {} });

  assert.equal(result.error, `Error ${FIXED_ID}: boom`);
  assert.equal(readToolErrorId({ result: result }, {}), FIXED_ID);
});

test("a validation failure is redacted with no ID minted", async () => {
  const inner = fakeExecutor({
    executionId: "exec-4",
    status: "failed",
    errorKind: "validation",
    error: "MEMBERS_NOT_FOUND: member 'x' was not found",
  });
  const executor = withRedactedToolFailures({ inner: inner }, { mintErrorId: () => FIXED_ID });

  const result = await executor.execute({ principal: PRINCIPAL, run: RUN, toolId: "t", input: {} });

  assert.equal(result.error, "MEMBERS_NOT_FOUND: member 'x' was not found");
  assert.equal(readToolErrorId({ result: result }, {}), undefined);
});

test("a validation failure whose message holds a secret is still blanked, with no ID", async () => {
  const inner = fakeExecutor({ executionId: "exec-5", status: "failed", errorKind: "validation", error: `bad key: ${STRIPE_KEY}` });
  const executor = withRedactedToolFailures({ inner: inner }, { mintErrorId: () => FIXED_ID });

  const result = await executor.execute({ principal: PRINCIPAL, run: RUN, toolId: "t", input: {} });

  assert.equal(result.error!.includes(STRIPE_KEY), false);
  assert.equal(readToolErrorId({ result: result }, {}), undefined);
});

test("every non-failed status is returned strictly unchanged", async () => {
  const statuses = ["completed", "denied", "timed-out", "cancelled", "confirmation-denied"] as const;
  for (const status of statuses) {
    const original: ToolExecutionResult = { executionId: "exec-6", status, output: { a: 1 } };
    const inner = fakeExecutor(original);
    const executor = withRedactedToolFailures({ inner: inner }, { mintErrorId: () => FIXED_ID });

    const result = await executor.execute({ principal: PRINCIPAL, run: RUN, toolId: "t", input: {} });

    assert.strictEqual(result, original, `status '${status}' must be returned as the exact same object`);
  }
});

test("the inner executor throwing is rethrown untouched", async () => {
  const boom = new Error("unknown tool \"typo\"");
  const executor = withRedactedToolFailures({ inner: throwingExecutor(boom) }, {});

  const thrown = await executor.execute({ principal: PRINCIPAL, run: RUN, toolId: "typo", input: {} }).then(
    () => null,
    (e: unknown) => e,
  );

  assert.equal(thrown, boom);
});

test("with the default minter, two internal failures get two different IDs, and both match the pattern", async () => {
  const inner1 = fakeExecutor({ executionId: "e1", status: "failed", errorKind: "internal", error: "boom 1" });
  const inner2 = fakeExecutor({ executionId: "e2", status: "failed", errorKind: "internal", error: "boom 2" });

  const r1 = await withRedactedToolFailures({ inner: inner1 }, {}).execute({ principal: PRINCIPAL, run: RUN, toolId: "t", input: {} });
  const r2 = await withRedactedToolFailures({ inner: inner2 }, {}).execute({ principal: PRINCIPAL, run: RUN, toolId: "t", input: {} });

  const id1 = readToolErrorId({ result: r1 }, {})!;
  const id2 = readToolErrorId({ result: r2 }, {})!;
  assert.notEqual(id1, id2);
  assert.match(id1, TOOL_ERROR_ID_PATTERN);
  assert.match(id2, TOOL_ERROR_ID_PATTERN);
});

test("mintToolErrorId always matches TOOL_ERROR_ID_PATTERN", () => {
  for (let i = 0; i < 20; i += 1) assert.match(mintToolErrorId({}, {}), TOOL_ERROR_ID_PATTERN);
});

test("resumeConfirmation, cancel and getAuditRecord delegate straight through", () => {
  const calls: string[] = [];
  const record = { executionId: "e", toolId: "t", principalId: "p", runId: "r", events: [] };
  const inner = {
    execute: async () => ({ executionId: "e", status: "completed" as const }),
    resumeConfirmation: ({ executionId: id, decision }: { executionId: string; decision: string }) => calls.push(`resume:${id}:${decision}`),
    cancel: ({ executionId: id }: { executionId: string }) => calls.push(`cancel:${id}`),
    getAuditRecord: ({ executionId: id }: { executionId: string }) => {
      calls.push(`get:${id}`);
      return record;
    },
  } as unknown as ToolExecutor;

  const executor = withRedactedToolFailures({ inner: inner }, {});
  executor.resumeConfirmation({ executionId: "e", decision: "confirm" });
  executor.cancel({ executionId: "e" });

  assert.equal(executor.getAuditRecord({ executionId: "e" }), record);
  assert.deepEqual(calls, ["resume:e:confirm", "cancel:e", "get:e"]);
});

test("redaction forwards every execute argument, including the cancellation and surface channels", async () => {
  const emit: SurfaceEmitter = async () => {};
  const signal = new AbortController().signal;
  const input = { field: "value" };
  const inner = fakeExecutor({ executionId: "e", status: "completed" });
  await withRedactedToolFailures({ inner: inner }, {}).execute({ principal: PRINCIPAL, run: RUN, toolId: "t", input: input }, { signal: signal, emitSurface: emit });
  assert.equal(inner.arguments.length, 1);
  assert.equal(inner.arguments[0].length, 2);
  const [required, optional] = inner.arguments[0];
  assert.equal(required.principal, PRINCIPAL);
  assert.equal(required.run, RUN);
  assert.equal(required.toolId, "t");
  assert.equal(required.input, input);
  assert.equal(optional?.signal, signal);
  assert.equal(optional?.emitSurface, emit);
});
