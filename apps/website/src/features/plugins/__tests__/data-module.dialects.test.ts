import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { sql } from "kysely";

import type { ContentKernel } from "#src/platform/db/content-kernel";
import { describeEachDialect, heldUntil } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { listColumns, listIndexes, listTables } from "#src/platform/db/kernel/dialect";
import { type DataModuleDecl, declareDataModule } from "../data-module.js";
import { advanceJournalPhase, beginJournalEntry, ensureMigrationJournal, findIncompleteJournalEntries, stageJournalPhase } from "../migration-journal.js";
import { checkNamespaceAdoption, getPluginIdentity } from "../plugin-identity.js";

/**
 * @file The plugin dataModule engine on every dialect (storage plan P1): install, upgrade
 * (column/index reconciliation), fail-closed drift, transactional rollback, the identity guard, the
 * phase journal and the recovery scan — one body, SQLite and PGlite. `make` drops every table this
 * file creates first, since the PGlite instance is shared across the file.
 */

const OWN_TABLES = ["p_dm__widgets", "p_dm__notes", "_plugin_migrations", "_plugin_migration_journal", "_plugin_identity"];

function fresh(base: ContentKernel): ContentKernel {
  const pending = OWN_TABLES.reduce(
    (chain, table) => chain.then(() => base.execute(sql`DROP TABLE IF EXISTS ${sql.table(table)}`)),
    Promise.resolve()
  );
  pending.catch(() => {});
  return heldUntil(base, pending);
}

const PROVENANCE = { sourceUrl: "builtin://dm", publisher: "tovu-core" };

const V1: DataModuleDecl = {
  pluginId: "dm",
  pluginTier: "tier-2",
  provenance: PROVENANCE,
  tables: [
    {
      name: "widgets",
      columns: [
        { name: "id", type: "TEXT", primaryKey: true },
        { name: "workspace_id", type: "TEXT", notNull: true },
        { name: "count", type: "INTEGER", notNull: true },
        { name: "score", type: "REAL" },
        { name: "payload", type: "BLOB" },
      ],
      indexes: [{ name: "by_workspace", columns: ["workspace_id"] }],
    },
  ],
};

const withWidgetColumns = (extra: DataModuleDecl["tables"][number]["columns"], indexes = V1.tables[0].indexes): DataModuleDecl => ({
  ...V1,
  tables: [{ ...V1.tables[0], columns: [...V1.tables[0].columns, ...extra], indexes }],
});

