import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sql } from 'kysely';
import { eachDialect } from '../../kernel/__tests__/dialect-matrix.js';
import { listColumns } from '@jini-ai/db/kernel';
import { CONTENT_MIGRATIONS, runMigrations } from '../index.js';
import { MIGRATION_CHECKSUMS } from '../checksums.js';
import type { KyselyKernel } from '@jini-ai/db/kernel';

/** P11 ST-11b.T: migration 0046 adds `asset_blobs.purge_reason` and the `blob_gc_journal` table. The
 *  fresh bootstrap (SQLite's `freshSiteOperations`, PGlite's migrated head) must equal the migrated
 *  shape: same columns, same nullability. Additive only, applied once, pinned checksum. */
const ID = '0048_blob_gc_journal';
const JOURNAL_COLUMNS = ['workspace_id', 'storage_key', 'sha256', 'kind', 'reason', 'journaled_at', 'attempts', 'next_attempt_at', 'last_error'];

const shape = async (kernel: KyselyKernel<unknown>, table: string) =>
  (await listColumns({ kernel, table })).map(column => `${column.name}:${column.notNull ? 'not-null' : 'null'}`).sort();

for (const adapter of eachDialect({ tables: ['asset_blobs'], make: kernel => kernel as KyselyKernel<unknown> })) {
  test(`[${adapter.name}] fresh bootstrap = migrated schema`, async t => {
    const kernel = adapter.make();
    if (adapter.dialect === 'sqlite') t.after(() => kernel.close());
    const freshJournal = await shape(kernel, 'blob_gc_journal');
    const freshBlobs = await shape(kernel, 'asset_blobs');
    assert.deepEqual(freshJournal.map(entry => entry.split(':')[0]).sort(), [...JOURNAL_COLUMNS].sort());
    assert.ok(freshBlobs.includes('purge_reason:null'), 'fresh asset_blobs has a nullable purge_reason');

    await kernel.execute(sql.raw('DROP TABLE blob_gc_journal'));
    await kernel.execute(sql.raw('ALTER TABLE asset_blobs DROP COLUMN purge_reason'));
    const step = CONTENT_MIGRATIONS.find(entry => entry.id === ID);
    assert.ok(step, 'blob GC journal step must be registered in the content history');
    assert.equal(CONTENT_MIGRATIONS[CONTENT_MIGRATIONS.indexOf(step) - 1]?.id, '0047_change_set_actor_kind');
    assert.equal(step.checksum, MIGRATION_CHECKSUMS[ID]);
    const options = { ledgerTable: 'blob_gc_journal_test_migrations' };
    assert.deepEqual((await runMigrations({ kernel, steps: [step] }, options)).applied, [ID]);
    assert.deepEqual(await shape(kernel, 'blob_gc_journal'), freshJournal);
    assert.deepEqual(await shape(kernel, 'asset_blobs'), freshBlobs);
    assert.deepEqual((await runMigrations({ kernel, steps: [step] }, options)).applied, []);
  });
}
