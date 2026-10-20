import assert from 'node:assert/strict';
import test from 'node:test';
import type { VaultRecord } from '@jini-ai/platform/secrets/credential-sets';
import type { TovuVaultPolicy } from '#src/platform/secrets/vault-kinds';
import { legacyContext } from '../vault-boot.js';
import { legacyVaultAad, normalizeLegacyVaultPayload, type VaultLegacyContext } from '../vault-legacy-codecs.js';

const record: VaultRecord = { workspaceId: 'ws', id: 'id', kind: 'vendor', ownerKey: 'tovu', principalId: null,
  binding: null, provider: null, label: 'Label', isDefault: true, revision: 1, sealed: null,
  last4: null, tokenLength: null, meta: {}, createdAt: '2026-10-20', updatedAt: '2026-10-20' };
const legacy: VaultLegacyContext = { table: 'custom_credential_sets', workspaceId: 'ws', id: 'id',
  principalId: null, provider: null, serverId: null, aadVersion: 1 };
const policy: TovuVaultPolicy = { validateMeta: ({ meta }) => meta, tokenField: () => 'token',
  legacyPublishCredential: () => ({ vendorId: 'target', tokenField: 'apiToken' }) };

test('L005: historical AAD lineages pin exact bytes and reject wrong kinds/versions/scopes', () => {
  const cases: { table: string; row: Partial<VaultRecord>; context?: Partial<VaultLegacyContext>; aad: string; zero?: boolean }[] = [
    { table: 'site_assistant_credentials', row: { kind: 'site-assistant' }, aad: 'site-assistant-credential:v1:ws', zero: true },
    { table: 'admin_execution_credentials', row: { kind: 'personal-execution', principalId: 'person' }, context: { principalId: 'person' }, aad: 'admin-execution-credential:v1:ws:person', zero: true },
    { table: 'media_provider_credentials', row: { kind: 'media-provider', provider: 'media' }, context: { provider: 'media' }, aad: 'media-provider-credential:v1:ws:media', zero: true },
    { table: 'custom_credential_sets', row: { meta: { credentialType: 'custom' } }, aad: 'custom-credential-set:v1:ws:id' },
    { table: 'publish_content_peers', row: { kind: 'publish-peer' }, aad: 'publish-content-peer:v1:ws:id' },
    { table: 'database_transfer_destinations', row: { kind: 'database-destination' }, aad: 'database-transfer-destination:v1:ws' },
    { table: 'vendor_credential_sets', row: { provider: 'vendor' }, context: { provider: 'vendor' }, aad: 'vendor-credential-set:v1:ws:vendor:id' },
    { table: 'source_control_credential_sets', row: { kind: 'source-control', provider: 'git' }, context: { provider: 'git' }, aad: 'source-control-credential-set:v1:ws:git:id' },
    { table: 'publish_credential_sets', row: {}, context: { provider: 'host' }, aad: 'publish-credential-set:v1:ws:host:id' },
    { table: 'external_mcp_servers', row: { kind: 'mcp-env', ownerKey: 'server' }, context: { serverId: 'server' }, aad: 'external-mcp-env:v1:ws:server', zero: true },
    { table: 'external_mcp_servers', row: { kind: 'mcp-auth', ownerKey: 'server' }, context: { serverId: 'server' }, aad: 'external-mcp-oauth:v1:ws:server', zero: true },
    { table: 'secrets_vault_custom_v1', row: { meta: { credentialType: 'custom' } }, aad: 'secrets-vault:v1:["ws","id","custom","tovu",null,null]' },
  ];
  for (const entry of cases) {
    const row = { ...record, ...entry.row };
    const context = { ...legacy, ...entry.context, table: entry.table };
    assert.equal(legacyVaultAad({ record: row, legacy: context }), entry.aad, entry.table);
    if (entry.zero) assert.equal(legacyVaultAad({ record: row, legacy: { ...context, aadVersion: 0 } }), undefined);
    else assert.throws(() => legacyVaultAad({ record: row, legacy: { ...context, aadVersion: 0 } }));
    for (const aadVersion of [-1, 2, 0.5, NaN]) assert.throws(() => legacyVaultAad({ record: row, legacy: { ...context, aadVersion } }));
    assert.throws(() => legacyVaultAad({ record: row, legacy: { ...context, workspaceId: 'other' } }));
    assert.throws(() => legacyVaultAad({ record: { ...row, kind: 'wrong' as VaultRecord['kind'] }, legacy: context }));
  }
  assert.throws(() => legacyVaultAad({ record, legacy: { ...legacy, table: 'unknown' } }));
  for (const field of ['id', 'ownerKey', 'provider', 'principalId', 'binding'] as const) {
    assert.throws(() => legacyVaultAad({ record: { ...record, meta: { credentialType: 'custom' }, [field]: 'other' }, legacy: { ...legacy, table: 'secrets_vault_custom_v1' } }));
  }
});

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

