import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { InMemoryExternalMcpServerRepo } from '../external-mcp-store.memory.js';
import { SqlExternalMcpServerRepo } from '../external-mcp-repo.js';
import { applyExternalMcpAccess, externalMcpAccessSnapshot } from '../external-mcp-store.js';
import type { ExternalMcpServerRecord, ExternalMcpServerRepoPort } from '../contracts.js';
import { describeEachDialect } from '../../../platform/db/kernel/__tests__/dialect-matrix.js';
import { ensureVaultRepoFixture } from '../../../platform/db/repos/__tests__/vault-repo.fixture.js';
import type { ContentKernel } from '../../../platform/db/content-kernel.js';
import { InMemoryKeyring } from '../../webhooks/keyring.memory.js';
import { AesGcmSecretSealer } from '../../webhooks/secret-sealer.aesgcm.js';
import { sealExternalMcpVaultPayload } from '../external-mcp-vault.js';

const workspaceId = 'ws-access';
const serverId = 'source';
const key = { workspaceId, serverId };
const originalAt = '2026-11-01T00:00:00.000Z';
const appliedAt = '2026-11-06T04:00:00.000Z';
const clock = { nowMs: () => Date.parse(appliedAt) };
const access = { enabled: true, allowedToolNames: ['read', 'write'], writeAllowedToolNames: ['write'] };

function row(overrides: Partial<ExternalMcpServerRecord> = {}): ExternalMcpServerRecord {
  return { ...key, label: 'Source', provisionedByPluginId: 'plugin', transport: 'streamable_http', authMode: 'oauth', enabled: false,
    command: null, url: 'https://example.test/mcp', args: null, allowedToolNames: '[]', writeAllowedToolNames: '[]',
    writeGrantsUpdatedByPrincipalId: null, writeGrantsUpdatedAt: null, envNames: null, sealedEnv: null,
    oauthProviderId: null, oauthGrant: 'authorization_code', oauthClientId: 'client', oauthEndpointsJson: null,
    oauthScopesJson: '["read"]', oauthStatus: 'connected', oauthExpiresAt: null, oauthTokenEnvName: null,
    oauthRefreshLeaseUntil: null, sealedOAuth: null, aadVersion: 1, oauthAadVersion: 1,
    createdAt: originalAt, updatedAt: originalAt, ...overrides };
}

async function sqlRepo(kernel: ContentKernel): Promise<ExternalMcpServerRepoPort> {
  await ensureVaultRepoFixture({ kernel });
  await kernel.run(db => db.insertInto('workspaces').values({ id: workspaceId, name: workspaceId, slug: workspaceId, created_at: originalAt })
    .onConflict(oc => oc.column('id').doNothing()).execute());
  return new SqlExternalMcpServerRepo(kernel);
}

async function oauthEnvelope(value: string) {
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  return sealExternalMcpVaultPayload({ deps: { keyring, sealer }, identity: key, kind: 'mcp-auth', payload: { tokens: { accessToken: value } } });
}

