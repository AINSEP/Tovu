import { sql } from "kysely";
import type { StorageKernel } from "../kernel/port.js";
import type { MigrationStep } from "./step.js";

/** Extend the existing ledger; null config marks old runs whose destination cannot be replayed safely.
 * Both dialects support these additive text columns. No credential value is stored here. */
async function up(kernel: StorageKernel<unknown>): Promise<void> {
  await kernel.execute(sql`ALTER TABLE publish_history ADD COLUMN credential_id text`);
  await kernel.execute(sql`ALTER TABLE publish_history ADD COLUMN config_fields_json text`);
}

/** Build the immutable ADR-066 step. @example publishDestinationHistory({ checksum: pinnedChecksum }) */
export function publishDestinationHistory(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep {
  return { id: "0016_publish_destination_history", checksum: required.checksum, up };
}
