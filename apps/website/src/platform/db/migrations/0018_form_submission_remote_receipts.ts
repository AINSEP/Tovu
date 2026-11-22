import { sql } from "kysely";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import type { MigrationStep } from "@jini-ai/core/contracts/storage";

/** One row per submission imported from a form destination (a static host). The key makes imports
 * idempotent; no foreign key, so a receipt outlives Trash and purge and a retried pull cannot
 * resurrect a deleted submission. Portable DDL, shared with the fresh-database bootstrap. */
export const FORM_SUBMISSION_REMOTE_RECEIPTS_STATEMENTS = [
  "CREATE TABLE form_submission_remote_receipts (workspace_id text NOT NULL, destination_key text NOT NULL, remote_id text NOT NULL, submission_id text NOT NULL, imported_at text NOT NULL, PRIMARY KEY (workspace_id, destination_key, remote_id))",
] as const;

async function up(kernel: KyselyKernel<unknown>): Promise<void> {
  for (const statement of FORM_SUBMISSION_REMOTE_RECEIPTS_STATEMENTS) await kernel.execute(sql.raw(statement));
}

/** Build the immutable ADR-066 step. @example formSubmissionRemoteReceipts({ checksum: pinnedChecksum }) */
export function formSubmissionRemoteReceipts(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep<KyselyKernel<unknown>> {
  return { id: "0018_form_submission_remote_receipts", checksum: required.checksum, up };
}
