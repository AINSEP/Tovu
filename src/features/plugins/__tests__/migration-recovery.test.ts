import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { declareDataModule } from "../data-module.js";
import { beginJournalEntry, ensureMigrationJournal } from "../migration-journal.js";
import { recoverIncompleteDataModuleMigrations } from "../migration-recovery.js";
import { snapshotDb } from "../snapshot.js";

/**
 * @file ADR-023 §2 — boot-time crash recovery. Simulates a process death mid-DDL (a journal entry
 * left at a non-terminal phase, with a live db that has already diverged from its snapshot) and
 * proves the mandatory, blocking restore-or-complete step actually restores the pre-DDL state.
 *
 * The last test (POST-COMMIT DATA-LOSS WINDOW, BUG FIX 2026-08-12) is a different shape from the
 * ones above it: rather than hand-simulating a crash by calling the journal/snapshot primitives
 * directly, it drives the real `declareDataModule` through a fault-injected post-commit-style
 * failure (see `data-module.test.ts` for the matching unit-level assertions, including the full
 * write-survives-a-later-restart reproduction) and then runs THIS file's actual
 * `recoverIncompleteDataModuleMigrations` against the result — closing the loop the bug was about:
 * not just "the journal phase is terminal" in isolation, but "a real boot recovery pass correctly
 * finds nothing to do," since a non-crash, in-process failure must never leave behind anything a
 * genuine crash-recovery pass would mistake for its own.
 */

