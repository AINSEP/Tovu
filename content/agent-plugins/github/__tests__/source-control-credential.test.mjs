import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parseSourceControlProvidersFile, loadSourceControlProviderRegistryFromSource } from '../../../../apps/website/src/features/source-control/provider-registry.ts';
import { parsePluginCredentialCards } from '../../../../apps/website/src/features/agent-plugins/credential-cards.ts';
import { createSourceControlCredential, resolveDefaultForSourceControl } from '../../../../apps/website/src/features/source-control/store.ts';
import { InMemorySourceControlCredentialSetRepo } from '../../../../apps/website/src/features/source-control/repo.memory.ts';
import { InMemoryKeyring } from '../../../../apps/website/src/features/webhooks/keyring.memory.ts';
import { AesGcmSecretSealer } from '../../../../apps/website/src/features/webhooks/secret-sealer.aesgcm.ts';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const raw = readFileSync(new URL('../tovu-source-control.json', import.meta.url), 'utf8');

test('GitHub owns its token form and reuses its existing source-control credential card', () => {
  const parsed = parseSourceControlProvidersFile(raw);
  assert.equal(parsed.ok, true);
  const descriptor = parsed.descriptors.find(provider => provider.id === 'github');
  assert.deepEqual(descriptor.credential.fields, [{ name: 'token', label: 'Access token', required: true, secret: true }]);
  assert.equal(descriptor.credential.tokenField, 'token');
  assert.equal(descriptor.credential.tokenPageUrl, 'https://github.com/settings/personal-access-tokens/new');
  assert.match(descriptor.credential.help, /fine-grained personal access token/);
  assert.equal(descriptor.i18n.es['Access token'], 'Token de acceso');
  const manifestRaw = readFileSync(new URL('../plugin.json', import.meta.url), 'utf8');
  const manifest = JSON.parse(manifestRaw);
  for (const keyword of ['github', 'source-control', 'commit']) assert.ok(manifest.keywords.includes(keyword));
  const cards = parsePluginCredentialCards({ raw: manifestRaw });
  assert.equal(cards.ok, true);
  const card = cards.descriptors.find(card => card.saveKind === 'source-control');
  assert.equal(card.saveTarget, descriptor.id);
  assert.equal(card.helpUrl, descriptor.credential.tokenPageUrl);
  assert.equal('credentialPolicy' in descriptor, false);
});

test('GitHub declares its own reserved and executable workflow paths', () => {
  const parsed = parseSourceControlProvidersFile(raw);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.descriptors.find(provider => provider.id === 'github').reservedPaths, ['.github']);
  assert.deepEqual(parsed.descriptors.find(provider => provider.id === 'github').workflowPaths, ['.github/workflows']);
});

test('GitHub credential admission needs only the token and probes through the injected transport after saving', async () => {
  const keyring = new InMemoryKeyring();
  const repo = new InMemorySourceControlCredentialSetRepo();
  const calls = [];
  const deps = {
    repo, keyring, sealer: new AesGcmSecretSealer(keyring),
    clock: { nowIso: () => '2026-10-22T00:00:00.000Z', nowMs: () => 0 },
    idGen: { newId: () => 'github-credential' },
    loadSourceControlProviders: () => loadSourceControlProviderRegistryFromSource({ pluginId: 'github', packageRoot }),
    fetchFn: async (url, init) => {
      assert.equal((await repo.listByWorkspace({ workspaceId: 'example-workspace' })).length, 1);
      calls.push({ url, init });
      return Response.json({ login: 'octo', email: 'private@example.test' });
    },
  };
  const saved = await createSourceControlCredential({ deps: deps, input: { workspaceId: 'example-workspace', label: 'default', connection: { providerId: 'github', token: 'fixture-token-a9F2' } } });
  assert.equal(saved.accountLabel, 'octo');
  assert.equal(saved.connection, 'connected');
  assert.equal(calls[0].url, 'https://api.github.com/user');
  assert.equal(new Headers(calls[0].init.headers).get('authorization'), 'Bearer fixture-token-a9F2');
  assert.equal(JSON.stringify(saved).includes('fixture-token-a9F2'), false);
  assert.equal(JSON.stringify(saved).includes('private@example.test'), false);
  assert.deepEqual((await resolveDefaultForSourceControl(deps, { workspaceId: 'example-workspace', providerId: 'github' })).connection, { providerId: 'github', token: 'fixture-token-a9F2' });
});
