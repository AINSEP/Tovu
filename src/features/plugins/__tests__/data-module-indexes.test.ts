import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { declareDataModule } from "../data-module.js";

/**
 * @file ADR-023 §2 / ADR-031 OQ-1 — the declared-index grammar (SPEC-033).
 *
 * INDEX-LEVEL RECONCILIATION (BUG FIX, 2026-08-12): the tests below through "a unique index is
 * enforced" only ever exercise the CREATE path (a brand-new table with its indexes). Index
 * reconciliation on an ALREADY-EXISTING table used to be entirely missing — a v2 manifest that
 * added an index to an existing table got `{ ok: true, altered: [...] }` back (truthfully
 * reporting any column work) with the index itself silently never created. See `data-module.ts`'s
 * header comment, INDEX-LEVEL RECONCILIATION, for the full reasoning behind `indexesToAdd` vs.
 * `indexesToRecreate` (DROP + CREATE, deliberately, since an index carries no data) vs. leaving an
 * undeclared live index alone.
 */

function openDb(): { db: Database.Database; dbPath: string; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-dm-idx-"));
  const dbPath = path.join(dir, "content.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  return { db, dbPath, dir };
}

const provenance = { sourceUrl: "test://idxtest", publisher: "test" };

const liveIndex = (db: Database.Database, name: string): { name: string; sql: string } | undefined =>
  db.prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name = ?`).get(name) as
    | { name: string; sql: string }
    | undefined;

test("a declared composite index is created alongside its table", async () => {
  const { db, dbPath, dir } = openDb();
  const result = await declareDataModule({ db, dbPath, decl: {
    pluginId: "idxtest",
    pluginTier: "tier-2",
    provenance: { sourceUrl: "test://idxtest", publisher: "test" },
    tables: [
      {
        name: "widgets",
        columns: [
          { name: "id", type: "TEXT", primaryKey: true },
          { name: "workspace_id", type: "TEXT", notNull: true },
          { name: "status", type: "TEXT", notNull: true },
        ],
        indexes: [{ name: "by_workspace_status", columns: ["workspace_id", "status"] }],
      },
    ],
  } });

  assert.equal(result.ok, true, JSON.stringify(result.error));
  const idx = db
    .prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_p_idxtest__widgets__by_workspace_status'`)
    .get() as { name: string; sql: string } | undefined;
  assert.ok(idx, "the declared index exists in sqlite_master");
  assert.match(idx!.sql, /"workspace_id", "status"/);

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("an index referencing an undeclared column is rejected before any I/O", async () => {
  const { db, dbPath, dir } = openDb();
  const result = await declareDataModule({ db, dbPath, decl: {
    pluginId: "idxtest",
    pluginTier: "tier-2",
    provenance: { sourceUrl: "test://idxtest", publisher: "test" },
    tables: [
      {
        name: "widgets",
        columns: [{ name: "id", type: "TEXT", primaryKey: true }],
        indexes: [{ name: "bad", columns: ["nonexistent_column"] }],
      },
    ],
  } });
  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "INDEX_UNKNOWN_COLUMN");
  assert.equal(result.snapshotPath, null, "no snapshot wasted on an invalid declaration");

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a unique index is enforced", async () => {
  const { db, dbPath, dir } = openDb();
  await declareDataModule({ db, dbPath, decl: {
    pluginId: "idxtest",
    pluginTier: "tier-2",
    provenance: { sourceUrl: "test://idxtest", publisher: "test" },
    tables: [
      {
        name: "widgets",
        columns: [
          { name: "id", type: "TEXT", primaryKey: true },
          { name: "slug", type: "TEXT", notNull: true },
        ],
        indexes: [{ name: "unique_slug", columns: ["slug"], unique: true }],
      },
    ],
  } });

  db.prepare(`INSERT INTO "p_idxtest__widgets" (id, slug) VALUES ('a', 'x')`).run();
  assert.throws(() => db.prepare(`INSERT INTO "p_idxtest__widgets" (id, slug) VALUES ('b', 'x')`).run());

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("dataModule: a missing index on an already-existing table is added via CREATE INDEX", async () => {
  const { db, dbPath, dir } = openDb();
  const v1 = { pluginId: "idxtest", pluginTier: "tier-2" as const, provenance, tables: [
    { name: "widgets", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }, { name: "workspace_id", type: "TEXT" as const, notNull: true }] },
  ] };
  const first = await declareDataModule({ db, dbPath, decl: v1 });
  assert.equal(first.ok, true, JSON.stringify(first.error));
  assert.equal(liveIndex(db, "idx_p_idxtest__widgets__by_workspace"), undefined, "not created yet");

  const v2 = { ...v1, tables: [{ ...v1.tables[0]!, indexes: [{ name: "by_workspace", columns: ["workspace_id"] }] }] };
  const second = await declareDataModule({ db, dbPath, decl: v2 });

  assert.equal(second.ok, true, JSON.stringify(second.error));
  assert.deepEqual(second.created, [], "no table was newly created");
  assert.deepEqual(second.altered, ["p_idxtest__widgets"], "the existing table is reported as altered for the new index");
  const idx = liveIndex(db, "idx_p_idxtest__widgets__by_workspace");
  assert.ok(idx, "the declared index now exists");
  assert.match(idx!.sql, /"workspace_id"/);

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("dataModule: a live index whose shape no longer matches its declaration is dropped and recreated, not silently left stale", async () => {
  const { db, dbPath, dir } = openDb();
  const v1 = { pluginId: "idxtest", pluginTier: "tier-2" as const, provenance, tables: [
    {
      name: "widgets",
      columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }, { name: "workspace_id", type: "TEXT" as const, notNull: true }, { name: "status", type: "TEXT" as const, notNull: true }],
      indexes: [{ name: "by_workspace", columns: ["workspace_id"] }],
    },
  ] };
  await declareDataModule({ db, dbPath, decl: v1 });
  assert.match(liveIndex(db, "idx_p_idxtest__widgets__by_workspace")!.sql, /\("workspace_id"\)/);

  // v2 widens the SAME declared index (same short name) to a composite column list.
  const v2 = { ...v1, tables: [{ ...v1.tables[0]!, indexes: [{ name: "by_workspace", columns: ["workspace_id", "status"] }] }] };
  const result = await declareDataModule({ db, dbPath, decl: v2 });

  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.deepEqual(result.altered, ["p_idxtest__widgets"]);
  const idx = liveIndex(db, "idx_p_idxtest__widgets__by_workspace");
  assert.ok(idx, "the index still exists under the same name — dropped and recreated, not left orphaned");
  assert.match(idx!.sql, /"workspace_id", "status"/, "the live index now reflects the new column list");

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("dataModule: a live index the current declaration no longer mentions is left alone, mirroring the column-drop policy", async () => {
  const { db, dbPath, dir } = openDb();
  const v1 = { pluginId: "idxtest", pluginTier: "tier-2" as const, provenance, tables: [
    {
      name: "widgets",
      columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }, { name: "legacy_col", type: "TEXT" as const }],
      indexes: [{ name: "legacy_idx", columns: ["legacy_col"] }],
    },
  ] };
  await declareDataModule({ db, dbPath, decl: v1 });
  assert.ok(liveIndex(db, "idx_p_idxtest__widgets__legacy_idx"));

  // v2's manifest no longer declares any index on this table at all.
  const v2 = { ...v1, tables: [{ name: "widgets", columns: v1.tables[0]!.columns }] };
  const result = await declareDataModule({ db, dbPath, decl: v2 });

  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.deepEqual(result.altered, [], "nothing needed reconciling — an undeclared index is not itself a reason to touch the table");
  assert.ok(liveIndex(db, "idx_p_idxtest__widgets__legacy_idx"), "legacy_idx was NOT dropped");

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("dataModule: a fully-reconciled index (already matching) produces no DROP/CREATE churn — idempotent", async () => {
  const { db, dbPath, dir } = openDb();
  const decl = { pluginId: "idxtest", pluginTier: "tier-2" as const, provenance, tables: [
    {
      name: "widgets",
      columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }, { name: "slug", type: "TEXT" as const, notNull: true }],
      indexes: [{ name: "unique_slug", columns: ["slug"], unique: true }],
    },
  ] };
  await declareDataModule({ db, dbPath, decl });

  const migrationCountBefore = (db.prepare(`SELECT COUNT(*) AS n FROM _plugin_migrations`).get() as { n: number }).n;
  const result = await declareDataModule({ db, dbPath, decl });
  const migrationCountAfter = (db.prepare(`SELECT COUNT(*) AS n FROM _plugin_migrations`).get() as { n: number }).n;

  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.deepEqual(result.altered, [], "an already-matching index is not redeclared as work");
  assert.equal(result.snapshotPath, null, "true no-op — nothing was snapshotted");
  assert.equal(migrationCountAfter, migrationCountBefore, "no DROP INDEX / CREATE INDEX pair was executed for an unchanged index");

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("dataModule: ADVERSARIAL — recreating an index as UNIQUE against live duplicate data fails the whole call, rolled back", async () => {
  const { db, dbPath, dir } = openDb();
  const v1 = { pluginId: "idxtest", pluginTier: "tier-2" as const, provenance, tables: [
    {
      name: "widgets",
      columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }, { name: "slug", type: "TEXT" as const, notNull: true }],
      indexes: [{ name: "by_slug", columns: ["slug"] }], // non-unique
    },
  ] };
  await declareDataModule({ db, dbPath, decl: v1 });
  db.prepare(`INSERT INTO "p_idxtest__widgets" (id, slug) VALUES ('a', 'dup')`).run();
  db.prepare(`INSERT INTO "p_idxtest__widgets" (id, slug) VALUES ('b', 'dup')`).run(); // genuine duplicate

  // v2 tightens the SAME index to unique — recreating it against real duplicate data.
  const v2 = { ...v1, tables: [{ ...v1.tables[0]!, indexes: [{ name: "by_slug", columns: ["slug"], unique: true }] }] };
  const result = await declareDataModule({ db, dbPath, decl: v2 });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "DDL_FAILED");
  assert.ok(result.recoveryPoint && fs.existsSync(result.recoveryPoint), "recovery snapshot kept");
  // Rolled back: the ORIGINAL non-unique index survives — DROP INDEX + the failed CREATE UNIQUE
  // INDEX are both inside the one transaction, so the DROP is undone along with everything else.
  const idx = liveIndex(db, "idx_p_idxtest__widgets__by_slug");
  assert.ok(idx, "the original index still exists — not left dropped with nothing rebuilt");
  assert.doesNotMatch(idx!.sql, /UNIQUE/i);
  assert.equal(
    (db.prepare(`SELECT COUNT(*) AS n FROM "p_idxtest__widgets" WHERE slug = 'dup'`).get() as { n: number }).n,
    2,
    "both duplicate rows survive — nothing was lost to a partial migration"
  );

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
