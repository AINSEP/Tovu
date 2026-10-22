import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { InMemoryPluginActivationRepo, createPluginSourcePolicy, pluginCapabilitySet, setPluginEnabled } from '@jini-ai/plugins/host';
import { definePlugin } from '@tovu/sdk';
import { WORD_COUNT_MANIFEST } from '#src/features/plugin-runtime/built-ins/word-count/index';
import { composePluginRuntime, type PluginRuntimeSource } from '../plugin-runtime.js';

const clock = { nowMs: () => 0 };
const manifest = { ...WORD_COUNT_MANIFEST, id: 'pin', extensions: { tovu: { id: 'tovu/pin', provides: [] } }, hooks: [], fields: [], capabilities: [] };

test('L005: attachment with no filter publishes a version, while missing hooks and stale loads refuse it', async () => {
  for (const mode of ['plain', 'missing-hook', 'disabled-during-setup', 'invalid-export'] as const) {
    const repo = new InMemoryPluginActivationRepo();
    const source: PluginRuntimeSource = { source: 'built-in', entryPath: '/unused/index.mjs',
      manifest: mode === 'missing-hook' ? { ...manifest, hooks: ['content.entry.beforeSave'] } : manifest,
      importModule: async () => mode === 'invalid-export' ? {} : ({ default: definePlugin({ setup() {
        if (mode === 'disabled-during-setup') runtime.onPluginDisabled('pin');
      } }) }) };
    const runtime = composePluginRuntime({ workspaceId: 'ws', clock, activationRepo: repo, sources: [source] });
    if (mode === 'plain') {
      await runtime.onPluginEnabled('pin');
      assert.equal(runtime.pluginLoadedVersion({ id: 'pin' }), manifest.version);
      runtime.onPluginDisabled('pin');
    } else await assert.rejects(runtime.onPluginEnabled('pin'));
    assert.equal(runtime.pluginLoadedVersion({ id: 'pin' }), undefined);
    assert.deepEqual(runtime.browserProviders({}).providers, []);
  }
});

test('L005: boot isolates missing and failed plugins, skips disabled/foreign rows and attaches survivors', async t => {
  t.mock.method(console, 'warn', () => {});
  const repo = new InMemoryPluginActivationRepo();
  const attempted: string[] = [];
  const sources: PluginRuntimeSource[] = ['broken', 'good', 'disabled', 'foreign'].map(id => ({
    source: 'built-in', entryPath: '/unused/index.mjs', manifest: { ...manifest, id, extensions: { tovu: { id: `tovu/${id}`, provides: [] } } },
    importModule: async () => { attempted.push(id); if (id === 'broken') throw new Error('failed setup'); return { default: definePlugin({ setup() {} }) }; },
  }));
  for (const id of ['missing', 'broken', 'good', 'disabled', 'foreign']) await repo.save({ workspaceId: id === 'foreign' ? 'elsewhere' : 'ws', pluginId: id, version: manifest.version, enabled: id !== 'disabled', updatedAt: '2026-10-20' });
  const runtime = composePluginRuntime({ workspaceId: 'ws', clock, activationRepo: repo, sources });
  await runtime.attachEnabledPluginsAtBoot();
  assert.deepEqual(attempted, ['broken', 'good']);
  assert.equal(runtime.pluginLoadedVersion({ id: 'good' }), manifest.version);
  assert.equal(runtime.pluginLoadedVersion({ id: 'broken' }), undefined);
});

test('L005: an unavailable boot conflict inventory detaches previously loaded plugins', async t => {
  t.mock.method(console, 'warn', () => {});
  const repo = new InMemoryPluginActivationRepo();
  const runtime = composePluginRuntime({ workspaceId: 'ws', clock, activationRepo: repo, sources: [{ source: 'built-in', entryPath: '/unused/index.mjs', manifest, importModule: async () => ({ default: definePlugin({ setup() {} }) }) }] });
  await runtime.onPluginEnabled('pin');
  await repo.save({ workspaceId: 'ws', pluginId: 'pin', version: manifest.version, enabled: true, updatedAt: '2026-10-20' });
  const list = repo.listAll.bind(repo);
  let calls = 0;
  t.mock.method(repo, 'listAll', async () => { calls++; if (calls === 2) throw new Error('inventory unavailable'); return list(); });
  await runtime.attachEnabledPluginsAtBoot();
  assert.equal(runtime.pluginLoadedVersion({ id: 'pin' }), undefined);
});

