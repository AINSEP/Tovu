import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryVaultRepo, buildVaultAad } from '@jini-ai/platform/secrets/credential-sets';
import { siteGrantedSealer, ownerKeyHandleOnly } from '../site-sealer.js';
import { fakeAttachments, vaultRow } from './helpers.js';

test('retaining a sealed owner row cannot bypass a later site revocation', async () => {
  const vault = new InMemoryVaultRepo({});
  const attachments = fakeAttachments();
  const sealed = { keyId: 'v1', alg: 'aes-256-gcm' as const, ciphertext: 'sealed-fixture', nonce: 'nonce-fixture' };
  const row = { ...vaultRow(), sealed };
  await vault.put({ record: row, expectedRevision: null });
  await attachments.attach({ siteId: 'a', keyId: row.id, siteName: 'A' });
  let opens = 0;
  const sealer = siteGrantedSealer({ allowed: ({ credentialId }) => attachments.isAttached({ siteId: 'a', keyId: credentialId }),
    sealer: { open: async () => { opens++; return 'fixture-token'; }, seal: async () => sealed } });
  const aad = buildVaultAad(row);
  assert.equal(await sealer.open({ sealed }, { aad }), 'fixture-token');
  await attachments.detach({ siteId: 'a', keyId: row.id });
  await assert.rejects(sealer.open({ sealed }, { aad }));
  assert.equal(opens, 1);
});

test('a site receives only an active owner key handle and cannot derive owner key bytes', async () => {
  let derivations = 0;
  const keyring = ownerKeyHandleOnly({ keyring: { activeKey: async (...args: unknown[]) => {
    assert.equal(args.length, 0, 'the host keyring uses its existing zero-argument ABI');
    return { keyId: 'v1' };
  },
    derive: async () => { derivations++; return new Uint8Array(32); },
    deriveSigningSecret: async () => { derivations++; return new Uint8Array(32); } } });
  assert.deepEqual(await keyring.activeKey(), { keyId: 'v1' });
  await assert.rejects(keyring.derive({ workspaceId: 'project', purpose: 'secrets', info: 'anything' }));
  assert.equal(derivations, 0);
});

test('a revoke committed during asynchronous crypto prevents returning plaintext', async () => {
  let allowed = true;
  const sealer = siteGrantedSealer({ allowed: async () => allowed,
    sealer: { seal: async () => assert.fail('must not seal'), open: async () => { allowed = false; return 'private-fixture'; } } });
  await assert.rejects(sealer.open({ sealed: { keyId: 'v1', alg: 'fixture', nonce: 'fixture', ciphertext: 'fixture' } },
    { aad: buildVaultAad(vaultRow()) }), /no longer has access/);
});

test('human saves forward plaintext, key handle and exact row AAD unchanged', async () => {
  const input = { plaintext: 'fixture-token', key: { keyId: 'v1' }, aad: buildVaultAad(vaultRow()) };
  const sealed = { keyId: 'v1', alg: 'aes-256-gcm', ciphertext: 'fixture', nonce: 'fixture' };
  const calls: unknown[] = [];
  const sealer = siteGrantedSealer({ allowed: async () => assert.fail('human saves do not read site grants'),
    sealer: { seal: async value => { calls.push(value); return sealed; }, open: async () => assert.fail('must not open') } });
  assert.equal(await sealer.seal(input), sealed);
  assert.deepEqual(calls, [input]);
});
