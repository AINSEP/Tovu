/** Library L1 step 2 / ADR-066: additive step on SQLite and PostgreSQL, legacy default + once-only. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sql } from 'kysely';
import { eachDialect } from '#src/platform/db/kernel/__tests__/dialect-matrix';
import { listColumns } from '#src/platform/db/kernel/dialect';
import type { StorageKernel } from '#src/platform/db/kernel/port';
import { runMigrations } from '../runner.js';
import { mediaLibrary } from '../0014_media_library.js';
import { MIGRATION_CHECKSUMS } from '../checksums.js';

for (const adapter of eachDialect({ tables: ['media'], make: kernel => kernel })) {
  test(`[${adapter.name}] Library migration defaults legacy rows to media and retains document metadata`, async () => {
    const kernel = adapter.make();
    try {
      const columns = await listColumns(kernel, 'media');
      for (const name of ['kind', 'original_filename']) {
        if (columns.some(column => column.name === name)) await kernel.execute(sql`ALTER TABLE media DROP COLUMN ${sql.ref(name)}`);
      }
      await kernel.execute(sql`INSERT INTO media (id, workspace_id, title, slug, alt, caption, credit, source_sha256, status, created_at, updated_at, version)
        VALUES ('legacy', 'site-a', 'Legacy', 'legacy', '', '', '', 'hash', 'active', 'now', 'now', 1)`);
      const steps = [mediaLibrary({ checksum: MIGRATION_CHECKSUMS['0014_media_library']! })];
      const options = { ledgerTable: 'library_test_migrations' };
      assert.deepEqual((await runMigrations(kernel as StorageKernel<unknown>, steps, options)).applied, ['0014_media_library']);
      assert.deepEqual(await kernel.query(sql`SELECT kind, original_filename FROM media WHERE id = 'legacy'`), [{ kind: 'media', original_filename: null }]);
      assert.deepEqual((await runMigrations(kernel as StorageKernel<unknown>, steps, options)).applied, []);
      await assert.rejects(kernel.execute(sql`UPDATE media SET kind = 'other' WHERE id = 'legacy'`));
    } finally { if (adapter.name === 'sqlite') await kernel.close(); }
  });
}
