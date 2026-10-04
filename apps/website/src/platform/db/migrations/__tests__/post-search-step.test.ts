import assert from "node:assert/strict";
import { after, describe, test } from "node:test";

import { sql } from "kysely";

import { openPgliteKernel } from "../../kernel/drivers/pglite.js";
import { openMemorySqliteKernel, sqliteKernel } from "../../kernel/drivers/sqlite.js";
import { listTables } from "../../kernel/dialect.js";
import type { StorageKernel } from "../../kernel/port.js";
import { readSchemaShape } from "../../kernel/schema-shape.js";
import { openChatDb } from "../../sqlite/chat-db.js";
import { openContentDb } from "../../sqlite/content-db.js";
import { CHAT_MIGRATIONS, migrateChatDatabase, migrateContentDatabase } from "../index.js";

/**
 * @file Step `0001_post_search` on SQLite (recorded, changes nothing: FTS5 is in the legacy chain)
 * and PGlite (the `tovu_search` configuration, `post_search_document` and its GIN index), and the
 * chat history on both (SQLite: a site's `chat.db`). Real Postgres:
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
    // Steps 0002 and 0004 drop the empty legacy chat and unused deployment tables;
    // every other table remains unchanged.
    const before = (await listTables(kernel)).filter((name) => !["ai_chats", "ai_chat_messages", "assistant_agent_sessions", "deployment_run_events", "deployment_runs", "deployment_targets", "releases", "deployment_environments"].includes(name));
    const report = await migrateContentDatabase(kernel);
    assert.deepEqual(report.applied, ["0000_legacy_baseline", "0001_post_search", "0002_drop_empty_legacy_chat_tables", "0003_coercion_json_as_json", "0004_drop_unused_deployment_tables"]);
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
    assert.equal(n, 2);
    assert.deepEqual(await listTables(kernel), [], "nothing in public");
    assert.deepEqual((await migrateChatDatabase(kernel)).applied, []);
  });

  test("SQLite (chat.db): the chat tables and their own ledger in the file, second run is a no-op", async () => {
    const kernel = open(openMemorySqliteKernel<unknown>());
    assert.deepEqual((await migrateChatDatabase(kernel)).applied, CHAT_MIGRATIONS.map((step) => step.id));
    assert.deepEqual(await listTables(kernel), [
      "ai_chat_messages",
      "ai_chats",
      "assistant_agent_sessions",
      "assistant_conversation_tool_approvals",
      "tovu_chat_migrations",
    ]);
    assert.deepEqual((await migrateChatDatabase(kernel)).applied, []);
  });

  test("SQLite (chat.db): an existing file made by the old bootstrap is adopted as it is", async () => {
    const db = openChatDb(":memory:");
    db.prepare("INSERT INTO ai_chats (id, scope_id, owner_kind, owner_id, created_at, updated_at) VALUES ('c1', 'ws', 'user', 'u', 1, 1)").run();
    const kernel = sqliteKernel<unknown>(db);
    const before = await readSchemaShape(kernel, { exclude: ["tovu_chat_migrations"] });
    await migrateChatDatabase(kernel);
    assert.deepEqual(await readSchemaShape(kernel, { exclude: ["tovu_chat_migrations"] }), before);
    const [{ n }] = await kernel.query<{ n: number }>(sql`SELECT count(*) AS n FROM ai_chats`);
    assert.equal(n, 1);
    db.close();
  });
});
