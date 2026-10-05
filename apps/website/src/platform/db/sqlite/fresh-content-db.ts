import { CONTENT_MIGRATIONS, type MigrationStep } from "../migrations/index.js";
import { readFrozenChain } from "../migrations/legacy-sqlite.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file Synchronous construction of a BRAND-NEW Tovu content database at head.
 *
 * Site upgrades still use migrateSqliteContentFile and its backups, history validation and
 * per-step transactions. This constructor only operates on a database with no application
 * tables, under BEGIN IMMEDIATE; it cannot adopt or upgrade an existing site's schema.
 *
 * openContentDb's callers need its synchronous return, including commerce's Drizzle adapters.
 * The frozen baseline alone stopped matching schema.sqlite.ts when TS steps added columns.
 * Keep these fresh-only operations checked against the real TS runner by
 * __tests__/integration/content-db-fresh.integration.test.ts. A new step must be handled here
 * explicitly before any fresh schema is written. Do not extend the frozen Drizzle chain.
 *
 * Raw SQLite by necessity, so this file is in the no-raw-SQLite ratchet's baseline
 * (`kernel/__tests__/raw-sqlite-baseline.json`) rather than on the storage kernel: openContentDb's
 * contract is a synchronous return, and every kernel call is async, so it drives better-sqlite3
 * directly (prepare/get/all, a sync `.immediate()` transaction, `sqlite_schema`). Its json_* calls
 * are the fresh-only copy of 0003's SQLite branch. It is not a driver and cannot move under
 * `kernel/drivers/`: it depends on the content migration list, which the kernel must not. A new
 * fresh-only step that adds raw SQLite raises this file's baseline counts in the same commit.
 */
export function bootstrapFreshContentDb(
  { db }: { db: ContentDb },
  // Injectable for the drift guard's own test; production always uses the real step list.
  { migrations = CONTENT_MIGRATIONS }: { migrations?: readonly MigrationStep[] } = {},
): boolean {
  const client = db.$client;
  const hasTables = () => client.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND substr(name, 1, 7) <> 'sqlite_' LIMIT 1").get() !== undefined;
  if (hasTables()) return false;

  // These are Tovu's fresh-schema operations, not a second existing-database migrator.
  // Use the real history's IDs/checksums so the ordinary site runner sees head on first boot.
  const operations: Readonly<Record<string, () => void>> = {
    "0000_legacy_baseline": () => {
      client.exec("CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)");
      const record = client.prepare('INSERT INTO __drizzle_migrations ("hash", "created_at") VALUES (?, ?)');
      for (const entry of readFrozenChain()) {
        for (const statement of entry.statements) client.exec(statement);
        record.run(entry.hash, entry.when);
      }
    },
    "0001_post_search": () => {}, // SQLite FTS is already in the frozen baseline.
    "0002_drop_empty_legacy_chat_tables": () => {
      for (const table of ["ai_chats", "ai_chat_messages", "assistant_agent_sessions"]) {
        // The baseline creates no chat rows; any future seed must go through normal site boot.
        client.exec(`DROP TABLE "${table}"`);
      }
    },
    "0003_coercion_json_as_json": () => {
      client.exec("UPDATE setting_definitions SET coercion_json = json_quote(coercion_json) WHERE coercion_json IS NOT NULL AND json_valid(coercion_json) = 0");
    },
    "0004_drop_unused_deployment_tables": () => {
      for (const table of ["deployment_run_events", "deployment_runs", "deployment_targets", "releases", "deployment_environments"]) {
        client.exec(`DROP TABLE IF EXISTS "${table}"`);
      }
    },
    "0005_media_createdby": () => {
      client.exec("ALTER TABLE media ADD COLUMN created_by text");
    },
    "0006_submission_ip_retention": () => {
      // SQLite rebuilds this table to relax NOT NULL. Preserve all baseline indexes/triggers;
      // this is a fresh table, so no existing site data or external plugin objects are present.
      const objects = client.prepare("SELECT sql FROM sqlite_schema WHERE tbl_name = 'form_submissions' AND type IN ('index', 'trigger') AND sql IS NOT NULL")
        .all() as Array<{ sql: string }>;
      client.exec(`CREATE TABLE form_submissions_ip_retention_new (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL,
        form_definition_id TEXT NOT NULL REFERENCES form_definitions(id) ON DELETE RESTRICT,
        data_json TEXT NOT NULL,
        source_ip TEXT,
        submitted_at TEXT NOT NULL,
        deleted_at TEXT,
        version INTEGER NOT NULL DEFAULT 1
      )`);
      client.exec(`INSERT INTO form_submissions_ip_retention_new
        (id, workspace_id, form_definition_id, data_json, source_ip, submitted_at, deleted_at, version)
        SELECT id, workspace_id, form_definition_id, data_json, source_ip, submitted_at, deleted_at, version
        FROM form_submissions`);
      client.exec("DROP TABLE form_submissions");
      client.exec("ALTER TABLE form_submissions_ip_retention_new RENAME TO form_submissions");
      for (const object of objects) client.exec(object.sql);
      client.exec("CREATE INDEX IF NOT EXISTS idx_form_submissions_ip_retention ON form_submissions(submitted_at, id) WHERE source_ip IS NOT NULL");
    },
    "0007_publish_backstop": () => {
      // Exact SQLite DDL from 0007. Sharing it would edit the checksum-covered step source;
      // keep that immutable and guard this fresh-only copy against the real TS runner.
      client.exec(`CREATE TABLE publish_backstop_log (
    id text PRIMARY KEY NOT NULL, workspace_id text NOT NULL,
    direction text NOT NULL CONSTRAINT publish_backstop_log_direction_check CHECK(direction IN ('source','destination')),
    actor_id text NOT NULL, destination text NOT NULL, reason text NOT NULL,
    at text NOT NULL, items_json text NOT NULL, gap_labels_json text NOT NULL,
    result text NOT NULL, run_id text, details_json text NOT NULL, inverses_json text NOT NULL
  )`);
      client.exec(`CREATE INDEX publish_backstop_log_workspace_at ON publish_backstop_log(workspace_id, at)`);
      client.exec(`CREATE INDEX publish_backstop_log_run ON publish_backstop_log(workspace_id, run_id)`);
    },
  };
  if (migrations.length !== Object.keys(operations).length ||
      migrations.some(step => !Object.hasOwn(operations, step.id))) {
    throw new Error("fresh content bootstrap is behind CONTENT_MIGRATIONS; update its fresh-only operations and schema parity guard");
  }

  return client.transaction(() => {
    // Another process may have built this file while we were waiting for its write lock.
    if (hasTables()) return false;
    // Ledger and schema commit together. A failure leaves an empty database that can be retried.
    client.exec("CREATE TABLE tovu_migrations (id TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)");
    const record = client.prepare("INSERT INTO tovu_migrations (id, checksum, applied_at) VALUES (?, ?, ?)");
    for (const step of migrations) {
      operations[step.id]!();
      record.run(step.id, step.checksum, new Date().toISOString());
    }
    return true;
  }).immediate();
}
