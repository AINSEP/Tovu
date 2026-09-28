import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { beginJournalEntry, ensureMigrationJournal } from "#src/features/plugins/migration-journal";
import { snapshotDb } from "#src/features/plugins/snapshot";
import { closeSqliteConnection } from "#src/platform/db/kernel/drivers/sqlite";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { openSiteContentDb } from "../open-site-content-db.js";

/**
 * @file SPEC-032 AC / ADR-023 §2 — the site opener (`openSiteContentDb`, what `createSiteRouteDeps`
 * opens content.db with) runs boot-time recovery on its fresh connection BEFORE the Drizzle
 * migrations, end to end through the real seam, then leaves a migrated, prepared db.
 */

function tableNames(dbPath: string): string[] {
  const raw = new Database(dbPath, { readonly: true });
  try {
    return (raw.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{ name: string }>).map((row) => row.name);
  } finally {
    raw.close();
  }
}

test("openSiteContentDb restores a crash-interrupted dataModule attempt, then prepares the restored file", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-open-site-content-db-"));
  const dbPath = path.join(dir, "content.db");

  // A real prior boot (migrated, no watermark row: `openContentDb` alone writes no rows), then a
  // crash mid-DDL. The watermark row after reopening proves the store was prepared on the restored file.
  closeSqliteConnection(openContentDb(dbPath));
  const raw = new Database(dbPath);
  const snapshotPath = await snapshotDb({ db: raw, dbPath, label: "crashed-plugin" });
  await ensureMigrationJournal(raw);
  await beginJournalEntry({ db: raw, pluginId: "crashed-plugin", snapshotPath: snapshotPath! });
  raw.prepare(`CREATE TABLE "p_crashed_plugin__half_created" (id TEXT PRIMARY KEY)`).run();
  raw.close();

  const db = await openSiteContentDb(dbPath);
  const watermark = db.$client.prepare(`SELECT id, value FROM database_write_watermark`).all();
  const workspaces = db.$client.prepare(`SELECT slug FROM workspaces`).all();
  closeSqliteConnection(db);

  const tables = tableNames(dbPath);
  assert.equal(tables.includes("p_crashed_plugin__half_created"), false, "the half-created table is gone: the snapshot was restored");
  assert.equal(tables.includes("_plugin_migration_journal"), false, "the restored file predates the interrupted attempt");
  assert.deepEqual(watermark, [{ id: 1, value: 0 }]);
  assert.deepEqual(workspaces, [{ slug: "local-tovu" }]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("openSiteContentDb on a fresh path creates, migrates, seeds once and writes the watermark row", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-open-site-content-db-fresh-"));
  const dbPath = path.join(dir, "content.db");
  closeSqliteConnection(await openSiteContentDb(dbPath));
  const db = await openSiteContentDb(dbPath);
  try {
    assert.deepEqual(db.$client.prepare(`SELECT count(*) AS n FROM workspaces`).get(), { n: 1 });
    assert.deepEqual(db.$client.prepare(`SELECT id, value FROM database_write_watermark`).all(), [{ id: 1, value: 0 }]);
  } finally {
    closeSqliteConnection(db);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});
