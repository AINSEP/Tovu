import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sql } from 'kysely';
import { eachDialect } from '../../kernel/__tests__/dialect-matrix.js';
import { listColumns } from '@jini-ai/db/kernel';
import { CONTENT_MIGRATIONS, runMigrations } from '../index.js';
import { MIGRATION_CHECKSUMS } from '../checksums.js';
import { LEDGER_ACTOR_KIND_STATEMENTS } from '../0050_ledger_actor_kind.js';
import type { KyselyKernel } from '@jini-ai/db/kernel';

/** H2 owner decision: migration 0050 adds nullable typed-attribution columns (`trashed_items.actor_kind`
 *  + `actor_id`, `taxonomy_revisions.actor_kind`, `post_revisions.actor_kind`) — additive only, applied
 *  once, pinned checksum, no backfill, no CHECK — on SQLite and PGlite alike. Rows written before it
 *  keep NULL: unknown, never guessed from their principal, plugin or actor ids. */
const ID = '0050_ledger_actor_kind';
const AT = '2026-01-01T00:00:00.000Z';
const ADDED: ReadonlyArray<readonly [string, string]> = [
  ['trashed_items', 'actor_kind'], ['trashed_items', 'actor_id'], ['taxonomy_revisions', 'actor_kind'], ['post_revisions', 'actor_kind'],
];
const TABLES = ['workspaces', 'trashed_items', 'taxonomy_revisions', 'post_revisions'];

const columnsOf = async (kernel: KyselyKernel<unknown>, table: string) => listColumns({ kernel, table });

test('0050 is registered after 0048 with its pinned checksum and only ADD COLUMN statements', () => {
  const index = CONTENT_MIGRATIONS.findIndex(step => step.id === ID);
  assert.ok(index > 0, 'ledger actor kind step must be registered in the content history');
  assert.equal(CONTENT_MIGRATIONS[index - 1]?.id, '0048_blob_gc_journal');
  assert.equal(CONTENT_MIGRATIONS[index]!.checksum, MIGRATION_CHECKSUMS[ID]);
  assert.equal(MIGRATION_CHECKSUMS[ID], '8451263a8850109e6257deb1e29bd681aceacbacd55e3413c5c75fae0522dda9');
  for (const statement of LEDGER_ACTOR_KIND_STATEMENTS) {
    assert.match(statement, /^ALTER TABLE \w+ ADD COLUMN \w+ text$/, 'nullable, no default, no CHECK, no backfill');
  }
});

for (const adapter of eachDialect({ tables: TABLES, make: kernel => kernel })) {
  test(`[${adapter.name}] a fresh database has every 0050 column, nullable`, async t => {
    const kernel = adapter.make() as KyselyKernel<unknown>;
    if (adapter.dialect === 'sqlite') t.after(() => kernel.close());
    for (const [table, name] of ADDED) {
      const column = (await columnsOf(kernel, table)).find(entry => entry.name === name);
      assert.ok(column, `fresh ${table} has ${name}`);
      assert.equal(column.notNull, false, `${table}.${name} is nullable`);
    }
  });

  test(`[${adapter.name}] a database at 0048 migrates and its existing ledger rows keep a NULL (unknown) actor`, async t => {
    const kernel = adapter.make() as KyselyKernel<unknown>;
    if (adapter.dialect === 'sqlite') t.after(() => kernel.close());
    for (const [table, name] of [...ADDED].reverse()) await kernel.execute(sql.raw(`ALTER TABLE ${table} DROP COLUMN ${name}`));
    await kernel.execute(sql`INSERT INTO workspaces (id, name, slug, created_at) VALUES ('w', 'W', 'w', ${AT})`);
    await kernel.execute(sql`INSERT INTO trashed_items (id, workspace_id, entity_type, entity_id, trashed_at, purge_after, actor_principal_id, actor_plugin_id, display_title)
      VALUES ('trash-1', 'w', 'post', 'post-1', ${AT}, ${AT}, 'owner-1', 'plugin-1', 'Old post')`);
    await kernel.execute(sql`INSERT INTO taxonomy_revisions (workspace_id, taxonomy_id, op, previous_state_json, actor_id, recorded_at)
      VALUES ('w', 'tax-1', 'create', NULL, 'owner-1', ${AT})`);
    await kernel.execute(sql`INSERT INTO post_revisions (id, post_id, workspace_id, seq, op, state_json, content_hash, actor_id, recorded_at)
      VALUES ('rev-1', 'post-1', 'w', 1, 'create', '{}', 'hash', 'owner-1', ${AT})`);
    const step = CONTENT_MIGRATIONS.find(entry => entry.id === ID)!;
    const options = { ledgerTable: 'ledger_actor_kind_test_migrations' };
    assert.deepEqual((await runMigrations({ kernel, steps: [step] }, options)).applied, [ID]);
    for (const [table, name] of ADDED) {
      assert.equal((await columnsOf(kernel, table)).find(entry => entry.name === name)?.notNull ?? true, false, `${table}.${name} is nullable`);
    }
    assert.deepEqual(await kernel.query(sql`SELECT actor_principal_id, actor_plugin_id, actor_kind, actor_id FROM trashed_items`),
      [{ actor_principal_id: 'owner-1', actor_plugin_id: 'plugin-1', actor_kind: null, actor_id: null }]);
    assert.deepEqual(await kernel.query(sql`SELECT actor_id, actor_kind FROM taxonomy_revisions`), [{ actor_id: 'owner-1', actor_kind: null }]);
    assert.deepEqual(await kernel.query(sql`SELECT actor_id, actor_kind FROM post_revisions`), [{ actor_id: 'owner-1', actor_kind: null }]);
    assert.deepEqual((await runMigrations({ kernel, steps: [step] }, options)).applied, [], 'applied once');
  });
}
