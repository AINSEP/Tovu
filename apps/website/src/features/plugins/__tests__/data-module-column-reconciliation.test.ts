/**
 * @file Column-level desired-state reconciliation for an already-existing plugin table (ADR-023
 * §2's own text: "Core diffs declared-state against live-state and executes the DDL itself").
 *
 * BUG FIX (2026-08-12): `declareDataModule` used to diff table *names* only — a plugin whose v2
 * manifest added a column to an already-existing table got `{ ok: true, created: [] }` back, and
 * the new column silently never existed until something queried it and failed far from the real
 * cause. See `data-module.ts`'s header comment for the full reasoning behind each outcome these
 * tests assert (safe ALTER ADD COLUMN vs. the two SQLite-can't-do-that fail-closed cases vs. a
 * type mismatch vs. an undeclared live column being left alone).
 *
 * CONSTRAINT-LEVEL BUG FIX (2026-08-12): the same table-contents diff above compared `type` for an
 * existing column but not `notNull`/`primaryKey` — declaring an already-existing nullable column
 * `notNull: true` (or a non-PK column `primaryKey: true`) also returned `{ ok: true, altered: [] }`
 * with the live column completely unenforced. `COLUMN_NOT_NULL_MISMATCH` and
 * `COLUMN_PRIMARY_KEY_MISMATCH` close that gap, direction-agnostic (declared-stricter-than-live
 * AND declared-looser-than-live both fail closed, mirroring `COLUMN_TYPE_MISMATCH`'s own symmetric
 * behavior — see `data-module.ts`'s header for the full reasoning), plus a composite-primary-key
 * false-positive check since `PRAGMA table_info`'s `pk` is an ordinal, not a boolean.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { declareDataModule } from "../data-module.js";

function openDb(): { db: Database.Database; dbPath: string; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-dm-col-"));
  const dbPath = path.join(dir, "content.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  return { db, dbPath, dir };
}

const provenance = { sourceUrl: "test://coltest", publisher: "test" };

const liveColumns = (db: Database.Database, fqTable: string): string[] =>
  (db.prepare(`PRAGMA table_info("${fqTable}")`).all() as Array<{ name: string }>).map((r) => r.name);

test("dataModule: a missing nullable column on an already-existing table is added via ALTER TABLE, with the full safety apparatus", async () => {
  const { db, dbPath, dir } = openDb();
  const v1 = { pluginId: "coltest", pluginTier: "tier-2" as const, provenance, tables: [
    { name: "widgets", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }, { name: "title", type: "TEXT" as const }] },
  ] };
  const first = await declareDataModule({ db, dbPath, decl: v1 });
  assert.equal(first.ok, true, JSON.stringify(first.error));

  const v2 = { ...v1, tables: [{ ...v1.tables[0]!, columns: [...v1.tables[0]!.columns, { name: "sku", type: "TEXT" as const }] }] };
  const second = await declareDataModule({ db, dbPath, decl: v2 });

  assert.equal(second.ok, true, JSON.stringify(second.error));
  assert.deepEqual(second.created, [], "no table was newly created");
  assert.deepEqual(second.altered, ["p_coltest__widgets"], "the existing table is reported as altered");
  assert.ok(second.snapshotPath, "a pre-DDL snapshot was still taken for an ALTER, same as for a CREATE");
  assert.equal(fs.existsSync(second.snapshotPath!), false, "the snapshot is discarded once the migration commits");
  assert.deepEqual(liveColumns(db, "p_coltest__widgets"), ["id", "title", "sku"], "the new column now exists");

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("dataModule: fails closed on a missing NOT NULL column — SQLite can't ADD COLUMN NOT NULL without a default this grammar has no field for", async () => {
  const { db, dbPath, dir } = openDb();
  const v1 = { pluginId: "coltest", pluginTier: "tier-2" as const, provenance, tables: [
    { name: "widgets", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }] },
  ] };
  await declareDataModule({ db, dbPath, decl: v1 });

  const v2 = { ...v1, tables: [{ name: "widgets", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }, { name: "sku", type: "TEXT" as const, notNull: true }] }] };
  const result = await declareDataModule({ db, dbPath, decl: v2 });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "COLUMN_ADD_NOT_NULL_WITHOUT_DEFAULT");
  assert.match(result.error?.message ?? "", /"sku"/);
  assert.equal(result.snapshotPath, null, "fails before any I/O — no snapshot wasted on an unreconcilable declaration");
  assert.deepEqual(liveColumns(db, "p_coltest__widgets"), ["id"], "the table is completely untouched");

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("dataModule: fails closed on a missing PRIMARY KEY column — ALTER TABLE cannot add one to an existing table at all", async () => {
  const { db, dbPath, dir } = openDb();
  const v1 = { pluginId: "coltest", pluginTier: "tier-2" as const, provenance, tables: [
    { name: "widgets", columns: [{ name: "legacy_id", type: "INTEGER" as const, primaryKey: true }] },
  ] };
  await declareDataModule({ db, dbPath, decl: v1 });

  const v2 = { ...v1, tables: [{ name: "widgets", columns: [{ name: "legacy_id", type: "INTEGER" as const, primaryKey: true }, { name: "id", type: "TEXT" as const, primaryKey: true }] }] };
  const result = await declareDataModule({ db, dbPath, decl: v2 });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "COLUMN_ADD_PRIMARY_KEY");
  assert.match(result.error?.message ?? "", /"id"/);
  assert.equal(result.snapshotPath, null, "fails before any I/O");
  assert.deepEqual(liveColumns(db, "p_coltest__widgets"), ["legacy_id"], "the table is completely untouched");

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("dataModule: fails closed when an existing column's declared type no longer matches the live column", async () => {
  const { db, dbPath, dir } = openDb();
  const v1 = { pluginId: "coltest", pluginTier: "tier-2" as const, provenance, tables: [
    { name: "widgets", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }, { name: "price", type: "INTEGER" as const }] },
  ] };
  await declareDataModule({ db, dbPath, decl: v1 });

  const v2 = { ...v1, tables: [{ name: "widgets", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }, { name: "price", type: "TEXT" as const }] }] };
  const result = await declareDataModule({ db, dbPath, decl: v2 });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "COLUMN_TYPE_MISMATCH");
  assert.match(result.error?.message ?? "", /declared TEXT but the live column is INTEGER/);
  assert.equal(result.snapshotPath, null, "fails before any I/O");

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("dataModule: a live column absent from the current declaration is left alone, not dropped (pure no-op)", async () => {
  const { db, dbPath, dir } = openDb();
  const v1 = { pluginId: "coltest", pluginTier: "tier-2" as const, provenance, tables: [
    { name: "widgets", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }, { name: "legacy_flag", type: "INTEGER" as const }] },
  ] };
  await declareDataModule({ db, dbPath, decl: v1 });

  // v2's manifest no longer mentions legacy_flag at all.
  const v2 = { ...v1, tables: [{ name: "widgets", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }] }] };
  const result = await declareDataModule({ db, dbPath, decl: v2 });

  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.deepEqual(result.created, []);
  assert.deepEqual(result.altered, [], "nothing needed reconciling — an undeclared column is not itself a reason to touch the table");
  assert.equal(result.snapshotPath, null, "true no-op — nothing was snapshotted");
  assert.deepEqual(liveColumns(db, "p_coltest__widgets"), ["id", "legacy_flag"], "legacy_flag was NOT dropped");

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("dataModule: an undeclared live column is left alone even while a different declared column is genuinely added in the same call", async () => {
  const { db, dbPath, dir } = openDb();
  const v1 = { pluginId: "coltest", pluginTier: "tier-2" as const, provenance, tables: [
    { name: "widgets", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }, { name: "legacy_flag", type: "INTEGER" as const }] },
  ] };
  await declareDataModule({ db, dbPath, decl: v1 });

  // v2 drops legacy_flag from the manifest AND adds a new declared column "sku".
  const v2 = { ...v1, tables: [{ name: "widgets", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }, { name: "sku", type: "TEXT" as const }] }] };
  const result = await declareDataModule({ db, dbPath, decl: v2 });

  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.deepEqual(result.altered, ["p_coltest__widgets"]);
  assert.deepEqual(
    liveColumns(db, "p_coltest__widgets").sort(),
    ["id", "legacy_flag", "sku"].sort(),
    "sku was added AND legacy_flag survived, undeclared and untouched"
  );

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("dataModule: a single call can both create a brand-new table and alter an already-existing one", async () => {
  const { db, dbPath, dir } = openDb();
  const v1 = { pluginId: "coltest", pluginTier: "tier-2" as const, provenance, tables: [
    { name: "widgets", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }] },
  ] };
  await declareDataModule({ db, dbPath, decl: v1 });

  const v2 = {
    pluginId: "coltest",
    pluginTier: "tier-2" as const,
    provenance,
    tables: [
      { name: "widgets", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }, { name: "sku", type: "TEXT" as const }] },
      { name: "orders", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }] },
    ],
  };
  const result = await declareDataModule({ db, dbPath, decl: v2 });

  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.deepEqual(result.created, ["p_coltest__orders"]);
  assert.deepEqual(result.altered, ["p_coltest__widgets"]);
  assert.deepEqual(liveColumns(db, "p_coltest__widgets"), ["id", "sku"]);
  assert.ok(liveColumns(db, "p_coltest__orders").includes("id"));

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("dataModule: ADVERSARIAL — one safe and one unsafe missing column on the same table fails the whole call before any DDL runs (no partial reconciliation)", async () => {
  const { db, dbPath, dir } = openDb();
  const v1 = { pluginId: "coltest", pluginTier: "tier-2" as const, provenance, tables: [
    { name: "widgets", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }] },
  ] };
  await declareDataModule({ db, dbPath, decl: v1 });

  const v2 = { ...v1, tables: [{ name: "widgets", columns: [
    { name: "id", type: "TEXT" as const, primaryKey: true },
    { name: "sku", type: "TEXT" as const }, // safe: nullable
    { name: "must_have", type: "TEXT" as const, notNull: true }, // unsafe: NOT NULL, no default field
  ] }] };
  const result = await declareDataModule({ db, dbPath, decl: v2 });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "COLUMN_ADD_NOT_NULL_WITHOUT_DEFAULT");
  assert.deepEqual(
    liveColumns(db, "p_coltest__widgets"),
    ["id"],
    "the individually-safe \"sku\" column was NOT opportunistically added — planning fails atomically, before any DDL"
  );
  assert.equal(result.snapshotPath, null, "the whole plan is rejected before any I/O, same as any other invalid declaration");

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("dataModule: ADVERSARIAL — a CREATE failure elsewhere in the same call rolls back an otherwise-valid ALTER too (single-transaction atomicity)", async () => {
  const { db, dbPath, dir } = openDb();
  const v1 = { pluginId: "coltest", pluginTier: "tier-2" as const, provenance, tables: [
    { name: "widgets", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }] },
  ] };
  await declareDataModule({ db, dbPath, decl: v1 });

  const v2 = {
    pluginId: "coltest",
    pluginTier: "tier-2" as const,
    provenance,
    tables: [
      { name: "widgets", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }, { name: "sku", type: "TEXT" as const }] },
      // Same table declared twice in one call — the second CREATE fails (no IF NOT EXISTS), by design (see data-module.test.ts).
      { name: "dup", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }] },
      { name: "dup", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }] },
    ],
  };
  const result = await declareDataModule({ db, dbPath, decl: v2 });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "DDL_FAILED");
  assert.ok(result.recoveryPoint && fs.existsSync(result.recoveryPoint), "the pre-DDL snapshot is retained as the recovery point");
  assert.deepEqual(liveColumns(db, "p_coltest__widgets"), ["id"], "the otherwise-valid ALTER was rolled back along with the failed CREATE");
  assert.equal(
    (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'p_coltest__dup'`).all() as unknown[]).length,
    0,
    "no partial dup table left behind either"
  );

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("dataModule: an ALTER TABLE ADD COLUMN is recorded in the site-wide migration journal, same as a CREATE TABLE", async () => {
  const { db, dbPath, dir } = openDb();
  const v1 = { pluginId: "coltest", pluginTier: "tier-2" as const, provenance, tables: [
    { name: "widgets", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }] },
  ] };
  await declareDataModule({ db, dbPath, decl: v1 });

  const v2 = { ...v1, tables: [{ name: "widgets", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }, { name: "sku", type: "TEXT" as const }] }] };
  await declareDataModule({ db, dbPath, decl: v2 });

  const row = db
    .prepare(`SELECT plugin_id, table_name, ddl FROM _plugin_migrations WHERE ddl LIKE 'ALTER TABLE%'`)
    .get() as { plugin_id: string; table_name: string; ddl: string } | undefined;
  assert.ok(row, "an ALTER TABLE migration entry exists");
  assert.equal(row!.plugin_id, "coltest");
  assert.equal(row!.table_name, "p_coltest__widgets");
  assert.match(row!.ddl, /ADD COLUMN "sku" TEXT/);

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("dataModule: fails closed when an existing column's declared NOT NULL is tighter than the live column (declared NOT NULL, live nullable)", async () => {
  const { db, dbPath, dir } = openDb();
  const v1 = { pluginId: "coltest", pluginTier: "tier-2" as const, provenance, tables: [
    { name: "widgets", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }, { name: "title", type: "TEXT" as const }] },
  ] };
  await declareDataModule({ db, dbPath, decl: v1 });

  const v2 = { ...v1, tables: [{ name: "widgets", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }, { name: "title", type: "TEXT" as const, notNull: true }] }] };
  const result = await declareDataModule({ db, dbPath, decl: v2 });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "COLUMN_NOT_NULL_MISMATCH");
  assert.match(result.error?.message ?? "", /"title" is declared NOT NULL but the live column is nullable/);
  assert.equal(result.snapshotPath, null, "fails before any I/O");
  assert.deepEqual(liveColumns(db, "p_coltest__widgets"), ["id", "title"], "the table is completely untouched");

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("dataModule: fails closed when an existing column's declared NOT NULL is looser than the live column (declared nullable, live NOT NULL) — direction-agnostic by design", async () => {
  const { db, dbPath, dir } = openDb();
  const v1 = { pluginId: "coltest", pluginTier: "tier-2" as const, provenance, tables: [
    { name: "widgets", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }, { name: "title", type: "TEXT" as const, notNull: true }] },
  ] };
  await declareDataModule({ db, dbPath, decl: v1 });

  const v2 = { ...v1, tables: [{ name: "widgets", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }, { name: "title", type: "TEXT" as const }] }] };
  const result = await declareDataModule({ db, dbPath, decl: v2 });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "COLUMN_NOT_NULL_MISMATCH");
  assert.match(result.error?.message ?? "", /"title" is declared nullable but the live column is NOT NULL/);
  assert.equal(result.snapshotPath, null, "fails before any I/O");

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("dataModule: fails closed when an existing column's declared PRIMARY KEY is tighter than the live column (declared PK, live not PK)", async () => {
  const { db, dbPath, dir } = openDb();
  const v1 = { pluginId: "coltest", pluginTier: "tier-2" as const, provenance, tables: [
    { name: "widgets", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }, { name: "sku", type: "TEXT" as const }] },
  ] };
  await declareDataModule({ db, dbPath, decl: v1 });

  const v2 = { ...v1, tables: [{ name: "widgets", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }, { name: "sku", type: "TEXT" as const, primaryKey: true }] }] };
  const result = await declareDataModule({ db, dbPath, decl: v2 });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "COLUMN_PRIMARY_KEY_MISMATCH");
  assert.match(result.error?.message ?? "", /"sku" is declared a PRIMARY KEY but the live column is not part of the table's primary key/);
  assert.equal(result.snapshotPath, null, "fails before any I/O");

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("dataModule: fails closed when an existing column's declared PRIMARY KEY is looser than the live column (declared not PK, live IS PK) — direction-agnostic by design", async () => {
  const { db, dbPath, dir } = openDb();
  const v1 = { pluginId: "coltest", pluginTier: "tier-2" as const, provenance, tables: [
    { name: "widgets", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }, { name: "sku", type: "TEXT" as const }] },
  ] };
  await declareDataModule({ db, dbPath, decl: v1 });

  const v2 = { ...v1, tables: [{ name: "widgets", columns: [{ name: "id", type: "TEXT" as const }, { name: "sku", type: "TEXT" as const }] }] };
  const result = await declareDataModule({ db, dbPath, decl: v2 });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "COLUMN_PRIMARY_KEY_MISMATCH");
  assert.match(result.error?.message ?? "", /"id" is declared not a PRIMARY KEY but the live column is part of the table's primary key/);
  assert.equal(result.snapshotPath, null, "fails before any I/O");

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("dataModule: ADVERSARIAL — a live composite primary key does not produce a false COLUMN_PRIMARY_KEY_MISMATCH when every key column is declared primaryKey: true", async () => {
  const { db, dbPath, dir } = openDb();
  // This engine's own DDL can never create a composite primary key (see this file's header
  // comment: two column-level PRIMARY KEY constraints in one CREATE TABLE is rejected by SQLite
  // itself, "table has more than one primary key") — simulate the only way one can exist live: a
  // table that predates this engine, or was created by a Tier-3 plugin holding a raw handle (the
  // §0 access-control caveat in this file's header).
  db.prepare(
    `CREATE TABLE "p_coltest__memberships" ("workspace_id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "role" TEXT, PRIMARY KEY ("workspace_id", "user_id"))`
  ).run();

  const decl = { pluginId: "coltest", pluginTier: "tier-2" as const, provenance, tables: [
    { name: "memberships", columns: [
      { name: "workspace_id", type: "TEXT" as const, notNull: true, primaryKey: true },
      { name: "user_id", type: "TEXT" as const, notNull: true, primaryKey: true },
      { name: "role", type: "TEXT" as const },
    ] },
  ] };
  const result = await declareDataModule({ db, dbPath, decl });

  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.deepEqual(result.created, []);
  assert.deepEqual(result.altered, [], "every declared column already exists and matches — pure no-op, not a false mismatch");
  assert.equal(result.snapshotPath, null, "true no-op — nothing was snapshotted");

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("dataModule: against a live composite primary key, a genuinely undeclared key column still fails closed (the ordinal-aware read isn't blind to real mismatches)", async () => {
  const { db, dbPath, dir } = openDb();
  db.prepare(
    `CREATE TABLE "p_coltest__memberships" ("workspace_id" TEXT NOT NULL, "user_id" TEXT NOT NULL, "role" TEXT, PRIMARY KEY ("workspace_id", "user_id"))`
  ).run();

  // The manifest author only marked the FIRST composite-key column primaryKey: true and forgot
  // the second (user_id) — this must still be caught, not waved through because a composite key
  // is involved.
  const decl = { pluginId: "coltest", pluginTier: "tier-2" as const, provenance, tables: [
    { name: "memberships", columns: [
      { name: "workspace_id", type: "TEXT" as const, notNull: true, primaryKey: true },
      { name: "user_id", type: "TEXT" as const, notNull: true },
      { name: "role", type: "TEXT" as const },
    ] },
  ] };
  const result = await declareDataModule({ db, dbPath, decl });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "COLUMN_PRIMARY_KEY_MISMATCH");
  assert.match(result.error?.message ?? "", /"user_id" is declared not a PRIMARY KEY but the live column is part of the table's primary key/);

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("dataModule: against an in-memory db, adding a column to an already-existing table still applies with snapshotPath null and no stray file", async () => {
  const db = new Database(":memory:");
  const v1 = { pluginId: "coltest", pluginTier: "tier-2" as const, provenance, tables: [
    { name: "widgets", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }] },
  ] };
  await declareDataModule({ db, dbPath: ":memory:", decl: v1 });

  const before = new Set(fs.readdirSync(process.cwd()));
  const v2 = { ...v1, tables: [{ name: "widgets", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }, { name: "sku", type: "TEXT" as const }] }] };
  const result = await declareDataModule({ db, dbPath: ":memory:", decl: v2 });
  const after = fs.readdirSync(process.cwd());

  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.deepEqual(result.altered, ["p_coltest__widgets"]);
  assert.equal(result.snapshotPath, null, "no file backs an in-memory db — nothing to snapshot");
  assert.deepEqual(liveColumns(db, "p_coltest__widgets"), ["id", "sku"], "the DDL still ran and committed in-process");
  assert.deepEqual(after.filter((name) => !before.has(name)), [], "no stray file leaked into the cwd");

  db.close();
});