function normalize({ row, plaintext }: { row: VaultRecord; plaintext: string | null },
  { context = legacy, injected = policy }: { context?: VaultLegacyContext; injected?: TovuVaultPolicy } = {}) {
  return normalizeLegacyVaultPayload({ record: row, legacy: context, plaintext, policy: injected });
}

test('L005: payload normalization pins null/plain/JSON, username precedence, publish mapping and MCP hints', () => {
  assert.deepEqual(normalize({ row: { ...record, meta: { normalization: 'missing-key', legacyAad: {}, keep: true } }, plaintext: null }), { payload: null, meta: { keep: true }, provider: null });
  for (const kind of ['site-assistant', 'personal-execution', 'media-provider', 'publish-peer'] as const)
    assert.deepEqual(normalize({ row: { ...record, kind }, plaintext: 'plain' }), { payload: { apiKey: 'plain' }, meta: {}, provider: null, hintToken: 'plain' });
  assert.deepEqual(normalize({ row: { ...record, kind: 'database-destination' }, plaintext: 'connection' }), { payload: { connectionString: 'connection' }, meta: {}, provider: null });
  for (const text of ['null', '[]', '1', '"string"', 'invalid']) assert.throws(() => normalize({ row: record, plaintext: text }));
});

test('L005: custom usernames, publish discriminators and MCP token hints retain their historical contracts', () => {
  for (const username of [undefined, null, 'saved']) {
    const row = { ...record, meta: { credentialType: 'custom', ...(username === undefined ? {} : { username }) } };
    const result = normalize({ row, plaintext: '{"username":"sealed","token":"plain"}' });
    assert.equal(result.meta.username, username === 'saved' ? 'saved' : 'sealed');
    assert.deepEqual(result.payload, { token: 'plain' });
    assert.equal(result.hintToken, 'plain');
    assert.deepEqual(row.meta, { credentialType: 'custom', ...(username === undefined ? {} : { username }) });
  }
  for (const username of ['', null, 1]) assert.equal(normalize({ row: { ...record, meta: { credentialType: 'custom' } }, plaintext: JSON.stringify({ username }) }).meta.username, undefined);
  for (const kind of ['mcp-env', 'mcp-auth'] as const) assert.equal(normalize({ row: { ...record, kind }, plaintext: '{"token":"plain","schemaVersion":1}' }).hintToken, undefined);
  assert.equal(normalize({ row: record, plaintext: '{"token":1}' }).hintToken, undefined);
  assert.equal(normalize({ row: record, plaintext: '{}' }, { injected: { ...policy, tokenField: () => undefined } }).hintToken, undefined);
  assert.deepEqual(normalize({ row: record, plaintext: '{"providerId":"old","apiToken":"plain"}' }, { context: { ...legacy, table: 'publish_credential_sets', provider: 'host' } }),
    { payload: { vendorId: 'target', apiToken: 'plain' }, meta: {}, provider: 'target', hintToken: 'plain' });
  assert.throws(() => normalize({ row: record, plaintext: '{}' }, { context: { ...legacy, table: 'publish_credential_sets' }, injected: { ...policy, legacyPublishCredential: () => undefined } }), /VAULT_CATALOG_UNAVAILABLE/);
});
