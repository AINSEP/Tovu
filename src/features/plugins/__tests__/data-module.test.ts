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
  // A snapshot WAS taken (the path is reported), and is deleted once the migration commits —
  // ADR-023 §4 amendment 2026-08-02. Its only reader is boot recovery, which acts solely on
  // non-terminal journal entries, so a COMMITTED entry's snapshot is unreachable and was
  // previously kept forever: one whole-database copy per plugin, per install.
  assert.ok(result.snapshotPath, "a snapshot path is still reported");
  assert.equal(
    fs.existsSync(result.snapshotPath!),
    false,
    "the snapshot is discarded once the migration is committed",
  );
  assert.ok(tableExists(db, "p_hello__products"), "the plugin table now exists");
  assert.ok(tableExists(db, "posts"), "core content is untouched");
  const journal = db
    .prepare(`SELECT plugin_id, table_name FROM _plugin_migrations WHERE table_name = ?`)
    .get("p_hello__products") as { plugin_id: string } | undefined;
  assert.equal(journal?.plugin_id, "hello");

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("dataModule: a FAILED migration keeps its snapshot, and that snapshot is the pre-DDL state (never-brick proof)", async () => {
  // Proven on the failure path deliberately. A committed migration now discards its snapshot
  // (ADR-023 §4 amendment 2026-08-02), so success is the one case where the file is legitimately
  // gone — and it is also the case where nothing could ever need it. Failure is where the
  // never-brick guarantee actually has to hold, so that is where it is asserted.
  //
  // The DDL is made to fail *after* the snapshot is taken by declaring the same table twice:
  // `declareDataModule` emits CREATE TABLE without IF NOT EXISTS precisely so a malformed manifest
  // fails loudly, and both entries survive the `toCreate` filter because neither exists yet.
  const { db, dbPath, dir } = openWithCore();
  const result = await declareDataModule({
    db,
    dbPath,
    decl: { ...productsDecl, tables: [productsDecl.tables[0]!, productsDecl.tables[0]!] },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "DDL_FAILED");
  assert.ok(result.snapshotPath && fs.existsSync(result.snapshotPath), "a failed migration retains its snapshot");
  assert.equal(result.recoveryPoint, result.snapshotPath, "the snapshot is reported as the recovery point");

  // Open the snapshot as its own db: it must be the PRE-state — core content present, plugin table absent.
  const snap = new Database(result.snapshotPath!);
  assert.ok(tableExists(snap, "posts"), "snapshot captured pre-existing core content");
  assert.equal(tableExists(snap, "p_hello__products"), false, "snapshot predates the new table");
  snap.close();

  // And the live db was rolled back, so the failed attempt left nothing behind.
  assert.equal(tableExists(db, "p_hello__products"), false, "the rolled-back table is absent from the live db");

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

/**
 * POST-COMMIT JOURNAL INTEGRITY (BUG FIX, 2026-08-12): see `data-module.ts`'s header comment for
 * the full reasoning. The two tests below prove both sides of the fork `recordFailurePhase` makes:
 * a PRE-commit failure still journals a truthful `ROLLED_BACK` (this one, complementing "a failing
 * DDL rolls back to a working state" above with an explicit journal-phase assertion it didn't
 * previously make), and a POST-commit failure does NOT (next test, fault-injected).
 */
test("dataModule: a pre-commit DDL failure still journals a truthful ROLLED_BACK", async () => {
  const { db, dbPath, dir } = openWithCore();
  const result = await declareDataModule({ db, dbPath, decl: {
    pluginId: "journaltest",
    pluginTier: "tier-2" as const,
    provenance: { sourceUrl: "test://journaltest", publisher: "test" },
    tables: [
      // Same table declared twice in one call — the second CREATE fails (no IF NOT EXISTS),
      // before db.transaction() ever resolves, so SQLite's own rollback really did undo it all.
      { name: "dup", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }] },
      { name: "dup", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }] },
    ],
  } });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "DDL_FAILED");
  const journalRow = db.prepare(`SELECT phase FROM _plugin_migration_journal ORDER BY id DESC LIMIT 1`).get() as { phase: string } | undefined;
  assert.ok(journalRow, "a journal entry exists");
  assert.equal(journalRow!.phase, "ROLLED_BACK", "SQLite's own transaction rollback really did undo everything, so ROLLED_BACK is truthful here");

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("dataModule: FAULT INJECTION — a post-commit verification failure does NOT mark the journal ROLLED_BACK, since the DDL genuinely committed", async () => {
  const { db, dbPath, dir } = openWithCore();
  const v1 = {
    pluginId: "committest",
    pluginTier: "tier-2" as const,
    provenance: { sourceUrl: "test://committest", publisher: "test" },
    tables: [{ name: "widgets", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }] }],
  };
  await declareDataModule({ db, dbPath, decl: v1 });

  const v2 = {
    ...v1,
    tables: [{ name: "widgets", columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }, { name: "sku", type: "TEXT" as const }] }],
  };

  // Wrap `db` so the FIRST `PRAGMA table_info("p_committest__widgets")` call (planning, strictly
  // BEFORE `db.transaction()` resolves) passes through untouched, but the SECOND one
  // (`verifyPostDdl`, called strictly AFTER the transaction has already committed for real) returns
  // a stale column list missing "sku" — this injects the rare "verification can't confirm what was
  // actually committed" case without needing an unreachable SQLite-level failure to trigger it.
  // Every other `prepare()` call, and every other db method (`.transaction`, `.pragma`, etc.), goes
  // straight through to the real connection, so the ALTER itself genuinely runs and commits.
  let tableInfoCalls = 0;
  const proxiedDb = new Proxy(db, {
    get(target, prop, receiver) {
      if (prop !== "prepare") {
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      }
      return (sql: string) => {
        if (sql.includes('PRAGMA table_info("p_committest__widgets")')) {
          tableInfoCalls += 1;
          if (tableInfoCalls === 2) {
            return { all: () => [{ name: "id", type: "TEXT", notnull: 0, pk: 1 }] } as unknown as ReturnType<Database.Database["prepare"]>;
          }
        }
        return target.prepare(sql);
      };
    },
  });

  const result = await declareDataModule({ db: proxiedDb, dbPath, decl: v2 });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "DDL_FAILED");
  assert.match(result.error?.message ?? "", /post-DDL verification failed/);

  // The ALTER genuinely committed on the real connection — confirmed via a plain, unproxied read.
  const liveCols = (db.prepare(`PRAGMA table_info("p_committest__widgets")`).all() as Array<{ name: string }>).map((r) => r.name);
  assert.deepEqual(liveCols, ["id", "sku"], "the ALTER really committed despite the reported failure");

  // The load-bearing assertion: the journal entry must NOT be terminal. A real ROLLED_BACK here
  // would make next-boot recovery see a "handled" entry and skip it, permanently losing the
  // ability to reconcile a journal that disagrees with a database that actually has the change.
  const journalRow = db.prepare(`SELECT phase FROM _plugin_migration_journal ORDER BY id DESC LIMIT 1`).get() as { phase: string };
  assert.equal(journalRow.phase, "VERIFYING", "left non-terminal so next-boot recovery can act on it, not falsely marked ROLLED_BACK");

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

