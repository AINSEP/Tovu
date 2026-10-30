import { sql } from 'kysely';
import type { StorageKernel } from '../kernel/port.js';
import type { MigrationStep } from './step.js';

async function up(kernel: StorageKernel<unknown>): Promise<void> {
  const type = kernel.dialect === 'postgres' ? 'jsonb' : 'text';
  await kernel.run(db => db.schema.alterTable('media').addColumn('source_metadata_json', sql.raw(type)).execute());
}

export function mediaSourceMetadata(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep {
  return { id: '0037_media_source_metadata', checksum: required.checksum, up };
}
