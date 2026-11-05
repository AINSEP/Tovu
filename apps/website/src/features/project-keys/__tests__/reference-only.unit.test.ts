import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryVaultRepo } from '@jini-ai/platform/secrets/credential-sets';
import { attachedOnlyVault } from '../attached-vault.js';
import { createProjectKeys } from '../service.js';
import { buildProjectKeyRegistrations } from '../tools.js';
import { fakeAttachments, vaultRow } from './helpers.js';

async function fixture() {
  const vault = new InMemoryVaultRepo({});
  const attachments = fakeAttachments();
  await vault.put({ record: vaultRow(), expectedRevision: null });
  const inputs = { vault, attachments, siteId: 'site-a', siteName: 'A',
    providerUsage: async () => ({ store: 'project' as const, usedByThisSite: false, usedBy: [] }),
    reapply: async () => 'now' as const,
    transaction: async <T>({ run }: { run: () => Promise<T> }) => run() };
  return { vault, attachments, inputs };
}

test('consumer cannot enumerate, guess, or mutate an ungranted owner entry', async () => {
  const { vault, attachments } = await fixture();
  const a = attachedOnlyVault({ vault, attachments, siteId: 'site-a' });
  const b = attachedOnlyVault({ vault, attachments, siteId: 'site-b' });
  await attachments.attach({ siteId: 'site-a', keyId: 'key-a', siteName: 'A' });
  assert.equal((await a.find({ workspaceId: 'project', id: 'key-a' }))?.id, 'key-a');
  assert.equal(await b.find({ workspaceId: 'project', id: 'key-a' }), null);
  assert.deepEqual(await b.list({ workspaceId: 'project', kind: 'vendor', ownerKey: 'tovu', principalId: null }), []);
  await assert.rejects(b.put({ record: { ...vaultRow(), revision: 2 }, expectedRevision: 1 }));
  await assert.rejects(a.delete({ workspaceId: 'project', id: 'key-a', expectedRevision: 1 }));
  await assert.rejects(b.patchMeta({ workspaceId: 'project', id: 'key-a', expectedRevision: 1, patch: {}, updatedAt: 'now' }));
  await assert.rejects(b.applyBatch!({ ops: [{ delete: { workspaceId: 'project', id: 'key-a', expectedRevision: 1 } }] }));
  await attachments.detach({ siteId: 'site-a', keyId: 'key-a' });
  assert.equal(await a.find({ workspaceId: 'project', id: 'key-a' }), null);
  assert.equal((await vault.find({ workspaceId: 'project', id: 'key-a' }))?.revision, 1);
});

test('site metadata list excludes ungranted entries while owner picker can see them', async () => {
  const { inputs } = await fixture();
  const keys = createProjectKeys(inputs);
  assert.deepEqual(await keys.listGranted({}), []);
  assert.equal((await keys.list({}))[0]?.keyId, 'key-a');
  await keys.use({ keyId: 'key-a', use: true });
  assert.equal((await keys.listGranted({}))[0]?.keyId, 'key-a');
  await keys.use({ keyId: 'key-a', use: false });
  assert.deepEqual(await keys.listGranted({}), []);
});

test('model grant without an interactive approval channel fails closed and forged site input is refused', async () => {
  const { inputs, attachments } = await fixture();
  const tools = buildProjectKeyRegistrations({ keys: createProjectKeys(inputs), authorize: async () => {},
    loadCards: async () => [], surfaces: {} as never, restart: null });
  const tool = tools.find(item => item.descriptor.id === 'project_key_use')!;
  const ctx = { executionId: 'grant', principal: { id: 'owner' }, run: { id: 'run' },
    signal: new AbortController().signal, input: { keyId: 'key-a', use: true } };
  await assert.rejects(tool.handler(ctx), /credential_copy_from_project/);
  await attachments.attach({ siteId: 'site-a', keyId: 'key-a', siteName: 'A' });
  await assert.rejects(tool.handler(ctx), /credential_copy_from_project/);
  assert.equal(await attachments.isAttached({ siteId: 'site-a', keyId: 'key-a' }), true);
  await assert.rejects(tool.handler({ ...ctx, input: { ...ctx.input, siteId: 'site-b' } }));
});

