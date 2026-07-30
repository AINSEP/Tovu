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
  const result = await declareDataModule({ db, dbPath, decl: productsDecl });

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
  const result = await declareDataModule({ db, dbPath, decl: productsDecl });
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
  const bad = await declareDataModule({ db, dbPath, decl: {
    pluginId: "Bad-Id", // invalid: not a stable lowercase id
    tables: productsDecl.tables,
  } });
  assert.equal(bad.ok, false);
  assert.equal(bad.error?.code, "BAD_PLUGIN_ID");
  assert.equal(bad.snapshotPath, null, "no snapshot wasted on an invalid declaration");
  assert.equal(tableExists(db, "p_Bad-Id__products"), false);

  const badType = await declareDataModule({ db, dbPath, decl: {
    pluginId: "hello",
    tables: [{ name: "x", columns: [{ name: "c", type: "DROP TABLE" as never }] }],
  } });
  assert.equal(badType.ok, false);
  assert.equal(badType.error?.code, "BAD_TYPE");

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("dataModule: a failing DDL rolls back to a working state (never-brick), snapshot kept as recovery point", async () => {
  const { db, dbPath, dir } = openWithCore();
  // Two tables with the same name in one call: the second CREATE fails → whole tx rolls back.
  const result = await declareDataModule({ db, dbPath, decl: {
    pluginId: "hello",
    pluginTier: "tier-2" as const,
    provenance: { sourceUrl: "test://hello", publisher: "test" },
    tables: [
      { name: "dup", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }] },
      { name: "dup", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }] },
    ],
  } });

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
  const first = await declareDataModule({ db, dbPath, decl: productsDecl });
  assert.equal(first.ok, true);
  assert.deepEqual(first.created, ["p_hello__products"]);

  const second = await declareDataModule({ db, dbPath, decl: productsDecl });
  assert.equal(second.ok, true);
  assert.deepEqual(second.created, [], "nothing re-created");
  assert.equal(second.snapshotPath, null, "no snapshot taken when there's nothing to do");

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * BUG FIX regression coverage (2026-07-28): `declareDataModule` against an in-memory (`:memory:`)
 * db used to call `snapshotDb` with that literal string, which resolved to a REAL file named
 * `:memory:.snapshot-<label>-<ts>` written into the process's cwd (the repo root in this suite) —
 * this is exactly the codepath `src/newsletter/__tests__/repo.contract.test.ts` and other
 * `:memory:`-backed contract-test suites exercise on every run. These tests are the actual
 * regression test that would have caught the original bug: they prove no such file appears, that
 * the DDL still succeeds/rolls back correctly, and that the phase-journal (meaningless for a db
 * with no "next boot" to recover at) is skipped entirely rather than crashing on a null-into-
 * NOT-NULL write.
 */
test("dataModule: against an in-memory db, snapshotPath is null and NO `:memory:.snapshot-*` file is ever created", async () => {
  const db = new Database(":memory:");
  db.prepare(`CREATE TABLE posts (id TEXT PRIMARY KEY, title TEXT)`).run();

  const before = new Set(fs.readdirSync(process.cwd()));
  const result = await declareDataModule({ db, dbPath: ":memory:", decl: productsDecl });
  const after = fs.readdirSync(process.cwd());

  assert.equal(result.ok, true);
  assert.deepEqual(result.created, ["p_hello__products"]);
  assert.equal(result.snapshotPath, null, "no file backs an in-memory db — nothing to snapshot");
  assert.ok(tableExists(db, "p_hello__products"), "the DDL still ran and committed in-process");

  const newFiles = after.filter((name) => !before.has(name));
  assert.deepEqual(newFiles, [], "no `:memory:.snapshot-*` (or any other) file leaked into the cwd");

  assert.equal(
    tableExists(db, "_plugin_migration_journal"),
    false,
    "the phase-journal is never even created for an in-memory db — nothing to recover at a next boot that never happens"
  );

  db.close();
});

test("dataModule: an in-memory db's failing DDL still rolls back to a working state, with no journal entry involved", async () => {
  const db = new Database(":memory:");
  db.prepare(`CREATE TABLE posts (id TEXT PRIMARY KEY, title TEXT)`).run();
  db.prepare(`INSERT INTO posts VALUES ('p1', 'hello')`).run();

  const before = new Set(fs.readdirSync(process.cwd()));
  const result = await declareDataModule({ db, dbPath: ":memory:", decl: {
    pluginId: "hello",
    pluginTier: "tier-2" as const,
    provenance: { sourceUrl: "test://hello", publisher: "test" },
    tables: [
      { name: "dup", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }] },
      { name: "dup", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }] },
    ],
  } });
  const after = fs.readdirSync(process.cwd());

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "DDL_FAILED");
  assert.equal(result.snapshotPath, null);
  assert.equal(result.recoveryPoint, undefined, "no snapshot file exists, so there is no recovery point to report");
  assert.equal(tableExists(db, "p_hello__dup"), false, "no partial table left behind — same-process rollback still works");
  assert.equal(
    (db.prepare(`SELECT COUNT(*) AS n FROM posts`).get() as { n: number }).n,
    1,
    "core content is fully intact — the transaction rollback is the complete safety net here"
  );
  assert.deepEqual(after.filter((name) => !before.has(name)), [], "still no stray file, even on the failure path");

  db.close();
});
