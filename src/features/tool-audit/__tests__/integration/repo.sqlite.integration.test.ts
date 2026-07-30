import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { desc, eq } from "drizzle-orm";

import { agentToolAttempts } from "../../../../infra/db/schema";
import { openContentDb } from "../../../../infra/sqlite/content-db";
import { MAX_ROWS_PER_WORKSPACE, SqliteToolAttemptAuditSink } from "../../repo.sqlite";
import type { ToolAttemptEvent } from "../../types";

/**
 * @file Real SQLite persistence for the agent tool-attempt audit trail. Uses a temp-file database
 * rather than `:memory:`, matching this repo's convention for this class of test
 * (`features/content-types/__tests__/integration/repo.sqlite.integration.test.ts`).
 *
 * The point of testing this against a real database rather than a fake: the whole reason the table
 * exists is that Jini's trail is in-memory and does not survive a restart, so a test that proved
 * persistence against an in-memory double would be proving nothing about the actual claim. The
 * reopen test below is the one that matters.
 */

function openTempContentDb() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tool-audit-sqlite-"));
  const filePath = path.join(tmpDir, "content.db");
  return { db: openContentDb(filePath), filePath, tmpDir };
}

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

test("an appended attempt survives closing and reopening the database — the whole point of the table", async (t) => {
  const { db, filePath, tmpDir } = openTempContentDb();
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await new SqliteToolAttemptAuditSink(db).append(event());
  await new SqliteToolAttemptAuditSink(db).append(event({ phase: "completed", detail: null }));

  const reopened = openContentDb(filePath);
  const rows = reopened.select().from(agentToolAttempts).all();

  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.phase),
    ["requested", "completed"],
  );
  assert.equal(rows[0].detail, "keys: fields[1], key, label");
  assert.equal(rows[1].detail, null);
  assert.equal(rows[0].attemptId, rows[1].attemptId);
});

test("a null executionId round-trips as NULL — the unknown-tool case must be storable", async (t) => {
  const { db, tmpDir } = openTempContentDb();
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  await new SqliteToolAttemptAuditSink(db).append(event({ executionId: null, phase: "unknown-tool", toolId: "collections_typo" }));

  const [row] = db.select().from(agentToolAttempts).all();
  assert.equal(row.executionId, null);
  assert.equal(row.phase, "unknown-tool");
  assert.equal(row.toolId, "collections_typo");
});

test("append never throws, even when the underlying write fails — audit is observation, not a gate", async (t) => {
  const { db, tmpDir } = openTempContentDb();
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const errors: unknown[] = [];
  const broken = { insert: () => { throw new Error("database is locked"); } } as unknown as typeof db;

  await assert.doesNotReject(() => new SqliteToolAttemptAuditSink(broken, { onError: (e) => errors.push(e) }).append(event()));
  assert.equal(errors.length, 1, "the failure must be reported, not silently dropped");
});

test("rows are scoped by workspace, so one tenant's trail cannot be read as another's (ADR-007)", async (t) => {
  const { db, tmpDir } = openTempContentDb();
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
  const sink = new SqliteToolAttemptAuditSink(db);

  await sink.append(event({ workspaceId: "ws-1" }));
  await sink.append(event({ workspaceId: "ws-2" }));

  assert.equal(db.select().from(agentToolAttempts).where(eq(agentToolAttempts.workspaceId, "ws-1")).all().length, 1);
  assert.equal(db.select().from(agentToolAttempts).where(eq(agentToolAttempts.workspaceId, "ws-2")).all().length, 1);
});

test("RETENTION: the per-workspace cap prunes oldest-first and leaves other workspaces untouched", async (t) => {
  const { db, tmpDir } = openTempContentDb();
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  // The cap and check interval are injected small so this exercises the real trigger path — a
  // genuine append driving a genuine prune — instead of calling a private method or writing 50k rows.
  const sink = new SqliteToolAttemptAuditSink(db, { maxRowsPerWorkspace: 10, pruneCheckInterval: 4 });
  await new SqliteToolAttemptAuditSink(db).append(event({ workspaceId: "ws-other", attemptId: "other-1" }));

  for (let i = 0; i < 40; i += 1) await sink.append(event({ workspaceId: "ws-1", attemptId: `attempt-${i}` }));

  const remaining = db.select().from(agentToolAttempts).where(eq(agentToolAttempts.workspaceId, "ws-1")).all();
  assert.ok(remaining.length <= 10, `expected at most 10 rows, found ${remaining.length}`);

  const newest = db.select().from(agentToolAttempts).where(eq(agentToolAttempts.workspaceId, "ws-1")).orderBy(desc(agentToolAttempts.id)).limit(1).all();
  assert.equal(newest[0].attemptId, "attempt-39", "the most recent append must always survive the prune");
  assert.equal(remaining.some((r) => r.attemptId === "attempt-0"), false, "the oldest rows are the ones pruned");
  assert.equal(
    db.select().from(agentToolAttempts).where(eq(agentToolAttempts.workspaceId, "ws-other")).all().length,
    1,
    "another workspace's rows must never be pruned by this workspace's writes",
  );
});

test("RETENTION: a workspace under the cap is never pruned", async (t) => {
  const { db, tmpDir } = openTempContentDb();
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
  const sink = new SqliteToolAttemptAuditSink(db, { maxRowsPerWorkspace: 10, pruneCheckInterval: 2 });

  for (let i = 0; i < 10; i += 1) await sink.append(event({ attemptId: `attempt-${i}` }));

  assert.equal(db.select().from(agentToolAttempts).all().length, 10, "at exactly the cap, nothing may be pruned — the boundary value must survive");
});

test("RETENTION: the shipped default cap is the documented starting number, so a silent change is visible here", () => {
  assert.equal(MAX_ROWS_PER_WORKSPACE, 50_000);
});
