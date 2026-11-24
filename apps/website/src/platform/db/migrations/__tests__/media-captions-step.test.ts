import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sql } from 'kysely';
import { eachDialect } from '../../kernel/__tests__/dialect-matrix.js';
import { listColumns } from '@jini-ai/db/kernel';
import { CONTENT_MIGRATIONS, runMigrations } from '../index.js';
import { MIGRATION_CHECKSUMS } from '../checksums.js';
import type { KyselyKernel } from '@jini-ai/db/kernel';

/** G7-9: migration 0045 (0044 is taken by a parallel lane) adds three nullable caption columns to
 *  `media` — additive only, applied once, pinned checksum — on SQLite and PGlite alike. */
const ID = '0045_media_captions';
const COLUMNS = ['captions_media_id', 'captions_srclang', 'captions_label'];

for (const adapter of eachDialect({ tables: ['media'], make: kernel => kernel as KyselyKernel<unknown> })) {
  test(`[${adapter.name}] media captions migration adds nullable columns once and keeps rows`, async t => {
    const kernel = adapter.make();
    if (adapter.dialect === 'sqlite') t.after(() => kernel.close());
    const fresh = (await listColumns({ kernel, table: 'media' })).map(column => column.name);
    for (const column of COLUMNS) {
      assert.ok(fresh.includes(column), `fresh schema has ${column}`);
      await kernel.execute(sql.raw(`ALTER TABLE media DROP COLUMN ${column}`));
    }
    const step = CONTENT_MIGRATIONS.find(entry => entry.id === ID);
    assert.ok(step, 'media captions step must be registered in the content history');
    assert.equal(step.checksum, MIGRATION_CHECKSUMS[ID]);
    const options = { ledgerTable: 'captions_test_migrations' };
    assert.deepEqual((await runMigrations({ kernel, steps: [step] }, options)).applied, [ID]);
    const columns = await listColumns({ kernel, table: 'media' });
    for (const name of COLUMNS) assert.equal(columns.find(column => column.name === name)?.notNull ?? false, false, `${name} is nullable`);
    assert.deepEqual((await runMigrations({ kernel, steps: [step] }, options)).applied, []);
  });
}
