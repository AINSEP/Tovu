import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { sql } from "kysely";

import { freshPostgresDatabase } from "../../__tests__/postgres-database.js";
import { dropDatabase } from "../../migration/pg-fixture.js";
import { openPostgresKernel } from "../../kernel/drivers/postgres.js";
import type { StorageKernel } from "../../kernel/port.js";
import { migrateChatDatabase, migrateContentDatabase } from "../index.js";
import { runMigrations } from "../runner.js";
import type { MigrationStep } from "../step.js";

/**
 * @file The runner on REAL Postgres (two independent connections), which PGlite's single
 * connection cannot show: two processes migrating one database at the same moment apply each step
 * exactly once (the advisory lock + ledger re-read), and the frozen baseline applies. Needs the local
 * server (`pg_ctl -D /usr/local/var/postgresql@14 start`); fails, never skips, when it is down.
 */

let first: StorageKernel<unknown>;
let second: StorageKernel<unknown>;
let baseline: StorageKernel<unknown>;

before(() => {
  const url = freshPostgresDatabase("tovu_migrations_pg_fixture");
  first = openPostgresKernel<unknown>({ connectionString: url });
  second = openPostgresKernel<unknown>({ connectionString: url });
  baseline = openPostgresKernel<unknown>({ connectionString: freshPostgresDatabase("tovu_migrations_pg_baseline") });
});

after(async () => {
  await first?.close();
  await second?.close();
  await baseline?.close();
  dropDatabase("tovu_migrations_pg_fixture");
  dropDatabase("tovu_migrations_pg_baseline");
});

test("two connections migrating at once apply a step exactly once", async () => {
  let runs = 0;
  const slow: MigrationStep = {
    id: "0001_slow",
    checksum: "e".repeat(64),
    up: async (kernel) => {
      runs += 1;
      await kernel.execute(sql`CREATE TABLE slow_t (id text PRIMARY KEY)`);
      await new Promise((resolve) => setTimeout(resolve, 150));
    },
  };
  const [a, b] = await Promise.all([runMigrations(first, [slow]), runMigrations(second, [slow])]);
  assert.equal(runs, 1);
  assert.deepEqual([...a.applied, ...b.applied], ["0001_slow"]);
  assert.deepEqual([...a.alreadyApplied, ...b.alreadyApplied], ["0001_slow"]);
});

test("the content history (frozen baseline + 0001_post_search + 0002 + 0003 + 0004) applies on real Postgres", async () => {
  const report = await migrateContentDatabase(baseline);
  assert.deepEqual(report.applied, ["0000_legacy_baseline", "0001_post_search", "0002_drop_empty_legacy_chat_tables", "0003_coercion_json_as_json", "0004_drop_unused_deployment_tables"]);
  const [{ n }] = await baseline.query<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'`
  );
  assert.equal(n, 89, "87 content tables after dropping 5 unused deployment tables + post_search_document + tovu_migrations");
  const [{ cfg }] = await baseline.query<{ cfg: number }>(sql`SELECT count(*)::int AS cfg FROM pg_ts_config WHERE cfgname = 'tovu_search'`);
  assert.equal(cfg, 1);
  assert.deepEqual((await migrateContentDatabase(baseline)).applied, [], "a rerun applies nothing");
});

test("the chat history lands in ai_chat with its own ledger there; public gets no chat table", async () => {
  const report = await migrateChatDatabase(baseline);
  assert.deepEqual(report.applied, ["0000_chat_baseline", "0001_sqlite_chat_tables"]);
  const rows = await baseline.query<{ schema: string; name: string }>(
    sql`SELECT table_schema AS schema, table_name AS name FROM information_schema.tables
        WHERE table_name IN ('ai_chats', 'ai_chat_messages', 'assistant_agent_sessions', 'assistant_conversation_tool_approvals', 'tovu_chat_migrations')
        ORDER BY table_name`
  );
  assert.deepEqual(rows, [
    { schema: "ai_chat", name: "ai_chat_messages" },
    { schema: "ai_chat", name: "ai_chats" },
    { schema: "ai_chat", name: "assistant_agent_sessions" },
    { schema: "ai_chat", name: "assistant_conversation_tool_approvals" },
    { schema: "ai_chat", name: "tovu_chat_migrations" },
  ]);
  const [{ n }] = await baseline.query<{ n: number }>(sql`SELECT count(*)::int AS n FROM tovu_migrations`);
  assert.equal(n, 5, "the content ledger holds only content steps (0000-0004)");
  assert.deepEqual((await migrateChatDatabase(baseline)).applied, [], "a rerun applies nothing");
});
