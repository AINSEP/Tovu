import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sql } from 'kysely';
import { eachDialect } from '../../kernel/__tests__/dialect-matrix.js';
import { listColumns } from '@jini-ai/db/kernel';
import { CONTENT_MIGRATIONS, runMigrations } from '../index.js';
import { MIGRATION_CHECKSUMS } from '../checksums.js';
import { SqlMediaRepo } from '../../repos/media-repo.js';
import type { KyselyKernel } from '@jini-ai/db/kernel';
import type { ContentKernel } from '../../content-kernel.js';

/** P10-M5.T: migration 0046 adds one nullable `media.description` column — additive only, applied
 *  once, pinned checksum, no backfill — on SQLite and PGlite alike. A row written before it reads
 *  back as never described, with its captions and source metadata intact. */
const ID = '0046_media_description';

for (const adapter of eachDialect({ tables: ['media'], make: kernel => kernel })) {
  test(`[${adapter.name}] legacy media opens with no description after migration`, async t => {
    const kernel = adapter.make();
    if (adapter.dialect === 'sqlite') t.after(() => kernel.close());
    const fresh = (await listColumns({ kernel: kernel as KyselyKernel<unknown>, table: 'media' })).map(column => column.name);
    assert.ok(fresh.includes('description'), 'fresh schema has description');
    await kernel.execute(sql.raw('ALTER TABLE media DROP COLUMN description'));
    await kernel.execute(sql.raw(`INSERT INTO media (id, workspace_id, title, slug, alt, caption, credit, source_sha256, source_metadata_json, status, created_at, updated_at, version, captions_media_id, captions_srclang, captions_label)
      VALUES ('legacy-1', 'workspace-1', 'Barn', 'barn', 'a barn', 'Our barn', 'Ana', '${'a'.repeat(64)}', '{"contentType":"image/jpeg"}', 'active', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 1, 'track-1', 'en', 'English')`));
    const step = CONTENT_MIGRATIONS.find(entry => entry.id === ID);
    assert.ok(step, 'media description step must be registered in the content history');
    assert.equal(step.checksum, MIGRATION_CHECKSUMS[ID]);
    const options = { ledgerTable: 'description_test_migrations' };
    assert.deepEqual((await runMigrations({ kernel: kernel as KyselyKernel<unknown>, steps: [step] }, options)).applied, [ID]);
    const column = (await listColumns({ kernel: kernel as KyselyKernel<unknown>, table: 'media' })).find(entry => entry.name === 'description');
    assert.equal(column?.notNull ?? true, false, 'description is nullable');
    const legacy = await new SqlMediaRepo(kernel as unknown as ContentKernel).findById({ workspaceId: 'workspace-1', id: 'legacy-1' });
    assert.ok(legacy, 'the legacy row still opens');
    assert.equal('description' in legacy, false, 'no fabricated description');
    assert.deepEqual(legacy.captions, { assetId: 'track-1', srclang: 'en', label: 'English' });
    assert.equal((legacy.source as { contentType?: string }).contentType, 'image/jpeg');
    assert.deepEqual((await runMigrations({ kernel: kernel as KyselyKernel<unknown>, steps: [step] }, options)).applied, []);
  });
}
