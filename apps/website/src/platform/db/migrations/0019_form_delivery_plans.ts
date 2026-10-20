import { sql } from "kysely";
import type { StorageKernel } from "../kernel/port.js";
import type { MigrationStep } from "./step.js";

/**
 * @file Migration 0019: durable form delivery plans and the shared receiver pull lease.
 *
 * - `form_delivery_plans`: one row per (workspace, submission) once delivery was planned, even with
 *   no matching binding, so a replay never re-plans and later bindings never backfill.
 * - `form_delivery_jobs`: one row per child outbox job. The job's frozen payload (answers included)
 *   lives only in `outbox_events`; this index row carries just what the status reads print, so a
 *   status read never loads answers and the answers are not copied into a second table.
 * - `form_receiver_pulls`: per-receiver lease (token + expiry) and last start time, shared by manual
 *   and automatic pulls. No foreign keys anywhere: delivered copies and pull history outlive Trash.
 *
 * Portable DDL, shared with the fresh-database bootstrap.
 */
export const FORM_DELIVERY_PLANS_STATEMENTS = [
  "CREATE TABLE form_delivery_plans (workspace_id text NOT NULL, submission_id text NOT NULL, form_id text NOT NULL, PRIMARY KEY (workspace_id, submission_id))",
  "CREATE TABLE form_delivery_jobs (job_id text PRIMARY KEY NOT NULL, workspace_id text NOT NULL, submission_id text NOT NULL, binding_id text NOT NULL, adapter_id text NOT NULL)",
  // One job per binding per submission; also serves the per-submission status read.
  "CREATE UNIQUE INDEX ux_form_delivery_jobs_binding ON form_delivery_jobs (workspace_id, submission_id, binding_id)",
  "CREATE TABLE form_receiver_pulls (workspace_id text NOT NULL, receiver_key text NOT NULL, lease_token text, lease_expires_at text, last_started_at text NOT NULL, PRIMARY KEY (workspace_id, receiver_key))",
] as const;

async function up(kernel: StorageKernel<unknown>): Promise<void> {
  for (const statement of FORM_DELIVERY_PLANS_STATEMENTS) await kernel.execute(sql.raw(statement));
}

/** Build the immutable ADR-066 step. @example formDeliveryPlans({ checksum: pinnedChecksum }) */
export function formDeliveryPlans(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep {
  return { id: "0019_form_delivery_plans", checksum: required.checksum, up };
}
