import { sql } from "kysely";
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

export const MAIL_SUPPRESSION_ADMIN_STATEMENTS = [
  "CREATE INDEX idx_mail_suppression_workspace_created ON mail_suppression (workspace_id, created_at)",
  "CREATE INDEX idx_mail_feedback_inbox_workspace_provider_received ON mail_feedback_inbox (workspace_id, provider_id, received_at)",
  "CREATE TABLE mail_suppression_removals (id text PRIMARY KEY NOT NULL, workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, normalized_address text NOT NULL, scope text NOT NULL CHECK (scope IN ('all', 'bulk')), suppression_reason text NOT NULL, suppressed_at text NOT NULL, removal_reason text NOT NULL, removed_by text NOT NULL, removed_at text NOT NULL)",
  "CREATE INDEX idx_mail_suppression_removals_workspace_removed ON mail_suppression_removals (workspace_id, removed_at)",
] as const;

async function up(kernel: StorageKernel<unknown>): Promise<void> {
  for (const statement of MAIL_SUPPRESSION_ADMIN_STATEMENTS) await kernel.execute(sql.raw(statement));
}

/** Build the immutable ADR-066 step. @example mailSuppressionAdmin({ checksum: pinnedChecksum }) */
export function mailSuppressionAdmin(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep {
  return { id: MAIL_SUPPRESSION_ADMIN_ID, checksum: required.checksum, up };
}
