/**
 * @file Coverage for `apply-report.ts`: the execute reply gains `report` only from a ready audit's
 * destination record that carries one, and every other case (no audit, not ready, no record, a
 * source-side record, no report, a failing read) adds nothing and never throws. Small audit fake;
 * no module mocks.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { BackstopAuditPort, BackstopAuditRecord } from "#src/features/publish-content/backstop-audit";
import { readBackstopApplyReport } from "../apply-report.js";

const report = {
  refused: false,
  refusalReason: null,
  applyOrder: ["raw-row"],
  rows: [{ entityType: "raw-row", entityId: "p:1", entityLabel: "Footer", outcome: "skip", writes: [], reason: "already current", canOverwrite: false, retires: [] }],
};

function record(overrides: Partial<BackstopAuditRecord> = {}): BackstopAuditRecord {
  return {
    id: "run-1", workspaceId: "ws", direction: "destination", actorId: "owner", destination: "live.example", reason: "fix",
    at: "2026-10-04T00:00:00.000Z", items: [], gapLabels: [], result: "success", runId: "run-1", details: { report }, inverses: [],
    ...overrides,
  };
}

function audit(options: { ready?: boolean; found?: BackstopAuditRecord | null; getThrows?: boolean } = {}): BackstopAuditPort & { gets: Array<{ workspaceId: string; id: string }> } {
  const gets: Array<{ workspaceId: string; id: string }> = [];
  return {
    gets,
    ready: async () => options.ready ?? true,
    save: async () => undefined,
    gaps: async () => [],
    get: async (input) => {
      gets.push(input);
      if (options.getThrows) throw new Error("audit table locked");
      return options.found === undefined ? record() : options.found;
    },
  };
}

test("a ready audit's destination record with a report becomes the reply's report DTO", async () => {
  const port = audit();
  const out = await readBackstopApplyReport({ audit: port, workspaceId: "ws", runId: "run-1" });
  assert.deepEqual(out, { report });
  assert.deepEqual(port.gets, [{ workspaceId: "ws", id: "run-1" }]);
});

test("no audit port, or one that is not ready, adds nothing and reads no record", async () => {
  assert.deepEqual(await readBackstopApplyReport({ audit: undefined, workspaceId: "ws", runId: "run-1" }), {});
  const notReady = audit({ ready: false });
  assert.deepEqual(await readBackstopApplyReport({ audit: notReady, workspaceId: "ws", runId: "run-1" }), {});
  assert.deepEqual(notReady.gets, []);
});

test("a missing record, a source-side record, or one without a report adds nothing", async () => {
  for (const found of [null, record({ direction: "source" }), record({ details: {} })]) {
    assert.deepEqual(await readBackstopApplyReport({ audit: audit({ found }), workspaceId: "ws", runId: "run-1" }), {});
  }
});

test("a failing audit read adds nothing instead of failing the already-applied run", async () => {
  assert.deepEqual(await readBackstopApplyReport({ audit: audit({ getThrows: true }), workspaceId: "ws", runId: "run-1" }), {});
});
