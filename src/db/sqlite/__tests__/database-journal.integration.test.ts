import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openDatabaseJournalDb } from "../database-journal-db";
import { SqliteMigrationRunsRepo, SqliteRestorePointsRepo, SqliteDatabaseLedgerRepo } from "../database-journal-repo";

/**
 * @file ADR-041 §2/§4 — integration tests for the sidecar `ops/database-journal.db` schema +
 * adapters, against a real temp-file SQLite database (mirrors
 * `core/gated-mutations/__tests__/integration/db-ops.integration.test.ts`'s pattern: a real
 * `better-sqlite3` file, not a fake). No certified test suite gates this slice (ADR-PIPE-017's
 * File Map names the tables/adapter but the TDD suite dispatched this session covered only
 * `features/database`'s pure-logic layer) — these tests are this session's own coverage for the
 * new schema/adapter layer, per the dispatch's own instruction to write them.
 */

function openTempJournal() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "database-journal-"));
  const filePath = path.join(tmpDir, "database-journal.db");
  const db = openDatabaseJournalDb(filePath);
  return { db, tmpDir };
}

test("migration runs clean: all 3 tables exist after openDatabaseJournalDb", async () => {
  const { db, tmpDir } = openTempJournal();
  try {
    const ledger = new SqliteDatabaseLedgerRepo({ db, siteId: "site-1" });
    const runs = new SqliteMigrationRunsRepo({ db, siteId: "site-1" });
    const restorePoints = new SqliteRestorePointsRepo({ db, siteId: "site-1" });

    // A missing table throws a SQLITE_ERROR synchronously from better-sqlite3 — issuing one real
    // (empty-result) query per table is a direct proof the migration actually created all three.
    const [ledgerResult, run, restorePoint] = await Promise.all([
      ledger.query({ limit: 10 }),
      runs.findNonTerminalForSite("site-1"),
      restorePoints.findByIdempotencyKey("nonexistent"),
    ]);
    assert.deepEqual(ledgerResult.items, []);
    assert.equal(run, null);
    assert.equal(restorePoint, null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("SqliteDatabaseLedgerRepo: append + query round-trips a row and filters by kind/outcome", async () => {
  const { db, tmpDir } = openTempJournal();
  try {
    const ledger = new SqliteDatabaseLedgerRepo({ db, siteId: "site-1" });

    await ledger.append({
      id: "led-1",
      kind: "core.migration",
      outcome: "success",
      createdAt: "2026-07-15T00:00:00.000Z",
    });
    await ledger.append({
      id: "led-2",
      kind: "restore.executed",
      outcome: "success",
      createdAt: "2026-07-15T00:01:00.000Z",
    });
    await ledger.append({
      id: "led-3",
      kind: "core.migration",
      outcome: "failed",
      createdAt: "2026-07-15T00:02:00.000Z",
    });

    const allRows = await ledger.query({ limit: 10 });
    assert.equal(allRows.items.length, 3);
    assert.equal(allRows.items[0].id, "led-3", "newest-first ordering");
    assert.equal(allRows.nextCursor, null);

    const byKind = await ledger.query({ kind: "core.migration", limit: 10 });
    assert.deepEqual(
      byKind.items.map((r) => r.id).sort(),
      ["led-1", "led-3"]
    );

    const byOutcome = await ledger.query({ outcome: "failed", limit: 10 });
    assert.deepEqual(byOutcome.items.map((r) => r.id), ["led-3"]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("SqliteDatabaseLedgerRepo: query() paginates via a stable cursor, never a raw offset", async () => {
  const { db, tmpDir } = openTempJournal();
  try {
    const ledger = new SqliteDatabaseLedgerRepo({ db, siteId: "site-1" });
    for (let i = 0; i < 5; i += 1) {
      await ledger.append({
        id: `led-${i}`,
        kind: "core.migration",
        outcome: "success",
        createdAt: `2026-07-15T00:0${i}:00.000Z`,
      });
    }

    const page1 = await ledger.query({ limit: 2 });
    assert.equal(page1.items.length, 2);
    assert.deepEqual(page1.items.map((r) => r.id), ["led-4", "led-3"]);
    assert.ok(page1.nextCursor);

    const page2 = await ledger.query({ limit: 2, cursor: page1.nextCursor ?? undefined });
    assert.deepEqual(page2.items.map((r) => r.id), ["led-2", "led-1"]);
    assert.ok(page2.nextCursor);

    const page3 = await ledger.query({ limit: 2, cursor: page2.nextCursor ?? undefined });
    assert.deepEqual(page3.items.map((r) => r.id), ["led-0"]);
    assert.equal(page3.nextCursor, null, "the final page must report no further cursor");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("SqliteDatabaseLedgerRepo.appendInterruptedRow: writes a migration.interrupted row (ADR-041 §3 boot reconciliation)", async () => {
  const { db, tmpDir } = openTempJournal();
  try {
    const ledger = new SqliteDatabaseLedgerRepo({ db, siteId: "site-1" });
    await ledger.appendInterruptedRow({ siteId: "site-1", migrationRunId: "run-1" });

    const result = await ledger.query({ kind: "migration.interrupted", limit: 10 });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].outcome, "blocked_pending_recovery");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("SqliteDatabaseLedgerRepo: rows are strictly site-scoped — a different siteId never sees another site's rows", async () => {
  const { db, tmpDir } = openTempJournal();
  try {
    const siteA = new SqliteDatabaseLedgerRepo({ db, siteId: "site-a" });
    const siteB = new SqliteDatabaseLedgerRepo({ db, siteId: "site-b" });

    await siteA.append({ id: "led-a1", kind: "core.migration", outcome: "success", createdAt: "2026-07-15T00:00:00.000Z" });
    await siteB.append({ id: "led-b1", kind: "core.migration", outcome: "success", createdAt: "2026-07-15T00:00:00.000Z" });

    const resultA = await siteA.query({ limit: 10 });
    const resultB = await siteB.query({ limit: 10 });

    assert.deepEqual(resultA.items.map((r) => r.id), ["led-a1"]);
    assert.deepEqual(resultB.items.map((r) => r.id), ["led-b1"]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("SqliteMigrationRunsRepo: findNonTerminalForSite finds an in-flight run and stops finding it once it reaches a terminal status", async () => {
  const { db, tmpDir } = openTempJournal();
  try {
    const runs = new SqliteMigrationRunsRepo({ db, siteId: "site-1" });

    await runs.insert({
      id: "run-1",
      dialect: "sqlite",
      status: "QUIESCING",
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
    });

    const nonTerminal = await runs.findNonTerminalForSite("site-1");
    assert.deepEqual(nonTerminal, { id: "run-1", status: "QUIESCING" });

    await runs.updateState({ id: "run-1", status: "DONE", updatedAt: "2026-07-15T00:05:00.000Z" });

    const afterCompletion = await runs.findNonTerminalForSite("site-1");
    assert.equal(afterCompletion, null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("SqliteMigrationRunsRepo: findNonTerminalForSite is site-scoped", async () => {
  const { db, tmpDir } = openTempJournal();
  try {
    const runsA = new SqliteMigrationRunsRepo({ db, siteId: "site-a" });
    const runsB = new SqliteMigrationRunsRepo({ db, siteId: "site-b" });

    await runsA.insert({
      id: "run-a1",
      dialect: "sqlite",
      status: "APPLYING",
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
    });

    assert.ok(await runsA.findNonTerminalForSite("site-a"));
    assert.equal(await runsB.findNonTerminalForSite("site-b"), null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("SqliteRestorePointsRepo: save + findByIdempotencyKey round-trips, and a second save under the same key is not required to be re-found under a different key", async () => {
  const { db, tmpDir } = openTempJournal();
  try {
    const repo = new SqliteRestorePointsRepo({ db, siteId: "site-1" });

    await repo.save({
      restorePointId: "rp-1",
      idempotencyKey: "key-1",
      trigger: "manual",
      createdAt: "2026-07-15T00:00:00.000Z",
      createdBy: "user-1",
      watermarkAtCapture: 42,
    });

    const found = await repo.findByIdempotencyKey("key-1");
    assert.deepEqual(found, { restorePointId: "rp-1", idempotencyKey: "key-1" });

    const notFound = await repo.findByIdempotencyKey("key-does-not-exist");
    assert.equal(notFound, null);

    const listed = await repo.list();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].watermarkAtCapture, 42);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("SqliteRestorePointsRepo: list() renders newest-first and is strictly site-scoped", async () => {
  const { db, tmpDir } = openTempJournal();
  try {
    const siteA = new SqliteRestorePointsRepo({ db, siteId: "site-a" });
    const siteB = new SqliteRestorePointsRepo({ db, siteId: "site-b" });

    await siteA.save({
      restorePointId: "rp-a1",
      idempotencyKey: "key-a1",
      trigger: "manual",
      createdAt: "2026-07-15T00:00:00.000Z",
      createdBy: "user-1",
    });
    await siteA.save({
      restorePointId: "rp-a2",
      idempotencyKey: "key-a2",
      trigger: "pre-migration-auto",
      createdAt: "2026-07-15T00:01:00.000Z",
      createdBy: "user-1",
    });
    await siteB.save({
      restorePointId: "rp-b1",
      idempotencyKey: "key-b1",
      trigger: "manual",
      createdAt: "2026-07-15T00:00:00.000Z",
      createdBy: "user-1",
    });

    const listA = await siteA.list();
    assert.deepEqual(listA.map((r) => r.id), ["rp-a2", "rp-a1"]);

    const listB = await siteB.list();
    assert.deepEqual(listB.map((r) => r.id), ["rp-b1"]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
