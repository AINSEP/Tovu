import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sql } from 'kysely';
import { eachDialect } from '#src/platform/db/kernel/__tests__/dialect-matrix';
import { createPasskeyStore } from '../passkeys.repo.js';
import { createMfaStore } from '../mfa.repo.js';
import { createIdentityTransactions } from '../repo.js';
import { CONTENT_MIGRATIONS, runMigrations } from '#src/platform/db/migrations/index';

for (const adapter of eachDialect({ tables: ['owner_passkeys', 'owner_mfa_pending', 'owner_mfa_factors'], make: kernel => kernel })) {
  test(`[${adapter.name}] passkey public credentials retain ownership, counters, scope and rollback`, async t => {
    const kernel = adapter.make();
    if (adapter.dialect === 'sqlite') t.after(() => kernel.close());
    const store = createPasskeyStore({ kernel });
    const scope = { workspaceId: 'a', principalId: 'owner' };
    const credential = { ...scope, id: 'credential', publicKey: 'public', counter: 0, rpId: 'localhost' };
    assert.deepEqual(await store.list(scope), []);
    await store.save(credential);
    assert.deepEqual(await store.list(scope), [credential]);
    assert.deepEqual(await store.list({ ...scope, workspaceId: 'b' }), []);
    assert.deepEqual(await store.list({ ...scope, principalId: 'foreign' }), []);
    await assert.rejects(store.save({ ...credential, principalId: 'foreign' }), /ownership conflict/);
    await assert.rejects(store.save({ ...credential, publicKey: 'replacement' }), /ownership conflict/);
    await assert.rejects(store.save({ ...credential, rpId: 'evil.test' }), /ownership conflict/);
    await store.save({ ...credential, counter: 5 });
    assert.equal((await store.list(scope))[0]?.counter, 5);
    const transactions = createIdentityTransactions({ kernel });
    await assert.rejects(transactions.run({ workspaceId: 'a', execute: async () => {
      await store.save({ ...credential, counter: 6 });
      throw Error('session failure');
    } }));
    assert.equal((await store.list(scope))[0]?.counter, 5);
    await store.remove({ ...scope, workspaceId: 'b', id: credential.id });
    assert.equal((await store.list(scope)).length, 1);
    await createMfaStore({ kernel }).clear(scope);
    assert.deepEqual(await store.list(scope), []);
  });

  test(`[${adapter.name}] additive credential migration preserves prior factors and applies once`, async t => {
    const kernel = adapter.make();
    if (adapter.dialect === 'sqlite') t.after(() => kernel.close());
    await kernel.execute(sql`INSERT INTO owner_mfa_factors VALUES ('upgrade', 'owner', 'sealed', 100)`);
    await kernel.execute(sql`DROP TABLE owner_passkeys`);
    const step = CONTENT_MIGRATIONS.find(s => s.id === '0041_owner_passkeys');
    assert.ok(step);
    const options = { ledgerTable: 'passkey_upgrade_test' };
    assert.deepEqual((await runMigrations(kernel, [step], options)).applied, [step.id]);
    assert.deepEqual((await runMigrations(kernel, [step], options)).applied, []);
    assert.deepEqual(await kernel.query(sql`SELECT sealed_secret FROM owner_mfa_factors WHERE workspace_id = 'upgrade'`), [{ sealed_secret: 'sealed' }]);
    await kernel.execute(sql`INSERT INTO owner_passkeys VALUES ('a', 'owner', 'key', 'public', 0, 'localhost')`);
    await assert.rejects(kernel.execute(sql`INSERT INTO owner_passkeys VALUES ('a', 'other', 'key', 'public', 0, 'localhost')`));
  });
}
