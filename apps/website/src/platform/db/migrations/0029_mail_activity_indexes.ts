import { Kysely, SqliteDialect, type SchemaModule, sql } from "kysely";
import type { StorageKernel } from "../kernel/port.js";
import type { MigrationStep } from "./step.js";

/**
 * @file Migration 0029: activity storage for the Email page's **Recent sends and failures** (email
 * phase 4, `features/mail/activity.repo.ts` and `features/mail/attempts.repo.ts`).
 *
 * - `mail_send_ledger (workspace_id, created_at)`: the activity list reads newest first per
 *   workspace, 25 at a time. 0023's primary key starts with the idempotency key, so without this a
 *   page scans every row the workspace ever sent.
 * - `mail_feedback_inbox (workspace_id, provider_message_id)`: each listed send joins the provider's
 *   delivered/bounced/complained events by the message id the provider returned. 0023 keys the inbox
 *   by (provider, event id), which cannot answer "which events belong to this message".
 *
 * Adds opaque activity identities and retention flags to historical sends, plus body-free attempt
 * observations (including preflight refusals and captures) keyed by workspace, request and recipient.
 * Existing send outcomes and deduplication identities stay intact. 0023 stays immutable. Common DDL
 * is shared with fresh SQLite bootstrap; only upgrades need the historical-identity backfill.
 */
export const MAIL_ACTIVITY_INDEXES_ID = "0029_mail_activity_indexes";

/** The schema builder is shared with the synchronous fresh-SQLite constructor (compile only). */
export function mailActivitySchema({ schema }: { schema: SchemaModule }, _options = {}) {
  return [
    schema.createIndex("idx_mail_send_ledger_workspace_created").on("mail_send_ledger").columns(["workspace_id", "created_at"]),
    schema.createIndex("idx_mail_feedback_inbox_workspace_message").on("mail_feedback_inbox").columns(["workspace_id", "provider_message_id"]),
    schema.alterTable("mail_send_ledger").addColumn("activity_id", "text", c => c.notNull().defaultTo("")),
    schema.alterTable("mail_send_ledger").addColumn("activity_retained", "integer", c => c.notNull().defaultTo(1)),
    schema.createTable("mail_activity_attempts")
      .addColumn("id", "text", c => c.notNull().unique())
      .addColumn("workspace_id", "text", c => c.notNull().references("workspaces.id").onDelete("cascade"))
      .addColumn("idempotency_key", "text", c => c.notNull())
      .addColumn("recipient", "text", c => c.notNull())
      .addColumn("effective_recipient", "text", c => c.notNull())
      .addColumn("delivery_mode", "text", c => c.notNull())
      .addColumn("lane", "text", c => c.notNull())
      .addColumn("provider_id", "text", c => c.notNull())
      .addColumn("outcome", "text", c => c.notNull())
      .addColumn("provider_message_id", "text")
      .addColumn("error_code", "text")
      .addColumn("created_at", "text", c => c.notNull())
      .addColumn("updated_at", "text", c => c.notNull())
      .addPrimaryKeyConstraint("mail_activity_attempts_pk", ["workspace_id", "idempotency_key", "recipient"]),
    schema.createIndex("idx_mail_attempts_workspace_created").on("mail_activity_attempts").columns(["workspace_id", "created_at", "id"]),
  ];
}

// Compile only: no database is opened. Fresh bootstrap is synchronous by contract.
const sqliteSchema = new Kysely<unknown>({ dialect: new SqliteDialect({ database: {} as never }) }).schema;
export const MAIL_ACTIVITY_INDEXES_STATEMENTS = mailActivitySchema({ schema: sqliteSchema }).map(step => step.compile().sql);

async function up(kernel: StorageKernel<unknown>): Promise<void> {
  await kernel.run(async db => { for (const step of mailActivitySchema({ schema: db.schema })) await step.execute(); });
  // Opaque identities for historical rows: data updates are dialect-specific only for randomness.
  const identity = kernel.dialect === "sqlite" ? sql`lower(hex(randomblob(16)))` : sql`md5(random()::text || clock_timestamp()::text)`;
  await kernel.execute(sql`UPDATE mail_send_ledger SET activity_id = ${identity}`);
}

/** Build the immutable ADR-066 step. @example mailActivityIndexes({ checksum: pinnedChecksum }) */
export function mailActivityIndexes(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep {
  return { id: MAIL_ACTIVITY_INDEXES_ID, checksum: required.checksum, up };
}
