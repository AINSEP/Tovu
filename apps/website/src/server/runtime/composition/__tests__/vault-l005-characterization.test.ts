import assert from 'node:assert/strict';
import test from 'node:test';
import type { VaultRecord } from '@jini-ai/core/contracts/vault';
import { legacyContext } from '../vault-boot.js';
import type { VaultLegacyContext } from '@jini-ai/platform/secrets/legacy-codecs';

const record: VaultRecord = { workspaceId: 'ws', id: 'id', kind: 'vendor', ownerKey: 'tovu', principalId: null,
  binding: null, provider: null, label: 'Label', isDefault: true, revision: 1, sealed: null,
  last4: null, tokenLength: null, meta: {}, createdAt: '2026-10-20', updatedAt: '2026-10-20' };
const legacy: VaultLegacyContext = { table: 'custom_credential_sets', workspaceId: 'ws', id: 'id',
  principalId: null, provider: null, serverId: null, aadVersion: 1 };

// The legacy AAD/payload codec characterization moved with the codec to Jini
// (`@jini-ai/platform` src/secrets/__tests__/legacy-codecs.test.ts); boot's context reader stays here.
test('L005: legacy metadata requires matching migration identity and nullable string fields', () => {
  assert.equal(legacyContext({ record }), null);
  const meta = { legacyAad: { ...legacy }, migration: { ...legacy, mappedId: record.id } };
  assert.deepEqual(legacyContext({ record: { ...record, meta } }), legacy);
  for (const value of [null, [], 'text', 7]) {
    assert.throws(() => legacyContext({ record: { ...record, meta: { ...meta, legacyAad: value } } }));
    assert.throws(() => legacyContext({ record: { ...record, meta: { ...meta, migration: value } } }));
  }
  assert.throws(() => legacyContext({ record: { ...record, meta: { legacyAad: { ...legacy } } } }));
  for (const field of Object.keys(legacy)) {
    assert.throws(() => legacyContext({ record: { ...record, meta: { ...meta, migration: { ...meta.migration, [field]: 'mismatch' } } } }));
    const invalid = { ...legacy, [field]: false };
    assert.throws(() => legacyContext({ record: { ...record, meta: { legacyAad: invalid, migration: { ...invalid, mappedId: record.id } } } }));
  }
});
