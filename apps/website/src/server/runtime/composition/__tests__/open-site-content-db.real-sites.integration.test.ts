import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";

import Database from "better-sqlite3";

import { closeSqliteConnection } from "#src/platform/db/kernel/drivers/sqlite";
import { CONTENT_MIGRATIONS } from "#src/platform/db/migrations/index";
import { MIGRATION_BACKUP_PREFIX } from "#src/platform/db/sqlite/content-db";
import { openSiteContentDb } from "../open-site-content-db.js";
import { LEGACY_CHAT_TABLES, allowedRemovals, contentOver, missingRows, readContent, rewrittenByTail, type TableContent } from "./fixtures/legacy-content-history.js";

/**
 * @file R1h: a site's boot (`openSiteContentDb`: open → recover → migration runner → prepare) on
 * COPIES of real SQLite sites whose legacy drizzle history stops at different points:
 * - tovu-dev (head 0077, one duplicate drizzle row) — the newest copy not yet adopted among its
 *   pre-migration copies (`sites/tovu-dev/ops/pre-migrations-*.db`) and `content.db`;
 * - tovu-com (head 0057: the 20-entry tail, fake-2027 stamps included, is applied);
 * - a starter-theme-check site (head 0074).
 *
 * First boot: every table keeps its columns (at head) and every row's VALUES over the columns it
 * had (tables the drizzle tail rewrites with UPDATE/DELETE keep their row count); a table may vanish
 * only when a migration source drops it (`fixtures/legacy-content-history.ts`); the ledger holds
 * every content step, exactly one backup sits in `ops/` and it holds the file's exact contents.
 * Second boot: nothing is written (same bytes, no new backup). The originals are only ever copied,
 * never opened. A source missing on this machine is skipped; the same three histories are also
 * GENERATED, independent of any machine, by `open-site-content-db.legacy-fixtures.integration.test.ts`.
 */

const REPO = path.resolve(import.meta.dirname, "../../../../../../..");

function tovuDevSources(): string[] {
  const ops = path.join(REPO, "sites/tovu-dev/ops");
  const copies = fs.existsSync(ops) ? fs.readdirSync(ops).filter((name) => name.startsWith(MIGRATION_BACKUP_PREFIX) && name.endsWith(".db")).sort().reverse() : [];
  return [...copies.map((name) => path.join(ops, name)), path.join(REPO, "sites/tovu-dev/content.db")];
}

function starterSource(): string {
  const root = path.join(REPO, "ADS-memory/.local-artifacts/starter-theme-check");
  const site = fs.existsSync(root) ? fs.readdirSync(root).find((name) => name.startsWith("site-")) : undefined;
  return path.join(root, site ?? "missing", "content.db");
}

const SOURCES: Array<{ name: string; candidates: string[]; drizzleRows: number }> = [
  { name: "tovu-dev", candidates: tovuDevSources(), drizzleRows: 79 },
  { name: "tovu-com (head 0057)", candidates: [path.join(REPO, "apps/website/sites/tovu-com/content.db")], drizzleRows: 58 },
  { name: "starter-theme-check (head 0074)", candidates: [starterSource()], drizzleRows: 75 },
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-real-site-boot-"));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

interface Snapshot {
  columns: Record<string, string>;
  rows: Record<string, number>;
  content: Record<string, TableContent>;
}

function snapshot(file: string): Snapshot {
  const db = new Database(file, { readonly: true });
  try {
    const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all() as Array<{ name: string }>).map(
      (row) => row.name
    );
    const snap: Snapshot = { columns: {}, rows: {}, content: readContent(db) };
    for (const table of tables) {
      // FTS5 shadow/virtual tables have rows too; counting every table is the point.
      snap.columns[table] = JSON.stringify(db.prepare(`SELECT name, type, "notnull", pk FROM pragma_table_info(?)`).all(table));
      snap.rows[table] = (db.prepare(`SELECT count(*) AS n FROM "${table}"`).get() as { n: number }).n;
    }
    return snap;
  } finally {
    db.close();
  }
}

