import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { migrateSqliteContentFile, MIGRATION_BACKUP_PREFIX, openContentDb, openContentDbReadOnly, openSqliteContentConnection } from "../content-db.js";
import { LegacyHistoryError } from "../../migrations/step.js";
import * as schema from "../../schema.sqlite.js";

/**
 * @file The mandatory proof for `openContentDbReadOnly` — the fix for the AAD/username backfill
 * scripts' `--dry-run` mutating the live database (`openContentDb` unconditionally runs pending
 * migrations and writes the bootstrap watermark row before any caller's own dry-run check ever
 * runs; see `content-db.ts`'s own doc on `openContentDbReadOnly`).
 *
 * The most concrete manifestation of that bug is a database sitting one migration behind the
 * running code's own migrations folder (the ordinary state of any `content.db` between "a new
 * migration file lands in this repo" and "someone restarts the server against this file"): plain
 * `openContentDb` would silently apply that migration. This file builds exactly that fixture — a
 * database migrated through every migration except the newest one — using drizzle's own migrator
 * pointed at a trimmed copy of the real migrations folder, then proves `openContentDbReadOnly`
 * cannot advance it, while confirming `openContentDb` (unchanged, still used by every `--apply`
 * path) still can.
 */

const REAL_MIGRATIONS_DIR = path.resolve(import.meta.dirname, "../../drizzle");
// Fixture assumption, current as of migration 0077 (`0077_external_mcp_tool_approvals`, which
// creates the `external_mcp_tool_approvals` table — no earlier migration mentions it, so its
// `fingerprint` column is absent until 0077 runs; `PRAGMA table_info` on a missing table returns
// no rows, which `hasColumn` reads as "column absent") — update both constants whenever a new
// migration lands, per the assertion in `buildMigrationsDirMissingNewest` below.
const NEWEST_MIGRATION_TAG = "0077_external_mcp_tool_approvals";
const NEWEST_MIGRATION_ADDS = { table: "external_mcp_tool_approvals", column: "fingerprint" };

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Copies the real migrations folder minus its newest entry — `readMigrationFiles` only reads
 *  `meta/_journal.json` plus the `.sql` file each journal entry names, so trimming the journal is
 *  sufficient; no snapshot json files are needed by the runtime migrator. */
function buildMigrationsDirMissingNewest(scratch: string): string {
  const dir = path.join(scratch, "migrations-partial");
  fs.mkdirSync(path.join(dir, "meta"), { recursive: true });
  const journal = JSON.parse(fs.readFileSync(path.join(REAL_MIGRATIONS_DIR, "meta", "_journal.json"), "utf8")) as {
    entries: Array<{ tag: string }>;
  };
  assert.equal(
    journal.entries[journal.entries.length - 1]!.tag,
    NEWEST_MIGRATION_TAG,
    "fixture assumption stale — this repo's newest migration tag changed; update NEWEST_MIGRATION_TAG/NEWEST_MIGRATION_ADDS"
  );
  const trimmed = { ...journal, entries: journal.entries.slice(0, -1) };
  fs.writeFileSync(path.join(dir, "meta", "_journal.json"), JSON.stringify(trimmed));
  for (const entry of trimmed.entries) {
    fs.copyFileSync(path.join(REAL_MIGRATIONS_DIR, `${entry.tag}.sql`), path.join(dir, `${entry.tag}.sql`));
  }
  return dir;
}

/** Builds a `content.db` migrated through every migration EXCEPT the newest one — the fixture
 *  precondition every test below depends on. */
function buildOneMigrationBehindDb(scratch: string): string {
  const dbPath = path.join(scratch, "content.db");
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: buildMigrationsDirMissingNewest(scratch) });
  sqlite.close();
  return dbPath;
}

function hasColumn(dbPath: string, table: string, column: string): boolean {
  const raw = new Database(dbPath, { readonly: true });
  try {
    const cols = raw.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return cols.some((c) => c.name === column);
  } finally {
    raw.close();
  }
}

function appliedMigrationCount(dbPath: string): number {
  const raw = new Database(dbPath, { readonly: true });
  try {
    return (raw.prepare("SELECT COUNT(*) as c FROM __drizzle_migrations").get() as { c: number }).c;
  } finally {
    raw.close();
  }
}

