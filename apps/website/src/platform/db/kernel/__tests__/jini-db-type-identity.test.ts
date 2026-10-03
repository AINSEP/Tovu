import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";
import { sql, type RawBuilder, type Kysely } from "kysely";
import type { StorageKernel } from "@jini-ai/db/kernel";
import { openMemorySqliteKernel, sqliteKernel as jiniSqliteKernel } from "@jini-ai/db/kernel/sqlite";

import type { ContentDatabase } from "../../content-database.generated.js";
import { sqliteKernel } from "../drivers/sqlite.js";

/** Compile this file explicitly: the root tsconfig excludes tests. All handles are disposable. */
test("Tovu generated types and SQL fragments round-trip through the Jini kernel", async () => {
  const kernel: StorageKernel<ContentDatabase> = openMemorySqliteKernel<ContentDatabase>({
    open: (filePath, options) => new Database(filePath, options),
  });
  try {
    await kernel.execute(sql`CREATE TABLE database_write_watermark (id INTEGER PRIMARY KEY, value INTEGER NOT NULL, last_stamped_at TEXT)`);
    // Both Kysely's executor and RawBuilder cross the package boundary without casts.
    await kernel.run((db: Kysely<ContentDatabase>) => db.insertInto("database_write_watermark")
      .values({ id: 1, value: 42, last_stamped_at: null }).execute());
    const statement: RawBuilder<{ value: number }> = sql`SELECT value FROM database_write_watermark WHERE id = ${1}`;
    assert.deepEqual(await kernel.query(statement), [{ value: 42 }]);
    assert.deepEqual(await kernel.run((db) => db.selectFrom("database_write_watermark")
      .select(["id", "value", "last_stamped_at"]).execute()), [{ id: 1, value: 42, last_stamped_at: null }]);
  } finally {
    await kernel.close();
  }
});

test("Tovu and Jini wrapping the same native SQLite handle share one kernel", async () => {
  const client = new Database(":memory:");
  try {
    const fromTovu: StorageKernel<ContentDatabase> = sqliteKernel<ContentDatabase>({ $client: client });
    const fromJini: StorageKernel<ContentDatabase> = jiniSqliteKernel<ContentDatabase>(client);
    assert.equal(fromTovu, fromJini);
    await fromTovu.transaction(async () => {
      assert.equal(fromJini.inTransaction(), true);
      assert.deepEqual(await fromJini.query(sql<{ value: number }>`SELECT ${7} AS value`), [{ value: 7 }]);
    });
    await fromJini.close();
    assert.equal(client.open, true, "a borrowed kernel must not close its native client");
  } finally {
    client.close();
  }
});
