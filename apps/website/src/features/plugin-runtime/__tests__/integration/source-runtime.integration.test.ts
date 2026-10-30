import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import test, { type TestContext } from 'node:test';
import { createSystemClock, createRandomUuidGenerator } from '@jini-ai/core/primitives';
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM } from '@jini-ai/daemon/surface-exchanges';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { createPluginSourcePolicy, InMemoryPluginActivationRepo, setPluginEnabled } from '@jini-ai/plugins/host';
import { composePluginRuntime } from '#src/server/runtime/composition/plugin-runtime';
import { reconcilePluginActivationsOnce } from '#src/server/runtime/composition/agent-daemon-deps';
import { InMemoryOutbox } from '#src/contracts/core/events/index';
import { InMemoryChangeSetRepo } from '#src/contracts/core/commands/index';
import { buildPluginsRegistrations, type PluginsToolDeps } from '../../tool-registrations.js';
import { buildPluginSourceRegistrations } from '../../source-tools.js';
import { createSitePluginPolicy, sitePluginLocalInstallEnabled } from '../../install.js';
import { CORE_HOST_SIGNAL_FALLBACK, evaluateHostSignals } from '../../../../contracts/core/host-signals.js';
import { providerFacesFor } from '../fixtures/plugins-tool-harness.js';

