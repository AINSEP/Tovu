import { sql } from 'kysely';
import type { KyselyKernel } from '@jini-ai/db/kernel';
import type { MigrationStep } from '@jini-ai/core/contracts/storage';

async function up(kernel: KyselyKernel<unknown>): Promise<void> {
  const type = kernel.dialect === 'postgres' ? 'jsonb' : 'text';
  await kernel.run(db => db.schema.alterTable('media').addColumn('source_metadata_json', sql.raw(type)).execute());
}

export function mediaSourceMetadata(required: { checksum: string }, _options: Record<string, never> = {}): MigrationStep<KyselyKernel<unknown>> {
  return { id: '0037_media_source_metadata', checksum: required.checksum, up };
}
