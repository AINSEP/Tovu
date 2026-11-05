import { createFormAttachmentPurgeHooks, type FormAttachmentRemoval } from '@jini-ai/cms/forms';
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
