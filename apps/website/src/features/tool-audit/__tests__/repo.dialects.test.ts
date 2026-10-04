import assert from "node:assert/strict";
import test from "node:test";

import type { ContentKernel } from "#src/platform/db/content-kernel";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { SqlToolAttemptAuditSink } from "../repo.js";
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
