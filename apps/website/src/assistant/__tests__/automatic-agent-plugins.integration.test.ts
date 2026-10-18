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
import { createTempSiteLayoutFixture } from '#src/__tests__/fixtures/site-layout-context';
import { toolMetadata as themeMetadata } from '../../contracts/core/tool-metadata/theme.js';
import { ASK_CHOICE_TOOL_ID } from '../ask-choice-tool.js';
import { ensureAdminInterfaceSettingDefinitions } from '../../features/settings/admin-interface.js';
import { set } from '../../features/settings/index.js';
import { captureDaemonRun } from '../../server/inbound/assistant/__tests__/helpers/daemon-source.js';
import { createAutomaticPluginRuns, type AutomaticPluginRun } from '../automatic-agent-plugins.js';

// Real catalog, activation, ranker, skill resolution and effective settings. No daemon boot.
async function fixture(t: TestContext) {
  const site = createTempSiteLayoutFixture({});
  t.after(site.cleanup);
  const workspaceId = 'workspace-auto';
  const pluginId = 'synthetic-author';
  const layout = site.deps.agentPluginLayout;
  const workspace = layout.forWorkspace(workspaceId);
  const packageDir = path.join(workspace.pluginPackagesDir({ pluginId }), 'a'.repeat(64));
  await mkdir(path.join(packageDir, 'skills', pluginId), { recursive: true });
  await writeFile(path.join(packageDir, 'plugin.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: pluginId, version: '1.0.0', keywords: ['holography'], extensions: { tovu: { id: `test/${pluginId}`, displayName: 'Synthetic Author', provides: ['theme-authoring'] } } }));
  await writeFile(path.join(packageDir, 'skills', pluginId, 'SKILL.md'), `---\nname: ${pluginId}\ndescription: Holography instructions\n---\nUse holographic layout discipline.\n`);
  await writeFile(path.join(workspace.root, 'activations.json'), JSON.stringify({ schemaVersion: 1, plugins: { [pluginId]: { enabled: true, origin: 'operator-installed', updatedAt: '2026-10-18T00:00:00.000Z', updatedBy: 'fixture' } } }));
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
  return { runs, context, published, workspaceId, pluginId, principalRepo, settingsRepo, clock, idGen, surfaceExchanges };
}

test('Auto preflight returns real installed guidance; a first reset after an unmatched prompt loads guidance once', async t => {
  const { runs, context, published, pluginId } = await fixture(t);
  assert.match(await runs.start({ runId: 'preflight', context }), /Use holographic layout discipline/);
  assert.deepEqual(published.at(-1)?.plugins, [{ id: pluginId, name: 'Synthetic Author' }]);
  const gate = { principal: context.principal, run: { id: 'preflight' }, tool: { id: 'theme_reset_file', metadata: themeMetadata.theme_reset_file }, signal: context.signal };
  assert.equal(await runs.prepareGuidance(gate), '', 'preflight guidance must not be duplicated by the tool gate');
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
  } } }), /Use holographic layout discipline/);
  assert.equal((await read('alice')).value, 'auto');
  assert.equal((await read('bob')).value, 'ask');
  assert.equal(f.surfaceExchanges.size(), 0);
  f.runs.forget({ runId: 'ask-auto' });
});

test('CLI onStarted places real automatic preflight guidance into the executor prompt', async t => {
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
  assert.match(input.prompt, /Use holographic layout discipline/);
  assert.match(input.prompt, /Design holography/);
  f.runs.forget({ runId: 'daemon-test-run' });
});
