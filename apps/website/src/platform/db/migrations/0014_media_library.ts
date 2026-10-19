import { sql } from 'kysely';
import type { StorageKernel } from '../kernel/port.js';
import type { MigrationStep } from './step.js';

export const MEDIA_LIBRARY_STATEMENTS = [
  "ALTER TABLE media ADD COLUMN kind text NOT NULL DEFAULT 'media' CHECK (kind IN ('media', 'document'))",
  "ALTER TABLE media ADD COLUMN original_filename text",
] as const;

async function up(kernel: StorageKernel<unknown>): Promise<void> {
  for (const statement of MEDIA_LIBRARY_STATEMENTS) await kernel.execute(sql.raw(statement));
}

export const mediaLibrary = (required: { checksum: string },
  _optional: Record<string, never> = {}): MigrationStep => ({
  id: '0014_media_library', checksum: required.checksum, up,
});
