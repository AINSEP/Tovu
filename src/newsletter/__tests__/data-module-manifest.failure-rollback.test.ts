/**
 * @file T010 🔴 REQUIRED, GATING (ADR-PIPE-011 Mitigations Required).
 *
 * `declareDataModule()` (`src/features/plugins/data-module.ts`) now implements ADR-023's full
 * accepted T1-T8 safety mechanics (SPEC-032) — this is no longer spike-quality code, though it
 * remains load-bearing for Newsletter's five real production tables and this test remains the
 * dedicated integration test forcing a mid-DDL failure against Newsletter's REAL 5-table manifest
 * (`NEWSLETTER_DATA_MODULE`, `../data-module-manifest`), invoked through the real
 * `declareDataModule()` mechanism, asserting the pre-DDL snapshot restores the target SQLite DB to
 * its exact pre-existing state (no partial tables, no orphaned rows).
 *
 * This test MUST pass before T011 (wiring `installNewsletterDataModule()` into the boot path) is
 * considered complete, and gates every downstream task that writes to a `p_newsletter__*` table:
 * T013 (repo.sqlite.ts), and transitively T026 (lists.ts), T027 (confirmation.ts), T028
 * (unsubscribe.ts), T029 (subscriptions.ts), T037 (send-pipeline.ts). Code Review blocks approval of
 * the schema-creation task without this test present and passing (ADR-PIPE-011 Enforcement).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { declareDataModule, type DataModuleDecl } from "../../features/plugins/data-module";
import { NEWSLETTER_DATA_MODULE, NEWSLETTER_TABLE_NAMES } from "../data-module-manifest";

function openWithCore(): { db: Database.Database; dbPath: string; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-newsletter-dm-"));
  const dbPath = path.join(dir, "content.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  // Stand-in for pre-existing core content (mirrors `data-module.test.ts`'s own `openWithCore` helper).
  db.prepare(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, name TEXT)`).run();
  db.prepare(`INSERT INTO workspaces VALUES ('ws-1', 'Acme')`).run();
  return { db, dbPath, dir };
}

const tableExists = (db: Database.Database, name: string): boolean =>
  !!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`).get(name);

const ALL_NEWSLETTER_TABLE_NAMES = Object.values(NEWSLETTER_TABLE_NAMES);

test("data-module-manifest: the real 5-table Newsletter manifest is well-formed and installs cleanly (happy path)", async () => {
  const { db, dbPath, dir } = openWithCore();

  const result = await declareDataModule(db, dbPath, NEWSLETTER_DATA_MODULE);

  assert.equal(result.ok, true, `expected the real manifest to install cleanly, got error: ${JSON.stringify(result.error)}`);
  assert.equal(result.created.length, 5, "all 5 p_newsletter__* tables were created");
  for (const fq of ALL_NEWSLETTER_TABLE_NAMES) {
    assert.ok(tableExists(db, fq), `expected ${fq} to exist after a clean install`);
  }
  assert.ok(tableExists(db, "workspaces"), "core content untouched by a successful install");

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("data-module-manifest: a mid-DDL failure against the REAL 5-table manifest rolls back to the exact pre-existing state (never-brick, T010 gate)", async () => {
  const { db, dbPath, dir } = openWithCore();

  const preExistingTableCount = (
    db.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'`).get() as { n: number }
  ).n;
  const preExistingWorkspaceRows = db.prepare(`SELECT * FROM workspaces`).all();

  // Poison the REAL manifest: every one of Newsletter's 5 real table declarations, verbatim, plus a
  // 6th entry that RE-DECLARES the last table's short name ("confirmation_tokens"). `declareDataModule`
  // computes `toCreate` once (before any DDL) from the pre-call `sqlite_master` snapshot, so both
  // occurrences are scheduled; the DDL runs inside ONE transaction with no `IF NOT EXISTS`
  // (`data-module.ts`'s own documented behavior), so the 6th CREATE fails on "table already exists"
  // AFTER the first 5 real CREATEs have already run in the same transaction — forcing a genuine
  // mid-DDL failure against the real manifest, not a synthetic isolated one.
  const poisonedManifest: DataModuleDecl = {
    pluginId: NEWSLETTER_DATA_MODULE.pluginId,
    pluginTier: NEWSLETTER_DATA_MODULE.pluginTier,
    provenance: NEWSLETTER_DATA_MODULE.provenance,
    tables: [
      ...NEWSLETTER_DATA_MODULE.tables,
      {
        name: "confirmation_tokens",
        columns: [{ name: "id", type: "TEXT", primaryKey: true }],
      },
    ],
  };

  const result = await declareDataModule(db, dbPath, poisonedManifest);

  assert.equal(result.ok, false, "a within-call duplicate table name must fail, not silently succeed");
  assert.equal(result.error?.code, "DDL_FAILED");
  assert.ok(
    result.recoveryPoint && fs.existsSync(result.recoveryPoint),
    "a named recovery-point snapshot is kept on failure (§9)"
  );

  // No partial tables: NONE of the 5 real p_newsletter__* tables exist — the whole transaction,
  // including the 5 real CREATEs that ran before the poisoned 6th failed, was rolled back.
  for (const fq of ALL_NEWSLETTER_TABLE_NAMES) {
    assert.equal(tableExists(db, fq), false, `${fq} must not exist after a rolled-back mid-DDL failure`);
  }

  // No orphaned CONTENT tables / no drift in pre-existing content. The table count itself is
  // EXPECTED to grow by exactly 3: `_plugin_migration_journal` and `_plugin_identity` — SPEC-032's
  // always-created infra bookkeeping tables, created outside the DDL transaction on purpose so
  // they survive a rollback (the journal must survive to record ROLLED_BACK; the identity record
  // is permanent by design, ADR-023 §5) — plus SQLite's own `sqlite_sequence` table, which SQLite
  // itself auto-creates (and never removes) the first time any AUTOINCREMENT table is created;
  // `_plugin_migration_journal` is that first table here, so this is an unavoidable, stable,
  // SQLite-internal side effect, not something this engine could suppress. `_plugin_migrations`
  // (the pre-SPEC-032 table) is still created INSIDE the DDL transaction, so it rolls back with
  // everything else on a first-ever failed attempt, same as before.
  const postFailureTableCount = (
    db.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'`).get() as { n: number }
  ).n;
  assert.equal(postFailureTableCount, preExistingTableCount + 3, "only the always-created infra tables (+ SQLite's own sqlite_sequence) were added; no plugin content tables leaked through");
  assert.ok(tableExists(db, "_plugin_migration_journal"), "the phase journal itself must survive a rollback to record it");
  assert.ok(tableExists(db, "_plugin_identity"), "the identity record is permanent by design (ADR-023 §5)");
  assert.deepEqual(db.prepare(`SELECT * FROM workspaces`).all(), preExistingWorkspaceRows, "pre-existing rows are untouched");

  // The recovery snapshot itself is the PRE-DDL state: core content present, no newsletter tables at all.
  const snap = new Database(result.recoveryPoint!);
  assert.ok(tableExists(snap, "workspaces"), "recovery snapshot captured pre-existing core content");
  for (const fq of ALL_NEWSLETTER_TABLE_NAMES) {
    assert.equal(tableExists(snap, fq), false, `recovery snapshot predates ${fq} — it is the PRE-DDL anchor`);
  }
  snap.close();

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("data-module-manifest: after a rolled-back attempt, a clean retry of the REAL manifest still installs correctly (resumable, not permanently bricked)", async () => {
  const { db, dbPath, dir } = openWithCore();

  const poisoned: DataModuleDecl = {
    pluginId: NEWSLETTER_DATA_MODULE.pluginId,
    pluginTier: NEWSLETTER_DATA_MODULE.pluginTier,
    provenance: NEWSLETTER_DATA_MODULE.provenance,
    tables: [...NEWSLETTER_DATA_MODULE.tables, { name: "lists", columns: [{ name: "id", type: "TEXT", primaryKey: true }] }],
  };
  const failed = await declareDataModule(db, dbPath, poisoned);
  assert.equal(failed.ok, false);

  const retried = await declareDataModule(db, dbPath, NEWSLETTER_DATA_MODULE);
  assert.equal(retried.ok, true, "a clean retry after a rolled-back failure must succeed, not stay bricked");
  assert.equal(retried.created.length, 5);
  for (const fq of ALL_NEWSLETTER_TABLE_NAMES) {
    assert.ok(tableExists(db, fq));
  }

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
