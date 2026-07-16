/**
 * @file Tests for the core-mediated plugin dataModule engine (ADR-023, SPEC-032).
 *
 * This is the never-brick seam: a plugin DECLARES a table (data), CORE snapshots the whole db
 * file FIRST (ADR-023 §4, SQLite online backup), then core runs the DDL inside a transaction so a
 * failure rolls back to a working state. This engine ships ahead of §12's "seams only" v1
 * schedule per §12's own "ship the engine v-next against a concrete demand plugin" clause —
 * Newsletter is that demand. See `migration-journal.test.ts`, `disk-headroom.test.ts`,
 * `plugin-identity.test.ts`, and `migration-recovery.test.ts` for the T2-T8 mechanics' own
 * dedicated coverage; this file covers the end-to-end `declareDataModule` orchestration.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { declareDataModule } from "../data-module";

function openWithCore(): { db: Database.Database; dbPath: string; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-dm-"));
  const dbPath = path.join(dir, "content.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.prepare(`CREATE TABLE posts (id TEXT PRIMARY KEY, title TEXT)`).run(); // stand-in core content
  db.prepare(`INSERT INTO posts VALUES ('p1', 'hello')`).run();
  return { db, dbPath, dir };
}

const tableExists = (db: Database.Database, name: string): boolean =>
  !!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`).get(name);

const productsDecl = {
  pluginId: "hello",
  pluginTier: "tier-2" as const,
  provenance: { sourceUrl: "test://hello", publisher: "test" },
  tables: [
    {
      name: "products",
      columns: [
        { name: "id", type: "TEXT" as const, primaryKey: true },
        { name: "title", type: "TEXT" as const, notNull: true },
        { name: "price", type: "INTEGER" as const },
        { name: "version", type: "INTEGER" as const, notNull: true },
      ],
    },
  ],
};

test("dataModule: declares a namespaced table and records a migration-journal entry", async () => {
  const { db, dbPath, dir } = openWithCore();
  const result = await declareDataModule(db, dbPath, productsDecl);

  assert.equal(result.ok, true);
  assert.deepEqual(result.created, ["p_hello__products"]);
  assert.ok(result.snapshotPath && fs.existsSync(result.snapshotPath), "a snapshot file was written");
  assert.ok(tableExists(db, "p_hello__products"), "the plugin table now exists");
  assert.ok(tableExists(db, "posts"), "core content is untouched");
  const journal = db
    .prepare(`SELECT plugin_id, table_name FROM _plugin_migrations WHERE table_name = ?`)
    .get("p_hello__products") as { plugin_id: string } | undefined;
  assert.equal(journal?.plugin_id, "hello");

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("dataModule: the snapshot is taken BEFORE the DDL (never-brick proof)", async () => {
  const { db, dbPath, dir } = openWithCore();
  const result = await declareDataModule(db, dbPath, productsDecl);
  assert.equal(result.ok, true);

  // Open the snapshot as its own db: it must be the PRE-state — core content present, plugin table absent.
  const snap = new Database(result.snapshotPath!);
  assert.ok(tableExists(snap, "posts"), "snapshot captured pre-existing core content");
  assert.equal(tableExists(snap, "p_hello__products"), false, "snapshot predates the new table");
  snap.close();

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("dataModule: rejects a table outside the p_{pluginId}__* namespace / bad declaration (no DDL)", async () => {
  const { db, dbPath, dir } = openWithCore();
  const bad = await declareDataModule(db, dbPath, {
    pluginId: "Bad-Id", // invalid: not a stable lowercase id
    tables: productsDecl.tables,
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.error?.code, "BAD_PLUGIN_ID");
  assert.equal(bad.snapshotPath, null, "no snapshot wasted on an invalid declaration");
  assert.equal(tableExists(db, "p_Bad-Id__products"), false);

  const badType = await declareDataModule(db, dbPath, {
    pluginId: "hello",
    tables: [{ name: "x", columns: [{ name: "c", type: "DROP TABLE" as never }] }],
  });
  assert.equal(badType.ok, false);
  assert.equal(badType.error?.code, "BAD_TYPE");

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("dataModule: a failing DDL rolls back to a working state (never-brick), snapshot kept as recovery point", async () => {
  const { db, dbPath, dir } = openWithCore();
  // Two tables with the same name in one call: the second CREATE fails → whole tx rolls back.
  const result = await declareDataModule(db, dbPath, {
    pluginId: "hello",
    pluginTier: "tier-2" as const,
    provenance: { sourceUrl: "test://hello", publisher: "test" },
    tables: [
      { name: "dup", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }] },
      { name: "dup", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }] },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "DDL_FAILED");
  assert.ok(result.recoveryPoint && fs.existsSync(result.recoveryPoint), "recovery snapshot kept");
  assert.equal(tableExists(db, "p_hello__dup"), false, "no partial table left behind — rolled back");
  assert.ok(tableExists(db, "posts"), "core content still intact");
  assert.equal(
    (db.prepare(`SELECT COUNT(*) AS n FROM posts`).get() as { n: number }).n,
    1,
    "site is fully recoverable to a working state"
  );

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("dataModule: declaring the same table twice is idempotent (no error, no double-create)", async () => {
  const { db, dbPath, dir } = openWithCore();
  const first = await declareDataModule(db, dbPath, productsDecl);
  assert.equal(first.ok, true);
  assert.deepEqual(first.created, ["p_hello__products"]);

  const second = await declareDataModule(db, dbPath, productsDecl);
  assert.equal(second.ok, true);
  assert.deepEqual(second.created, [], "nothing re-created");
  assert.equal(second.snapshotPath, null, "no snapshot taken when there's nothing to do");

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
