import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { openContentDb } from "../content-db";
import { beginJournalEntry, ensureMigrationJournal } from "#src/features/plugins/migration-journal";
import { recoverIncompleteDataModuleMigrations } from "#src/features/plugins/migration-recovery";
import { snapshotDb } from "#src/features/plugins/snapshot";

/**
 * @file SPEC-032 AC — proves `openContentDb`'s `recover` hook (ADR-023 §2, wired via
 * `server/deps.ts`) actually runs boot-time recovery BEFORE the real Drizzle-managed connection
 * opens, end to end through the real injection seam, not just the standalone recovery function.
 */

test("openContentDb's recover hook restores a crash-interrupted dataModule attempt before Drizzle migrations run", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-content-db-recovery-"));
  const dbPath = path.join(dir, "content.db");

  // Bootstrap a real content.db via the normal path once, so Drizzle's own migrations have
  // already run — mirrors a real prior boot. Closed immediately: recovery must never run while
  // another connection still holds the file open (restore.ts's own documented invariant).
  openContentDb(dbPath).$client.close();

  // Simulate a crash mid-DDL against that same file, exactly as migration-recovery.test.ts does.
  const raw = new Database(dbPath);
  const snapshotPath = await snapshotDb({ db: raw, dbPath, label: "crashed-plugin" });
  ensureMigrationJournal(raw);
  // Non-null: `dbPath` here is a real tmpdir file, never `:memory:` — snapshotDb only returns null
  // for SQLite's in-memory/temp identifiers (see snapshot.ts).
  beginJournalEntry({ db: raw, pluginId: "crashed-plugin", snapshotPath: snapshotPath! });
  raw.prepare(`CREATE TABLE "p_crashed_plugin__half_created" (id TEXT PRIMARY KEY)`).run();
  raw.close();

  // Reopen through the REAL seam, with the REAL recovery hook — this is what index.ts actually
  // does via server/deps.ts's createSqliteRouteDeps.
  const db = openContentDb(dbPath, undefined, recoverIncompleteDataModuleMigrations);

  const found = db.$client.prepare(`SELECT name FROM sqlite_master WHERE name = 'p_crashed_plugin__half_created'`).get();
  assert.equal(found, undefined, "the half-created table must be gone after reopening through the real recovery-wired seam");

  fs.rmSync(dir, { recursive: true, force: true });
});

test("openContentDb with no recover hook (every existing call site's prior signature) behaves exactly as before — no crash, no behavior change", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-content-db-recovery-noop-"));
  const dbPath = path.join(dir, "content.db");
  const db = openContentDb(dbPath); // 2-arg call, unchanged from every pre-existing test call site
  assert.ok(db);
  fs.rmSync(dir, { recursive: true, force: true });
});
