import { sql } from 'kysely';
import type { StorageKernel } from '../kernel/port.js';
import type { MigrationStep } from './step.js';

// Purge hard-deletes editorial rows before GC: retain ownership on the existing blob owner.
// Backfill all surviving documents, including Trash, without classifying ordinary orphan blobs.
// Pre-migration purges left no ownership history and cannot be reconstructed from blob metadata.
export function documentBlobOwnershipStatements({ dialect }: { dialect: 'sqlite' | 'postgres' },
  _optional: Record<string, never> = {}): readonly string[] {
  const booleanType = dialect === 'sqlite' ? 'integer' : 'boolean';
  return [
    `ALTER TABLE asset_blobs ADD COLUMN document_owned ${booleanType} NOT NULL DEFAULT false`,
    "UPDATE asset_blobs SET document_owned = true WHERE EXISTS (SELECT 1 FROM media WHERE media.workspace_id = asset_blobs.workspace_id AND media.source_sha256 = asset_blobs.sha256 AND media.kind = 'document')",
  ];
}

async function up(kernel: StorageKernel<unknown>): Promise<void> {
  for (const statement of documentBlobOwnershipStatements({ dialect: kernel.dialect })) await kernel.execute(sql.raw(statement));
}

export const documentBlobOwnership = (required: { checksum: string },
  _optional: Record<string, never> = {}): MigrationStep => ({
  id: '0015_document_blob_ownership', checksum: required.checksum, up,
});
