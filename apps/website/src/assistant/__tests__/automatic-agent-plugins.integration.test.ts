import '../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { InMemorySettingsRepo, getEffective } from '@jini-ai/core/settings';
import { InMemoryPrincipalRepo } from '@jini-ai/user-management/server';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createSystemClock, createRandomUuidGenerator } from '@jini-ai/core/primitives';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { createToolRegistry } from '@jini-ai/core';
import { createToolExecutor } from '@jini-ai/daemon';
import { createTempSiteLayoutFixture } from '#src/__tests__/fixtures/site-layout-context';
import { toolMetadata as themeMetadata } from '../../contracts/core/tool-metadata/theme.js';
import { ASK_CHOICE_TOOL_ID } from '../ask-choice-tool.js';
import { ensureAdminInterfaceSettingDefinitions } from '../../features/settings/admin-interface.js';
import { set } from '../../features/settings/index.js';
import { captureDaemonRun } from '../../server/inbound/assistant/__tests__/helpers/daemon-source.js';
import { buildAgentPluginSearchRegistrations } from '../../features/agent-plugins/tool-registrations.js';
import { resolveAgentPluginRefs } from '../../features/agent-plugins/lifecycle.js';
import { createAutomaticPluginRuns, type AutomaticPluginRun } from '../automatic-agent-plugins.js';

