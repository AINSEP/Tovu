import { Kysely, SqliteDialect, type SchemaModule, sql } from "kysely";
import type { StorageKernel } from "../kernel/port.js";
import type { MigrationStep } from "./step.js";

/**
 * @file ADR-066 step 0031: indexed activity purposes and retention. 0029/0030 remain immutable.
 * Timestamp-leading indexes serve the owner process's cross-workspace privacy pass. The attempts
 * purpose is classified once (including historical attempts); list/get predicates reach base rows
 * before feedback projection. Data backfill is frozen here so future key conventions cannot change
 * an already-pinned step. Fresh SQLite compiles the same portable DDL, with no rows to backfill.
 */
export const MAIL_ACTIVITY_RETENTION_ID = "0031_mail_activity_retention";

/** Common DDL for upgrades and synchronous fresh SQLite bootstrap. @complexity Fixed DDL count. */
export function mailActivityRetentionSchema({ schema }: { schema: SchemaModule }, _optional: Record<string, never> = {}) {
  return [
    schema.alterTable("mail_activity_attempts").addColumn("use_id", "text", c => c.notNull().defaultTo("unknown")),
    schema.createIndex("idx_mail_attempts_workspace_use_created").on("mail_activity_attempts").columns(["workspace_id", "use_id", "created_at", "id"]),
    schema.createIndex("idx_mail_attempts_workspace_effective_recipient").on("mail_activity_attempts").columns(["workspace_id", "effective_recipient"]),
    schema.createIndex("idx_mail_attempts_workspace_recipient").on("mail_activity_attempts").columns(["workspace_id", "recipient"]),
    schema.createIndex("idx_mail_ledger_workspace_created_activity").on("mail_send_ledger").columns(["workspace_id", "created_at", "activity_id"]),
    schema.createIndex("idx_mail_ledger_retention").on("mail_send_ledger").columns(["created_at", "updated_at"]),
    schema.createIndex("idx_mail_attempts_retention").on("mail_activity_attempts").column("created_at"),
    schema.createIndex("idx_mail_capture_retention").on("mail_capture").column("created_at"),
    schema.createIndex("idx_mail_feedback_retention").on("mail_feedback_inbox").column("received_at"),
  ];
}

const sqliteSchema = new Kysely<unknown>({ dialect: new SqliteDialect({ database: {} as never }) }).schema;
export const MAIL_ACTIVITY_RETENTION_STATEMENTS = mailActivityRetentionSchema({ schema: sqliteSchema }).map(step => step.compile().sql);

async function up(kernel: StorageKernel<unknown>): Promise<void> {
  await kernel.run(async db => { for (const step of mailActivityRetentionSchema({ schema: db.schema })) await step.execute(); });
  await kernel.execute(sql`UPDATE mail_activity_attempts SET use_id = CASE
    WHEN idempotency_key LIKE 'members:signin:%' THEN 'sign_in'
    WHEN idempotency_key LIKE 'newsletter:confirm-email:%' THEN 'newsletter_confirmation'
    WHEN idempotency_key LIKE 'forms:notify:%' THEN 'form_notification'
    WHEN idempotency_key LIKE 'mail:test:%' THEN 'test'
    WHEN idempotency_key LIKE 'newsletter:%' THEN 'newsletter'
    ELSE 'unknown' END`);
}

/** New immutable step, joined to the runner's transaction. */
export function mailActivityRetention(required: { checksum: string }, _optional: Record<string, never> = {}): MigrationStep {
  return { id: MAIL_ACTIVITY_RETENTION_ID, checksum: required.checksum, up };
}
