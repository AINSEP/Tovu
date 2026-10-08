import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { InMemoryKeyring } from '../../webhooks/keyring.memory.js';
import { AesGcmSecretSealer } from '../../webhooks/secret-sealer.aesgcm.js';
import { CREDENTIAL_MESSAGES } from '../../../contracts/core/credential-token.js';
import { InMemoryExternalMcpServerRepo } from '../../../assistant/external-mcp-store.memory.js';
import { saveExternalMcpServer, readEnabledExternalMcpConfigs, listExternalMcpServerViews } from '../../../assistant/external-mcp-store.js';
import { InMemoryCustomCredentialSetRepo } from '../../custom-credentials/repo.memory.js';
import { createCustomCredential, updateCustomCredential, resolveCustomCredentialByLabel, listCustomCredentials } from '../../custom-credentials/store.js';
import { InMemorySourceControlCredentialSetRepo } from '../../source-control/repo.memory.js';
import { createSourceControlCredential, updateSourceControlCredential, resolveDefaultForSourceControl, listSourceControlCredentials } from '../../source-control/store.js';
import { InMemoryVendorCredentialSetRepo } from '@jini-ai/platform/secrets/credential-sets';
import { createPublishCredential, updatePublishCredential, resolveForPublish, listPublishCredentials } from '../../deployments/publish-credentials/store.js';
import type { DeployTargetRegistry } from '../../deployments/deploy-targets/types.js';
import { InMemoryMediaProviderCredentialRepo } from '../../media/provider-credential-store.memory.js';
import { saveMediaProviderCredentials, resolveMediaProviderCredential, getMediaProviderCredentials } from '../../media/provider-credential-store.js';

const workspaceId = 'credential-safety';
function cryptoDeps() {
  const keyring = new InMemoryKeyring();
  let sequence = 0;
  return { keyring, sealer: new AesGcmSecretSealer(keyring), clock: { nowMs: () => 0, nowIso: () => '1970-01-01T00:00:00.000Z' }, idGen: { newId: () => `credential-${++sequence}` } };
}
const noProviders = async () => ({ list: () => [], get: () => undefined, refusals: [] });
const registry: DeployTargetRegistry = {
  list: () => [registry.get('fixture-host')!], refusals: [],
  get: id => id === 'fixture-host' ? {
    pluginId: 'fixture', module: { create: () => { throw new Error('unused'); } },
    descriptor: { id: 'fixture-host', label: 'Fixture', module: 'fixture.mjs', configFields: [], credential: { vendorId: 'fixture', tokenField: 'apiKey', fields: [{ name: 'apiKey', label: 'Key', required: true, secret: true }] } },
  } : undefined,
};
interface Harness {
  save(value: unknown): Promise<unknown>;
  read(): Promise<string | undefined>;
  hint(): Promise<unknown>;
}
function externalHarness(transport: 'streamable_http' | 'stdio' = 'streamable_http'): Harness {
  const deps = { ...cryptoDeps(), repo: new InMemoryExternalMcpServerRepo() };
  return {
    save: accessToken => saveExternalMcpServer(deps, { workspaceId, serverId: 'fixture', label: 'Fixture', transport, authMode: 'static_env', command: transport === 'stdio' ? 'node' : '', args: '', url: transport === 'stdio' ? undefined : 'https://example.test/mcp', accessToken: accessToken as string, accessTokenEnvName: 'ACCESS_TOKEN', allowedToolNames: '', principalId: 'owner', enabled: true }),
    read: async () => {
      const { configs, failures } = await readEnabledExternalMcpConfigs(deps, workspaceId);
      assert.equal(failures.length, 0);
      const target = configs[0]?.target;
      return target?.kind === 'stdio' ? target.env.ACCESS_TOKEN : target?.headers.authorization?.slice('Bearer '.length);
    },
    hint: async () => (await listExternalMcpServerViews(deps, workspaceId))[0]?.accessTokenHint,
  };
}
function customHarness(): Harness {
  const deps = { ...cryptoDeps(), repo: new InMemoryCustomCredentialSetRepo() };
  let id: string | undefined;
  return {
    save: async token => {
      const result = id ? await updateCustomCredential(deps, { workspaceId, id, connection: { token } }) : await createCustomCredential(deps, { workspaceId, label: 'Fixture', category: 'general', baseUrl: 'https://example.test', connection: { token } });
      id = result.id; return result;
    },
    read: async () => (await resolveCustomCredentialByLabel(deps, { workspaceId, label: 'Fixture' }))?.connection.token,
    hint: async () => (await listCustomCredentials(deps, { workspaceId }))[0]?.tokenHint,
  };
}
function sourceHarness(): Harness {
  const deps = { ...cryptoDeps(), repo: new InMemorySourceControlCredentialSetRepo(), loadSourceControlProviders: noProviders };
  let id: string | undefined;
  return {
    save: async token => {
      const connection = { providerId: 'github', token };
      const result = id ? await updateSourceControlCredential(deps, { workspaceId, id, connection }) : await createSourceControlCredential(deps, { workspaceId, label: 'Fixture', connection });
      id = result.id; return result;
    },
    read: async () => (await resolveDefaultForSourceControl(deps, { workspaceId, providerId: 'github' }))?.connection.token,
    hint: async () => (await listSourceControlCredentials(deps, { workspaceId }))[0]?.tokenHint,
  };
}
function publishHarness(): Harness {
  const deps = { ...cryptoDeps(), repo: new InMemoryVendorCredentialSetRepo({}), loadDeployTargets: async () => registry };
  let id: string | undefined;
  return {
    save: async apiKey => {
      const connection = { providerId: 'fixture-host', apiKey };
      const result = id ? await updatePublishCredential(deps, { workspaceId, id, connection }) : await createPublishCredential(deps, { workspaceId, label: 'Fixture', connection });
      id = result.id; return result;
    },
    read: async () => id ? (await resolveForPublish(deps, { workspaceId, id }))?.connection.apiKey as string : undefined,
    hint: async () => (await listPublishCredentials(deps, { workspaceId }))[0]?.tokenHint,
  };
}
function mediaHarness(): Harness {
  const deps = { ...cryptoDeps(), repo: new InMemoryMediaProviderCredentialRepo() };
  return {
    save: apiKey => saveMediaProviderCredentials(deps, { workspaceId, providers: { openai: { apiKey: apiKey as string } } }),
    read: async () => (await resolveMediaProviderCredential(deps, { workspaceId, providerId: 'openai' }))?.apiKey,
    hint: async () => (await getMediaProviderCredentials(deps, { workspaceId })).openai?.apiKeyHint,
  };
}

