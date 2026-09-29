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

/**
 * @file R1h: a site's boot (`openSiteContentDb`: open → recover → migration runner → prepare) on
 * COPIES of real SQLite sites whose legacy drizzle history stops at different points:
 * - tovu-dev (head 0077, one duplicate drizzle row) — its last pre-migration copy
 *   (`sites/tovu-dev/ops/pre-migrations-*.db`) once the live site has been adopted, else `content.db`;
 * - tovu-com (head 0057: the 20-entry tail, fake-2027 stamps included, is applied);
 * - a starter-theme-check site (head 0074).
 *
 * First boot: every table keeps its columns and rows (only empty legacy chat tables may go, step
 * 0002), the ledger holds every content step, exactly one backup sits in `ops/` and it is the file
 * as it was. Second boot: nothing is written (same bytes, no new backup). The originals are only
 * ever copied, never opened. A source missing on this machine is skipped.
 */

const REPO = path.resolve(import.meta.dirname, "../../../../../../..");
const LEGACY_CHAT_TABLES = new Set(["ai_chats", "ai_chat_messages", "assistant_agent_sessions"]);

function tovuDevSource(): string {
  const ops = path.join(REPO, "sites/tovu-dev/ops");
  const copies = fs.existsSync(ops) ? fs.readdirSync(ops).filter((name) => name.startsWith(MIGRATION_BACKUP_PREFIX) && name.endsWith(".db")).sort() : [];
  return copies.length > 0 ? path.join(ops, copies.at(-1) as string) : path.join(REPO, "sites/tovu-dev/content.db");
}

function starterSource(): string {
  const root = path.join(REPO, "ADS-memory/.local-artifacts/starter-theme-check");
  const site = fs.existsSync(root) ? fs.readdirSync(root).find((name) => name.startsWith("site-")) : undefined;
  return path.join(root, site ?? "missing", "content.db");
}

const SOURCES: Array<{ name: string; file: string; drizzleRows: number }> = [
  { name: "tovu-dev", file: tovuDevSource(), drizzleRows: 79 },
  { name: "tovu-com (head 0057)", file: path.join(REPO, "apps/website/sites/tovu-com/content.db"), drizzleRows: 58 },
  { name: "starter-theme-check (head 0074)", file: starterSource(), drizzleRows: 75 },
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-real-site-boot-"));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

interface Snapshot {
  columns: Record<string, string>;
  rows: Record<string, number>;
}

function snapshot(file: string): Snapshot {
  const db = new Database(file, { readonly: true });
  try {
    const tables = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all() as Array<{ name: string }>).map(
      (row) => row.name
    );
    const snap: Snapshot = { columns: {}, rows: {} };
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

describe("site boot on copies of real SQLite sites (R1h)", () => {
  for (const source of SOURCES) {
    test(source.name, { skip: fs.existsSync(source.file) ? false : `${source.file} is not on this machine` }, async () => {
      const siteDir = fs.mkdtempSync(path.join(tmp, "site-"));
      const dbPath = path.join(siteDir, "content.db");
      // Plain file copies (none of the sources has a live writer): opening an original, even read-only,
      // would leave `-shm`/`-wal` files beside it.
      fs.copyFileSync(source.file, dbPath);
      if (fs.existsSync(`${source.file}-wal`)) fs.copyFileSync(`${source.file}-wal`, `${dbPath}-wal`);
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
      // A site at the chain's head keeps its shape exactly; one behind gets the tail's DDL (which
      // drops tables too, e.g. 0075+). Rows: the runner changes none; `prepareContentStore` may add
      // the watermark row and first-run seed rows to an EMPTY table, never touches a filled one.
      const atHead = source.drizzleRows === 79;
      for (const [table, columns] of Object.entries(before.columns)) {
        if (afterFirst.columns[table] === undefined) {
          if (atHead) assert.ok(LEGACY_CHAT_TABLES.has(table) && before.rows[table] === 0, `only an empty legacy chat table may go, not ${table}`);
          continue;
        }
        if (atHead) assert.equal(afterFirst.columns[table], columns, `${table} columns`);
        if (table === "__drizzle_migrations" || before.rows[table] === 0) continue;
        assert.equal(afterFirst.rows[table], before.rows[table], `${table} rows`);
      }
      // Every frozen entry recorded once (tovu-dev keeps its one historical duplicate row).
      assert.equal(afterFirst.rows.__drizzle_migrations, source.drizzleRows === 79 ? 79 : 78);
      const ledger = new Database(dbPath, { readonly: true });
      const ids = (ledger.prepare("SELECT id FROM tovu_migrations ORDER BY id").all() as Array<{ id: string }>).map((row) => row.id);
      ledger.close();
      assert.deepEqual(ids, CONTENT_MIGRATIONS.map((step) => step.id));

      const backups = backupsIn(siteDir);
      assert.equal(backups.length, 1, "exactly one pre-migration copy");
      const copy = snapshot(path.join(siteDir, "ops", backups[0]));
      assert.deepEqual(copy.rows, before.rows, "the copy is the database as it was");

      const bytes = sha(dbPath);
      closeSqliteConnection(await openSiteContentDb(dbPath));
      assert.equal(sha(dbPath), bytes, "a second boot writes nothing");
      assert.deepEqual(backupsIn(siteDir), backups, "and takes no new copy");
    });
  }
});