function makeDbWithCoreContent(): { dir: string; dbPath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-recovery-"));
  const dbPath = path.join(dir, "content.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.prepare(`CREATE TABLE posts (id TEXT PRIMARY KEY)`).run();
  db.prepare(`INSERT INTO posts VALUES ('p1')`).run();
  db.close();
  return { dir, dbPath };
}

test("no journal table yet (fresh db, never ran a dataModule declare) — recovery is a clean no-op", () => {
  const { dir, dbPath } = makeDbWithCoreContent();
  const result = recoverIncompleteDataModuleMigrations(dbPath);
  assert.deepEqual(result, { recovered: 0, entries: [] });
  fs.rmSync(dir, { recursive: true, force: true });
});

test("an incomplete journal entry (simulated crash mid-DDL) is restored from its snapshot on next boot", async () => {
  const { dir, dbPath } = makeDbWithCoreContent();
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  // Simulate exactly what declareDataModule does up through DDL_IN_PROGRESS, then "crash" —
  // no COMMITTED/ROLLED_BACK ever gets written.
  const snapshotPath = await snapshotDb({ db, dbPath, label: "crashed-plugin" });
  ensureMigrationJournal(db);
  // Non-null: `dbPath` here is a real tmpdir file, never `:memory:` — snapshotDb only returns null
  // for SQLite's in-memory/temp identifiers (see snapshot.ts).
  beginJournalEntry({ db, pluginId: "crashed-plugin", snapshotPath: snapshotPath! });
  // Now actually diverge the live db from the snapshot, exactly as a mid-DDL crash would leave it.
  db.prepare(`CREATE TABLE "p_crashed_plugin__half_created" (id TEXT PRIMARY KEY)`).run();
  db.close();

  assert.ok(
    (new Database(dbPath).prepare(`SELECT name FROM sqlite_master WHERE name = 'p_crashed_plugin__half_created'`).get()),
    "sanity check: the half-created table exists before recovery runs"
  );

  const result = recoverIncompleteDataModuleMigrations(dbPath);

  assert.equal(result.recovered, 1);
  assert.equal(result.entries[0].pluginId, "crashed-plugin");

  const restored = new Database(dbPath);
  assert.equal(
    restored.prepare(`SELECT name FROM sqlite_master WHERE name = 'p_crashed_plugin__half_created'`).get(),
    undefined,
    "the half-created table must be gone — restored to the pre-DDL snapshot"
  );
  assert.ok(restored.prepare(`SELECT * FROM posts WHERE id = 'p1'`).get(), "pre-existing core content survives the restore");
  restored.close();

  fs.rmSync(dir, { recursive: true, force: true });
});

test("recovery clears the WAL/SHM sidecars left by the crashed attempt (T8)", async () => {
  const { dir, dbPath } = makeDbWithCoreContent();
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  const snapshotPath = await snapshotDb({ db, dbPath, label: "crashed-plugin" });
  ensureMigrationJournal(db);
  beginJournalEntry({ db, pluginId: "crashed-plugin", snapshotPath: snapshotPath! }); // real tmpdir file — never null, see above
  db.prepare(`CREATE TABLE "p_crashed_plugin__x" (id TEXT PRIMARY KEY)`).run();
  // Check WAL existence WHILE the connection is still open — a clean close() triggers its own
  // checkpoint, which is not representative of the crash this test simulates (an abrupt process
  // death leaves the WAL sidecar behind; a clean close does not). Close immediately after the
  // check so the file is not held open when recovery's file copy runs.
  assert.ok(fs.existsSync(`${dbPath}-wal`), "sanity check: WAL sidecar exists before recovery (WAL mode)");
  db.close();

  recoverIncompleteDataModuleMigrations(dbPath);

  assert.equal(fs.existsSync(`${dbPath}-wal`), false, "the crashed attempt's WAL sidecar must be cleared");
  assert.equal(fs.existsSync(`${dbPath}-shm`), false, "the crashed attempt's SHM sidecar must be cleared");

  fs.rmSync(dir, { recursive: true, force: true });
});

test("a COMMITTED entry is left alone — recovery is a no-op for a successful prior attempt", async () => {
  const { dir, dbPath } = makeDbWithCoreContent();
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  const snapshotPath = await snapshotDb({ db, dbPath, label: "done-plugin" });
  ensureMigrationJournal(db);
  const id = beginJournalEntry({ db, pluginId: "done-plugin", snapshotPath: snapshotPath! }); // real tmpdir file — never null
  db.prepare(`CREATE TABLE "p_done_plugin__real" (id TEXT PRIMARY KEY)`).run();
  const { advanceJournalPhase } = await import("../migration-journal.js");
  advanceJournalPhase({ db, id, phase: "COMMITTED" });
  db.close();

  const result = recoverIncompleteDataModuleMigrations(dbPath);
  assert.deepEqual(result, { recovered: 0, entries: [] });

  const stillThere = new Database(dbPath);
  assert.ok(stillThere.prepare(`SELECT name FROM sqlite_master WHERE name = 'p_done_plugin__real'`).get(), "a committed table must not be reverted");
  stillThere.close();

  fs.rmSync(dir, { recursive: true, force: true });
});

test("POST-COMMIT DATA-LOSS WINDOW (BUG FIX, 2026-08-12): a declareDataModule call whose verification fails leaves NOTHING for real boot recovery to act on, and any writes made after it survive", async () => {
  const { dir, dbPath } = makeDbWithCoreContent();
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  const v1 = {
    pluginId: "committest2",
    pluginTier: "tier-2" as const,
    provenance: { sourceUrl: "test://committest2", publisher: "test" },
    tables: [{ name: "widgets", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }] }],
  };
  await declareDataModule({ db, dbPath, decl: v1 });

  const v2 = {
    ...v1,
    tables: [{ name: "widgets", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }, { name: "sku", type: "TEXT" as const }] }],
  };

  // Same fault-injection technique as `data-module.test.ts`'s matching test: let the FIRST
  // `PRAGMA table_info` call (planning, before the DDL transaction opens) through untouched, but
  // make the SECOND one (verifyPostDdl, now called from INSIDE that same transaction) report "sku"
  // as missing — see that file for the fuller comment.
  let tableInfoCalls = 0;
  const proxiedDb = new Proxy(db, {
    get(target, prop, receiver) {
      if (prop !== "prepare") {
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      }
      return (sql: string) => {
        if (sql.includes('PRAGMA table_info("p_committest2__widgets")')) {
          tableInfoCalls += 1;
          if (tableInfoCalls === 2) {
            return { all: () => [{ name: "id", type: "TEXT", notnull: 0, pk: 1 }] } as unknown as ReturnType<Database.Database["prepare"]>;
          }
        }
        return target.prepare(sql);
      };
    },
  });

  const declareResult = await declareDataModule({ db: proxiedDb, dbPath, decl: v2 });
  assert.equal(declareResult.ok, false, "the fault-injected verification failure is reported");

  // The site does NOT crash — it keeps serving and accepting writes on the same live connection,
  // exactly like production. This write must survive everything below.
  db.prepare(`INSERT INTO posts VALUES ('p2')`).run();
  // Close BEFORE recovery — `recoverIncompleteDataModuleMigrations` opens its own short-lived
  // connection and requires no other connection holds the file open (see this file's header and
  // `migration-recovery.ts`'s own header on why restore only ever runs at boot, before any other
  // connection exists).
  db.close();

  const recovery = recoverIncompleteDataModuleMigrations(dbPath);

  // The load-bearing assertion: recovery must find NOTHING to do. Before the fix, this same
  // fault-injected failure left a non-terminal `VERIFYING` entry behind, which this exact call used
  // to (wrongly) pick up and restore, discarding every write made after the failed declare — see the
  // git history of this test for the pre-fix version, which asserted `recovery.recovered === 1` as
  // the then-accepted behavior.
  assert.deepEqual(recovery, { recovered: 0, entries: [] }, "verification failing now rolls back inside declareDataModule itself, so there is no non-terminal entry left for boot recovery to ever find");

  const restored = new Database(dbPath);
  const cols = (restored.prepare(`PRAGMA table_info("p_committest2__widgets")`).all() as Array<{ name: string }>).map((r) => r.name);
  assert.deepEqual(cols, ["id"], "the ALTER rolled back atomically at declare time, not via a later restore");
  assert.ok(restored.prepare(`SELECT id FROM posts WHERE id = 'p2'`).get(), "the write made after the failed declare survives, because recovery never touched the file");
  restored.close();

  fs.rmSync(dir, { recursive: true, force: true });
});
