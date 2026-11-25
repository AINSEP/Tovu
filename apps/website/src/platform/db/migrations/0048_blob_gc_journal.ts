import { sql } from "kysely";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import type { MigrationStep } from "@jini-ai/core/contracts/storage";

/**
 * @file Migration 0048: the durable blob GC journal (P11 storage budget, ST-11b.T).
 *
 * `asset_blobs.purge_reason` records why a blob row lost its last owner (`manual` or `trash-ttl`);
 * pre-0048 rows stay NULL, which the media-bytes report treats as a legacy orphan: reported, never
 * eligible. `blob_gc_journal` holds one row per storage key waiting for its bytes to be unlinked,
 * with the same provenance plus a retry schedule. Timestamps are text, matching `asset_blobs`.
 *
 * Additive and O(1): one nullable column and one new table, no row rewrite, no table rebuild. Portable DDL
 * shared by SQLite, Postgres and the fresh-database bootstrap. Added as an ADR-066 step: the
 * Drizzle chain is frozen.
 */
export const BLOB_GC_JOURNAL_ID = "0048_blob_gc_journal";

export const BLOB_GC_JOURNAL_STATEMENTS = [
  "ALTER TABLE asset_blobs ADD COLUMN purge_reason text",
  `CREATE TABLE blob_gc_journal (
  workspace_id text NOT NULL,
  storage_key text NOT NULL,
  sha256 text NOT NULL,
  kind text NOT NULL,
  reason text NOT NULL,
  journaled_at text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at text,
  last_error text,
  PRIMARY KEY (workspace_id, storage_key)
)`,
] as const;

async function up(kernel: KyselyKernel<unknown>): Promise<void> {
  for (const statement of BLOB_GC_JOURNAL_STATEMENTS) await kernel.execute(sql.raw(statement));
}

/** Build the immutable ADR-066 step. @example blobGcJournal({ checksum: pinnedChecksum }, {}) */
export function blobGcJournal(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep<KyselyKernel<unknown>> {
  return { id: BLOB_GC_JOURNAL_ID, checksum: required.checksum, up };
}