/**
 * PostgreSQL truncates over-long identifiers silently. SQLite has no limit, so a name that is fine
 * today becomes a defect the day a site runs on Postgres — the catalog name would differ from the
 * computed name, and the `existingTables` idempotency check would try to re-create the object on
 * every activation. These three tests pin the boundary rather than the sentiment.
 */
const longNameDecl = (pluginId: string, tableName: string, indexName?: string) => ({
  pluginId,
  pluginTier: "tier-2" as const,
  provenance: { sourceUrl: "test://long", publisher: "test" },
  tables: [
    {
      name: tableName,
      columns: [{ name: "id", type: "TEXT" as const, primaryKey: true }],
      ...(indexName ? { indexes: [{ name: indexName, columns: ["id"] }] } : {}),
    },
  ],
});

test("dataModule: rejects a table whose namespaced name would exceed PostgreSQL's 63-byte identifier limit", async () => {
  const { db, dbPath, dir } = openWithCore();
  // `p_` + pluginId(30) + `__` + tableName(32) = 66 bytes.
  const result = await declareDataModule({ db, dbPath, decl: longNameDecl("a".repeat(30), "b".repeat(32)) });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "IDENTIFIER_TOO_LONG");
  assert.match(result.error?.message ?? "", /66 bytes/, "reports the actual byte count");
  assert.equal(result.snapshotPath, null, "fails before any I/O — no snapshot was taken");
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("dataModule: rejects an index whose generated name would exceed the identifier limit, even when the table fits", async () => {
  const { db, dbPath, dir } = openWithCore();
  // Table `p_short__t` fits easily; the index `idx_p_short__t__<50 chars>` does not.
  const result = await declareDataModule({ db, dbPath, decl: longNameDecl("short", "t", "i".repeat(50)) });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "IDENTIFIER_TOO_LONG");
  assert.match(result.error?.message ?? "", /^index /, "attributes the failure to the index, not the table");
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("dataModule: accepts an identifier of exactly 63 bytes — the limit is inclusive", async () => {
  const { db, dbPath, dir } = openWithCore();
  // `p_`(2) + pluginId(30) + `__`(2) + tableName(29) = exactly 63.
  const result = await declareDataModule({ db, dbPath, decl: longNameDecl("a".repeat(30), "b".repeat(29)) });

  assert.equal(result.ok, true, result.error?.message);
  assert.deepEqual(result.created, [`p_${"a".repeat(30)}__${"b".repeat(29)}`]);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
