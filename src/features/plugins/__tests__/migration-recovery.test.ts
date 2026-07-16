import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { beginJournalEntry, ensureMigrationJournal } from "../migration-journal";
import { recoverIncompleteDataModuleMigrations } from "../migration-recovery";
import { snapshotDb } from "../snapshot";

/**
 * @file ADR-023 §2 — boot-time crash recovery. Simulates a process death mid-DDL (a journal entry
 * left at a non-terminal phase, with a live db that has already diverged from its snapshot) and
 * proves the mandatory, blocking restore-or-complete step actually restores the pre-DDL state.
 */

function makeDbWithCoreContent(): { dir: string; dbPath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-recovery-"));
  const dbPath = path.join(dir, "content.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.prepare(`CREATE TABLE posts (id TEXT PRIMARY KEY)`).run();
  db.prepare(`INSERT INTO posts VALUES ('p1')`).run();
  db.close();
  return { dir, dbPath };
}

test("no journal table yet (fresh db, never ran a dataModule declare) — recovery is a clean no-op", () => {
  const { dir, dbPath } = makeDbWithCoreContent();
  const result = recoverIncompleteDataModuleMigrations(dbPath);
  assert.deepEqual(result, { recovered: 0, entries: [] });
  fs.rmSync(dir, { recursive: true, force: true });
});

test("an incomplete journal entry (simulated crash mid-DDL) is restored from its snapshot on next boot", async () => {
  const { dir, dbPath } = makeDbWithCoreContent();
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  // Simulate exactly what declareDataModule does up through DDL_IN_PROGRESS, then "crash" —
  // no COMMITTED/ROLLED_BACK ever gets written.
  const snapshotPath = await snapshotDb(db, dbPath, "crashed-plugin");
  ensureMigrationJournal(db);
  beginJournalEntry(db, "crashed-plugin", snapshotPath);
  // Now actually diverge the live db from the snapshot, exactly as a mid-DDL crash would leave it.
  db.prepare(`CREATE TABLE "p_crashed_plugin__half_created" (id TEXT PRIMARY KEY)`).run();
  db.close();

  assert.ok(
    (new Database(dbPath).prepare(`SELECT name FROM sqlite_master WHERE name = 'p_crashed_plugin__half_created'`).get()),
    "sanity check: the half-created table exists before recovery runs"
  );

  const result = recoverIncompleteDataModuleMigrations(dbPath);

  assert.equal(result.recovered, 1);
  assert.equal(result.entries[0].pluginId, "crashed-plugin");

  const restored = new Database(dbPath);
  assert.equal(
    restored.prepare(`SELECT name FROM sqlite_master WHERE name = 'p_crashed_plugin__half_created'`).get(),
    undefined,
    "the half-created table must be gone — restored to the pre-DDL snapshot"
  );
  assert.ok(restored.prepare(`SELECT * FROM posts WHERE id = 'p1'`).get(), "pre-existing core content survives the restore");
  restored.close();

  fs.rmSync(dir, { recursive: true, force: true });
});

test("recovery clears the WAL/SHM sidecars left by the crashed attempt (T8)", async () => {
  const { dir, dbPath } = makeDbWithCoreContent();
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  const snapshotPath = await snapshotDb(db, dbPath, "crashed-plugin");
  ensureMigrationJournal(db);
  beginJournalEntry(db, "crashed-plugin", snapshotPath);
  db.prepare(`CREATE TABLE "p_crashed_plugin__x" (id TEXT PRIMARY KEY)`).run();
  // Check WAL existence WHILE the connection is still open — a clean close() triggers its own
  // checkpoint, which is not representative of the crash this test simulates (an abrupt process
  // death leaves the WAL sidecar behind; a clean close does not). Close immediately after the
  // check so the file is not held open when recovery's file copy runs.
  assert.ok(fs.existsSync(`${dbPath}-wal`), "sanity check: WAL sidecar exists before recovery (WAL mode)");
  db.close();

  recoverIncompleteDataModuleMigrations(dbPath);

  assert.equal(fs.existsSync(`${dbPath}-wal`), false, "the crashed attempt's WAL sidecar must be cleared");
  assert.equal(fs.existsSync(`${dbPath}-shm`), false, "the crashed attempt's SHM sidecar must be cleared");

  fs.rmSync(dir, { recursive: true, force: true });
});

test("a COMMITTED entry is left alone — recovery is a no-op for a successful prior attempt", async () => {
  const { dir, dbPath } = makeDbWithCoreContent();
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  const snapshotPath = await snapshotDb(db, dbPath, "done-plugin");
  ensureMigrationJournal(db);
  const id = beginJournalEntry(db, "done-plugin", snapshotPath);
  db.prepare(`CREATE TABLE "p_done_plugin__real" (id TEXT PRIMARY KEY)`).run();
  const { advanceJournalPhase } = await import("../migration-journal");
  advanceJournalPhase(db, id, "COMMITTED");
  db.close();

  const result = recoverIncompleteDataModuleMigrations(dbPath);
  assert.deepEqual(result, { recovered: 0, entries: [] });

  const stillThere = new Database(dbPath);
  assert.ok(stillThere.prepare(`SELECT name FROM sqlite_master WHERE name = 'p_done_plugin__real'`).get(), "a committed table must not be reverted");
  stillThere.close();

  fs.rmSync(dir, { recursive: true, force: true });
});
