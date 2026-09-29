import assert from "node:assert/strict";
import { after, describe, test } from "node:test";

import { sql } from "kysely";

import { openPgliteKernel } from "../../kernel/drivers/pglite.js";
import { sqliteKernel } from "../../kernel/drivers/sqlite.js";
import { listTables } from "../../kernel/dialect.js";
import type { StorageKernel } from "../../kernel/port.js";
import { openContentDb } from "../../sqlite/content-db.js";
import { CHAT_MIGRATIONS, migrateChatDatabase, migrateContentDatabase } from "../index.js";

/**
 * @file Step `0001_post_search` on SQLite (recorded, changes nothing: FTS5 is in the legacy chain)
 * and PGlite (the `tovu_search` configuration, `post_search_document` and its GIN index), and the
 * chat history on both (SQLite: not run by any boot; its step is a no-op). Real Postgres:
 * `runner.postgres.test.ts`.
 */

const opened: StorageKernel<unknown>[] = [];
after(async () => {
  for (const kernel of opened) await kernel.close();
});

function open<K extends StorageKernel<unknown>>(kernel: K): K {
  opened.push(kernel);
  return kernel;
}

describe("0001_post_search", () => {
  test("SQLite: recorded, the schema is unchanged", async () => {
    const kernel = sqliteKernel<unknown>(openContentDb(":memory:"));
    const before = await listTables(kernel);
    const report = await migrateContentDatabase(kernel);
    assert.deepEqual(report.applied, ["0000_legacy_baseline", "0001_post_search"]);
    assert.deepEqual((await listTables(kernel)).filter((name) => name !== "tovu_migrations"), before);
  });

  test("PGlite: builds the search configuration, the projection table and its GIN index", async () => {
    const kernel = open(openPgliteKernel<unknown>());
    await migrateContentDatabase(kernel);
    const [row] = await kernel.query<{ cfg: number; idx: number; cols: string }>(
      sql`SELECT (SELECT count(*)::int FROM pg_ts_config WHERE cfgname = 'tovu_search') AS cfg,
                 (SELECT count(*)::int FROM pg_indexes WHERE indexname = 'post_search_document_search_idx') AS idx,
                 (SELECT string_agg(column_name, ',' ORDER BY ordinal_position) FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'post_search_document') AS cols`
    );
    assert.deepEqual(row, { cfg: 1, idx: 1, cols: "post_id,title,slug,body_text,search" });
    assert.deepEqual((await migrateContentDatabase(kernel)).applied, [], "a rerun applies nothing");
  });
});

describe("chat history", () => {
  test("PGlite: ai_chat schema, own ledger, second run is a no-op", async () => {
    const kernel = open(openPgliteKernel<unknown>());
    assert.deepEqual((await migrateChatDatabase(kernel)).applied, CHAT_MIGRATIONS.map((step) => step.id));
    const [{ n }] = await kernel.query<{ n: number }>(sql`SELECT count(*)::int AS n FROM ai_chat.tovu_chat_migrations`);
    assert.equal(n, 1);
    assert.deepEqual(await listTables(kernel), [], "nothing in public");
    assert.deepEqual((await migrateChatDatabase(kernel)).applied, []);
  });

  test("SQLite: a ledger schema is refused (chat.db keeps its own bootstrap)", async () => {
    const kernel = sqliteKernel<unknown>(openContentDb(":memory:"));
    await assert.rejects(migrateChatDatabase(kernel), /needs Postgres, not sqlite/);
  });
});
