import { createFormAttachmentPurgeHooks, scheduleFormAttachmentCleanup, FormDeliveryError, type FormAttachmentRemoval, type FormOutboxPort } from '@jini-ai/cms/forms';
import { computeBlobStorageKey, withSha256Lock, type MediaRowCleanupDeps } from '@jini-ai/cms/media';
import type { TrashFollowUpHooks } from '@jini-ai/cms/trash';
import type { ContentKernel } from '#src/platform/db/content-kernel';

/** Bind the generic attachment lifecycle to Tovu's existing Trash tables and delivery scrub.
 * @returns Transactional hooks; query/removal errors abort purge before its transaction commits.
 * @complexity Keyset reads of 100 JSON rows per page per purge, plus one removal per distinct file. */
export function createFormFilePurgeHooks(
  { kernel, entityType, scrub, ...removal }: {
    kernel: ContentKernel;
    entityType: 'form' | 'form_submission';
    scrub: (required: { workspaceId: string; entityId: string }) => Promise<void>;
  } & FormAttachmentRemoval,
  _optional = {},
): TrashFollowUpHooks {
  const hooks = createFormAttachmentPurgeHooks({ ...removal, readSubmissions: ({ workspaceId, entityId, after, limit }) => kernel.run(async db => {
    let query = db.selectFrom('form_submissions').select(['id', 'data_json']).where('workspace_id', '=', workspaceId)
      .where(entityType === 'form' ? 'form_definition_id' : 'id', '=', entityId);
    if (after !== undefined) query = query.where('id', '>', after);
    const rows = await query.orderBy('id').limit(limit).execute();
    return rows.map(row => ({ id: row.id, dataJson: row.data_json }));
  }) });
  return { beforePurge: hooks.beforePurge, afterPurge: async required => {
    await hooks.afterPurge!(required);
    await scrub(required);
  } };
}

/** A delayed cleanup must retain bytes owned by active or restorable media in this workspace.
 * @complexity One scoped EXISTS-style probe per cold job, returning at most one id (no metadata). */
export async function hasFormFileOwners({ kernel, workspaceId, sha256 }: { kernel: ContentKernel; workspaceId: string; sha256: string }, _optional = {}): Promise<boolean> {
  const row = await kernel.run(db => db.selectFrom('media').select('id').where('workspace_id', '=', workspaceId).where('source_sha256', '=', sha256).limit(1).executeTakeFirst());
  return row !== undefined;
}

/** Bind the media owner's pre-delete journal to this site's existing outbox and transaction.
 * Memory-only hosts omit kernel; persistent hosts join their outer Trash/submission transaction.
 * @returns Cleanup dependencies shared by purge, compensation and explicit maintenance.
 * @complexity One small outbox write per removed asset; no file reads or recurring work. */
export function createFormMediaCleanup(
  { kernel, outbox, clock, graceMs }: { kernel?: ContentKernel; outbox: FormOutboxPort; clock: { nowMs(): number }; graceMs: number },
  _optional = {},
): Pick<MediaRowCleanupDeps, 'cleanupJournal' | 'cleanupTransaction' | 'tombstoneLock'> {
  return {
    ...(kernel ? {
      cleanupTransaction: ({ work }: { work: () => Promise<void> }) => kernel.transaction(work),
      // SQLite owns the entire database writer turn here. Waiting for the JS hash lock would
      // deadlock with an upload holding that hash while it waits for this database transaction.
      tombstoneLock: <T>({ key, criticalSection }: { key: string; criticalSection: () => Promise<T> }): Promise<T> => {
        if (kernel.dialect === 'sqlite' && kernel.inTransaction()) return criticalSection();
        return withSha256Lock({ key, criticalSection });
      },
    } : {}),
    cleanupJournal: input => scheduleFormAttachmentCleanup({ ...input, outbox, now: clock.nowMs(), graceMs }),
  };
}

/** Exact-key ownership also covers shared rendition objects and other workspaces. Exclude only
 * this cleanup job's own tombstoned source row: counting it would retain every original forever.
 * @returns Whether any retained rendition or different/live blob still names these exact bytes.
 * @complexity Two EXISTS queries per cold key, O(rendition + blob rows) without a storage-key
 * index in the existing schema. Returns at most one identity; no object downloads or polling. */
export async function hasFormFileStorageKeyOwners(
  { kernel, workspaceId, sha256, storageKey }: { kernel?: ContentKernel; workspaceId: string; sha256: string; storageKey: string },
  _optional = {},
): Promise<boolean> {
  if (!kernel) return true;
  return kernel.run(async db => {
    const rendition = await db.selectFrom('asset_renditions').select('id').where('storage_key', '=', storageKey).limit(1).executeTakeFirst();
    if (rendition) return true;
    const blob = await db.selectFrom('asset_blobs').select('sha256').where('storage_key', '=', storageKey)
      .where(eb => eb.or([eb('workspace_id', '!=', workspaceId), eb('sha256', '!=', sha256), eb('status', '!=', 'tombstoned')]))
      .limit(1).executeTakeFirst();
    return blob !== undefined;
  });
}

/** Lock exact byte identities in the writer's hash namespace. Unknown storage layouts retain
 * their durable cleanup job rather than guessing an object identity.
 * @throws A retryable cleanup error when a key is not this host's canonical blob key.
 * @complexity O(key length) validation plus one shared in-process hash lock. */
export async function withFormFileStorageKeyLock(
  { workspaceId, storageKey, criticalSection }: { workspaceId: string; storageKey: string; criticalSection: () => Promise<void> },
  _optional = {},
): Promise<void> {
  const sha256 = storageKey.split('/').at(-1) ?? '';
  if (!/^[a-f0-9]{64}$/.test(sha256) || computeBlobStorageKey({ workspaceId, sha256 }) !== storageKey) {
    throw new FormDeliveryError({ code: 'delivery-failed', retryable: true });
  }
  await withSha256Lock({ key: sha256, criticalSection });
}
