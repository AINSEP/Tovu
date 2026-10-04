import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { mock } from "node:test";

import Database from "better-sqlite3";

import { beginJournalEntry, ensureMigrationJournal } from "#src/features/plugins/migration-journal";
import { snapshotDb } from "#src/features/plugins/snapshot";
import { closeSqliteConnection } from "#src/platform/db/kernel/drivers/sqlite";
import { openLegacyContentDb } from "#src/platform/db/migrations/__tests__/legacy-content-db.fixture";
import { CONTENT_MIGRATIONS, MigrationChecksumError } from "#src/platform/db/migrations/index";
import { MIGRATION_BACKUP_PREFIX } from "#src/platform/db/sqlite/content-db";
import { openSiteContentDb } from "../open-site-content-db.js";

/**
 * @file SPEC-032 AC / ADR-023 §2 — the site opener (`openSiteContentDb`, what `createSiteRouteDeps`
 * opens content.db with) runs boot-time recovery on its fresh connection BEFORE the migration
 * runner, end to end through the real seam, then leaves a migrated, prepared db; the runner's
 * pre-change copy in `ops/` and its retention (R1h).
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

  // A prior legacy boot (frozen Drizzle chain, no Tovu ledger or seeded/watermark rows), then a
  // crash mid-DDL. The watermark row after reopening proves the store was prepared on the restored file.
  closeSqliteConnection(openLegacyContentDb({ filePath: dbPath }));
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
    const ids = (db.$client.prepare(`SELECT id FROM tovu_migrations ORDER BY id`).all() as Array<{ id: string }>).map((row) => row.id);
    assert.deepEqual(ids, CONTENT_MIGRATIONS.map((step) => step.id), "the runner's ledger");
  } finally {
    closeSqliteConnection(db);
  }
  const ops = path.join(dir, "ops");
  assert.deepEqual(fs.existsSync(ops) ? fs.readdirSync(ops) : [], [], "a new, empty file needs no pre-migration copy");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("openSiteContentDb copies an existing unadopted file to ops/ first and keeps only the newest copy", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-open-site-content-db-backup-"));
  const dbPath = path.join(dir, "content.db");
  closeSqliteConnection(openLegacyContentDb({ filePath: dbPath })); // explicit frozen chain, no ledger: a site before R1h
  const ops = path.join(dir, "ops");
  fs.mkdirSync(ops);
  const older = `${MIGRATION_BACKUP_PREFIX}2000-01-01T00-00-00-000Z.db`;
  for (const name of [older, `${older}-wal`, `${older}-shm`, "database-journal.db"]) fs.writeFileSync(path.join(ops, name), "");

  closeSqliteConnection(await openSiteContentDb(dbPath));
  const copies = fs.readdirSync(ops).filter((name) => name.startsWith(MIGRATION_BACKUP_PREFIX));
  assert.equal(copies.length, 1, `one copy left, got ${copies.join(", ")}`);
  assert.notEqual(copies[0], older);
  assert.ok(fs.existsSync(path.join(ops, "database-journal.db")), "nothing else in ops/ is touched");
  const copy = new Database(path.join(ops, copies[0]), { readonly: true });
  try {
    assert.deepEqual(copy.prepare(`SELECT count(*) AS n FROM sqlite_master WHERE name = 'tovu_migrations'`).get(), { n: 0 }, "the file as it was");
  } finally {
    copy.close();
  }

  closeSqliteConnection(await openSiteContentDb(dbPath));
  assert.deepEqual(
    fs.readdirSync(ops).filter((name) => name.startsWith(MIGRATION_BACKUP_PREFIX) && name.endsWith(".db")),
    copies,
    "an adopted file at head: no new copy"
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test("openSiteContentDb closes its connection when a boot step rejects (a checksum mismatch here)", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-open-site-content-db-fail-"));
  const dbPath = path.join(dir, "content.db");
  closeSqliteConnection(await openSiteContentDb(dbPath));
  const raw = new Database(dbPath);
  raw.prepare(`UPDATE tovu_migrations SET checksum = ? WHERE id = ?`).run("0".repeat(64), CONTENT_MIGRATIONS[0]!.id);
  raw.close();

  // Every connection opened on the file, caught at its first pragma.
  const opened = new Set<Database.Database>();
  const pragma = Database.prototype.pragma;
  mock.method(Database.prototype, "pragma", function (this: Database.Database, ...args: Parameters<typeof pragma>) {
    if (this.name === dbPath) opened.add(this);
    return pragma.apply(this, args);
  });
  t.after(() => mock.restoreAll());

  await assert.rejects(openSiteContentDb(dbPath), MigrationChecksumError);
  assert.ok(opened.size > 0, "the opener's connection was seen");
  assert.deepEqual([...opened].map((db) => db.open), [...opened].map(() => false), "no connection is left open");
  fs.rmSync(dir, { recursive: true, force: true });
});
