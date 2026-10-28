import { sql } from "kysely";
import type { StorageKernel } from "../kernel/port.js";
import type { MigrationStep } from "./step.js";

/** Match the native JSON Postgres schema without changing applied step 0016. SQLite retains text.
 * Existing JSON and SQL NULL survive the cast; invalid JSON aborts the migration transaction.
 * @complexity O(b) stored config bytes; Postgres may rewrite the column under its DDL lock.
 */
async function up(kernel: StorageKernel<unknown>): Promise<void> {
  if (kernel.dialect !== "postgres") return;
  await kernel.execute(sql`ALTER TABLE publish_history ALTER COLUMN config_fields_json TYPE jsonb USING config_fields_json::jsonb`);
}

/** Immutable ADR-066 correction for publish destination configuration. */
export function publishHistoryConfigJsonb(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep {
  return { id: "0036_publish_history_config_jsonb", checksum: required.checksum, up };
}