test("openContentDbReadOnly: never advances a database sitting one migration behind, unlike openContentDb", () => {
  const scratch = tmpDir("content-db-readonly-migrate-");
  const dbPath = buildOneMigrationBehindDb(scratch);

  // --- Precondition: genuinely one migration behind. ---
  assert.equal(hasColumn(dbPath, NEWEST_MIGRATION_ADDS.table, NEWEST_MIGRATION_ADDS.column), false);
  const migrationsBefore = appliedMigrationCount(dbPath);

  // --- THE MANDATORY PROOF: opening read-only must not run the pending migration. ---
  const readOnlyDb = openContentDbReadOnly(dbPath);
  assert.equal(
    hasColumn(dbPath, NEWEST_MIGRATION_ADDS.table, NEWEST_MIGRATION_ADDS.column),
    false,
    "openContentDbReadOnly must never apply a pending migration"
  );
  assert.equal(appliedMigrationCount(dbPath), migrationsBefore, "openContentDbReadOnly must never record a new migration as applied");
  // The read-only handle can still read existing tables/rows fine.
  assert.doesNotThrow(() => readOnlyDb.select().from(schema.workspaces).all());
  readOnlyDb.$client.close();

  // --- Control: plain openContentDb (still used by every `--apply` path, unchanged) DOES advance
  // it — proves the fixture and assertions above would have caught the bug if it were still there. ---
  const migratingDb = openContentDb(dbPath);
  assert.equal(hasColumn(dbPath, NEWEST_MIGRATION_ADDS.table, NEWEST_MIGRATION_ADDS.column), true);
  assert.equal(appliedMigrationCount(dbPath), migrationsBefore + 1);
  migratingDb.$client.close();

  fs.rmSync(scratch, { recursive: true, force: true });
});

test("openContentDbReadOnly: rejects a write at the driver level, not just by this module's own discipline", () => {
  const scratch = tmpDir("content-db-readonly-write-");
  const dbPath = path.join(scratch, "content.db");
  openContentDb(dbPath).$client.close(); // Fully migrated fixture, closed before reopening read-only.

  const db = openContentDbReadOnly(dbPath);
  assert.throws(() => {
    db.insert(schema.workspaces).values({ id: "w1", name: "w1", slug: "w1", createdAt: "2026-09-01T00:00:00.000Z" }).run();
  }, /readonly|read-only/i);
  db.$client.close();

  fs.rmSync(scratch, { recursive: true, force: true });
});

test("openContentDbReadOnly: throws rather than creating a new file when the path does not exist", () => {
  const scratch = tmpDir("content-db-readonly-missing-");
  const missingPath = path.join(scratch, "does-not-exist.db");

  assert.throws(() => openContentDbReadOnly(missingPath));
  assert.equal(fs.existsSync(missingPath), false, "a read-only open must never create the file it was asked to read");

  fs.rmSync(scratch, { recursive: true, force: true });
});

test("a refused file migration preserves the database and keeps both the pre-change copy and earlier backups", async () => {
  const scratch = tmpDir("content-db-migration-failure-");
  const dbPath = buildOneMigrationBehindDb(scratch);
  const db = openSqliteContentConnection(dbPath);
  const ops = path.join(scratch, "ops");
  fs.mkdirSync(ops);
  const oldName = `${MIGRATION_BACKUP_PREFIX}2000-01-01T00-00-00-000Z.db`;
  for (const name of [oldName, `${oldName}-wal`, `${oldName}-shm`]) fs.writeFileSync(path.join(ops, name), "KEEP-OLDER-BACKUP");
  try {
    db.$client.prepare("UPDATE __drizzle_migrations SET hash = 'foreign-history' WHERE rowid = (SELECT min(rowid) FROM __drizzle_migrations)").run();
    const historyBefore = db.$client.prepare("SELECT * FROM __drizzle_migrations ORDER BY rowid").all();
    const schemaBefore = db.$client.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY type, name").all();
    assert.equal(hasColumn(dbPath, NEWEST_MIGRATION_ADDS.table, NEWEST_MIGRATION_ADDS.column), false);
    await assert.rejects(migrateSqliteContentFile(db, dbPath), LegacyHistoryError);
    assert.deepEqual(db.$client.prepare("SELECT * FROM __drizzle_migrations ORDER BY rowid").all(), historyBefore);
    assert.deepEqual(db.$client.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY type, name").all(), schemaBefore);
    const copies = fs.readdirSync(ops).filter(name => name.endsWith(".db") && name !== oldName);
    assert.equal(copies.length, 1);
    const copy = new Database(path.join(ops, copies[0]!), { readonly: true });
    try {
      assert.deepEqual(copy.prepare("SELECT * FROM __drizzle_migrations ORDER BY rowid").all(), historyBefore);
      assert.deepEqual(copy.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY type, name").all(), schemaBefore);
    } finally { copy.close(); }
    for (const name of [oldName, `${oldName}-wal`, `${oldName}-shm`]) assert.equal(fs.readFileSync(path.join(ops, name), "utf8"), "KEEP-OLDER-BACKUP");
  } finally {
    db.$client.close();
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
