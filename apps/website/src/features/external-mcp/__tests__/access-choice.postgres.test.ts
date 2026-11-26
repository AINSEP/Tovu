import { externalMcpVaultPorts } from '#src/features/external-mcp/external-mcp-vault';
import { SqlSecretsVaultRepo, type SecretsVaultDatabase } from '@jini-ai/db/secrets-vault';
import { schemaErasedKernel } from '#src/platform/db/content-kernel';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { dropDatabase, freshPostgresDatabase } from '../../../platform/db/__tests__/postgres-database.js';
import { migrateContentDatabase } from '../../../platform/db/migrations/index.js';
import { openPostgresKernel } from '../../../platform/db/kernel/drivers/postgres.js';
import type { KyselyKernel } from '@jini-ai/db/kernel';
import type { ContentDatabase } from '../../../platform/db/content-database.generated.js';
import type { ContentKernel } from '../../../platform/db/content-kernel.js';
import { ensureVaultRepoFixture } from '../../../platform/db/repos/__tests__/vault-repo.fixture.js';
import { SqlExternalMcpServerRepo } from '@jini-ai/mcp/federation/hosted/external-mcp-repo';
import { externalMcpAccessSnapshot } from '@jini-ai/mcp/federation/hosted';
import type { ExternalMcpServerRecord } from '@jini-ai/core/contracts/hosted-mcp';

const database = 'tovu_external_mcp_choice_test';
const identity = { workspaceId: 'ws-choice', serverId: 'source' };
const nowIso = '2026-11-06T00:00:00.000Z';
let first: ContentKernel; let second: ContentKernel;

before(async () => {
  const connectionString = freshPostgresDatabase(database);
  first = openPostgresKernel<ContentDatabase>({ connectionString });
  await migrateContentDatabase({ kernel: first as KyselyKernel<unknown> });
  await ensureVaultRepoFixture({ kernel: first });
  second = openPostgresKernel<ContentDatabase>({ connectionString });
  await first.run(db => db.insertInto('workspaces').values({ id: identity.workspaceId, name: 'Choice fixture', slug: 'choice-fixture', created_at: nowIso }).execute());
});
after(async () => {
  await second?.close(); await first?.close();
  dropDatabase({ database });
});

test('independent connections cannot both apply an access decision from the same snapshot', async () => {
  const original: ExternalMcpServerRecord = { ...identity, label: 'Source', provisionedByPluginId: 'plugin',
    transport: 'streamable_http', authMode: 'none', enabled: true, command: null, url: 'https://example.test/mcp', args: null,
    allowedToolNames: '[]', writeAllowedToolNames: '[]', writeGrantsUpdatedByPrincipalId: null, writeGrantsUpdatedAt: null,
    envNames: null, sealedEnv: null, oauthProviderId: null, oauthGrant: null, oauthClientId: null, oauthEndpointsJson: null,
    oauthScopesJson: null, oauthStatus: null, oauthExpiresAt: null, oauthTokenEnvName: null, oauthRefreshLeaseUntil: null,
    sealedOAuth: null, aadVersion: 1, oauthAadVersion: 1, createdAt: nowIso, updatedAt: nowIso, version: 1 };
  const repos = [new SqlExternalMcpServerRepo({ kernel: { ...schemaErasedKernel({ store: first }), query: statement => first.query(statement) }, vaultRepo: new SqlSecretsVaultRepo({ kernel: first as unknown as KyselyKernel<SecretsVaultDatabase> }), tables: { servers: 'external_mcp_servers', vault: 'secrets_vault' }, vaultErrors: externalMcpVaultPorts.vaultErrors }), new SqlExternalMcpServerRepo({ kernel: { ...schemaErasedKernel({ store: second }), query: statement => second.query(statement) }, vaultRepo: new SqlSecretsVaultRepo({ kernel: second as unknown as KyselyKernel<SecretsVaultDatabase> }), tables: { servers: 'external_mcp_servers', vault: 'secrets_vault' }, vaultErrors: externalMcpVaultPorts.vaultErrors })];
  await repos[0]!.upsert(original);
  const expected = externalMcpAccessSnapshot({ record: original });
  const outcomes = await Promise.all(repos.map((repo, index) => repo.updateAccessIfCurrent({ ...identity, expected,
    access: { enabled: true, allowedToolNames: '[]', writeAllowedToolNames: '[]' }, principalId: `person-${index}`, nowIso })));
  assert.deepEqual(outcomes.sort(), [false, true]);
  const current = await repos[0]!.findByServerId(identity);
  assert.equal(current?.allowedToolNames, '[]');
  assert.ok(current?.writeGrantsUpdatedByPrincipalId?.startsWith('person-'));
});