test('lookup does not read the owner vault for a guessed ungranted identity', async () => {
  const { vault, attachments } = await fixture();
  let reads = 0;
  const find = vault.find.bind(vault);
  vault.find = async input => { reads++; return find(input); };
  const consumer = attachedOnlyVault({ vault, attachments, siteId: 'site-b' });
  assert.equal(await consumer.find({ workspaceId: 'project', id: 'key-a' }), null);
  assert.equal(reads, 0);
});

test('human-create port cannot replace, delete, or enumerate existing owner entries', async () => {
  const { vault, attachments } = await fixture();
  const { projectKeyCreateVault } = await import('../create-vault.js');
  const view = attachedOnlyVault({ vault, attachments, siteId: 'site-a' });
  const create = projectKeyCreateVault({ owner: vault, view });
  assert.equal(await create.find({ workspaceId: 'project', id: 'key-a' }), null);
  await assert.rejects(create.put({ record: { ...vaultRow(), revision: 2 }, expectedRevision: 1 }));
  await assert.rejects(create.delete({ workspaceId: 'project', id: 'key-a', expectedRevision: 1 }));
  await create.put({ record: { ...vaultRow({ id: 'new-key' }), label: 'New', isDefault: false }, expectedRevision: null });
  assert.equal(await create.find({ workspaceId: 'project', id: 'new-key' }), null, 'a human save still requires its site grant');
});


test('trusted replacement rechecks the grant inside the owner transaction', async () => {
  const { vault, attachments } = await fixture();
  const { projectKeyCreateVault } = await import('../create-vault.js');
  await attachments.attach({ siteId: 'site-a', siteName: 'A', keyId: 'key-a' });
  let transaction = false;
  const view = attachedOnlyVault({ vault, attachments, siteId: 'site-a' });
  const find = view.find;
  view.find = async input => { assert.equal(transaction, true); return find(input); };
  const replace = projectKeyCreateVault({ owner: vault, view }, { allowReplacement: true,
    transaction: async ({ run }) => { transaction = true; try { return await run(); } finally { transaction = false; } } });
  await replace.put({ record: { ...vaultRow(), revision: 2 }, expectedRevision: 1 });
  await attachments.detach({ siteId: 'site-a', keyId: 'key-a' });
  await assert.rejects(replace.put({ record: { ...vaultRow(), revision: 3 }, expectedRevision: 2 }));
  assert.equal((await vault.find({ workspaceId: 'project', id: 'key-a' }))?.revision, 2);
});

test('shared OAuth attach validates its consumer before grant; stop here leaves other sites granted', async () => {
  const { inputs, vault, attachments } = await fixture();
  const row = { ...vaultRow({ id: 'oauth-owner', kind: 'api-connection' }), meta: { credentialFormat: 'oauth-token-set' } };
  await vault.put({ record: row, expectedRevision: null });
  const validated: string[] = [];
  const keys = createProjectKeys({ ...inputs, bindOAuth: async ({ keyId, use }) => {
    assert.equal(await attachments.isAttached({ siteId: 'site-a', keyId }), false);
    validated.push(`${keyId}:${use}`);
  } });
  assert.equal((await keys.list({})).some(item => item.keyId === row.id), true);
  await assert.rejects(createProjectKeys(inputs).use({ keyId: row.id, use: true }), /saved connection/);
  assert.equal(await attachments.isAttached({ siteId: 'site-a', keyId: row.id }), false);
  await keys.use({ keyId: row.id, use: true });
  await attachments.attach({ siteId: 'site-b', siteName: 'B', keyId: row.id });
  await keys.use({ keyId: row.id, use: false });
  assert.deepEqual(validated, ['oauth-owner:true']);
  assert.equal(await attachments.isAttached({ siteId: 'site-a', keyId: row.id }), false);
  assert.equal(await attachments.isAttached({ siteId: 'site-b', keyId: row.id }), true);
});