function contract(make: () => Promise<ExternalMcpServerRepoPort> | ExternalMcpServerRepoPort) {
  test('access-only application preserves concurrently refreshed credentials and all other columns', async () => {
    const repo = await make();
    const original = row({ sealedOAuth: await oauthEnvelope('initial-test-value') });
    await repo.upsert(original);
    const expected = externalMcpAccessSnapshot({ record: original });
    const refreshed = { ...original, label: 'Renamed during approval', sealedOAuth: await oauthEnvelope('rotated-test-value'),
      oauthExpiresAt: appliedAt, oauthRefreshLeaseUntil: appliedAt, updatedAt: appliedAt };
    await repo.upsert(refreshed);
    await applyExternalMcpAccess({ repo, clock, ...key, expected, access, principalId: 'person' });
    assert.deepEqual(await repo.findByServerId(key), { ...refreshed, enabled: true,
      allowedToolNames: '["read","write"]', writeAllowedToolNames: '["write"]',
      writeGrantsUpdatedByPrincipalId: 'person', writeGrantsUpdatedAt: appliedAt, updatedAt: appliedAt });
  });

  for (const changed of [
    { enabled: true }, { allowedToolNames: '["other"]' }, { writeAllowedToolNames: '["other"]' },
    { provisionedByPluginId: 'other-plugin' }, { url: 'https://other.example.test/mcp' },
    { createdAt: '2026-11-02T00:00:00.000Z' },
    { writeGrantsUpdatedByPrincipalId: 'later-person' }, { writeGrantsUpdatedAt: appliedAt },
  ] satisfies Partial<ExternalMcpServerRecord>[]) {
    test(`a stale ${Object.keys(changed)[0]} snapshot performs zero access writes`, async () => {
      const repo = await make();
      const original = row();
      await repo.upsert(original);
      const expected = externalMcpAccessSnapshot({ record: original });
      const current = { ...original, ...changed };
      await repo.upsert(current);
      await assert.rejects(applyExternalMcpAccess({ repo, clock, ...key, expected, access, principalId: 'person' }), /changed|stale/i);
      assert.deepEqual(await repo.findByServerId(key), current);
    });
  }

  test('two approvals prepared at the same revision cannot both replace access', async () => {
    const repo = await make();
    const original = row();
    await repo.upsert(original);
    const expected = externalMcpAccessSnapshot({ record: original });
    const outcomes = await Promise.allSettled([
      applyExternalMcpAccess({ repo, clock, ...key, expected, access, principalId: 'first' }),
      applyExternalMcpAccess({ repo, clock, ...key, expected, access: { ...access, allowedToolNames: ['other'], writeAllowedToolNames: [] }, principalId: 'second' }),
    ]);
    assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter(outcome => outcome.status === 'rejected').length, 1);
  });

  test('a later access decision with unchanged grants invalidates an earlier snapshot', async () => {
    const repo = await make();
    const original = row({ enabled: true });
    await repo.upsert(original);
    const expected = externalMcpAccessSnapshot({ record: original });
    assert.equal(await repo.updateAccessIfCurrent({ ...key, expected,
      access: { enabled: true, allowedToolNames: '[]', writeAllowedToolNames: '[]' },
      principalId: 'later-person', nowIso: appliedAt }), true);
    const current = await repo.findByServerId(key);
    await assert.rejects(applyExternalMcpAccess({ repo, clock, ...key, expected, access, principalId: 'earlier-reader' }), /changed|stale/i);
    assert.deepEqual(await repo.findByServerId(key), current);
  });

  test('a deleted source is not recreated by access approval', async () => {
    const repo = await make();
    const original = row();
    await repo.upsert(original);
    const expected = externalMcpAccessSnapshot({ record: original });
    await repo.deleteByServerId(key);
    await assert.rejects(applyExternalMcpAccess({ repo, clock, ...key, expected, access, principalId: 'person' }), /changed|stale/i);
    assert.equal(await repo.findByServerId(key), null);
  });

  test('undeclared write names and oversized allowlists fail before writes', async () => {
    const repo = await make();
    const original = row();
    await repo.upsert(original);
    const expected = externalMcpAccessSnapshot({ record: original });
    await assert.rejects(applyExternalMcpAccess({ repo, clock, ...key, expected,
      access: { ...access, allowedToolNames: ['read'] }, principalId: 'person' }), /write|allowed/i);
    await assert.rejects(applyExternalMcpAccess({ repo, clock, ...key, expected,
      access: { ...access, allowedToolNames: Array.from({ length: 65 }, (_, index) => `tool_${index}`), writeAllowedToolNames: [] }, principalId: 'person' }), /64|maximum|many/i);
    assert.deepEqual(await repo.findByServerId(key), original);
  });
}

describe('external MCP access-only update [memory]', () => contract(() => new InMemoryExternalMcpServerRepo()));
describeEachDialect('external MCP access-only update', { tables: ['workspaces'], make: sqlRepo }, make => contract(make));