test('publish tokenField stays secret and required when a descriptor omits its secret/required flags', async () => {
  const declared = registry.get('fixture-host')!;
  const target = { ...declared, descriptor: { ...declared.descriptor, credential: { ...declared.descriptor.credential!, fields: [{ name: 'apiKey', label: 'Key', required: false }] } } };
  const deps = { ...cryptoDeps(), repo: new InMemoryVendorCredentialSetRepo({}), loadDeployTargets: async () => ({ list: () => [target], get: () => target, refusals: [] }) };
  await assert.rejects(createPublishCredential(deps, { workspaceId, label: 'Fixture', connection: { providerId: 'fixture-host' } }), (error: unknown) => error instanceof Error && error.message === CREDENTIAL_MESSAGES.blank);
  await assert.rejects(createPublishCredential(deps, { workspaceId, label: 'Fixture', connection: { providerId: 'fixture-host', apiKey: 'x'.repeat(8193) } }), (error: unknown) => error instanceof Error && error.message === CREDENTIAL_MESSAGES.limit);
  const saved = await createPublishCredential(deps, { workspaceId, label: 'Fixture', connection: { providerId: 'fixture-host', apiKey: 'fixture-credential-a9F2' } });
  await updatePublishCredential(deps, { workspaceId, id: saved.id, connection: { providerId: 'fixture-host', apiKey: '' } });
  assert.equal((await resolveForPublish(deps, { workspaceId, id: saved.id }))?.connection.apiKey === 'fixture-credential-a9F2', true);
});
const harnesses = { external: externalHarness, custom: customHarness, source: sourceHarness, publish: publishHarness, media: mediaHarness };
const exactError = (message: string) => (error: unknown) => error instanceof Error && error.message === message;
const jwt = (length: number) => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payloadLength = length - header.length - 2 - 43;
  const bytes = Math.floor(payloadLength * 3 / 4);
  const payload = Buffer.from(JSON.stringify({ data: 'x'.repeat(bytes - 11) })).toString('base64url');
  const unsigned = `${header}.${payload}`;
  const signature = createHmac('sha256', 'public-synthetic-test-signing-key').update(unsigned).digest('base64url');
  const value = `${unsigned}.${signature}`;
  assert.equal(value.length, length, 'fixture must be a JWT of the exact requested length');
  return value;
};
for (const [name, create] of Object.entries(harnesses)) {
  test(`${name}: create needs a token; blank update keeps; whitespace update never clears`, async () => {
    for (const value of [undefined, '', ' \n ']) await assert.rejects(create().save(value), exactError(CREDENTIAL_MESSAGES.blank));
    const vault = create(); const entered = jwt(4096);
    await vault.save(entered); await vault.save(''); await vault.save(undefined);
    assert.equal((await vault.read()) === entered, true, 'blank updates preserve the original bytes');
    await assert.rejects(vault.save('   '), exactError(CREDENTIAL_MESSAGES.blank));
    assert.equal((await vault.read()) === entered, true, 'a refused update preserves the original bytes');
  });
  for (const length of [4096, 8192]) test(`${name}: ${length}-character JWT round-trips byte for byte`, async () => {
    const vault = create(); const entered = jwt(length);
    await vault.save(` \n${entered}\n `);
    assert.equal(Buffer.from((await vault.read()) ?? '').equals(Buffer.from(entered)), true, 'unsealed bytes must equal input after edge trim');
    assert.deepEqual(await vault.hint(), { length, last4: entered.slice(-4) });
  });
  test(`${name}: alphabet exact; short hint length only; oversize/non-ASCII rejected`, async () => {
    const vault = create(); const entered = '+/=._-~Aa09';
    await vault.save(entered);
    assert.equal((await vault.read()) === entered, true, 'accepted punctuation is not changed');
    assert.deepEqual(await vault.hint(), { length: entered.length, last4: null });
    await assert.rejects(vault.save('x'.repeat(8193)), exactError(CREDENTIAL_MESSAGES.limit));
    await assert.rejects(vault.save('café_東京'), exactError(CREDENTIAL_MESSAGES.ascii));
    await assert.rejects(vault.save('abc def'), exactError(CREDENTIAL_MESSAGES.ascii));
    assert.equal((await vault.read()) === entered, true, 'rejections preserve the stored token');
  });
}
test('stdio token keeps interior spaces and Unicode exactly', async () => {
  const vault = externalHarness('stdio'); const entered = 'café 東京 +/=._-~';
  await vault.save(` \n${entered}\n `);
  assert.equal(Buffer.from((await vault.read()) ?? '').equals(Buffer.from(entered)), true, 'stdio bytes are preserved');
});
test('stdio JSON env preserves embedded newlines, edge spaces, Unicode and punctuation', async () => {
  const deps = { ...cryptoDeps(), repo: new InMemoryExternalMcpServerRepo() };
  const value = '  café 東京\nsecond +/=._-~\nthird  ';
  await saveExternalMcpServer(deps, { workspaceId, serverId: 'env', transport: 'stdio', authMode: 'static_env', enabled: true, command: 'node', args: '', allowedToolNames: '', principalId: 'owner', env: JSON.stringify({ PRIVATE_VALUE: value }) });
  const { configs } = await readEnabledExternalMcpConfigs(deps, workspaceId);
  const target = configs[0]?.target;
  assert.equal(target?.kind === 'stdio' && Buffer.from(target.env.PRIVATE_VALUE ?? '').equals(Buffer.from(value)), true, 'multiline env is lossless');
});
test('source-control validates before even loading a probe and probes only the durably saved token', async () => {
  const repo = new InMemorySourceControlCredentialSetRepo(); let probes = 0;
  const deps = { ...cryptoDeps(), repo, loadSourceControlProviders: async () => {
    probes++;
    assert.equal((await repo.listByWorkspace({ workspaceId })).length, 1, 'save must be durable before probe');
    return noProviders();
  } };
  await assert.rejects(createSourceControlCredential(deps, { workspaceId, label: 'Fixture', connection: { providerId: 'github', token: 'x'.repeat(8193) } }), exactError(CREDENTIAL_MESSAGES.limit));
  assert.equal(probes, 0);
  const summary = await createSourceControlCredential(deps, { workspaceId, label: 'Fixture', connection: { providerId: 'github', token: 'accepted-credential-a9F2' } });
  assert.equal(probes, 1); assert.equal(summary.connection, 'saved');
});

