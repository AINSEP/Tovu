import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sql } from 'kysely';
import { eachDialect } from '../../kernel/__tests__/dialect-matrix.js';
import { listColumns } from '@jini-ai/db/kernel';
import { CONTENT_MIGRATIONS, runMigrations } from '../index.js';
import { MIGRATION_CHECKSUMS } from '../checksums.js';
import type { KyselyKernel } from '@jini-ai/db/kernel';

/** P10-H2.T: migration 0047 adds one nullable `change_sets.actor_kind` column — additive only, applied
 *  once, pinned checksum, no backfill — on SQLite and PGlite alike. A change set written before it
 *  keeps a NULL kind: unknown, never guessed from its actor id. */
const ID = '0047_change_set_actor_kind';

for (const adapter of eachDialect({ tables: ['change_sets'], make: kernel => kernel })) {
  test(`[${adapter.name}] legacy change sets keep an unknown actor kind after migration`, async t => {
    const kernel = adapter.make();
    if (adapter.dialect === 'sqlite') t.after(() => kernel.close());
    const fresh = (await listColumns({ kernel: kernel as KyselyKernel<unknown>, table: 'change_sets' })).map(column => column.name);
    assert.ok(fresh.includes('actor_kind'), 'fresh schema has actor_kind');
    await kernel.execute(sql.raw('ALTER TABLE change_sets DROP COLUMN actor_kind'));
    await kernel.execute(sql.raw(`INSERT INTO change_sets (id, workspace_id, actor_id, status, summary, created_at)
      VALUES ('legacy-1', 'workspace-1', 'owner-1', 'applied', 'Before provenance', '2026-01-01T00:00:00.000Z')`));
    const step = CONTENT_MIGRATIONS.find(entry => entry.id === ID);
    assert.ok(step, 'actor kind step must be registered in the content history');
    assert.equal(CONTENT_MIGRATIONS[CONTENT_MIGRATIONS.findIndex(step => step.id === ID) - 1]?.id, '0046_media_description', 'registered after 0046');
    assert.equal(step.checksum, MIGRATION_CHECKSUMS[ID]);
    const options = { ledgerTable: 'actor_kind_test_migrations' };
    assert.deepEqual((await runMigrations({ kernel: kernel as KyselyKernel<unknown>, steps: [step] }, options)).applied, [ID]);
    const column = (await listColumns({ kernel: kernel as KyselyKernel<unknown>, table: 'change_sets' })).find(entry => entry.name === 'actor_kind');
    assert.equal(column?.notNull ?? true, false, 'actor_kind is nullable');
    assert.deepEqual(await kernel.query(sql`SELECT actor_id, actor_kind FROM change_sets WHERE id = 'legacy-1'`), [{ actor_id: 'owner-1', actor_kind: null }]);
    assert.deepEqual((await runMigrations({ kernel: kernel as KyselyKernel<unknown>, steps: [step] }, options)).applied, []);
  });
}
