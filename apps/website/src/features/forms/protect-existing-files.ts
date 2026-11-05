import { access, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { protectFormAttachments, FormAttachmentOwnerMismatchError } from '@jini-ai/cms/forms';
import type { ContentKernel } from '#src/platform/db/content-kernel';

type Site = { kernel: ContentKernel; workspaceId: string };

/** Upgrade legacy attachments once before serving the site. New uploads already stamp private
 * metadata. The owner composition calls this; clients and idle wakes do not repeat the scan.
 * Missing assets are already purged. Preserve source metadata and warn for mismatched ownership.
 * @complexity Once per site: pages of 100 JSON rows, one indexed read/up to two writes per file;
 * later owner boots check only the fixed completion marker. No visitor request scans submissions. */
export async function protectExistingFormFiles(
  { kernel, workspaceId, siteDir }: Site & { siteDir: string },
  { warn = console.warn }: { warn?: (message: string) => void } = {},
): Promise<void> {
  const marker = join(siteDir, '.form-files-protected-v1');
  try { await access(marker); return; } catch { /* A first owner boot has no completion marker. */ }
  try {
    let failedStamp = false;
    await protectFormAttachments({
      workspaceId,
      readPage: input => readPage({ kernel, workspaceId, ...input }),
      protect: reference => protectReference({ kernel, ...reference }),
      warn: ({ submissionId, code }) => {
        if (code === 'attachment-protection-failed') failedStamp = true;
        warn(`A legacy form file could not be protected; the site will continue. Details: FORMS_LEGACY_FILE_PROTECTION ${code} submission=${submissionId}. The file was left unchanged.`);
      },
    });
    if (!failedStamp) await writeFile(marker, 'complete\n', { mode: 0o600 });
  } catch {
    warn('Legacy form file protection could not finish; the site will continue and retry on its next owner start. Details: FORMS_LEGACY_FILE_PROTECTION_INCOMPLETE.');
  }
}

/** Include Trash so a later restore cannot expose a legacy file. One 100-row keyset page. */
async function readPage({ kernel, workspaceId, after, limit }: Site & { after?: string; limit: number }) {
  return kernel.run(async db => {
    let query = db.selectFrom('form_submissions').select(['id', 'data_json']).where('workspace_id', '=', workspaceId);
    if (after !== undefined) query = query.where('id', '>', after);
    const rows = await query.orderBy('id').limit(limit).execute();
    return rows.map(row => ({ id: row.id, dataJson: row.data_json }));
  });
}

/** Idempotent private stamp; a forged legacy reference cannot take an editorial asset private.
 * @complexity One indexed media read and at most two scoped writes per attachment. */
async function protectReference({ kernel, workspaceId, submissionId, mediaId }: Site & { submissionId: string; mediaId: string }): Promise<void> {
  await kernel.transaction(async () => kernel.run(async db => {
    const row = await db.selectFrom('media').select(['id', 'original_filename', 'source_metadata_json', 'source_sha256'])
      .where('workspace_id', '=', workspaceId).where('id', '=', mediaId).executeTakeFirst();
    if (!row) return;
    const metadata = JSON.parse(row.source_metadata_json ?? '{}');
    if (!metadata.private && !row.original_filename?.startsWith(`${submissionId}-`)) throw new FormAttachmentOwnerMismatchError();
    if (!metadata.private) await db.updateTable('media').set({ source_metadata_json: JSON.stringify({ ...metadata, private: true }) }).where('workspace_id', '=', workspaceId).where('id', '=', row.id).execute();
    await db.updateTable('asset_blobs').set({ document_owned: true }).where('workspace_id', '=', workspaceId).where('sha256', '=', row.source_sha256).where('document_owned', '=', false).execute();
  }));
}
