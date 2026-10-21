import { sql } from "kysely";
import type { StorageKernel } from "../kernel/port.js";
import type { MigrationStep } from "./step.js";

/**
 * @file Migration 0024: replaced site-search generations awaiting their backend index drop
 * (`@jini-ai/search` ports.ts `listRetired`/`forgetRetired`).
 *
 * `search_index_targets.promote` inserts the replaced (provider, generation) here in the same
 * transaction as the pointer switch; the row is deleted only once the provider confirmed the drop,
 * so a refused, indeterminate or unconfigured drop is retried by the maintenance loop instead of
 * leaving the old content in the vendor index forever. Derived data, no foreign keys, portable DDL
 * shared with the fresh-database bootstrap (like 0023).
 */
export const SEARCH_INDEX_RETIRED_ID = "0024_search_index_retired";

export const SEARCH_INDEX_RETIRED_STATEMENTS = [
  "CREATE TABLE search_index_retired (site_id text NOT NULL, provider_id text NOT NULL, generation integer NOT NULL, retired_at_ms bigint NOT NULL, PRIMARY KEY (site_id, provider_id, generation))",
] as const;

async function up(kernel: StorageKernel<unknown>): Promise<void> {
  for (const statement of SEARCH_INDEX_RETIRED_STATEMENTS) await kernel.execute(sql.raw(statement));
}

/** Build the immutable ADR-066 step. @example searchIndexRetired({ checksum: pinnedChecksum }) */
export function searchIndexRetired(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep {
  return { id: SEARCH_INDEX_RETIRED_ID, checksum: required.checksum, up };
}
