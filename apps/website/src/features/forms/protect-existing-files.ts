import { access, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { protectExistingFormFiles as protectWithPorts } from '@jini-ai/cms/forms/site/protect-existing-files';
import { describeErrorForLog } from '@jini-ai/core/model-facing-tool-errors';
import { schemaErasedKernel, type ContentKernel } from '#src/platform/db/content-kernel';

/** The submission/media/blob row view the cms protection pass reads and writes through `withTables`. */
type FormFileTables = Record<string, {
  id: string; workspace_id: string; data_json: string; source_metadata_json: string | null;
  source_sha256: string; sha256: string; document_owned: boolean;
}>;

type Site = { kernel: ContentKernel; workspaceId: string };

export function protectExistingFormFiles(
  { kernel, workspaceId, siteDir }: Site & { siteDir: string },
  { warn = console.warn }: { warn?: (message: string) => void } = {},
): Promise<void> {
  const marker = join(siteDir, '.form-files-protected-v1');
  const erased = schemaErasedKernel({ store: kernel });
  return protectWithPorts({ kernel: { run: work => erased.run(db => work(db.withTables<FormFileTables>())), transaction: work => erased.transaction(work) }, workspaceId,
    tables: { submissions: 'form_submissions', media: 'media', assetBlobs: 'asset_blobs' },
    readMarker: () => access(marker), markComplete: () => writeFile(marker, 'complete\n', { mode: 0o600 }),
    warn: ({ submissionId, code }) => warn(`A legacy form file could not be protected; the site will continue. Details: FORMS_LEGACY_FILE_PROTECTION ${code} submission=${submissionId}. The file was left unchanged.`),
    warnIncomplete: error => warn(`Legacy form file protection could not finish; the site will continue and retry on its next owner start. Details: FORMS_LEGACY_FILE_PROTECTION_INCOMPLETE. Cause: ${describeErrorForLog({ err: error })}`),
  });
}
