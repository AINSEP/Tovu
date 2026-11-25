import { sql } from "kysely";
import type { KyselyKernel } from "@jini-ai/db/kernel";
import type { BlobGcJournalEntry, BlobGcJournalRepoPort } from "@jini-ai/cms/media";

/**
 * @file The durable `blob_gc_journal` (migration 0046) behind `@jini-ai/cms`'s
 * `BlobGcJournalRepoPort`, plus the read the media-bytes report needs for legacy orphans.
 *
 * The journal's natural key is `(workspace_id, storage_key)`: one row per file waiting for its bytes
 * to be unlinked. The port's `id` is that storage key, so `remove({ id })` names the same file.
 */

/** Why a blob lost its last owner: an owner's confirmed purge, or the Trash retention timer. */
export type BlobPurgeReason = "manual" | "trash-ttl";
export type BlobGcJournalKind = "original" | "rendition";
export type HostBlobGcJournalEntry = BlobGcJournalEntry & { kind: BlobGcJournalKind; reason: BlobPurgeReason };

const REASONS: ReadonlySet<string> = new Set<BlobPurgeReason>(["manual", "trash-ttl"]);
const KINDS: ReadonlySet<string> = new Set<BlobGcJournalKind>(["original", "rendition"]);

interface JournalRow { workspace_id: string; storage_key: string; sha256: string; kind: string; reason: string; journaled_at: string }

/**
 * Throw unless the entry carries exact provenance.
 *
 * Why exact journal provenance is required: the only thing that can later make these bytes eligible
 * for an unlink is WHY they lost their owner. A manual purge was confirmed by the owner; a Trash TTL
 * expiry was not, and whether it may ever unlink is still an open owner decision (OQ-11a). Guessing,
 * defaulting or leaving the reason empty would let a Trash expiry, or an orphan of unknown origin,
 * pass as an owner-confirmed purge. So a row without one of the two exact reasons is never written;
 * rows that predate the journal (NULL `purge_reason`) stay report-only.
 */
function assertProvenance(entry: Partial<HostBlobGcJournalEntry>): asserts entry is HostBlobGcJournalEntry {
  if (!REASONS.has(String(entry.reason))) throw new Error("A file can only be queued for removal with its exact reason (manual purge or Trash expiry).");
  if (!KINDS.has(String(entry.kind))) throw new Error("A file can only be queued for removal as an original or a rendition.");
}

const toEntry = (row: JournalRow): HostBlobGcJournalEntry => ({
  id: row.storage_key, workspaceId: row.workspace_id, storageKey: row.storage_key, sha256: row.sha256,
  kind: row.kind as BlobGcJournalKind, reason: row.reason as BlobPurgeReason, journaledAt: row.journaled_at,
});

/**
 * Build the SQL journal repo.
 * @param required.kernel the content database kernel (SQLite or Postgres; same SQL on both).
 * @returns the cms port (`save`/`list`/`remove`) plus `listLegacyOrphans`.
 * @throws on `save` when the entry has no exact reason or kind (nothing is written).
 * @complexity `list`/`listLegacyOrphans` O(rows in the workspace); `save`/`remove` O(1) by key.
 * @example createBlobGcJournal({ kernel }, {}).list({ workspaceId })
 */
export function createBlobGcJournal(required: { kernel: KyselyKernel<unknown> }, _optional: Record<string, never> = {}) {
  const { kernel } = required;
  return {
    async save(entry: BlobGcJournalEntry | HostBlobGcJournalEntry): Promise<void> {
      assertProvenance(entry);
      await kernel.transaction(async () => {
        await kernel.run(db => sql`INSERT INTO blob_gc_journal (workspace_id, storage_key, sha256, kind, reason, journaled_at)
          VALUES (${entry.workspaceId}, ${entry.storageKey}, ${entry.sha256}, ${entry.kind}, ${entry.reason}, ${entry.journaledAt})
          ON CONFLICT (workspace_id, storage_key) DO UPDATE SET sha256 = excluded.sha256, kind = excluded.kind, reason = excluded.reason, journaled_at = excluded.journaled_at`.execute(db));
        await kernel.run(db => sql`UPDATE asset_blobs SET purge_reason = ${entry.reason} WHERE workspace_id = ${entry.workspaceId} AND sha256 = ${entry.sha256}`.execute(db));
      });
    },
    async list(input: { workspaceId: string }): Promise<HostBlobGcJournalEntry[]> {
      const result = await kernel.run(db => sql<JournalRow>`SELECT workspace_id, storage_key, sha256, kind, reason, journaled_at FROM blob_gc_journal WHERE workspace_id = ${input.workspaceId} ORDER BY journaled_at, storage_key`.execute(db));
      return result.rows.map(toEntry);
    },
    async remove(input: { workspaceId: string; id: string }): Promise<void> {
      await kernel.run(db => sql`DELETE FROM blob_gc_journal WHERE workspace_id = ${input.workspaceId} AND storage_key = ${input.id}`.execute(db));
    },
    /** Tombstoned blob rows from before the journal (NULL `purge_reason`): reported, never eligible. */
    async listLegacyOrphans(input: { workspaceId: string }): Promise<Array<{ sha256: string; storageKey: string }>> {
      const result = await kernel.run(db => sql<{ sha256: string; storage_key: string }>`SELECT sha256, storage_key FROM asset_blobs WHERE workspace_id = ${input.workspaceId} AND status = 'tombstoned' AND purge_reason IS NULL ORDER BY sha256`.execute(db));
      return result.rows.map(row => ({ sha256: row.sha256, storageKey: row.storage_key }));
    },
  } satisfies BlobGcJournalRepoPort & Record<string, unknown>;
}
