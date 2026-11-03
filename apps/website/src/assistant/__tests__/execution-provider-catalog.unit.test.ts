import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import * as catalog from '@jini-ai/integrations/media-providers/catalog';
import { AesGcmSecretSealer } from '../../features/webhooks/secret-sealer.aesgcm.js';
import { InMemoryKeyring } from '../../features/webhooks/keyring.memory.js';
import { InMemoryAdminExecutionCredentialRepo } from '../execution-credential-store.memory.js';
import { setExecutionCredential } from '../execution-credential-store.js';
import type { EnsureExecutionSettingDefinitionsDeps } from '../execution-mode-settings.js';

const endpoint = 'https://catalog.example.test';
mock.module('@jini-ai/integrations/media-providers/catalog', {
  namedExports: { ...catalog, VENDOR_API_BASE_URLS: { ...catalog.VENDOR_API_BASE_URLS, anthropic: endpoint } },
});

test('execution settings use the provider catalog endpoint when its default changes', async () => {
  const { ensureExecutionSettingDefinitions } = await import('../execution-mode-settings.js');
  let baseUrl: unknown;
  const deps = { ensureSettingDefinitions: async (_deps: unknown, input: { namespace: string; definitions: readonly { key: string; defaultValue?: unknown }[] }) => {
    if (input.namespace === 'core.execution') baseUrl = input.definitions.find(row => row.key === 'byok.baseUrl')?.defaultValue;
  } } as unknown as EnsureExecutionSettingDefinitionsDeps;
  await ensureExecutionSettingDefinitions(deps, { systemPrincipalId: 'system' });
  assert.equal(baseUrl, endpoint);
});

test('live model discovery uses the provider catalog when a saved key has no custom endpoint', async () => {
  const { createLiveModelDiscovery } = await import('../live-model-cache.js');
  const repo = new InMemoryAdminExecutionCredentialRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const clock = { nowMs: () => 0, nowIso: () => '2026-11-02T00:00:00.000Z' };
  await setExecutionCredential({ repo, sealer, keyring, clock }, {
    workspaceId: 'workspace', principalId: 'admin', protocol: 'anthropic', apiKey: 'test-key',
  });
  let requested: string | undefined;
  const discovery = createLiveModelDiscovery({ repo, sealer, clock, discover: async ({ baseUrl }) => {
    requested = baseUrl; return [{ id: 'test-model', label: 'Test model' }];
  } });
  assert.deepEqual(await discovery.getLiveClaudeModels({ workspaceId: 'workspace', principalId: 'admin' }), [{ id: 'test-model', label: 'Test model' }]);
  assert.equal(requested, endpoint);
});
