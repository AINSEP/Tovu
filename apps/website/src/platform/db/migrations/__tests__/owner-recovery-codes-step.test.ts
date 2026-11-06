import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sql } from 'kysely';
import { eachDialect } from '../../kernel/__tests__/dialect-matrix.js';
import { listColumns } from '../../kernel/dialect.js';
import { CONTENT_MIGRATIONS, runMigrations } from '../index.js';
import type { StorageKernel } from '../../kernel/port.js';

for (const adapter of eachDialect({ tables: ['owner_recovery_codes'], make: kernel => kernel as StorageKernel<unknown> })) {
  test(`[${adapter.name}] recovery migration adds only scoped hashes, enforces uniqueness, and applies once`, async t => {
    const kernel = adapter.make();
    if (adapter.dialect === 'sqlite') t.after(() => kernel.close());
    await kernel.execute(sql`DROP TABLE owner_recovery_codes`);
    const step = CONTENT_MIGRATIONS.find(entry => entry.id === '0039_owner_recovery_codes');
    assert.ok(step, 'recovery schema must be registered in the content history');
    const options = { ledgerTable: 'recovery_test_migrations' };
    assert.deepEqual((await runMigrations(kernel, [step], options)).applied, [step.id]);
    assert.deepEqual((await listColumns(kernel, 'owner_recovery_codes')).map(column => column.name).sort(),
      ['workspace_id', 'principal_id', 'code_hash'].sort());
    await kernel.execute(sql`INSERT INTO owner_recovery_codes VALUES ('a', 'owner', 'hash')`);
    await assert.rejects(kernel.execute(sql`INSERT INTO owner_recovery_codes VALUES ('a', 'owner', 'hash')`));
    await kernel.execute(sql`INSERT INTO owner_recovery_codes VALUES ('b', 'owner', 'hash')`);
    assert.deepEqual((await runMigrations(kernel, [step], options)).applied, []);
    assert.equal((await kernel.query(sql`SELECT code_hash FROM owner_recovery_codes`)).length, 2);
  });
}
