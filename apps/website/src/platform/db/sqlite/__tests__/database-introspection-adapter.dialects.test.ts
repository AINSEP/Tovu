import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import { sql } from "kysely";

import { type ContentKernel, describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { CONTENT_MIGRATIONS } from "#src/platform/db/migrations/index";
import { SqliteDatabaseIntrospectionAdapter } from "../database-introspection-adapter.sqlite.js";

/**
 * @file The database introspection adapter on every dialect. The journal is a fixture with one entry
 * never applied.
 *
 * - SQLite: the ledger it reads is `__drizzle_migrations`. A fresh `content.db` has a real one, so
 *   each test drops it and builds its own.
 * - Postgres/PGlite: there is no `__drizzle_migrations`; the ledger is `tovu_migrations` (ADR-066),
 *   which the dialect matrix's migrated PGlite instance already holds. That instance is shared by the
 *   file, so every test restores the ledger it changed.
 */

const JOURNAL = [
  { idx: 0, when: 1_000, tag: "aaa" },
  { idx: 1, when: 2_000, tag: "bbb" },
  { idx: 2, when: 3_000, tag: "ccc" },
];

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "introspection-dialects-"));
const journalPath = path.join(dir, "_journal.json");
const dbPath = path.join(dir, "content.db");
fs.writeFileSync(journalPath, JSON.stringify({ entries: JOURNAL }));
fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ schemaVersion: 1, schemaTag: "bbb" }));
// A Postgres/PGlite site is stamped with the journal head, like every site (`init-site.ts`).
const pgDir = path.join(dir, "pg-site");
const pgDbPath = path.join(pgDir, "content.db");
fs.mkdirSync(pgDir);
fs.writeFileSync(path.join(pgDir, ".site-meta.json"), JSON.stringify({ schemaVersion: 2, schemaTag: "ccc" }));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

async function dropMigrationsTable(kernel: ContentKernel): Promise<void> {
  await kernel.execute(sql`DROP TABLE IF EXISTS __drizzle_migrations`);
}

describeEachDialect<ContentKernel>("SqliteDatabaseIntrospectionAdapter", { tables: [], make: (kernel) => kernel }, (makeKernel, dialect) => {
  if (dialect === "postgres") return postgresLedgerTests(makeKernel);

  test("reads applied migrations: in-sync schema state and the one pending entry", async () => {
    const kernel = makeKernel();
    await dropMigrationsTable(kernel);
    try {
      await kernel.execute(sql`CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at BIGINT)`);
      await kernel.execute(sql`INSERT INTO __drizzle_migrations (id, hash, created_at) VALUES (1, 'h0', 1000), (2, 'h1', 2000)`);
      const adapter = new SqliteDatabaseIntrospectionAdapter({ db: kernel, dbPath, journalPath });

      assert.deepEqual(await adapter.getHealth(), { canOpenDb: true, migrationsTableReadable: true, driftStatus: "in-sync" });
      assert.deepEqual(await adapter.getSchemaState(), {
        status: "in-sync",
        siteMeta: { version: 1, tag: "bbb" },
        runtime: { version: 1, tag: "bbb" },
      });
      assert.deepEqual(await adapter.listPendingMigrations(), { items: [{ index: 2, tag: "ccc" }] });
    } finally {
      await dropMigrationsTable(kernel);
    }
  });

  test("no migrations table: readable false, state unknown, every journal entry pending", async () => {
    const kernel = makeKernel();
    await dropMigrationsTable(kernel);
    const adapter = new SqliteDatabaseIntrospectionAdapter({ db: kernel, dbPath, journalPath });

    assert.deepEqual(await adapter.getHealth(), { canOpenDb: true, migrationsTableReadable: false, driftStatus: "unknown" });
    assert.equal((await adapter.getSchemaState()).runtime, null);
    assert.equal((await adapter.listPendingMigrations()).items.length, 3);
  });
});

const LAST_STEP = CONTENT_MIGRATIONS[CONTENT_MIGRATIONS.length - 1];

function postgresLedgerTests(makeKernel: () => ContentKernel): void {
  test("a fully migrated database: tovu_migrations is readable, in sync with the journal-head stamp, nothing pending", async () => {
    const adapter = new SqliteDatabaseIntrospectionAdapter({ db: makeKernel(), dbPath: pgDbPath, journalPath });

    assert.deepEqual(await adapter.getHealth(), { canOpenDb: true, migrationsTableReadable: true, driftStatus: "in-sync" });
    assert.deepEqual(await adapter.getSchemaState(), {
      status: "in-sync",
      siteMeta: { version: 2, tag: "ccc" },
      runtime: { version: 2, tag: "ccc" },
    });
    assert.deepEqual(await adapter.listPendingMigrations(), { items: [] });
  });

  test("a step missing from tovu_migrations is pending, by its CONTENT_MIGRATIONS position and id", async () => {
    const kernel = makeKernel();
    await kernel.execute(sql`CREATE TEMP TABLE ledger_row_aside AS SELECT * FROM tovu_migrations WHERE id = ${LAST_STEP.id}`);
    await kernel.execute(sql`DELETE FROM tovu_migrations WHERE id = ${LAST_STEP.id}`);
    try {
      const adapter = new SqliteDatabaseIntrospectionAdapter({ db: kernel, dbPath: pgDbPath, journalPath });
      assert.deepEqual(await adapter.listPendingMigrations(), { items: [{ index: CONTENT_MIGRATIONS.length - 1, tag: LAST_STEP.id }] });
    } finally {
      await kernel.execute(sql`INSERT INTO tovu_migrations SELECT * FROM ledger_row_aside`);
      await kernel.execute(sql`DROP TABLE ledger_row_aside`);
    }
  });

  test("no tovu_migrations ledger: readable false, state unknown, every step pending", async () => {
    const kernel = makeKernel();
    await kernel.execute(sql`ALTER TABLE tovu_migrations RENAME TO tovu_migrations_aside`);
    try {
      const adapter = new SqliteDatabaseIntrospectionAdapter({ db: kernel, dbPath: pgDbPath, journalPath });
      assert.deepEqual(await adapter.getHealth(), { canOpenDb: true, migrationsTableReadable: false, driftStatus: "unknown" });
      assert.equal((await adapter.getSchemaState()).runtime, null);
      assert.deepEqual(
        (await adapter.listPendingMigrations()).items.map((item) => item.tag),
        CONTENT_MIGRATIONS.map((step) => step.id)
      );
    } finally {
      await kernel.execute(sql`ALTER TABLE tovu_migrations_aside RENAME TO tovu_migrations`);
    }
  });
}
