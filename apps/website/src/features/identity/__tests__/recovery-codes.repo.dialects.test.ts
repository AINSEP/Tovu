import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sql } from 'kysely';
import { eachDialect } from '#src/platform/db/kernel/__tests__/dialect-matrix';
import { createIdentityTransactions } from '../repo.js';
import { createRecoveryCodeStore } from '../recovery-codes.repo.js';

for (const adapter of eachDialect({ tables: ['owner_recovery_codes'], make: kernel => kernel })) {
  test(`[${adapter.name}] recovery hashes persist with owner/workspace scope and roll back with identity writes`, async t => {
    const kernel = adapter.make();
    if (adapter.dialect === 'sqlite') t.after(() => kernel.close());
    const codes = createRecoveryCodeStore({ kernel }, {});
    const transactions = createIdentityTransactions({ kernel });
    const scope = { workspaceId: 'a', principalId: 'owner' };
    await transactions.run({ workspaceId: 'a', execute: () => codes.replace({ ...scope, hashes: ['first', 'second'] }) });
    assert.equal(await codes.contains({ ...scope, hash: 'first' }), true);
    assert.equal(await codes.contains({ ...scope, workspaceId: 'b', hash: 'first' }), false);
    assert.equal(await codes.contains({ ...scope, principalId: 'other-owner', hash: 'first' }), false);
    await assert.rejects(transactions.run({ workspaceId: 'a', execute: async () => {
      await codes.clear(scope);
      throw new Error('injected password verification failure');
    } }));
    assert.equal(await codes.contains({ ...scope, hash: 'first' }), true);
    await transactions.run({ workspaceId: 'a', execute: () => codes.replace({ ...scope, hashes: ['rotated'] }) });
    assert.equal(await codes.contains({ ...scope, hash: 'first' }), false);
    assert.equal(await codes.contains({ ...scope, hash: 'rotated' }), true);
    assert.deepEqual(await kernel.query(sql`SELECT workspace_id, principal_id, code_hash FROM owner_recovery_codes`),
      [{ workspace_id: 'a', principal_id: 'owner', code_hash: 'rotated' }]);
    await transactions.run({ workspaceId: 'a', execute: () => codes.clear(scope) });
    assert.equal(await codes.contains({ ...scope, hash: 'rotated' }), false);
  });

  test(`[${adapter.name}] failed replacement preserves the prior kit and rejects oversized kits`, async t => {
    const kernel = adapter.make();
    if (adapter.dialect === 'sqlite') t.after(() => kernel.close());
    const codes = createRecoveryCodeStore({ kernel }, {});
    const scope = { workspaceId: 'a', principalId: 'owner' };
    const transactions = createIdentityTransactions({ kernel });
    const replace = (hashes: string[]) => transactions.run({ workspaceId: scope.workspaceId, execute: () => codes.replace({ ...scope, hashes }) });
    await replace(['kept']);
    await assert.rejects(replace(['duplicate', 'duplicate']));
    assert.equal(await codes.contains({ ...scope, hash: 'kept' }), true);
    await assert.rejects(replace(Array.from({ length: 11 }, (_, index) => `hash-${index}`)), RangeError);
    assert.equal(await codes.contains({ ...scope, hash: 'kept' }), true);
  });

}
