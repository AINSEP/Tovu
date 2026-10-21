import { sql } from "kysely";
import type { StorageKernel } from "../kernel/port.js";
import type { MigrationStep } from "./step.js";

/**
 * @file Migration 0023: the delivery-side mail ledgers (email provider contract v1, Jini
 * `@jini-ai/platform/mail`).
 *
 * - `mail_send_ledger`: one row per (workspace, idempotency key, recipient). The reserve → send →
 *   mark cycle replaces the racy wasSent/markSent pair; `unknown` records a send that may have
 *   reached the provider, so a redelivery is never blindly repeated.
 * - `mail_suppression`: the do-not-send list, keyed by address and scope, never by provider, so it
 *   survives a provider switch and a plugin disable. `all` (hard bounce, manual) blocks every lane;
 *   `bulk` (complaint) blocks only bulk mail, so a complainer can still get their sign-in link.
 * - `mail_feedback_inbox`: provider webhook events keyed by (provider, event id), so a replay is a
 *   no-op instead of a second suppression write.
 * - `mail_capture`: test/capture mode's sink; messages stay here instead of leaving the process.
 *
 * Rows are workspace-scoped and go with their workspace (ON DELETE CASCADE, as `secrets_vault`).
 * Portable DDL (text/integer only) for SQLite and Postgres, shared with the fresh-database bootstrap.
 */
export const MAIL_LEDGERS_ID = "0023_mail_ledgers";

const WORKSPACE = "workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE";
const LANE = "lane text NOT NULL CHECK (lane IN ('transactional', 'bulk'))";

export const MAIL_LEDGERS_STATEMENTS = [
  `CREATE TABLE mail_send_ledger (${WORKSPACE}, idempotency_key text NOT NULL, recipient text NOT NULL, payload_hash text NOT NULL, ${LANE}, provider_id text NOT NULL, outcome text NOT NULL CHECK (outcome IN ('reserved', 'sent', 'failed', 'unknown')), provider_message_id text, error_code text, created_at text NOT NULL, updated_at text NOT NULL, PRIMARY KEY (workspace_id, idempotency_key, recipient))`,
  `CREATE TABLE mail_suppression (${WORKSPACE}, normalized_address text NOT NULL, scope text NOT NULL CHECK (scope IN ('all', 'bulk')), reason text NOT NULL CHECK (reason IN ('bounced', 'complained', 'manual')), created_at text NOT NULL, PRIMARY KEY (workspace_id, normalized_address, scope))`,
  `CREATE TABLE mail_feedback_inbox (provider_id text NOT NULL, event_id text NOT NULL, ${WORKSPACE}, recipient text NOT NULL, kind text NOT NULL CHECK (kind IN ('delivered', 'bounced', 'complained')), hard_bounce integer NOT NULL CHECK (hard_bounce IN (0, 1)), provider_message_id text NOT NULL, occurred_at text NOT NULL, received_at text NOT NULL, PRIMARY KEY (provider_id, event_id))`,
  `CREATE TABLE mail_capture (id text PRIMARY KEY NOT NULL, ${WORKSPACE}, ${LANE}, idempotency_key text NOT NULL, to_address text NOT NULL, subject text NOT NULL, payload_json text NOT NULL, created_at text NOT NULL)`,
  // The operator's capture list reads newest first per workspace.
  "CREATE INDEX idx_mail_capture_workspace_created ON mail_capture (workspace_id, created_at)",
] as const;

async function up(kernel: StorageKernel<unknown>): Promise<void> {
  for (const statement of MAIL_LEDGERS_STATEMENTS) await kernel.execute(sql.raw(statement));
}

/** Build the immutable ADR-066 step. @example mailLedgers({ checksum: pinnedChecksum }) */
export function mailLedgers(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep {
  return { id: MAIL_LEDGERS_ID, checksum: required.checksum, up };
}
