import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { contentKernel } from "#src/platform/db/content-kernel";
import { createBackstopAuditSqlitePort } from "#src/platform/db/sqlite/publish-backstop-audit.sqlite";
import type { BackstopAuditRecord } from "../backstop-audit.js";

test("audit storage stays closed before installation and persists source and destination events by workspace", async (t) => {
  const db = new Database(":memory:");
  t.after(() => db.close());
  const audit = createBackstopAuditSqlitePort({ kernel: contentKernel(db) });
  assert.equal(await audit.ready(), false);
  // Test-only schema: the production migration remains staged, never installed by this job.
  db.exec(`CREATE TABLE publish_backstop_log (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, direction TEXT NOT NULL,
    actor_id TEXT NOT NULL, destination TEXT NOT NULL, reason TEXT NOT NULL, at TEXT NOT NULL,
    items_json TEXT NOT NULL, gap_labels_json TEXT NOT NULL, result TEXT NOT NULL,
    run_id TEXT, details_json TEXT NOT NULL, inverses_json TEXT NOT NULL
  )`);
  assert.equal(await audit.ready(), true);
  const event: BackstopAuditRecord = {
    id: "source-1", workspaceId: "ws", direction: "source", actorId: "admin",
    destination: "https://live.example", reason: "Emergency footer fix", at: "2026-10-04T00:00:00.000Z",
    items: [{ entityType: "raw-row", id: "p_widgets:a", beforeHash: null, afterHash: "after" }],
    gapLabels: ["table:p_widgets", "table:p_widgets"], result: "pending", runId: null, details: {}, inverses: [],
  };
  await audit.save({ record: event });
  await audit.save({ record: { ...event, result: "success", runId: "run-1", details: { applied: 1 } } });
  assert.equal((await audit.get({ workspaceId: "ws", id: event.id }))?.result, "success");
  assert.deepEqual((await audit.get({ workspaceId: "ws", id: "run-1" }))?.details, { applied: 1 });
  assert.equal(await audit.get({ workspaceId: "other", id: event.id }), null);
  await audit.save({ record: { ...event, id: "destination-1", direction: "destination", result: "success", runId: "run-1" } });
  assert.equal((await audit.get({ workspaceId: "ws", id: "run-1" }))?.direction, "destination");
  await audit.save({ record: { ...event, id: "source-2", result: "success", at: "2026-10-04T01:00:00.000Z", reason: "Emergency second fix" } });
  await audit.save({ record: { ...event, id: "failed", result: "failure", details: { error: "FK check failed" } } });
  await audit.save({ record: { ...event, id: "other", workspaceId: "other", result: "success" } });
  assert.equal((await audit.get({ workspaceId: "ws", id: "failed" }))?.details.error, "FK check failed");
  assert.deepEqual(await audit.gaps({ workspaceId: "ws" }), [{
    label: "table:p_widgets", count: 2, lastReason: "Emergency second fix", lastAt: "2026-10-04T01:00:00.000Z",
  }]);
});
