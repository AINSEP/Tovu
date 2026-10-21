import { sql } from "kysely";
import type { StorageKernel } from "../kernel/port.js";
import type { MigrationStep } from "./step.js";

/**
 * @file Migration 0025: `mail_feedback_inbox.processed_at`, the inbox's processing state.
 *
 * 0023's inbox row was written before the suppression it guards, with no enclosing transaction, so a
 * failure or crash in between made the provider's replay a `duplicate` and the bounce/complaint was
 * never suppressed. A row now counts as applied only once `processed_at` is set (after suppression
 * and the subscriber succeed); a replay of a row with NULL re-applies it. Rows from before this step
 * stay NULL: whether they were applied is unknown, and re-applying one is harmless (suppression is an
 * upsert), so a replay recovers them instead of trusting them.
 *
 * Portable DDL (text only) for SQLite and Postgres, shared with the fresh-database bootstrap.
 */
export const MAIL_FEEDBACK_PROCESSED_ID = "0025_mail_feedback_processed";

export const MAIL_FEEDBACK_PROCESSED_STATEMENTS = [
  "ALTER TABLE mail_feedback_inbox ADD COLUMN processed_at text",
] as const;

async function up(kernel: StorageKernel<unknown>): Promise<void> {
  for (const statement of MAIL_FEEDBACK_PROCESSED_STATEMENTS) await kernel.execute(sql.raw(statement));
}

/** Build the immutable ADR-066 step. @example mailFeedbackProcessed({ checksum: pinnedChecksum }) */
export function mailFeedbackProcessed(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep {
  return { id: MAIL_FEEDBACK_PROCESSED_ID, checksum: required.checksum, up };
}
