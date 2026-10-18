import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemorySettingsRepo, resolveDefinitionRaw, set } from '@jini-ai/core/settings';
import { ensureFeatureFlag, readFeatureFlag, FEATURE_FLAGS_NAMESPACE } from '../feature-flags.js';

const flag = { key: 'sample', environmentKey: 'TOVU_FEATURE_SAMPLE' };

async function fixture() {
  let seq = 0;
  const deps = { settingsRepo: new InMemorySettingsRepo(), clock: { nowMs: () => 0 }, ids: { newId: () => `flag-${++seq}` }, principals: { findActiveById: async ({ id }: { id: string }) => ({ id }) } };
  await ensureFeatureFlag({ deps, flag, systemPrincipalId: 'system' });
  const write = (workspaceId: string, value: boolean) => set({ deps: { repo: deps.settingsRepo, clock: deps.clock, ids: deps.ids, principals: deps.principals, authorize: async () => ({ allowed: true, reason: 'test' }) },
    input: { namespace: FEATURE_FLAGS_NAMESPACE, key: flag.key, scope: 'workspace', workspaceId, value, callerPrincipalId: 'owner' },
  });
  const read = (workspaceId: string, env: Record<string, string | undefined> = {}, options: { runtime?: boolean } = {}) => readFeatureFlag({ settingsRepo: deps.settingsRepo, workspaceId, flag, env }, options);
  return { deps, read, write };
}

test('workspace rollouts use current audited values, stay isolated and survive registration', async () => {
  const f = await fixture();
  assert.deepEqual(await f.read('a'), { enabled: false, source: 'default' });
  await f.write('a', true);
  assert.deepEqual(await f.read('a'), { enabled: true, source: 'workspace' });
  assert.deepEqual(await f.read('b'), { enabled: false, source: 'default' });
  await ensureFeatureFlag({ deps: f.deps, flag, systemPrincipalId: 'system' });
  assert.equal((await f.read('a')).enabled, true);
  await f.write('a', false);
  assert.equal((await f.read('a')).enabled, false);
  const definition = await resolveDefinitionRaw({ repo: f.deps.settingsRepo }, { namespace: FEATURE_FLAGS_NAMESPACE, key: flag.key, workspaceId: null });
  assert.ok(definition);
  assert.deepEqual(definition.schema, { type: 'boolean' });
  assert.equal((await f.deps.settingsRepo.listRevisions({ settingId: definition.settingId })).filter(r => r.op === 'set').length, 2);
});

test('deployment kill switch overrides runtime and workspace without reading storage', async () => {
  const f = await fixture();
  await f.write('a', true);
  f.deps.settingsRepo.findActiveDefinition = async () => { throw new Error('storage down'); };
  assert.deepEqual(await f.read('a', { TOVU_FEATURE_SAMPLE: '0' }, { runtime: true }), { enabled: false, source: 'environment' });
  assert.deepEqual(await f.read('a', {}, { runtime: false }), { enabled: false, source: 'runtime' });
  // Resolver caches definitions, but value reads remain uncached and failures must not enable.
  f.deps.settingsRepo.getWorkspaceValue = async () => { throw new Error('storage down'); };
  await assert.rejects(f.read('a'), /storage down/);
});