function sha(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

const backupsIn = (siteDir: string) =>
  fs.readdirSync(path.join(siteDir, "ops")).filter((name) => name.startsWith(MIGRATION_BACKUP_PREFIX) && name.endsWith(".db"));

/** Copies `source` (and its WAL) into a fresh site folder; never opens the original. */
function copySite(source: string): string {
  const siteDir = fs.mkdtempSync(path.join(tmp, "site-"));
  const dbPath = path.join(siteDir, "content.db");
  // Plain file copies (none of the sources has a live writer): opening an original, even read-only,
  // would leave `-shm`/`-wal` files beside it.
  fs.copyFileSync(source, dbPath);
  if (fs.existsSync(`${source}-wal`)) fs.copyFileSync(`${source}-wal`, `${dbPath}-wal`);
  return dbPath;
}

const isAdopted = (file: string) => {
  const db = new Database(file, { readonly: true });
  try {
    return db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'tovu_migrations'`).get() !== undefined;
  } finally {
    db.close();
  }
};

/** The first candidate whose COPY has not been adopted yet (a live site is adopted on its next boot,
 *  so its newest pre-migration copy can itself be post-adoption), with a pristine second copy. */
function unadoptedCopy(candidates: readonly string[]): { dbPath: string; pristine: string } | undefined {
  for (const candidate of candidates.filter((file) => fs.existsSync(file))) {
    const pristine = copySite(candidate);
    if (isAdopted(pristine)) continue;
    return { dbPath: copySite(candidate), pristine };
  }
  return undefined;
}

describe("site boot on copies of real SQLite sites (R1h)", () => {
  for (const source of SOURCES) {
    test(source.name, async (t) => {
      const copy = unadoptedCopy(source.candidates);
      if (!copy) {
        t.skip(`no unadopted copy of ${source.name} on this machine`);
        return;
      }
      const { dbPath, pristine } = copy;
      const siteDir = path.dirname(dbPath);
      const drizzleRows = (file: string) => {
        const db = new Database(file, { readonly: true });
        try {
          return (db.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get() as { n: number }).n;
        } finally {
          db.close();
        }
      };
      assert.equal(drizzleRows(dbPath), source.drizzleRows, "the copy is the history this test is about");
      const before = snapshot(dbPath);
      assert.equal(before.columns.tovu_migrations, undefined, "not adopted yet");

      closeSqliteConnection(await openSiteContentDb(dbPath));

      const afterFirst = snapshot(dbPath);
      // A site at the chain's head keeps its shape exactly; one behind gets the tail's DDL. A table may
      // vanish only when a migration source drops it (F2249). Rows: every row keeps its values over the
      // columns its table had (F2248) — the runner and `prepareContentStore` may ADD rows (the
      // watermark row, first-run seeds) but never rewrite one — except in tables the drizzle tail
      // itself rewrites (e.g. 0073's UPDATE posts), which keep their row count.
      const atHead = source.drizzleRows === 79;
      const applied = Math.min(source.drizzleRows, 78);
      const allowed = allowedRemovals(applied);
      const rewritten = rewrittenByTail(applied);
      const original = new Database(pristine, { readonly: true });
      const migrated = new Database(dbPath, { readonly: true });
      try {
        for (const [table, columns] of Object.entries(before.columns)) {
          if (afterFirst.columns[table] === undefined) {
            assert.ok(allowed.has(table), `${table} vanished, but no migration drops it`);
            if (LEGACY_CHAT_TABLES.has(table)) assert.equal(before.rows[table], 0, `0002 drops ${table} only when empty`);
            continue;
          }
          if (atHead) assert.equal(afterFirst.columns[table], columns, `${table} columns`);
          if (table === "__drizzle_migrations" || before.rows[table] === 0) continue;
          assert.equal(afterFirst.rows[table], before.rows[table], `${table} rows`);
          if (rewritten.has(table)) continue;
          const common = before.content[table]!.columns.filter((column) => afterFirst.content[table]!.columns.includes(column));
          assert.deepEqual(missingRows(contentOver(original, table, common), contentOver(migrated, table, common)), [], `${table}: rows rewritten or lost`);
        }
      } finally {
        original.close();
        migrated.close();
      }
      // Every frozen entry recorded once (tovu-dev keeps its one historical duplicate row).
      assert.equal(afterFirst.rows.__drizzle_migrations, source.drizzleRows === 79 ? 79 : 78);
      const ledger = new Database(dbPath, { readonly: true });
      const ids = (ledger.prepare("SELECT id FROM tovu_migrations ORDER BY id").all() as Array<{ id: string }>).map((row) => row.id);
      ledger.close();
      assert.deepEqual(ids, CONTENT_MIGRATIONS.map((step) => step.id));

      const backups = backupsIn(siteDir);
      assert.equal(backups.length, 1, "exactly one pre-migration copy");
      // The backup is the database as it was: every table's every row, value for value.
      const backup = snapshot(path.join(siteDir, "ops", backups[0]));
      assert.deepEqual(backup.content, before.content, "the copy is the database as it was");

      const bytes = sha(dbPath);
      closeSqliteConnection(await openSiteContentDb(dbPath));
      assert.equal(sha(dbPath), bytes, "a second boot writes nothing");
      assert.deepEqual(backupsIn(siteDir), backups, "and takes no new copy");
    });
  }
});
