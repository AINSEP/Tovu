import { Kysely, SqliteDialect, type SchemaModule, sql } from "kysely";
import type { StorageKernel } from "../kernel/port.js";
import type { MigrationStep } from "./step.js";

/**
 * @file Migration 0030: the Email page's suppression list and feedback setup (email phase 5,
 * `features/mail/suppression-admin.repo.ts`).
 *
 * - `mail_suppression (workspace_id, created_at)`: the blocked-recipient list reads newest first per
 *   workspace. 0023's key starts with the address, which serves send-time lookups, not a list.
 * - `mail_feedback_inbox (workspace_id, provider_id, received_at)`: "last verified event" per
 *   provider. Only events whose signature verified are ever recorded, so the newest row is the proof
 *   that webhook ingestion works ("no events yet" is a different state from healthy).
 * - `mail_suppression_removals`: the audit record of every deliberate removal from the do-not-send
 *   list. Removal deletes the 0023 row (send-time lookups stay one primary-key probe), so this keeps
 *   what was removed (address, scope, original reason and time), who removed it, when and the
 *   required written reason. Rows go with their workspace, like the ledgers. Removing a suppression
 *   never records or implies newsletter consent; consent lives with Newsletter.
 *
 * 0023 stays immutable. Portable DDL for SQLite and Postgres, shared with the fresh-database bootstrap.
 */
export const MAIL_SUPPRESSION_ADMIN_ID = "0030_mail_suppression_admin";

/** Portable common DDL, shared with fresh SQLite bootstrap by compiling these same builders. */
export function mailSuppressionSchema({ schema }: { schema: SchemaModule }, _options = {}) {
  return [
    schema.alterTable("mail_suppression").addColumn("revision", "text", c => c.notNull().defaultTo("")),
    schema.createIndex("idx_mail_suppression_workspace_created").on("mail_suppression").columns(["workspace_id", "created_at", "revision"]),
    schema.createIndex("idx_mail_feedback_inbox_workspace_provider_received").on("mail_feedback_inbox").columns(["workspace_id", "provider_id", "received_at"]),
    schema.createTable("mail_suppression_removals")
      .addColumn("id", "text", c => c.primaryKey().notNull())
      .addColumn("workspace_id", "text", c => c.notNull().references("workspaces.id").onDelete("cascade"))
      .addColumn("normalized_address", "text", c => c.notNull())
      .addColumn("scope", "text", c => c.notNull().check(sql`scope IN ('all', 'bulk')`))
      .addColumn("suppression_reason", "text", c => c.notNull())
      .addColumn("suppressed_at", "text", c => c.notNull())
      .addColumn("removal_reason", "text", c => c.notNull())
      .addColumn("removed_by", "text", c => c.notNull())
      .addColumn("removed_at", "text", c => c.notNull()),
    schema.createIndex("idx_mail_suppression_removals_workspace_removed").on("mail_suppression_removals").columns(["workspace_id", "removed_at"]),
  ];
}

const sqliteSchema = new Kysely<unknown>({ dialect: new SqliteDialect({ database: {} as never }) }).schema;
export const MAIL_SUPPRESSION_ADMIN_STATEMENTS = mailSuppressionSchema({ schema: sqliteSchema }).map(step => step.compile().sql);

async function up(kernel: StorageKernel<unknown>): Promise<void> {
  await kernel.run(async db => { for (const step of mailSuppressionSchema({ schema: db.schema })) await step.execute(); });
  const identity = kernel.dialect === "sqlite" ? sql`lower(hex(randomblob(16)))` : sql`md5(random()::text || clock_timestamp()::text)`;
  await kernel.execute(sql`UPDATE mail_suppression SET revision = ${identity}`);
}

/** Build the immutable ADR-066 step. @example mailSuppressionAdmin({ checksum: pinnedChecksum }) */
export function mailSuppressionAdmin(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep {
  return { id: MAIL_SUPPRESSION_ADMIN_ID, checksum: required.checksum, up };
}
