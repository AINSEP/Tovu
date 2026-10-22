import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { sql } from "kysely";

import { freshPostgresDatabase } from "../../__tests__/postgres-database.js";
import { createPgFixture } from "@jini-ai/db/testing/pg-fixture";

import { openPostgresKernel } from "../../kernel/drivers/postgres.js";
import { collectCoreTables } from "../../migration/manifest.js";
import type { StorageKernel } from "../../kernel/port.js";
import { CONTENT_MIGRATIONS, migrateChatDatabase, migrateContentDatabase } from "../index.js";
import { runMigrations } from "../runner.js";
import type { MigrationStep } from "../step.js";

const { dropDatabase } = createPgFixture({
  host: process.env.PGHOST ?? "/tmp",
  user: process.env.PGUSER ?? "la",
  port: process.env.PGPORT,
});

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
  dropDatabase({ database: "tovu_migrations_pg_fixture" });
  dropDatabase({ database: "tovu_migrations_pg_baseline" });
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

test("the content history through the current head applies on real Postgres", async () => {
  const report = await migrateContentDatabase(baseline);
  // Pinned literally: deriving both sides from CONTENT_MIGRATIONS would let a dropped step pass.
  const head = [
    "0000_legacy_baseline", "0001_post_search", "0002_drop_empty_legacy_chat_tables",
    "0003_coercion_json_as_json", "0004_drop_unused_deployment_tables", "0005_media_createdby",
    "0006_submission_ip_retention", "0007_publish_backstop", "0008_posts_publish_at_featured_media",
    "0009_posts_author", "0010_members_credentials_revoked_at", "0011_drop_empty_core_commerce_tables", "0012_secrets_vault",
    "0013_unify_vault_credentials", "0014_media_library", "0015_document_blob_ownership",
    "0016_publish_destination_history", "0017_publish_history_kind", "0018_form_submission_remote_receipts",
    "0019_form_delivery_plans", "0020_vault_api_connection_kind", "0021_site_consent_revisions",
    "0022_workspace_mcp_cascade", "0023_mail_ledgers", "0024_domain_bindings", "0025_mail_feedback_processed", "0026_domain_binding_version",
    "0027_search_index", "0028_search_index_retired", "0029_mail_activity_indexes",
  ];
  assert.deepEqual(report.applied, head);
  assert.deepEqual(CONTENT_MIGRATIONS.map(step => step.id), head);
  const [{ n }] = await baseline.query<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' AND left(table_name, 14) <> '_vault_backup_'`
  );
  assert.equal(n, collectCoreTables().length + 13, "declared content tables plus post_search_document, tovu_migrations, two TS-only site consent tables, four TS-only mail ledgers, domain_binding and four TS-only search index tables");
  assert.equal(n, 90, "90 tables at 0029_mail_activity_indexes: an accidental drop or addition must change this pin");
  const [{ cfg }] = await baseline.query<{ cfg: number }>(sql`SELECT count(*)::int AS cfg FROM pg_ts_config WHERE cfgname = 'tovu_search'`);
  assert.equal(cfg, 1);
  assert.deepEqual((await migrateContentDatabase(baseline)).applied, [], "a rerun applies nothing");
});

test("the chat history lands in ai_chat with its own ledger there; public gets no chat table", async () => {
  const report = await migrateChatDatabase(baseline);
  assert.deepEqual(report.applied, ["0000_chat_baseline", "0001_sqlite_chat_tables", "0002_durable_run_attempts"]);
  const rows = await baseline.query<{ schema: string; name: string }>(
    sql`SELECT table_schema AS schema, table_name AS name FROM information_schema.tables
        WHERE table_name IN ('ai_chats', 'ai_chat_messages', 'assistant_agent_sessions', 'assistant_conversation_tool_approvals', 'assistant_run_attempts', 'tovu_chat_migrations')
        ORDER BY table_name`
  );
  assert.deepEqual(rows, [
    { schema: "ai_chat", name: "ai_chat_messages" },
    { schema: "ai_chat", name: "ai_chats" },
    { schema: "ai_chat", name: "assistant_agent_sessions" },
    { schema: "ai_chat", name: "assistant_conversation_tool_approvals" },
    { schema: "ai_chat", name: "assistant_run_attempts" },
    { schema: "ai_chat", name: "tovu_chat_migrations" },
  ]);
  const contentSteps = await baseline.query<{ id: string }>(sql`SELECT id FROM tovu_migrations ORDER BY id`);
  assert.deepEqual(contentSteps.map(({ id }) => id), CONTENT_MIGRATIONS.map(({ id }) => id).sort(), "the content ledger holds exactly the current content steps, without chat steps");
  assert.deepEqual((await migrateChatDatabase(baseline)).applied, [], "a rerun applies nothing");
});
