import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sql } from 'kysely';
import { eachDialect } from '#src/platform/db/kernel/__tests__/dialect-matrix';
import { createIdentityTransactions } from '../repo.js';
import { createMfaStore } from '../mfa.repo.js';

for (const adapter of eachDialect({ tables: ['owner_mfa_factors', 'owner_mfa_pending'], make: kernel => kernel })) {
  test(`[${adapter.name}] owner MFA persists only sealed factors and scopes every operation`, async t => {
    const kernel = adapter.make();
    if (adapter.dialect === 'sqlite') t.after(() => kernel.close());
    const store = createMfaStore({ kernel });
    const scope = { workspaceId: 'a', principalId: 'owner' };
    assert.equal(await store.factor(scope), null);
    const factor = { ...scope, sealedSecret: 'sealed', lastStep: 100 };
    await store.saveFactor(factor);
    assert.deepEqual(await store.factor(scope), factor);
    assert.equal(await store.factor({ ...scope, workspaceId: 'b' }), null);
    assert.equal(await store.factor({ ...scope, principalId: 'other' }), null);
    await store.saveFactor({ ...factor, lastStep: 101 });
    assert.equal((await store.factor(scope))?.lastStep, 101);
    const pending = { ...scope, purpose: 'login' as const, tokenHash: 'first', expiresAt: 1_800_000_000_000, attempts: 0 };
    await store.savePending(pending);
    assert.deepEqual(await store.pending({ workspaceId: 'a', tokenHash: 'first' }), pending);
    assert.equal(await store.pending({ workspaceId: 'b', tokenHash: 'first' }), null);
    await store.savePending({ ...pending, tokenHash: 'second', attempts: 1 });
    assert.equal(await store.pending({ workspaceId: 'a', tokenHash: 'first' }), null);
    assert.equal((await store.pending({ workspaceId: 'a', tokenHash: 'second' }))?.attempts, 1);
    await store.savePending({ ...pending, purpose: 'enroll', tokenHash: 'enroll', sealedSecret: 'pending-sealed' });
    assert.equal((await store.pending({ workspaceId: 'a', tokenHash: 'enroll' }))?.sealedSecret, 'pending-sealed');
    await store.saveFactor({ ...factor, workspaceId: 'b' });
    await store.savePending({ ...pending, workspaceId: 'b' });
    await store.clearPending(scope);
    assert.equal(await store.pending({ workspaceId: 'a', tokenHash: 'second' }), null);
    assert.equal(await store.pending({ workspaceId: 'a', tokenHash: 'enroll' }), null);
    assert.ok(await store.factor(scope));
    await store.clear(scope);
    assert.equal(await store.factor(scope), null);
    assert.ok(await store.factor({ ...scope, workspaceId: 'b' }));
    assert.ok(await store.pending({ workspaceId: 'b', tokenHash: 'first' }));
  });

  test(`[${adapter.name}] MFA writes join identity rollback and concurrent proofs have one winner`, async t => {
    const kernel = adapter.make();
    if (adapter.dialect === 'sqlite') t.after(() => kernel.close());
    const store = createMfaStore({ kernel });
    const transactions = createIdentityTransactions({ kernel });
    const scope = { workspaceId: 'a', principalId: 'owner' };
    const factor = { ...scope, sealedSecret: 'sealed', lastStep: 10 };
    const pending = { ...scope, purpose: 'login' as const, tokenHash: 'proof', expiresAt: 1_800_000_000_000, attempts: 0 };
    await store.saveFactor(factor);
    await store.savePending(pending);
    await assert.rejects(transactions.run({ workspaceId: 'a', execute: async () => {
      await store.clear(scope);
      throw new Error('injected session failure');
    } }));
    assert.deepEqual(await store.factor(scope), factor);
    assert.deepEqual(await store.pending({ workspaceId: 'a', tokenHash: 'proof' }), pending);
    const complete = () => transactions.run({ workspaceId: 'a', execute: async () => {
      const current = await store.factor(scope);
      const proof = await store.pending({ workspaceId: 'a', tokenHash: 'proof' });
      if (!current || !proof || current.lastStep >= 11) return false;
      await store.saveFactor({ ...current, lastStep: 11 });
      await store.clearPending(scope);
      return true;
    } });
    assert.deepEqual((await Promise.all([complete(), complete()])).sort(), [false, true]);
    assert.equal((await store.factor(scope))?.lastStep, 11);
    assert.equal(await store.pending({ workspaceId: 'a', tokenHash: 'proof' }), null);
    await store.savePending(pending);
    await assert.rejects(store.savePending({ ...pending, principalId: 'different' }));
    assert.equal((await kernel.query(sql`SELECT token_hash FROM owner_mfa_pending`)).length, 1);
  });
}