test('L005: source reload with no enabled activations publishes without attaching code', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'l005-source-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runtime = composePluginRuntime({ workspaceId: 'ws', clock, activationRepo: new InMemoryPluginActivationRepo(), sources: [], installDir: path.join(root, 'plugins'), pluginSourcePolicy: createPluginSourcePolicy({ hosted: false, localInstallOptIn: false }) });
  assert.ok(runtime.pluginSource);
  await runtime.pluginSource.create({ id: 'pin', name: 'Pin', description: '' });
  const result = await runtime.pluginSource.seal({ id: 'pin' });
  assert.equal(result.installed, true);
  assert.equal(result.reloaded, false);
  assert.equal(runtime.pluginLoadedVersion({ id: 'pin' }), undefined);
});

async function sourceFixture({ t }: { t: TestContext }, _options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'l005-reload-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  t.mock.method(console, 'warn', () => {});
  const repo = new InMemoryPluginActivationRepo();
  const installDir = path.join(root, 'plugins');
  const runtime = composePluginRuntime({ workspaceId: 'ws', clock, activationRepo: repo, sources: [], installDir,
    pluginSourcePolicy: createPluginSourcePolicy({ hosted: false, localInstallOptIn: false }) });
  assert.ok(runtime.pluginSource);
  const source = runtime.pluginSource;
  await source.create({ id: 'pin', name: 'Pin', description: '' });
  const first = await source.seal({ id: 'pin' });
  return { repo, installDir, runtime, source, first };
}

async function editReloadDraft({ h, mode }: {
  h: Awaited<ReturnType<typeof sourceFixture>>; mode: string;
}, _options = {}): Promise<void> {
  if (mode === 'quarantine') await writeFile(path.join(h.installDir, 'pin', h.first.plugin.version, 'server/index.mjs'), 'tampered');
  if (mode === 'approval') {
    const original = JSON.parse((await h.source.read({ id: 'pin', path: 'jini.plugin.json' })).content);
    await h.source.write({ id: 'pin', path: 'jini.plugin.json', content: JSON.stringify({ ...original, capabilities: ['content.read'] }) });
  } else {
    const content = ['rollback', 'quarantine'].includes(mode) ? 'export default {};' : 'export default { definition: { setup() {} } };';
    await h.source.write({ id: 'pin', path: 'server/index.mjs', content });
  }
}

for (const mode of ['success', 'foreign', 'rollback', 'quarantine', 'approval'] as const) {
  test(`L005: source reload preserves ${mode} activation behavior`, async t => {
    const h = await sourceFixture({ t });
    const workspaceId = mode === 'foreign' ? 'other' : 'ws';
    const discovery = await h.runtime.discoverPlugins();
    const approved = discovery.find(record => record.id === 'pin')?.manifest;
    assert.ok(approved);
    // why: Tovu b4ae8d8a4 refuses widened re-seal reloads beyond the owner's recorded approval;
    // Jini 2bac9709 owns capability comparison and approval storage. The owner's enable
    // (set-enabled.ts) records approval first, so this direct enable does the same.
    await h.source.recordApproval({ id: 'pin', capabilities: pluginCapabilitySet({ manifest: approved }) }, {});
    await setPluginEnabled({ deps: { clock, repo: h.repo, discovery,
      onEnabled: mode === 'foreign' ? async () => {} : h.runtime.onPluginEnabled,
      onDisabled: h.runtime.onPluginDisabled }, input: { workspaceId, pluginId: 'pin', enabled: true } });
    await editReloadDraft({ h, mode });
    const result = await h.source.seal({ id: 'pin' });
    const activation = await h.repo.getActivation({ workspaceId, pluginId: 'pin' });
    assert.equal(result.installed, true);
    assert.ok(activation);
    assert.equal(result.reloaded, mode === 'success');
    assert.equal(activation.version, ['success', 'foreign'].includes(mode) ? result.plugin.version : h.first.plugin.version);
    assert.equal(activation.enabled, mode !== 'quarantine');
    assert.match(result.reloadError ?? '', {
      success: /^$/, foreign: /^$/, rollback: /PLUGIN_EXPORT_INVALID/,
      quarantine: /PLUGIN_EXPORT_INVALID/, approval: /PLUGIN_APPROVAL_REQUIRED/,
    }[mode]);
    assert.equal(h.runtime.pluginLoadedVersion({ id: 'pin' }), {
      success: result.plugin.version, foreign: undefined, rollback: h.first.plugin.version,
      quarantine: undefined, approval: h.first.plugin.version,
    }[mode]);
  });
}
