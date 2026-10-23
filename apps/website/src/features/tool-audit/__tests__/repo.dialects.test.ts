import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import type { ContentKernel } from "#src/platform/db/content-kernel";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { MAX_VISITOR_ROWS_PER_WORKSPACE, SqlToolAttemptAuditSink } from "../repo.js";
import { createInMemoryToolAttemptAuditSink } from "../repo.memory.js";
import type { ToolAttemptEvent } from "../types.js";

/** @file The tool-attempt audit sink's one Kysely body on SQLite and PGlite (storage plan §4). */

function event(overrides: Partial<ToolAttemptEvent> = {}): ToolAttemptEvent {
  return {
    attemptId: "attempt-1",
    executionId: "exec-1",
    workspaceId: "ws-1",
    runId: "run-1",
    toolId: "collections_content_type_define",
    principalId: "principal-1",
    phase: "requested",
    at: "2026-07-29T00:00:00.000Z",
    detail: "keys: fields[1], key, label",
    ...overrides,
  };
}

async function rows(kernel: ContentKernel, workspaceId: string) {
  return kernel.run((db) => db.selectFrom("agent_tool_attempts").selectAll().where("workspace_id", "=", workspaceId).orderBy("id", "asc").execute());
}

describeEachDialect("ToolAttemptAuditSink", { tables: ["agent_tool_attempts"], make: (kernel) => kernel }, (makeKernel) => {
  test("visitor floods prune only their bucket; admin floods preserve visitors and other sites", async () => {
    const kernel = makeKernel();
    const sink = new SqlToolAttemptAuditSink(kernel, { maxRowsPerWorkspace: 3, maxVisitorRowsPerWorkspace: 2, pruneCheckInterval: 1 });
    await sink.append(event({ workspaceId: "other-site", principalId: "anonymous-visitor", attemptId: "other" }));
    await sink.append(event({ attemptId: "admin-original" }));
    for (let i = 0; i < 8; i++) await sink.append(event({ principalId: "anonymous-visitor", attemptId: `visitor-${i}` }));
    assert.deepEqual((await rows(kernel, "ws-1")).map(row => row.attempt_id), ["admin-original", "visitor-6", "visitor-7"]);
    for (let i = 0; i < 8; i++) await sink.append(event({ principalId: `admin-${i % 2}`, attemptId: `admin-${i}` }));
    assert.deepEqual((await rows(kernel, "ws-1")).map(row => row.attempt_id), ["visitor-6", "visitor-7", "admin-5", "admin-6", "admin-7"]);
    assert.deepEqual((await rows(kernel, "other-site")).map(row => row.attempt_id), ["other"]);
    assert.equal(MAX_VISITOR_ROWS_PER_WORKSPACE, 20_000);
  });

  test("prune cadence is tracked per workspace and bucket, so interleaved traffic cannot starve pruning", async () => {
    const kernel = makeKernel();
    const sink = new SqlToolAttemptAuditSink(kernel, { maxRowsPerWorkspace: 1, maxVisitorRowsPerWorkspace: 1, pruneCheckInterval: 2 });
    for (let i = 0; i < 4; i++) {
      await sink.append(event({ principalId: "anonymous-visitor", attemptId: `visitor-${i}` }));
      await sink.append(event({ attemptId: `admin-${i}` }));
      await sink.append(event({ workspaceId: "other", attemptId: `other-${i}` }));
    }
    assert.deepEqual((await rows(kernel, "ws-1")).map(row => row.attempt_id), ["visitor-3", "admin-3"]);
    assert.deepEqual((await rows(kernel, "other")).map(row => row.attempt_id), ["other-3"]);
  });
  test("a failed write reports the original error through the default logger and stores no event", async (t) => {
    const kernel = makeKernel();
    const failure = new Error("audit storage unavailable");
    const messages: unknown[][] = [];
    t.mock.method(console, "error", (...args: unknown[]) => { messages.push(args); });
    const broken: ContentKernel = { ...kernel, run: async () => { throw failure; } };
    await assert.doesNotReject(() => new SqlToolAttemptAuditSink(broken).append(event()));
    assert.deepEqual(messages, [["[tool-audit] append failed", failure]]);
    assert.deepEqual(await rows(kernel, "ws-1"), []);
  });
  test("daemon options preserve cross-site detail and explicit null clears legacy detail", async () => {
    const kernel = makeKernel(), sink = new SqlToolAttemptAuditSink(kernel);
    await sink.append(event(), { detail: "cross-site read: B (B)" });
    await sink.append(event({ attemptId: "cleared" }), { detail: null });
    assert.deepEqual((await rows(kernel, "ws-1")).map(row => row.detail), ["cross-site read: B (B)", null]);
  });
  test("append writes every column, scoped by workspace", async () => {
    const kernel = makeKernel();
    const sink = new SqlToolAttemptAuditSink(kernel);
    await sink.append(event());
    await sink.append(event({ workspaceId: "ws-2", executionId: null, phase: "unknown-tool", detail: undefined }));
    const [row] = await rows(kernel, "ws-1");
    assert.deepEqual(
      { ...row, id: undefined },
      { id: undefined, attempt_id: "attempt-1", execution_id: "exec-1", workspace_id: "ws-1", run_id: "run-1", tool_id: "collections_content_type_define", principal_id: "principal-1", phase: "requested", at: "2026-07-29T00:00:00.000Z", detail: "keys: fields[1], key, label" }
    );
    const [other] = await rows(kernel, "ws-2");
    assert.equal(other?.execution_id, null);
    assert.equal(other?.detail, null);
  });

  test("the per-workspace cap prunes oldest-first, keeps the boundary, and leaves other workspaces alone", async () => {
    const kernel = makeKernel();
    const sink = new SqlToolAttemptAuditSink(kernel, { maxRowsPerWorkspace: 10, pruneCheckInterval: 4 });
    await new SqlToolAttemptAuditSink(kernel).append(event({ workspaceId: "ws-other", attemptId: "other-1" }));
    for (let i = 0; i < 40; i += 1) await sink.append(event({ attemptId: `attempt-${i}` }));
    const remaining = (await rows(kernel, "ws-1")).map((r) => r.attempt_id);
    assert.deepEqual(remaining, Array.from({ length: 10 }, (_, i) => `attempt-${30 + i}`));
    assert.equal((await rows(kernel, "ws-other")).length, 1);
  });

  for (const [stage, failingRun] of [["cutoff query", 2], ["retention delete", 3]] as const) {
    test(`append preserves its successful insert when the ${stage} fails`, async () => {
      const kernel = makeKernel();
      await new SqlToolAttemptAuditSink(kernel).append(event({ attemptId: "older" }));
      const failure = new Error(`${stage} failed`);
      const errors: unknown[] = [];
      let calls = 0;
      const broken: ContentKernel = {
        ...kernel,
        run: (work) => {
          calls += 1;
          if (calls === failingRun) return Promise.reject(failure);
          return kernel.run(work);
        },
      };
      const sink = new SqlToolAttemptAuditSink(broken, { maxRowsPerWorkspace: 1, pruneCheckInterval: 1, onError: (e) => errors.push(e) });
      await assert.doesNotReject(() => sink.append(event({ attemptId: "newest" })));
      assert.equal(calls, failingRun, "the selected retention operation must be reached");
      assert.deepEqual(errors, [failure]);
      assert.equal(errors[0], failure, "report the original error");
      assert.deepEqual((await rows(kernel, "ws-1")).map((row) => row.attempt_id), ["older", "newest"]);
    });
  }

  test("append never rejects; a failed write goes to onError", async () => {
    const kernel = makeKernel();
    const errors: unknown[] = [];
    const broken: ContentKernel = { ...kernel, run: async () => { throw new Error("database is locked"); } };
    await assert.doesNotReject(() => new SqlToolAttemptAuditSink(broken, { onError: (e) => errors.push(e) }).append(event()));
    assert.equal(errors.length, 1);
  });
});