// Real catalog, activation, ranker, skill resolution and effective settings. No daemon boot.
async function fixture(t: TestContext, { pluginId = 'synthetic-author', count = 1, trusted = true } = {}) {
  const site = createTempSiteLayoutFixture({});
  t.after(site.cleanup);
  const workspaceId = 'workspace-auto';
  const layout = site.deps.agentPluginLayout;
  const workspace = layout.forWorkspace(workspaceId);
  const pluginIds = Array.from({ length: count }, (_, i) => count === 1 ? pluginId : `synthetic-${String(i).padStart(2, '0')}`);
  for (const id of pluginIds) {
    const packageDir = path.join(workspace.pluginPackagesDir({ pluginId: id }), 'a'.repeat(64));
    await mkdir(path.join(packageDir, 'skills', id), { recursive: true });
    await writeFile(path.join(packageDir, 'plugin.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: id, version: '1.0.0', keywords: ['holography'], extensions: { tovu: { id: `test/${id}`, displayName: count === 1 ? 'Synthetic Author' : id, provides: ['theme-authoring'] } } }));
    await writeFile(path.join(packageDir, 'skills', id, 'SKILL.md'), `---\nname: ${id}\ndescription: Holography instructions\n---\nUse holographic layout discipline.\n`);
  }
  await writeFile(path.join(workspace.root, 'activations.json'), JSON.stringify({ schemaVersion: 1, plugins: Object.fromEntries(pluginIds.map(id => [id, { enabled: true, origin: 'bundled', updatedAt: '2026-10-18T00:00:00.000Z', updatedBy: 'fixture' }])) }));
  // The fixture represents a build-seeded package; untrusted = a bundled id at a digest the build did not ship.
  await writeFile(path.join(workspace.root, 'bundled-digests.json'), JSON.stringify({ schemaVersion: 1, plugins: Object.fromEntries(pluginIds.map(id => [id, { archiveDigest: (trusted ? 'a' : 'b').repeat(64) }])) }));
  const settingsRepo = new InMemorySettingsRepo();
  const clock = { nowIso: () => '2026-10-18T00:00:00.000Z', nowMs: () => 0 };
  let counter = 0;
  const idGen = { newId: () => `id-${++counter}` };
  const principalRepo = new InMemoryPrincipalRepo({});
  const settingsUiTabsReady = ensureAdminInterfaceSettingDefinitions({ settingsRepo, clock, ids: idGen, principals: { findActiveById: async ({ id }) => ({ id }) } }, { systemPrincipalId: 'system' });
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' });
  const runs = createAutomaticPluginRuns({ deps: { workspaceId, agentPluginLayout: layout, settingsRepo, getEffective, set, siteTitleReady: settingsUiTabsReady, principalRepo, clock, idGen, authorize: async () => ({ allowed: true, reason: 'test' }) }, surfaces: { surfaceExchanges } });
  const published: Parameters<AutomaticPluginRun['publish']>[0][] = [];
  const context: AutomaticPluginRun = { principal: { id: 'alice' }, conversationId: 'chat', state: { decision: null, excluded: [] }, query: 'Design holography', pinned: [], signal: new AbortController().signal, emitSurface: async () => { assert.fail('Auto must not ask'); }, publish: async value => { published.push(value); } };
  await settingsUiTabsReady;
  return { runs, context, published, workspaceId, workspace, layout, pluginId, principalRepo, settingsRepo, clock, idGen, surfaceExchanges };
}

test('Auto preflight suggests metadata only; the first guarded write still loads real guidance once', async t => {
  const { runs, context, published, pluginId } = await fixture(t);
  const note = await runs.start({ runId: 'preflight', context });
  assert.match(note, /Relevant agent plugins for this request:/);
  assert.match(note, /Synthetic Author/);
  assert.match(note, /load_agent_plugin/);
  assert.doesNotMatch(note, /Use holographic layout discipline/);
  assert.equal(published.length, 0, 'suggestion must not mark guidance as loaded');
  const gate = { principal: context.principal, run: { id: 'preflight' }, tool: { id: 'theme_reset_file', metadata: themeMetadata.theme_reset_file }, signal: context.signal };
  assert.match(await runs.prepareGuidance(gate), /Use holographic layout discipline/);
  assert.deepEqual(published.at(-1)?.plugins, [{ id: pluginId, name: 'Synthetic Author' }]);
  assert.equal(await runs.prepareGuidance(gate), '', 'backstop must load only once');
  await runs.start({ runId: 'backstop', context: { ...context, query: 'hello' } });
  assert.match(await runs.prepareGuidance({ ...gate, run: { id: 'backstop' } }), /Use holographic layout discipline/);
  assert.equal(await runs.prepareGuidance({ ...gate, run: { id: 'backstop' } }), '');
  runs.forget({ runId: 'preflight' });
  runs.forget({ runId: 'backstop' });
});

test("Don't ask again writes Auto only for the answering principal through the real setting service", async t => {
  const f = await fixture(t);
  const { createSettingsPrincipalLookup } = await import('../../features/settings/index.js');
  const principals = createSettingsPrincipalLookup({ repo: f.principalRepo });
  for (const id of ['alice', 'bob']) {
    await f.principalRepo.save({ id, workspaceId: f.workspaceId, kind: 'user', displayName: id, status: 'active', createdAt: f.clock.nowIso() });
    await set({ deps: { repo: f.settingsRepo, clock: f.clock, ids: f.idGen, principals, authorize: async () => ({ allowed: true, reason: 'test' }) },
      input: { namespace: 'core.interface', key: 'chatAgentPlugins', scope: 'user', workspaceId: f.workspaceId, principalId: id, callerPrincipalId: id, authWorkspaceId: f.workspaceId, value: 'ask' } });
  }
  const read = (principalId: string) => getEffective({ repo: f.settingsRepo }, { namespace: 'core.interface', key: 'chatAgentPlugins', scopeContext: { workspaceId: f.workspaceId, principalId } });
  assert.match(await f.runs.start({ runId: 'ask-auto', context: { ...f.context, emitSurface: async emission => {
    assert.equal((await read('alice')).value, 'ask', 'opening the form must not change the setting');
    const html = (emission.payload.resource as { resource: { text: string } }).resource.text;
    const exchangeId = html.match(/__exchangeId"\s*:\s*"([^"]+)"/)?.[1];
    assert.ok(exchangeId);
    assert.equal(f.surfaceExchanges.deliver({ exchangeId, principalId: 'bob', params: { __choiceAction: 'auto', selections: [f.pluginId] } }, { toolId: ASK_CHOICE_TOOL_ID }).ok, false);
    assert.equal(f.surfaceExchanges.deliver({ exchangeId, principalId: 'alice', params: { __choiceAction: 'auto', selections: [f.pluginId] } }, { toolId: ASK_CHOICE_TOOL_ID }).ok, true);
  } } }), /Relevant agent plugins for this request:/);
  assert.deepEqual(f.published.at(-1)?.plugins, [], 'consent is not a guidance load');
  assert.equal((await read('alice')).value, 'auto');
  assert.equal((await read('bob')).value, 'ask');
  assert.equal(f.surfaceExchanges.size(), 0);
  f.runs.forget({ runId: 'ask-auto' });
});

test('CLI onStarted places the relevance note, without guidance bodies, into the executor prompt', async t => {
  const f = await fixture(t);
  // Execute the actual onStarted expression with isolated process/session effects, avoiding daemon boot.
  const input = await captureDaemonRun({ conversationId: 'chat', prompt: 'Design holography', userPrompt: 'Design holography' }, {
    lifecycle: { waitForTerminal: () => new Promise(() => {}), onCancelRequested: () => () => {}, stream: async () => {}, emit: async () => {} },
    bindings: {
      automaticPluginRuns: f.runs,
      routeDeps: { workspaceId: f.workspaceId, agentSessions: { getSessionId: async () => null, setSessionId: async () => {} } },
      liveRunTracker: { register() {}, hasConcurrentLiveRun: () => false },
      waitForStoppingRuns: async () => {}, STOPPING_RUN_WAIT_MS: 20_000,
    },
  });
  assert.match(input.prompt, /Relevant agent plugins for this request:/);
  assert.doesNotMatch(input.prompt, /Use holographic layout discipline/);
  assert.match(input.prompt, /Design holography/);
  f.runs.forget({ runId: 'daemon-test-run' });
});

test('load_agent_plugin uses the real resolver and publishes the loaded chip through the real executor', async t => {
  const f = await fixture(t);
  await f.runs.start({ runId: 'explicit', context: f.context });
  assert.equal(f.published.length, 0);
  const registry = createToolRegistry({});
  registry.register(f.runs.loadRegistration);
  const executor = createToolExecutor({ registry }, { prepareGuidance: f.runs.prepareGuidance });
  const result = await executor.execute({ principal: f.context.principal, run: { id: 'explicit' }, toolId: 'load_agent_plugin', input: { pluginId: f.pluginId } });
  assert.equal(result.status, 'completed');
  assert.match(JSON.stringify(result.output), /Use holographic layout discipline/);
  assert.deepEqual(f.published.at(-1)?.plugins, [{ id: f.pluginId, name: 'Synthetic Author' }]);
  assert.equal(await f.runs.prepareGuidance({ principal: f.context.principal, run: { id: 'explicit' }, tool: { id: 'theme_reset_file', metadata: themeMetadata.theme_reset_file }, signal: f.context.signal }), '');
  f.runs.forget({ runId: 'explicit' });
});

test('the first theme write loads installed tovu-theme after a note-only preflight', async t => {
  const f = await fixture(t, { pluginId: 'tovu-theme' });
  assert.doesNotMatch(await f.runs.start({ runId: 'theme', context: f.context }), /Use holographic layout discipline/);
  assert.equal(f.published.length, 0);
  const gate = { principal: f.context.principal, run: { id: 'theme' }, tool: { id: 'theme_reset_file', metadata: themeMetadata.theme_reset_file }, signal: f.context.signal };
  assert.match(await f.runs.prepareGuidance(gate), /AGENT_PLUGIN pluginId="tovu-theme"/);
  assert.deepEqual(f.published.at(-1)?.plugins.map(plugin => plugin.id), ['tovu-theme']);
  assert.equal(await f.runs.prepareGuidance(gate), '');
  f.runs.forget({ runId: 'theme' });
});

test('the loader cannot use another principal’s run, an excluded plugin, or a revoked activation', async t => {
  const f = await fixture(t);
  const registry = createToolRegistry({});
  registry.register(f.runs.loadRegistration);
  const executor = createToolExecutor({ registry });
  await f.runs.start({ runId: 'owner', context: f.context });
  const stolen = await executor.execute({ principal: { id: 'bob' }, run: { id: 'owner' }, toolId: 'load_agent_plugin', input: { pluginId: f.pluginId } });
  assert.equal(stolen.status, 'failed');
  assert.equal(f.published.length, 0);
  await f.runs.start({ runId: 'excluded', context: { ...f.context, state: { decision: null, excluded: [f.pluginId] } } });
  const excluded = await executor.execute({ principal: f.context.principal, run: { id: 'excluded' }, toolId: 'load_agent_plugin', input: { pluginId: f.pluginId } });
  assert.equal(excluded.status, 'completed');
  assert.doesNotMatch(JSON.stringify(excluded.output), /Use holographic layout discipline/);
  assert.equal(f.published.length, 0);
  await writeFile(path.join(f.workspace.root, 'activations.json'), JSON.stringify({ schemaVersion: 1, plugins: { [f.pluginId]: { enabled: false, origin: 'operator-installed', updatedAt: '2026-10-18T00:00:00.000Z', updatedBy: 'fixture' } } }));
  const revoked = await executor.execute({ principal: f.context.principal, run: { id: 'owner' }, toolId: 'load_agent_plugin', input: { pluginId: f.pluginId } });
  assert.equal(revoked.status, 'completed');
  assert.doesNotMatch(JSON.stringify(revoked.output), /Use holographic layout discipline/);
  assert.equal(f.published.length, 0);
  for (const runId of ['owner', 'excluded']) f.runs.forget({ runId });
});

// Discover identities exclusively from the model-facing search response before attempting loads.
test('50 relevant ids are discoverable by paging the existing search tool and all load through the executor', async t => {
  const f = await fixture(t, { count: 50 });
  const note = await f.runs.start({ runId: 'paged', context: f.context });
  assert.ok(new TextEncoder().encode(note).length <= 600);
  assert.match(note, /\+\d+ more relevant: search_agent_plugin_local.*offset: 0.*nextOffset/);
  assert.equal(f.published.length, 0);
  const registry = createToolRegistry({});
  registry.register(f.runs.loadRegistration);
  for (const registration of buildAgentPluginSearchRegistrations({ workspaceId: f.workspaceId, agentPluginLayout: f.layout })) registry.register(registration);
  const executor = createToolExecutor({ registry });
  const discovered = new Set<string>();
  let offset: number | null = 0;
  let pages = 0;
  do {
    assert.ok(++pages <= 50, 'pagination must advance');
    const result = await executor.execute({ principal: f.context.principal, run: { id: 'paged' }, toolId: 'search_agent_plugin_local', input: { query: 'holography', offset, limit: 25 } });
    assert.equal(result.status, 'completed');
    const page = result.output as { matches: { pluginId: string }[]; nextOffset: number | null; totalMatches: number };
    assert.equal(page.totalMatches, 50);
    for (const { pluginId } of page.matches) {
      assert.equal(discovered.has(pluginId), false, 'no duplicate ids across pages');
      discovered.add(pluginId);
      const loaded = await executor.execute({ principal: f.context.principal, run: { id: 'paged' }, toolId: 'load_agent_plugin', input: { pluginId } });
      assert.equal(loaded.status, 'completed');
      assert.match(JSON.stringify(loaded.output), /Use holographic layout discipline/);
    }
    offset = page.nextOffset;
  } while (offset !== null);
  assert.equal(pages, 2);
  assert.equal(discovered.size, 50);
  assert.equal(f.published.at(-1)?.plugins.length, 50);
  for (const invalidOffset of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    const invalid = await executor.execute({ principal: f.context.principal, run: { id: 'paged' }, toolId: 'search_agent_plugin_local', input: { query: 'holography', offset: invalidOffset } });
    assert.equal(invalid.status, 'failed');
  }
  const exhausted = await executor.execute({ principal: f.context.principal, run: { id: 'paged' }, toolId: 'search_agent_plugin_local', input: { query: 'holography', offset: 50 } });
  assert.equal(exhausted.status, 'completed');
  assert.deepEqual((exhausted.output as { matches: unknown[] }).matches, []);
  assert.equal((exhausted.output as { nextOffset: number | null }).nextOffset, null);
  f.runs.forget({ runId: 'paged' });
});

for (const denied of ['ask', 'off', 'untrusted'] as const) {
  test(`explicit loader and guarded write refuse ${denied} through the real executor`, async t => {
    const f = await fixture(t, { trusted: denied !== 'untrusted' });
    if (denied !== 'untrusted') {
      await f.principalRepo.save({ id: 'alice', workspaceId: f.workspaceId, kind: 'user', displayName: 'Alice', status: 'active', createdAt: f.clock.nowIso() });
      const { createSettingsPrincipalLookup } = await import('../../features/settings/index.js');
      await set({ deps: { repo: f.settingsRepo, clock: f.clock, ids: f.idGen, principals: createSettingsPrincipalLookup({ repo: f.principalRepo }), authorize: async () => ({ allowed: true, reason: 'fixture' }) },
        input: { namespace: 'core.interface', key: 'chatAgentPlugins', scope: 'user', workspaceId: f.workspaceId, principalId: 'alice', callerPrincipalId: 'alice', authWorkspaceId: f.workspaceId, value: denied } });
    }
    const context = { ...f.context, state: { decision: { selected: [], asked: true }, excluded: [] } };
    const note = await f.runs.start({ runId: denied, context });
    if (denied !== 'untrusted') assert.equal(note, '');
    const registry = createToolRegistry({});
    registry.register(f.runs.loadRegistration);
    registry.register({ descriptor: { id: 'guarded_write', description: 'Fixture theme write', metadata: themeMetadata.theme_reset_file }, policy: { authorize: async () => 'allow' as const }, handler: async () => ({ written: true }) });
    const executor = createToolExecutor({ registry }, { prepareGuidance: f.runs.prepareGuidance });
    const result = await executor.execute({ principal: context.principal, run: { id: denied }, toolId: 'load_agent_plugin', input: { pluginId: f.pluginId } });
    assert.equal(result.status, 'completed');
    assert.equal((result.output as { guidance: string }).guidance, '');
    const write = await executor.execute({ principal: context.principal, run: { id: denied }, toolId: 'guarded_write', input: {} });
    assert.equal(write.status, 'completed');
    assert.doesNotMatch(JSON.stringify(write.output), /Use holographic layout discipline|agentPluginGuidance/);
    assert.ok(f.published.every(event => event.plugins.length === 0), 'denied guidance never appears as loaded');
    if (denied === 'untrusted') {
      const resolved = await resolveAgentPluginRefs([f.pluginId], f.workspace, 'inject');
      assert.equal(resolved.ok, false, 'the shared lifecycle resolver must refuse active-but-untrusted guidance');
      if (!resolved.ok) assert.match(resolved.reason, /only plugins shipped with/);
    }
    f.runs.forget({ runId: denied });
  });
}
