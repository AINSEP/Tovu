import { sql } from "kysely";
import type { StorageKernel } from "../kernel/port.js";
import type { MigrationStep } from "./step.js";

/**
 * @file Migration 0029: read indexes for the Email page's **Recent sends and failures** (email
 * phase 4, `features/mail/activity.repo.ts`).
 *
 * - `mail_send_ledger (workspace_id, created_at)`: the activity list reads newest first per
 *   workspace, 25 at a time. 0023's primary key starts with the idempotency key, so without this a
 *   page scans every row the workspace ever sent.
 * - `mail_feedback_inbox (workspace_id, provider_message_id)`: each listed send joins the provider's
 *   delivered/bounced/complained events by the message id the provider returned. 0023 keys the inbox
 *   by (provider, event id), which cannot answer "which events belong to this message".
 *
 * Indexes only: no row or column changes, so the 0023 ledger contract (`MailSendLedgerPort`) and
 * every stored row are untouched. 0023 stays immutable. Portable DDL for SQLite and Postgres, shared
 * with the fresh-database bootstrap.
 */
export const MAIL_ACTIVITY_INDEXES_ID = "0029_mail_activity_indexes";

export const MAIL_ACTIVITY_INDEXES_STATEMENTS = [
  "CREATE INDEX idx_mail_send_ledger_workspace_created ON mail_send_ledger (workspace_id, created_at)",
  "CREATE INDEX idx_mail_feedback_inbox_workspace_message ON mail_feedback_inbox (workspace_id, provider_message_id)",
] as const;

async function up(kernel: StorageKernel<unknown>): Promise<void> {
  for (const statement of MAIL_ACTIVITY_INDEXES_STATEMENTS) await kernel.execute(sql.raw(statement));
}

/** Build the immutable ADR-066 step. @example mailActivityIndexes({ checksum: pinnedChecksum }) */
export function mailActivityIndexes(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep {
  return { id: MAIL_ACTIVITY_INDEXES_ID, checksum: required.checksum, up };
}
