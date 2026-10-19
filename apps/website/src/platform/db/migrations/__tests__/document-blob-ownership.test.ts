/** RED: retained ordinary blobs were indistinguishable from purged Library documents. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sql } from 'kysely';
import { freshSqliteContentKernel, sharedPgContentKernel } from '#src/platform/db/kernel/__tests__/dialect-matrix';
import { openPgliteKernel } from '#src/platform/db/kernel/drivers/pglite';
import { openMemorySqliteKernel } from '#src/platform/db/kernel/drivers/sqlite';
import { listColumns } from '#src/platform/db/kernel/dialect';
import type { StorageKernel } from '#src/platform/db/kernel/port';
import { runMigrations } from '../runner.js';
import { documentBlobOwnership } from '../0015_document_blob_ownership.js';
import { MIGRATION_CHECKSUMS } from '../checksums.js';

const dialects = [
  { name: 'sqlite', open: () => openMemorySqliteKernel<unknown>(), fresh: () => freshSqliteContentKernel() as StorageKernel<unknown>, owned: 1, unowned: 0 },
  { name: 'pglite', open: () => openPgliteKernel<unknown>(), fresh: () => sharedPgContentKernel() as StorageKernel<unknown>, owned: true, unowned: false },
] as const;

const insertBlob = (kernel: StorageKernel<unknown>, id: string, workspace = 'site-a') => kernel.execute(sql`INSERT INTO asset_blobs
  (id, workspace_id, sha256, storage_key, created_by_principal, created_at, status) VALUES (${id}, ${workspace}, ${id}, ${id}, 'owner', 'now', 'active')`);

/** Column shape plus its declared default, so a fresh head database matches an upgraded one. */
async function ownershipColumn(kernel: StorageKernel<unknown>) {
  const column = (await listColumns(kernel, 'asset_blobs')).find(entry => entry.name === 'document_owned');
  const [declared] = await kernel.query<{ value: string | null }>(kernel.dialect === 'sqlite'
    ? sql`SELECT dflt_value AS value FROM pragma_table_info('asset_blobs') WHERE name = 'document_owned'`
    : sql`SELECT column_default AS value FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'asset_blobs' AND column_name = 'document_owned'`);
  return { ...column, declaredDefault: declared?.value };
}

for (const dialect of dialects) {
  test(`[${dialect.name}] document ownership backfill includes Trash, excludes ordinary orphans and respects workspace`, async () => {
    const kernel = dialect.open();
    try {
      // The pre-0015 shape, built directly: no DROP COLUMN on a head schema.
      await kernel.execute(sql`CREATE TABLE asset_blobs (id text PRIMARY KEY, workspace_id text NOT NULL, sha256 text NOT NULL,
        storage_key text NOT NULL, created_by_principal text NOT NULL, created_at text NOT NULL, status text NOT NULL, tombstoned_at text, content_type text)`);
      await kernel.execute(sql`CREATE TABLE media (id text PRIMARY KEY, workspace_id text NOT NULL, source_sha256 text NOT NULL,
        status text NOT NULL, kind text NOT NULL DEFAULT 'media')`);
      for (const id of ['active', 'trashed', 'ordinary', 'orphan', 'other-site']) {
        await insertBlob(kernel, id);
        if (id === 'orphan') continue;
        const workspace = id === 'other-site' ? 'site-b' : 'site-a';
        const kind = id === 'ordinary' ? 'media' : 'document';
        const status = id === 'trashed' ? 'trashed' : 'active';
        await kernel.execute(sql`INSERT INTO media (id, workspace_id, source_sha256, status, kind) VALUES (${id}, ${workspace}, ${id}, ${status}, ${kind})`);
      }
      const steps = [documentBlobOwnership({ checksum: MIGRATION_CHECKSUMS['0015_document_blob_ownership']! })];
      const options = { ledgerTable: 'document_ownership_test_migrations' };
      assert.deepEqual((await runMigrations(kernel, steps, options)).applied, ['0015_document_blob_ownership']);
      await insertBlob(kernel, 'later');
      // Exact stored values: SQLite must hold integer 0/1, never a text or NULL false.
      const rows = await kernel.query<{ id: string; document_owned: unknown }>(sql`SELECT id, document_owned FROM asset_blobs ORDER BY id`);
      const { owned, unowned } = dialect;
      assert.deepEqual(rows.map(row => [row.id, row.document_owned]),
        [['active', owned], ['later', unowned], ['ordinary', unowned], ['orphan', unowned], ['other-site', unowned], ['trashed', owned]]);
      assert.deepEqual((await runMigrations(kernel, steps, options)).applied, []);

      const fresh = dialect.fresh();
      try {
        assert.deepEqual(await ownershipColumn(fresh), await ownershipColumn(kernel));
        await insertBlob(fresh, 'fresh-default');
        assert.deepEqual(await fresh.query(sql`SELECT document_owned FROM asset_blobs WHERE id = 'fresh-default'`), [{ document_owned: unowned }]);
      } finally { if (dialect.name === 'sqlite') await fresh.close(); }
    } finally { await kernel.close(); }
  });
}