test("memory sink honors daemon options while retaining legacy event detail", async () => {
  const sink = createInMemoryToolAttemptAuditSink();
  await sink.append(event());
  await sink.append(event(), { detail: "cross-site read: B (B)" });
  await sink.append(event(), { detail: null });
  assert.deepEqual(sink.events.map(event => event.detail), ["keys: fields[1], key, label", "cross-site read: B (B)", null]);
});

test("memory sink evicts oldest anonymous events while preserving its live read array and detail", async () => {
  const sink = createInMemoryToolAttemptAuditSink({}, { maxEvents: 3 });
  const retained = sink.events;
  for (let i = 0; i < 8; i++) await sink.append(event({ principalId: "anonymous-visitor", attemptId: `visitor-${i}` }), { detail: `detail-${i}` });
  assert.equal(sink.events, retained);
  assert.deepEqual(retained.map(row => row.attemptId), ["visitor-5", "visitor-6", "visitor-7"]);
  assert.deepEqual(retained.map(row => row.detail), ["detail-5", "detail-6", "detail-7"]);
});

test("memory sink defaults to 20000 retained events and rejects invalid capacities", async () => {
  const sink = createInMemoryToolAttemptAuditSink();
  for (let i = 0; i <= 20_000; i++) await sink.append(event({ principalId: "anonymous-visitor", attemptId: String(i) }));
  assert.equal(sink.events.length, 20_000);
  assert.equal(sink.events[0].attemptId, "1");
  assert.equal(sink.events.at(-1)?.attemptId, "20000");
  for (const maxEvents of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createInMemoryToolAttemptAuditSink({}, { maxEvents }), RangeError);
  }
});
