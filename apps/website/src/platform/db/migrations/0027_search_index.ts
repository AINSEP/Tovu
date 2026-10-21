import { sql } from "kysely";
import type { StorageKernel } from "../kernel/port.js";
import type { MigrationStep } from "./step.js";

/**
 * @file Migration 0027: the site-search indexer's bookkeeping (`@jini-ai/search` ports.ts).
 *
 * - `search_index_state`: one row per (site, provider, generation, document key) the indexer has
 *   written or tried to write, with the revision it carried. `doc_key` is `encodeSearchKey`, the
 *   other key parts are kept beside it so a row is readable without decoding.
 * - `search_index_watermarks`: the resumable backfill cursor per (target, collection).
 * - `search_index_targets`: the active and building (provider, generation) pointer per site; the
 *   generation switch is one compare-and-swap UPDATE on this row.
 *
 * Booleans are `integer` 0/1 with a CHECK on both dialects: one portable DDL and one write path
 * (better-sqlite3 refuses JS booleans as parameters). Revisions and epoch-millisecond times are
 * `bigint`, since epoch ms does not fit Postgres `integer`. No foreign keys: this is derived data
 * that a full reindex rebuilds. Portable DDL, shared with the fresh-database bootstrap.
 */
export const SEARCH_INDEX_ID = "0027_search_index";

export const SEARCH_INDEX_STATEMENTS = [
  "CREATE TABLE search_index_state (site_id text NOT NULL, provider_id text NOT NULL, generation integer NOT NULL, doc_key text NOT NULL, workspace_id text NOT NULL, collection text NOT NULL, document_id text NOT NULL, revision bigint NOT NULL, deleted integer NOT NULL CHECK (deleted IN (0, 1)), status text NOT NULL CHECK (status IN ('pending', 'indexed', 'unknown', 'failed')), attempts integer NOT NULL DEFAULT 0, task_id text, last_error text, updated_at_ms bigint NOT NULL, PRIMARY KEY (site_id, provider_id, generation, doc_key))",
  // Serves listByStatus and counts, which always scope to one target.
  "CREATE INDEX ix_search_index_state_status ON search_index_state (site_id, provider_id, generation, status)",
  "CREATE TABLE search_index_watermarks (site_id text NOT NULL, provider_id text NOT NULL, generation integer NOT NULL, collection text NOT NULL, cursor text, done integer NOT NULL CHECK (done IN (0, 1)), PRIMARY KEY (site_id, provider_id, generation, collection))",
  // A pointer is either fully set or fully empty, never half a target.
  "CREATE TABLE search_index_targets (site_id text PRIMARY KEY NOT NULL, active_provider_id text, active_generation integer, building_provider_id text, building_generation integer, updated_at_ms bigint NOT NULL, CHECK ((active_provider_id IS NULL) = (active_generation IS NULL)), CHECK ((building_provider_id IS NULL) = (building_generation IS NULL)))",
] as const;

async function up(kernel: StorageKernel<unknown>): Promise<void> {
  for (const statement of SEARCH_INDEX_STATEMENTS) await kernel.execute(sql.raw(statement));
}

/** Build the immutable ADR-066 step. @example searchIndex({ checksum: pinnedChecksum }) */
export function searchIndex(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep {
  return { id: SEARCH_INDEX_ID, checksum: required.checksum, up };
}