const id = 'site-rules';
const workspaceId = 'site';
const clock = { nowMs: () => Date.parse('2026-10-09T00:00:00Z') };
const entry = `import { value } from './helper.mjs';\nexport default { definition: { setup(sdk) { sdk.addFilter('content.entry.beforeSave', () => ({ value })); } } };\n`;
const draft = { id: 'entry', workspaceId, title: 'Test', slug: 'test', status: 'draft' as const, bodyJson: {}, ext: {} };
const context = (input: unknown) => ({ executionId: 'exec', principal: { id: 'owner' }, run: { id: 'run' }, input, signal: new AbortController().signal });
async function harness(t: TestContext) {
  const root = await mkdtemp(path.join(tmpdir(), 'source-runtime-')); t.after(() => rm(root, { recursive: true, force: true }));
  const installDir = path.join(root, 'plugins');
  const activationRepo = new InMemoryPluginActivationRepo();
  const policy = createPluginSourcePolicy({ hosted: false, localInstallOptIn: false });
  const runtime = composePluginRuntime({ workspaceId, clock, activationRepo, sources: [], installDir, pluginSourcePolicy: policy });
  assert.ok(runtime.pluginSource); const source = runtime.pluginSource;
  let counter = 0;
  const deps = { ...runtime, workspaceId, clock, pluginActivationRepo: activationRepo,
    authorize: async () => ({ allowed: true, reason: 'matched' }), idGen: { newId: () => 'change-' + ++counter },
    changeSets: new InMemoryChangeSetRepo(), outbox: new InMemoryOutbox(),
    removePlugin: async () => assert.fail('Source tools must never uninstall'),
    agentPluginLayout: {} as never, providerFaces: providerFacesFor({ workspaceRoot: () => assert.fail('Site-runtime tools do not read Agent Plugin faces') }),
  } satisfies PluginsToolDeps;
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' });
  const surfaces = { surfaceExchanges };
  const registrations = [...buildPluginsRegistrations(deps, surfaces), ...buildPluginSourceRegistrations({ deps, surfaces })];
  const call = async (toolId: string, input: unknown) => {
    const tool = registrations.find(tool => tool.descriptor.id === toolId); assert.ok(tool);
    return tool.handler(context(input), { emitSurface: async () => assert.fail(`${toolId} must run directly for a sealed site package`) });
  };
  /** Answers every enable card the way the browser callback does; returns the result and card texts. */
  const approve = async (toolId: string, input: unknown) => {
    const tool = registrations.find(tool => tool.descriptor.id === toolId); assert.ok(tool);
    const cards: string[] = [];
    const result = await tool.handler(context(input), { emitSurface: async surface => {
      const html = (surface as unknown as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text;
      cards.push(html);
      const exchangeId = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`))?.[1]; assert.ok(exchangeId);
      setImmediate(() => { assert.equal(surfaceExchanges.deliver({ exchangeId, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: 'confirm' }, principalId: 'owner' }, { toolId }).ok, true); });
    } });
    return { result, cards };
  };
  async function createFilter() {
    await call('plugin_source_create', { id, name: 'Site rules', description: 'Test site content rules' });
    const manifest = JSON.parse((await source.read({ id, path: 'jini.plugin.json' })).content);
    await source.write({ id, path: 'jini.plugin.json', content: JSON.stringify({ ...manifest, capabilities: ['hooks.attach'], hooks: ['content.entry.beforeSave'], fields: [{ path: `ext.${id}.value`, type: 'integer', queryable: false }] }) });
    await call('plugin_source_write', { id, path: 'server/index.mjs', content: entry });
    await call('plugin_source_write', { id, path: 'server/helper.mjs', content: 'export const value = 1;\n' });
  }
  return { root, installDir, runtime, activationRepo, source, deps, registrations, call, approve, createFilter };
}

test('chat can scaffold, write, seal and enable after one owner confirmation; updates replace helper module snapshots', async t => {
  const h = await harness(t); await h.createFilter();
  const manifest = JSON.parse((await h.source.read({ id, path: 'jini.plugin.json' })).content);
  await h.source.write({ id, path: 'jini.plugin.json', content: JSON.stringify({ ...manifest, extensions: { tovu: { id: 'publisher/site-rules' } } }) });
  const first = await h.call('plugin_source_seal', { id }) as { installed: boolean; reloaded: boolean; plugin: { publisherId: string } };
  assert.equal(first.installed, true); assert.equal(first.reloaded, false);
  assert.equal(first.plugin.publisherId, 'publisher/site-rules');
  assert.equal(JSON.parse(await readFile(path.join(h.installDir, id, '0.1.0/jini.plugin.json'), 'utf8')).extensions.tovu.id, 'publisher/site-rules');
  assert.deepEqual(await h.activationRepo.listAll(), []);
  const { result: enabled, cards } = await h.approve('plugins_set_enabled', { family: 'site-runtime', pluginId: id, enabled: true }) as { result: { changed: boolean }; cards: string[] };
  assert.equal(enabled.changed, true); assert.equal(cards.length, 1);
  assert.deepEqual(await h.runtime.beforeSaveHook(draft), { [id]: { value: 1 } });
  const oldHelper = path.join(h.installDir, id, '0.1.0/server/helper.mjs');
  await h.call('plugin_source_edit', { id, path: 'server/helper.mjs', oldString: 'value = 1', newString: 'value = 2' });
  const update = await h.call('plugin_source_seal', { id }) as { reloaded: boolean; plugin: { version: string } };
  assert.equal(update.reloaded, true); assert.equal(update.plugin.version, '0.1.1');
  assert.equal(await readFile(oldHelper, 'utf8'), 'export const value = 1;\n');
  assert.deepEqual(await h.runtime.beforeSaveHook(draft), { [id]: { value: 2 } });
  assert.equal((await h.activationRepo.getActivation({ workspaceId, pluginId: id }))?.version, '0.1.1');
  assert.equal(h.runtime.pluginLoadedVersion({ id }), '0.1.1');
  await h.call('plugin_source_rollback', { id });
  assert.deepEqual(await h.runtime.beforeSaveHook(draft), { [id]: { value: 1 } });
  assert.equal((await h.activationRepo.getActivation({ workspaceId, pluginId: id }))?.version, '0.1.2');
});

test('new versions update active pointers across workspaces and the existing poll reloads another process once', async t => {
  const h = await harness(t); await h.createFilter(); await h.source.seal({ id });
  await h.approve('plugins_set_enabled', { family: 'site-runtime', pluginId: id, enabled: true });
  const remoteWorkspace = 'other-workspace';
  const remote = composePluginRuntime({ workspaceId: remoteWorkspace, clock, activationRepo: h.activationRepo, sources: [], installDir: h.installDir, pluginSourcePolicy: h.runtime.pluginSourcePolicy });
  await setPluginEnabled({ deps: { clock, repo: h.activationRepo, discovery: await remote.discoverPlugins(), onEnabled: remote.onPluginEnabled, onDisabled: remote.onPluginDisabled }, input: { workspaceId: remoteWorkspace, pluginId: id, enabled: true } });
  const remoteDraft = { ...draft, workspaceId: remoteWorkspace };
  assert.deepEqual(await remote.beforeSaveHook(remoteDraft), { [id]: { value: 1 } });
  await h.source.write({ id, path: 'server/helper.mjs', content: 'export const value = 3;\n' }); await h.source.seal({ id });
  assert.equal((await h.activationRepo.getActivation({ workspaceId: remoteWorkspace, pluginId: id }))?.version, '0.1.1');
  let reloads = 0;
  const poll = { workspaceId: remoteWorkspace, pluginActivationRepo: h.activationRepo, pluginLoadedVersion: remote.pluginLoadedVersion,
    onPluginEnabled: async (pluginId: string) => { reloads++; await remote.onPluginEnabled(pluginId); }, onPluginDisabled: remote.onPluginDisabled };
  const attached = new Set([id]);
  await reconcilePluginActivationsOnce(poll, attached);
  assert.deepEqual(await remote.beforeSaveHook(remoteDraft), { [id]: { value: 3 } });
  await reconcilePluginActivationsOnce(poll, attached); assert.equal(reloads, 1);
});

test('removing a filter from a sealed manifest clears the old running hook', async t => {
  const h = await harness(t); await h.createFilter(); await h.source.seal({ id });
  await h.approve('plugins_set_enabled', { family: 'site-runtime', pluginId: id, enabled: true });
  const manifest = JSON.parse((await h.source.read({ id, path: 'jini.plugin.json' })).content);
  await h.source.write({ id, path: 'jini.plugin.json', content: JSON.stringify({ ...manifest, capabilities: [], hooks: [], fields: [] }) });
  await h.source.write({ id, path: 'server/index.mjs', content: 'export default { definition: { setup() {} } };' });
  await h.source.seal({ id });
  assert.deepEqual(await h.runtime.beforeSaveHook(draft), {});
  assert.equal(h.runtime.pluginLoadedVersion({ id }), '0.1.1');
});

test('a newly installed package does not replace the active pointer at boot until controlled reload', async t => {
  const h = await harness(t); await h.createFilter(); await h.source.seal({ id });
  await h.approve('plugins_set_enabled', { family: 'site-runtime', pluginId: id, enabled: true });
  await h.source.write({ id, path: 'server/helper.mjs', content: 'export const value = 4;\n' }); await h.source.seal({ id });
  // Model a process crash after immutable publication but before active-pointer advancement.
  const row = await h.activationRepo.getActivation({ workspaceId, pluginId: id }); assert.ok(row);
  await h.activationRepo.save({ ...row, version: '0.1.0' });
  const restarted = composePluginRuntime({ workspaceId, clock, activationRepo: h.activationRepo, sources: [], installDir: h.installDir, pluginSourcePolicy: h.runtime.pluginSourcePolicy });
  await restarted.attachEnabledPluginsAtBoot();
  assert.deepEqual(await restarted.beforeSaveHook(draft), { [id]: { value: 1 } });
  assert.equal(restarted.pluginLoadedVersion({ id }), '0.1.0');
  await reconcilePluginActivationsOnce({ workspaceId, pluginActivationRepo: h.activationRepo, pluginLoadedVersion: restarted.pluginLoadedVersion, onPluginEnabled: restarted.onPluginEnabled, onPluginDisabled: restarted.onPluginDisabled }, new Set([id]));
  assert.equal(restarted.pluginLoadedVersion({ id }), '0.1.0');
});

test('reload failures return installed:true with a reason and pin the restored working version', async t => {
  const h = await harness(t); await h.createFilter(); await h.source.seal({ id });
  await h.approve('plugins_set_enabled', { family: 'site-runtime', pluginId: id, enabled: true });
  await h.source.write({ id, path: 'server/index.mjs', content: 'export default {};' });
  const result = await h.source.seal({ id });
  assert.equal(result.installed, true); assert.equal(result.reloaded, false); assert.match(result.reloadError ?? '', /PLUGIN_EXPORT_INVALID/);
  const activation = await h.activationRepo.getActivation({ workspaceId, pluginId: id });
  assert.ok(activation); assert.equal(activation.enabled, true); assert.equal(activation.version, '0.1.0');
  assert.equal(activation.quarantinedAt, undefined);
  assert.equal(h.runtime.pluginLoadedVersion({ id }), '0.1.0');
  assert.deepEqual(await h.runtime.beforeSaveHook(draft), { [id]: { value: 1 } });
  assert.equal((await h.source.rollback({ id })).reloaded, true);
  assert.deepEqual(await h.runtime.beforeSaveHook(draft), { [id]: { value: 1 } });
});

test('reload quarantines only when the restored version also cannot load', async t => {
  const h = await harness(t); await h.createFilter(); await h.source.seal({ id });
  await h.approve('plugins_set_enabled', { family: 'site-runtime', pluginId: id, enabled: true });
  await writeFile(path.join(h.installDir, id, '0.1.0/server/helper.mjs'), 'tampered bytes');
  await h.source.write({ id, path: 'server/index.mjs', content: 'export default {};' });
  const result = await h.source.seal({ id });
  assert.equal(result.installed, true); assert.equal(result.reloaded, false);
  const activation = await h.activationRepo.getActivation({ workspaceId, pluginId: id });
  assert.equal(activation?.enabled, false); assert.match(activation?.quarantineReason ?? '', /restored-version reload failed/);
  assert.deepEqual(await h.runtime.beforeSaveHook(draft), {});
  assert.equal(h.runtime.pluginLoadedVersion({ id }), undefined);
});

test('the scaffold documents real route/tool/widget registrations and required manifest grants', async t => {
  const h = await harness(t); await h.source.create({ id, name: 'Examples', description: '' });
  const scaffold = (await h.source.read({ id, path: 'server/index.mjs' })).content;
  for (const required of ['sdk.routes.add', 'sdk.tools.add', 'sdk.widgets.add', 'http.route.register', 'tools.register', 'render.contribute', 'contributes', '/api/p/<plugin-id>/hello']) assert.ok(scaffold.includes(required), required);
});

test('consent gap (2026-10-12): an assistant-sealed plugin cannot enable without an owner confirmation naming what it adds', async t => {
  const h = await harness(t); await h.createFilter(); await h.call('plugin_source_seal', { id });
  const { result, cards } = await h.approve('plugins_set_enabled', { family: 'site-runtime', pluginId: id, enabled: true }) as { result: { changed: boolean }; cards: string[] };
  assert.equal(cards.length, 1, 'a site-sealed tier-3 plugin must not enable silently');
  assert.match(cards[0]!, /full server access/i);
  assert.match(cards[0]!, /content\.entry\.beforeSave/);
  assert.equal(result.changed, true);
});

test('an unchanged re-seal does not re-prompt; a widened re-seal waits for a new confirmation listing only the additions', async t => {
  const h = await harness(t); await h.createFilter(); await h.call('plugin_source_seal', { id });
  await h.approve('plugins_set_enabled', { family: 'site-runtime', pluginId: id, enabled: true });
  await h.source.write({ id, path: 'server/helper.mjs', content: 'export const value = 5;\n' });
  assert.equal((await h.source.seal({ id })).reloaded, true);
  assert.deepEqual(await h.runtime.beforeSaveHook(draft), { [id]: { value: 5 } });
  // Re-enabling the same capabilities runs directly: `call` fails on any card.
  assert.equal((await h.call('plugins_set_enabled', { family: 'site-runtime', pluginId: id, enabled: true }) as { changed: boolean }).changed, true);
  const manifest = JSON.parse((await h.source.read({ id, path: 'jini.plugin.json' })).content);
  await h.source.write({ id, path: 'jini.plugin.json', content: JSON.stringify({ ...manifest, fields: [...manifest.fields, { path: `ext.${id}.extra`, type: 'integer', queryable: false }] }) });
  await h.source.write({ id, path: 'server/helper.mjs', content: 'export const value = 6;\n' });
  const widened = await h.source.seal({ id });
  assert.equal(widened.reloaded, false); assert.match(widened.reloadError ?? '', /approval/i);
  assert.equal((await h.activationRepo.getActivation({ workspaceId, pluginId: id }))?.version, '0.1.1', 'the approved version keeps running');
  assert.deepEqual(await h.runtime.beforeSaveHook(draft), { [id]: { value: 5 } });
  const { cards } = await h.approve('plugins_set_enabled', { family: 'site-runtime', pluginId: id, enabled: true });
  assert.equal(cards.length, 1); assert.match(cards[0]!, new RegExp(`ext\\.${id}\\.extra`)); assert.doesNotMatch(cards[0]!, /content\.entry\.beforeSave/);
  assert.equal((await h.activationRepo.getActivation({ workspaceId, pluginId: id }))?.version, '0.1.2');
  assert.deepEqual(await h.runtime.beforeSaveHook(draft), { [id]: { value: 6 } });
});

test('copied site packages lack site-owned provenance and keep their enable confirmation', async t => {
  const h = await harness(t); await h.createFilter(); await h.source.seal({ id });
  const other = path.join(h.root, 'other-site/plugins');
  await cp(path.join(h.installDir, id), path.join(other, id), { recursive: true });
  const runtime = composePluginRuntime({ workspaceId, clock, activationRepo: new InMemoryPluginActivationRepo(), sources: [], installDir: other, pluginSourcePolicy: h.runtime.pluginSourcePolicy });
  assert.ok(runtime.pluginSource); assert.equal(await runtime.pluginSource.isSealedHere({ id, version: '0.1.0' }), false);
  const tool = buildPluginsRegistrations({ ...h.deps, ...runtime, pluginActivationRepo: new InMemoryPluginActivationRepo() }, { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' }) }).find(tool => tool.descriptor.id === 'plugins_set_enabled');
  assert.ok(tool);
  await assert.rejects(tool.handler(context({ family: 'site-runtime', pluginId: id, enabled: true }), {}), error => /NO_CONFIRMATION_CHANNEL/.test((error as Error).message));
});

test('hosted source sealing retains the Tovu opt-in hint and publishes no package', async t => {
  const h = await harness(t); await h.createFilter();
  const runtime = composePluginRuntime({ workspaceId, clock, activationRepo: h.activationRepo, sources: [], installDir: h.installDir,
    pluginSourcePolicy: createPluginSourcePolicy({ hosted: true, localInstallOptIn: false }) });
  assert.ok(runtime.pluginSource);
  await assert.rejects(runtime.pluginSource.seal({ id }), { code: 'PLUGIN_LOCAL_INSTALL_DISABLED', message: 'Hosted plugin installs require TOVU_PLUGIN_LOCAL_INSTALL=1.' });
  await assert.rejects(readFile(path.join(h.installDir, id, '0.1.0/jini.plugin.json')), { code: 'ENOENT' });
  assert.deepEqual(await h.activationRepo.listAll(), []);
});

test('the deployment adapter treats desktop and dev as local and production/Fly as hosted', () => {
  const cases: ReadonlyArray<readonly [Readonly<Record<string, string | undefined>>, boolean]> = [
    [{}, true],
    [{ NODE_ENV: 'development', TOVU_PLUGIN_LOCAL_INSTALL: '0' }, true],
    [{ NODE_ENV: 'production' }, false],
    [{ FLY_APP_NAME: 'hosted' }, false],
    [{ NODE_ENV: 'production', TOVU_PLUGIN_LOCAL_INSTALL: '1' }, true],
    [{ NODE_ENV: 'production', ELECTRON_RUN_AS_NODE: '1', TOVU_DESKTOP_OWNER_PID: '42' }, true],
    [{ FLY_APP_NAME: 'hosted', ELECTRON_RUN_AS_NODE: '1', TOVU_DESKTOP_OWNER_PID: '42' }, false],
  ];
  for (const [env, expected] of cases) {
    const hostSignals = evaluateHostSignals({ env, declaration: CORE_HOST_SIGNAL_FALLBACK });
    assert.equal(sitePluginLocalInstallEnabled({ env, hostSignals }), expected);
    assert.equal(createSitePluginPolicy({ env, hostSignals }).localInstallEnabled({}, {}), expected);
  }
});

test('install policy uses injected host facts even when the env has no hosted hint', () => {
  const hostSignals = evaluateHostSignals({ env: { FLY_APP_NAME: 'hosted' }, declaration: CORE_HOST_SIGNAL_FALLBACK });
  assert.equal(sitePluginLocalInstallEnabled({ env: {}, hostSignals }), false);
  assert.equal(sitePluginLocalInstallEnabled({ env: { TOVU_PLUGIN_LOCAL_INSTALL: '1' }, hostSignals }), true);
});
