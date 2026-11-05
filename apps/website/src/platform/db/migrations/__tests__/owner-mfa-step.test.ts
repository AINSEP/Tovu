import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sql } from 'kysely';
import { eachDialect } from '../../kernel/__tests__/dialect-matrix.js';
import { listColumns } from '../../kernel/dialect.js';
import { CONTENT_MIGRATIONS, runMigrations } from '../index.js';

for (const adapter of eachDialect({ tables: ['owner_mfa_factors', 'owner_mfa_pending'], make: kernel => kernel })) {
  test(`[${adapter.name}] MFA migration preserves recovery kits, adds bounded proofs and applies once`, async t => {
    const kernel = adapter.make();
    if (adapter.dialect === 'sqlite') t.after(() => kernel.close());
    await kernel.execute(sql`INSERT INTO owner_recovery_codes VALUES ('upgrade', 'owner', 'kept-hash')`);
    await kernel.execute(sql`DROP TABLE owner_mfa_pending`);
    await kernel.execute(sql`DROP TABLE owner_mfa_factors`);
    const step = CONTENT_MIGRATIONS.find(entry => entry.id === '0040_owner_mfa');
    assert.ok(step, 'owner MFA schema must be registered in the content history');
    const options = { ledgerTable: 'mfa_test_migrations' };
    assert.deepEqual((await runMigrations(kernel, [step], options)).applied, [step.id]);
    assert.deepEqual((await listColumns(kernel, 'owner_mfa_factors')).map(column => column.name).sort(),
      ['workspace_id', 'principal_id', 'sealed_secret', 'last_step'].sort());
    assert.deepEqual((await listColumns(kernel, 'owner_mfa_pending')).map(column => column.name).sort(),
      ['workspace_id', 'principal_id', 'purpose', 'token_hash', 'expires_at', 'attempts', 'sealed_secret'].sort());
    await kernel.execute(sql`INSERT INTO owner_mfa_factors VALUES ('a', 'owner', 'sealed', 100)`);
    await assert.rejects(kernel.execute(sql`INSERT INTO owner_mfa_factors VALUES ('a', 'owner', 'other', 101)`));
    await kernel.execute(sql`INSERT INTO owner_mfa_pending VALUES ('a', 'owner', 'login', 'first', 1800000000000, 0, NULL)`);
    await assert.rejects(kernel.execute(sql`INSERT INTO owner_mfa_pending VALUES ('a', 'owner', 'login', 'second', 1800000000000, 0, NULL)`));
    await assert.rejects(kernel.execute(sql`INSERT INTO owner_mfa_pending VALUES ('a', 'other', 'login', 'first', 1800000000000, 0, NULL)`));
    await kernel.execute(sql`INSERT INTO owner_mfa_pending VALUES ('b', 'owner', 'login', 'first', 1800000000000, 0, NULL)`);
    assert.deepEqual((await runMigrations(kernel, [step], options)).applied, []);
    assert.deepEqual(await kernel.query(sql`SELECT code_hash FROM owner_recovery_codes WHERE workspace_id = 'upgrade'`), [{ code_hash: 'kept-hash' }]);
  });
}
