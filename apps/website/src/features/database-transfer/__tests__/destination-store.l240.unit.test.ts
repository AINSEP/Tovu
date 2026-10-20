import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryVaultRepo, VaultError } from '@jini-ai/platform/secrets/credential-sets';
import { SealedDatabaseDestinationStore } from '../destination-store.js';
import { InMemoryKeyring } from '../../webhooks/keyring.memory.js';
import { AesGcmSecretSealer } from '../../webhooks/secret-sealer.aesgcm.js';

const destination = { connectionString: 'postgres://owner@db.example.test/db', savedAt: '2026-10-01T00:00:00.000Z',
  description: { host: 'db.example.test', port: '5432', database: 'db', user: 'owner' } };
const run = { copied: true, snapshotAt: '2026-10-02T00:00:00.000Z', tableCount: 1, rowCount: 2 } as const;
const scope = { workspaceId: 'ws', kind: 'database-destination' as const };

function fixture(_required = {}, _options = {}) {
  class RacingRepo extends InMemoryVaultRepo {
    attempts = 0;
    beforePatch: () => Promise<void> = async () => {};
    override async patchMeta(input: Parameters<InMemoryVaultRepo['patchMeta']>[0]) {
      this.attempts++;
      await this.beforePatch();
      return super.patchMeta(input);
    }
  }
  const repo = new RacingRepo({});
  const keyring = new InMemoryKeyring();
  const store = new SealedDatabaseDestinationStore({ repo, keyring, sealer: new AesGcmSecretSealer(keyring) });
  return { repo, store };
}

test('recordRun without a destination does not create a vault row', async () => {
  const { repo, store } = fixture();
  await store.recordRun('ws', run);
  assert.equal(repo.attempts, 0);
  assert.equal(await repo.findOne(scope), null);
});
for (const conflicts of [0, 1, 2, 3]) {
  test(`recordRun retries at most three times (${conflicts} conflicts)`, async () => {
    const { repo, store } = fixture();
    await store.save('ws', destination);
    const original = await repo.findOne(scope);
    const failure = new VaultError({ code: 'conflict' });
    repo.beforePatch = async () => { if (repo.attempts <= conflicts) throw failure; };
    if (conflicts === 3) await assert.rejects(store.recordRun('ws', run), error => error === failure);
    else await store.recordRun('ws', run);
    assert.equal(repo.attempts, Math.min(conflicts + 1, 3));
    assert.deepEqual(await store.lastRun('ws'), conflicts === 3 ? null : run);
    assert.deepEqual((await repo.findOne(scope))?.sealed, original?.sealed);
  });
}
for (const failure of [new Error('repo unavailable'), new VaultError({ code: 'invalid-record' })]) {
  test(`recordRun propagates ${failure.message} without retrying`, async () => {
    const { repo, store } = fixture();
    await store.save('ws', destination);
    repo.beforePatch = async () => { throw failure; };
    await assert.rejects(store.recordRun('ws', run), error => error === failure);
    assert.equal(repo.attempts, 1);
    assert.equal(await store.lastRun('ws'), null);
  });
}
for (const change of ['identity', 'envelope', 'deletion', 'metadata'] as const) {
  test(`recordRun preserves concurrent ${change}`, async () => {
    const { repo, store } = fixture();
    await store.save('ws', destination);
    const original = await repo.findOne(scope);
    assert.ok(original);
    repo.beforePatch = async () => {
      repo.beforePatch = async () => {};
      if (change === 'deletion' || change === 'identity') {
        await repo.delete({ workspaceId: 'ws', id: original.id, expectedRevision: original.revision });
        if (change === 'identity') await repo.put({ record: { ...original, id: 'replacement', revision: 1 }, expectedRevision: null });
      } else if (change === 'envelope') {
        await store.save('ws', { ...destination, connectionString: 'postgres://owner@new.example.test/db' });
      } else {
        await repo.patchMeta({ workspaceId: 'ws', id: original.id, expectedRevision: original.revision,
          patch: { lastRun: { copied: false, snapshotAt: 'earlier', code: 'other', message: 'other run' } }, updatedAt: destination.savedAt });
      }
      throw new VaultError({ code: 'conflict' });
    };
    await store.recordRun('ws', run);
    assert.deepEqual(await store.lastRun('ws'), change === 'metadata' ? run : null);
    assert.equal(repo.attempts, change === 'metadata' ? 3 : 1);
    const current = await repo.findOne(scope);
    if (change === 'identity') assert.equal(current?.id, 'replacement');
    if (change === 'envelope') assert.notDeepEqual(current?.sealed, original.sealed);
    if (change === 'deletion') assert.equal(current, null);
    if (change === 'metadata') assert.deepEqual(current?.sealed, original.sealed);
  });
}
