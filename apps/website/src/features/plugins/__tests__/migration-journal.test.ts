import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { advanceJournalPhase, beginJournalEntry, ensureMigrationJournal, findIncompleteJournalEntries } from "../migration-journal.js";

/** @file ADR-023 §2 (T3 fix) — the phase-marker journal, isolated from the rest of the engine. */

function openDb(): { db: Database.Database; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-journal-"));
  const db = new Database(path.join(dir, "content.db"));
  db.pragma("journal_mode = WAL");
  return { db, dir };
}

test("beginJournalEntry starts at PREPARED_SNAPSHOT; findIncompleteJournalEntries surfaces it", async () => {
  const { db, dir } = openDb();
  await ensureMigrationJournal(db);
  const id = await beginJournalEntry({ db, pluginId: "plugin-a", snapshotPath: "/tmp/snap-1" });

  const incomplete = await findIncompleteJournalEntries(db);
  assert.equal(incomplete.length, 1);
  assert.equal(incomplete[0].id, id);
  assert.equal(incomplete[0].phase, "PREPARED_SNAPSHOT");
  assert.equal(incomplete[0].pluginId, "plugin-a");

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("advanceJournalPhase moves the phase forward; COMMITTED/ROLLED_BACK are terminal (not surfaced as incomplete)", async () => {
  const { db, dir } = openDb();
  await ensureMigrationJournal(db);
  const id = await beginJournalEntry({ db, pluginId: "plugin-a", snapshotPath: "/tmp/snap-1" });

  await advanceJournalPhase({ db, id, phase: "DDL_IN_PROGRESS" });
  assert.equal((await findIncompleteJournalEntries(db))[0].phase, "DDL_IN_PROGRESS");

  await advanceJournalPhase({ db, id, phase: "VERIFYING" });
  assert.equal((await findIncompleteJournalEntries(db))[0].phase, "VERIFYING");

  await advanceJournalPhase({ db, id, phase: "COMMITTED" });
  assert.equal((await findIncompleteJournalEntries(db)).length, 0, "a COMMITTED entry is terminal, not incomplete");

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a ROLLED_BACK entry is also terminal", async () => {
  const { db, dir } = openDb();
  await ensureMigrationJournal(db);
  const id = await beginJournalEntry({ db, pluginId: "plugin-a", snapshotPath: "/tmp/snap-1" });
  await advanceJournalPhase({ db, id, phase: "ROLLED_BACK" });
  assert.equal((await findIncompleteJournalEntries(db)).length, 0);

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("multiple entries: only the non-terminal ones are surfaced", async () => {
  const { db, dir } = openDb();
  await ensureMigrationJournal(db);
  const done = await beginJournalEntry({ db, pluginId: "plugin-done", snapshotPath: "/tmp/snap-done" });
  await advanceJournalPhase({ db, id: done, phase: "COMMITTED" });
  const stuck = await beginJournalEntry({ db, pluginId: "plugin-stuck", snapshotPath: "/tmp/snap-stuck" });
  await advanceJournalPhase({ db, id: stuck, phase: "DDL_IN_PROGRESS" });

  const incomplete = await findIncompleteJournalEntries(db);
  assert.equal(incomplete.length, 1);
  assert.equal(incomplete[0].pluginId, "plugin-stuck");

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