test('plaintext labels and URL credentials are refused by the stores, with value-free errors', async () => {
  // Assemble the reviewed fixture at runtime so tracked source carries no complete PAT shape.
  const secretLabel = 'ghp_' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
  const custom = { ...cryptoDeps(), repo: new InMemoryCustomCredentialSetRepo() };
  const create = (patch: Record<string, unknown>) => createCustomCredential(custom, { workspaceId, label: 'Fixture', category: 'general', baseUrl: 'https://example.test', connection: { token: 'safe-key-a9F2' }, ...patch });
  await assert.rejects(create({ label: secretLabel }), exactError(CREDENTIAL_MESSAGES.plain));
  await assert.rejects(create({ baseUrl: 'https://example.test?api_key=never-echo' }), exactError(CREDENTIAL_MESSAGES.plain));
  const external = { ...cryptoDeps(), repo: new InMemoryExternalMcpServerRepo() };
  for (const patch of [{ label: secretLabel }, { url: 'https://example.test?token=never-echo' }, { args: '--token=never-echo' }, { args: '--api-key never-echo' }]) {
    await assert.rejects(saveExternalMcpServer(external, { workspaceId, serverId: 'metadata', transport: 'streamable_http', authMode: 'static_env', enabled: true, command: '', args: '', url: 'https://example.test/mcp', accessToken: 'safe-key-a9F2', allowedToolNames: '', principalId: 'owner', ...patch }), exactError(CREDENTIAL_MESSAGES.plain));
  }
  const source = { ...cryptoDeps(), repo: new InMemorySourceControlCredentialSetRepo(), loadSourceControlProviders: noProviders };
  await assert.rejects(createSourceControlCredential(source, { workspaceId, label: secretLabel, connection: { providerId: 'github', token: 'safe-key-a9F2' } }), exactError(CREDENTIAL_MESSAGES.plain));
  const publish = { ...cryptoDeps(), repo: new InMemoryVendorCredentialSetRepo({}), loadDeployTargets: async () => registry };
  await assert.rejects(createPublishCredential(publish, { workspaceId, label: secretLabel, connection: { providerId: 'fixture-host', apiKey: 'safe-key-a9F2' } }), exactError(CREDENTIAL_MESSAGES.plain));
  const media = { ...cryptoDeps(), repo: new InMemoryMediaProviderCredentialRepo() };
  await assert.rejects(saveMediaProviderCredentials(media, { workspaceId, providers: { openai: { apiKey: 'safe-key-a9F2', baseUrl: 'https://example.test?token=never-echo' } } }), exactError(CREDENTIAL_MESSAGES.plain));
});

test('env-only credentials receive server-unsealed hints without sending their values', async () => {
  const deps = { ...cryptoDeps(), repo: new InMemoryExternalMcpServerRepo() };
  const token = 'fixture-environment-credential-a9F2';
  const summary = await saveExternalMcpServer(deps, { workspaceId, serverId: 'env-hint', transport: 'stdio', authMode: 'static_env', enabled: true, command: 'node', args: '', allowedToolNames: '', principalId: 'owner', env: JSON.stringify({ API_TOKEN: token, SHORT_TOKEN: 'short' }) });
  assert.deepEqual(summary.envTokenHints, { API_TOKEN: { length: token.length, last4: 'a9F2' }, SHORT_TOKEN: { length: 5, last4: null } });
  assert.equal(JSON.stringify(summary).includes(token), false);
  assert.equal(JSON.stringify(summary).includes('short'), false);
  await saveExternalMcpServer(deps, { workspaceId, serverId: 'env-hint', transport: 'stdio', authMode: 'static_env', enabled: true, command: 'node', args: '', allowedToolNames: '', principalId: 'owner', env: '' });
  assert.deepEqual((await listExternalMcpServerViews(deps, workspaceId))[0]?.envTokenHints, summary.envTokenHints);
});