describeEachDialect<ContentKernel>("plugin dataModule engine", { tables: [], make: fresh }, (makeKernel, dialect) => {
  describe("install", () => {
    test("creates the declared tables and indexes, records the DDL, and a repeat declare is a no-op", async () => {
      const kernel = makeKernel();
      const first = await declareDataModule({ db: kernel, dbPath: ":memory:", decl: V1 });
      assert.deepEqual(first, { ok: true, created: ["p_dm__widgets"], altered: [], snapshotPath: null });

      const columns = await listColumns(kernel, "p_dm__widgets");
      assert.deepEqual(
        columns.map((c) => [c.name, c.notNull, c.primaryKey]),
        [
          ["id", dialect === "postgres", true], // a Postgres PRIMARY KEY is NOT NULL; SQLite's TEXT one is not
          ["workspace_id", true, false],
          ["count", true, false],
          ["score", false, false],
          ["payload", false, false],
        ]
      );
      const index = (await listIndexes(kernel, "p_dm__widgets")).get("idx_p_dm__widgets__by_workspace");
      assert.deepEqual(index, { name: "idx_p_dm__widgets__by_workspace", columns: ["workspace_id"], unique: false });

      const recorded = await kernel.query<{ table_name: string }>(sql`SELECT table_name FROM _plugin_migrations ORDER BY id`);
      assert.deepEqual(
        recorded.map((r) => r.table_name),
        ["p_dm__widgets", "idx_p_dm__widgets__by_workspace"]
      );

      assert.deepEqual(await declareDataModule({ db: kernel, dbPath: ":memory:", decl: V1 }), {
        ok: true,
        created: [],
        altered: [],
        snapshotPath: null,
      });
    });

    test("INTEGER holds a millisecond timestamp and REAL a fraction, read back as numbers", async () => {
      const kernel = makeKernel();
      await declareDataModule({ db: kernel, dbPath: ":memory:", decl: V1 });
      const now = 1_790_000_000_123;
      await kernel.execute(sql`INSERT INTO p_dm__widgets (id, workspace_id, count, score) VALUES ('w1', 'ws', ${now}, ${0.25})`);
      const [row] = await kernel.query<{ count: number; score: number }>(sql`SELECT count, score FROM p_dm__widgets`);
      assert.deepEqual(row, { count: now, score: 0.25 });
    });

    test("a Postgres kernel takes no snapshot and opens no journal entry, whatever dbPath says", async () => {
      const kernel = makeKernel();
      const declared = declareDataModule({ db: kernel, dbPath: "/nonexistent/content.db", decl: V1 });
      if (dialect === "sqlite") {
        // SQLite with a file dbPath DOES snapshot (the in-memory case is the first test above).
        await assert.rejects(declared, /directory does not exist/);
        return;
      }
      const result = await declared;
      assert.equal(result.ok, true);
      assert.equal(result.snapshotPath, null, "no snapshot on Postgres, whatever dbPath says");
      assert.equal((await listTables(kernel)).includes("_plugin_migration_journal"), false);
    });
  });

  describe("upgrade", () => {
    test("adds a declared nullable column and a new index to an existing table", async () => {
      const kernel = makeKernel();
      await declareDataModule({ db: kernel, dbPath: ":memory:", decl: V1 });
      const v2 = withWidgetColumns([{ name: "sku", type: "TEXT" }], [...(V1.tables[0].indexes ?? []), { name: "by_sku", columns: ["sku"], unique: true }]);

      const result = await declareDataModule({ db: kernel, dbPath: ":memory:", decl: v2 });
      assert.deepEqual(result, { ok: true, created: [], altered: ["p_dm__widgets"], snapshotPath: null });
      assert.ok((await listColumns(kernel, "p_dm__widgets")).some((c) => c.name === "sku"));
      assert.deepEqual((await listIndexes(kernel, "p_dm__widgets")).get("idx_p_dm__widgets__by_sku")?.unique, true);
      assert.deepEqual((await declareDataModule({ db: kernel, dbPath: ":memory:", decl: v2 })).altered, []);
    });

    test("recreates an index whose declared shape changed", async () => {
      const kernel = makeKernel();
      await declareDataModule({ db: kernel, dbPath: ":memory:", decl: V1 });
      const v2 = withWidgetColumns([], [{ name: "by_workspace", columns: ["workspace_id", "count"] }]);
      assert.deepEqual((await declareDataModule({ db: kernel, dbPath: ":memory:", decl: v2 })).altered, ["p_dm__widgets"]);
      assert.deepEqual((await listIndexes(kernel, "p_dm__widgets")).get("idx_p_dm__widgets__by_workspace")?.columns, ["workspace_id", "count"]);
    });

    test("fails closed on a changed column type and on a NOT NULL column added to an existing table", async () => {
      const kernel = makeKernel();
      await declareDataModule({ db: kernel, dbPath: ":memory:", decl: V1 });
      const retyped: DataModuleDecl = {
        ...V1,
        tables: [{ ...V1.tables[0], columns: V1.tables[0].columns.map((c) => (c.name === "count" ? { ...c, type: "TEXT" as const } : c)) }],
      };
      assert.equal((await declareDataModule({ db: kernel, dbPath: ":memory:", decl: retyped })).error?.code, "COLUMN_TYPE_MISMATCH");
      const notNullAdd = withWidgetColumns([{ name: "sku", type: "TEXT", notNull: true }]);
      assert.equal((await declareDataModule({ db: kernel, dbPath: ":memory:", decl: notNullAdd })).error?.code, "COLUMN_ADD_NOT_NULL_WITHOUT_DEFAULT");
    });

    test("a failing statement rolls the whole alteration back, the added column included", async () => {
      const kernel = makeKernel();
      await declareDataModule({ db: kernel, dbPath: ":memory:", decl: V1 });
      await kernel.execute(sql`INSERT INTO p_dm__widgets (id, workspace_id, count) VALUES ('a', 'ws', 1), ('b', 'ws', 1)`);
      // The column is added first; the UNIQUE index then fails on the duplicate `count` values.
      const v2 = withWidgetColumns([{ name: "sku", type: "TEXT" }], [...(V1.tables[0].indexes ?? []), { name: "one_count", columns: ["count"], unique: true }]);

      const result = await declareDataModule({ db: kernel, dbPath: ":memory:", decl: v2 });
      assert.equal(result.ok, false);
      assert.equal(result.error?.code, "DDL_FAILED");
      assert.equal((await listColumns(kernel, "p_dm__widgets")).some((c) => c.name === "sku"), false, "the ADD COLUMN rolled back too");
      const recorded = await kernel.query<{ n: unknown }>(sql`SELECT COUNT(*) AS n FROM _plugin_migrations`);
      assert.equal(Number(recorded[0].n), 2, "only the v1 install's two records remain");
    });
  });

  describe("identity guard", () => {
    test("mints on first sight, allows an unchanged repeat, refuses a mismatch without overwriting", async () => {
      const kernel = makeKernel();
      assert.deepEqual(await checkNamespaceAdoption({ db: kernel, pluginId: "dm", provenance: PROVENANCE }), { allowed: true, track: "first-mint" });
      assert.deepEqual(await checkNamespaceAdoption({ db: kernel, pluginId: "dm", provenance: { ...PROVENANCE } }), { allowed: true, track: "unchanged" });
      const refused = await checkNamespaceAdoption({ db: kernel, pluginId: "dm", provenance: { sourceUrl: "https://evil.example", publisher: "tovu-core" } });
      assert.equal(refused.track, "consent-required");
      const identity = await getPluginIdentity({ db: kernel, pluginId: "dm" });
      assert.equal(identity?.provenance.sourceUrl, PROVENANCE.sourceUrl);
      assert.equal(typeof identity?.mintedAt, "number");
    });

    test("a declare with a mismatched provenance is refused before any DDL", async () => {
      const kernel = makeKernel();
      await declareDataModule({ db: kernel, dbPath: ":memory:", decl: V1 });
      const other = withWidgetColumns([{ name: "sku", type: "TEXT" }]);
      const result = await declareDataModule({ db: kernel, dbPath: ":memory:", decl: { ...other, provenance: { sourceUrl: "https://evil.example", publisher: "x" } } });
      assert.equal(result.error?.code, "IDENTITY_ADOPTION_REQUIRES_CONSENT");
      assert.equal((await listColumns(kernel, "p_dm__widgets")).some((c) => c.name === "sku"), false);
    });
  });

  describe("journal and recovery scan", () => {
    test("entries move through their phases; only non-terminal ones are surfaced for recovery", async () => {
      const kernel = makeKernel();
      await ensureMigrationJournal(kernel);
      const crashed = await beginJournalEntry({ db: kernel, pluginId: "crashed", snapshotPath: "/snap/crashed" });
      const done = await beginJournalEntry({ db: kernel, pluginId: "done", snapshotPath: "/snap/done" });
      const rolled = await beginJournalEntry({ db: kernel, pluginId: "rolled", snapshotPath: "/snap/rolled" });
      assert.notEqual(crashed, done);

      await advanceJournalPhase({ db: kernel, id: crashed, phase: "DDL_IN_PROGRESS" });
      await advanceJournalPhase({ db: kernel, id: done, phase: "COMMITTED" });
      await kernel.transaction(() => stageJournalPhase({ db: kernel, id: rolled, phase: "ROLLED_BACK" }));

      const incomplete = await findIncompleteJournalEntries(kernel);
      assert.equal(incomplete.length, 1);
      assert.equal(incomplete[0].id, crashed);
      assert.equal(incomplete[0].pluginId, "crashed");
      assert.equal(incomplete[0].phase, "DDL_IN_PROGRESS");
      assert.equal(incomplete[0].snapshotPath, "/snap/crashed");
      assert.equal(typeof incomplete[0].startedAt, "number");
    });

    test("a staged phase rolls back with its transaction", async () => {
      const kernel = makeKernel();
      await ensureMigrationJournal(kernel);
      const id = await beginJournalEntry({ db: kernel, pluginId: "p", snapshotPath: "/snap/p" });
      await assert.rejects(
        kernel.transaction(async () => {
          await stageJournalPhase({ db: kernel, id, phase: "COMMITTED" });
          throw new Error("boom");
        }),
        /boom/
      );
      assert.equal((await findIncompleteJournalEntries(kernel))[0]?.phase, "PREPARED_SNAPSHOT");
    });
  });
});
