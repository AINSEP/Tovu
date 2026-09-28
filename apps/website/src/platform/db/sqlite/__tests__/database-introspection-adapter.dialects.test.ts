import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import { sql } from "kysely";

import { type ContentKernel, describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { SqliteDatabaseIntrospectionAdapter } from "../database-introspection-adapter.sqlite.js";

/**
 * @file The database introspection adapter on every dialect. The PGlite content schema has no
 * `__drizzle_migrations` table and a fresh SQLite `content.db` has a real one, so each test drops it
 * and builds its own; the PGlite instance is shared by the file, so it is dropped again afterwards.
 * The journal is a fixture with one entry never applied.
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
after(() => fs.rmSync(dir, { recursive: true, force: true }));

async function dropMigrationsTable(kernel: ContentKernel): Promise<void> {
  await kernel.execute(sql`DROP TABLE IF EXISTS __drizzle_migrations`);
}

describeEachDialect<ContentKernel>("SqliteDatabaseIntrospectionAdapter", { tables: [], make: (kernel) => kernel }, (makeKernel) => {
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
