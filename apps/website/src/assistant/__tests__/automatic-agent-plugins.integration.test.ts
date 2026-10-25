import '../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { InMemorySettingsRepo, getEffective } from '@jini-ai/core/settings';
import { InMemoryPrincipalRepo } from '@jini-ai/user-management/server';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createSystemClock, createRandomUuidGenerator } from '@jini-ai/core/primitives';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { createToolRegistry } from '@jini-ai/core';
import { createToolExecutor } from '@jini-ai/daemon';
import { AWAITING_ANSWER_NOTICE, createDurableRecovery, type DurableRun, type DurableRunStore, type RecoveryPorts } from '@jini-ai/chat/server/durable-runs';
import { createTempSiteLayoutFixture } from '#src/__tests__/fixtures/site-layout-context';
import { toolMetadata as themeMetadata } from '../../contracts/core/tool-metadata/theme.js';
import { ASK_CHOICE_TOOL_ID } from '../ask-choice-tool.js';
import { ensureAdminInterfaceSettingDefinitions } from '../../features/settings/admin-interface.js';
import { createSettingsPrincipalLookup, set } from '../../features/settings/index.js';
import { captureDaemonRun } from '../../server/inbound/assistant/__tests__/helpers/daemon-source.js';
import { buildAgentPluginSearchRegistrations } from '../../features/agent-plugins/tool-registrations.js';
import { resolveAgentPluginRefs } from '../../features/agent-plugins/lifecycle.js';
import { setAgentPluginEnabled } from '../../features/agent-plugins/set-enabled.js';
import { createAutomaticPluginRuns, type AutomaticPluginRun } from '../automatic-agent-plugins.js';

// Real catalog, activation, ranker, skill resolution and effective settings. No daemon boot.
async function fixture(t: TestContext, { pluginId = 'synthetic-author', count = 1, trusted = true, maturity }: { pluginId?: string; count?: number; trusted?: boolean; maturity?: 'untested' | 'soon' } = {}) {
  const site = createTempSiteLayoutFixture({});
  t.after(site.cleanup);
  const workspaceId = 'workspace-auto';
  const layout = site.deps.agentPluginLayout;
  const workspace = layout.forWorkspace(workspaceId);
  const pluginIds = Array.from({ length: count }, (_, i) => count === 1 ? pluginId : `synthetic-${String(i).padStart(2, '0')}`);
  for (const id of pluginIds) {
    const packageDir = path.join(workspace.pluginPackagesDir({ pluginId: id }), 'a'.repeat(64));
    await mkdir(path.join(packageDir, 'skills', id), { recursive: true });
    await writeFile(path.join(packageDir, 'plugin.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: id, version: '1.0.0', keywords: ['holography'], extensions: { tovu: { id: `test/${id}`, displayName: count === 1 ? 'Synthetic Author' : id, provides: ['theme-authoring'], maturity } } }));
    await writeFile(path.join(packageDir, 'skills', id, 'SKILL.md'), `---\nname: ${id}\ndescription: Holography instructions\n---\nUse holographic layout discipline.\n`);
  }
  await writeFile(path.join(workspace.root, 'activations.json'), JSON.stringify({ schemaVersion: 1, plugins: Object.fromEntries(pluginIds.map(id => [id, { enabled: true, origin: 'bundled', updatedAt: '2026-10-18T00:00:00.000Z', updatedBy: 'fixture' }])) }));
  // The fixture represents a build-seeded package; untrusted = a bundled id at a digest the build did not ship.
  await writeFile(path.join(workspace.root, 'bundled-digests.json'), JSON.stringify({ schemaVersion: 1, plugins: Object.fromEntries(pluginIds.map(id => [id, { archiveDigest: (trusted ? 'a' : 'b').repeat(64) }])) }));
  const settingsRepo = new InMemorySettingsRepo();
  const clock = { nowIso: () => '2026-10-18T00:00:00.000Z', nowMs: () => 0 };
  let counter = 0;
  const idGen = { newId: () => `id-${++counter}` };
  const principalRecords = new InMemoryPrincipalRepo({});
  const principalRepo = Object.assign(principalRecords, createSettingsPrincipalLookup({ repo: principalRecords }));
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

for (const action of ['use', 'skip'] as const) {
  for (const checkpointed of [false, true]) {
    test(`pending Ask ${action}: ${checkpointed ? 'process loss ends the turn and honours a late answer' : 'real recovery replaces the attempt without another card'}`, async t => {
      const f = await fixture(t, { count: 2 });
      const { createSettingsPrincipalLookup } = await import('../../features/settings/index.js');
      await f.principalRepo.save({ id: 'alice', workspaceId: f.workspaceId, kind: 'user', displayName: 'Alice', status: 'active', createdAt: f.clock.nowIso() });
      await set({ deps: { repo: f.settingsRepo, clock: f.clock, ids: f.idGen, principals: createSettingsPrincipalLookup({ repo: f.principalRepo }), authorize: async () => ({ allowed: true, reason: 'test' }) },
        input: { namespace: 'core.interface', key: 'chatAgentPlugins', scope: 'user', workspaceId: f.workspaceId, principalId: 'alice', callerPrincipalId: 'alice', authWorkspaceId: f.workspaceId, value: 'ask' } });
      const selected = action === 'use' ? ['synthetic-00'] : [];
      let cards = 0;
      let exchangeId = '';
      let savedCard: unknown;
      let opened!: () => void;
      const opening = new Promise<void>(resolve => { opened = resolve; });
      const answer = (id: string) => f.surfaceExchanges.deliver({ exchangeId: id, principalId: 'alice', params: { __choiceAction: action, selections: selected } }, { toolId: ASK_CHOICE_TOOL_ID });
      const abort = new AbortController();
      const context = { ...f.context, signal: abort.signal,
        publish: async (value: Parameters<AutomaticPluginRun['publish']>[0]) => {
          if (abort.signal.aborted) throw new Error('cannot emit on a terminal attempt');
          await f.context.publish(value);
        }, emitSurface: async (emission: Parameters<AutomaticPluginRun['emitSurface']>[0]) => {
          if (emission.channel === 'user_message') {
            assert.equal(typeof emission.payload.surfaceUri, 'string');
            assert.equal(typeof emission.payload.text, 'string');
            return;
          }
        cards++;
        savedCard = emission.payload.resource;
        const html = (emission.payload.resource as { resource: { text: string } }).resource.text;
        const id = html.match(/__exchangeId"\s*:\s*"([^"]+)"/)?.[1];
        assert.ok(id);
        if (cards === 1) { exchangeId = id; opened(); }
        else answer(id); // Let broken duplicate-card behavior settle instead of hanging the test.
      } };
      const first = f.runs.start({ runId: 'old', messageId: 'answer', context });
      t.after(() => { answer(exchangeId); f.runs.forget({ runId: 'old' }); f.runs.forget({ runId: 'next' }); });
      await opening;
      let current: DurableRun = {
        messageId: 'answer', conversationId: 'chat', runId: 'old', workspaceId: f.workspaceId, principalId: 'alice', engine: 'daemon',
        request: { agentId: 'claude', contextRef: JSON.stringify({ prompt: 'Design holography', conversationId: 'chat', agentPluginState: context.state }) },
        // The card can be emitted before its checkpoint reaches storage. Recovery must still
        // share the in-memory exchange when it advances this logical message to a new attempt.
        message: { id: 'answer', role: 'assistant', content: '', runId: 'old', runStatus: 'running', events: checkpointed ? [{ kind: 'ext', name: 'mcp-ui', data: savedCard }] : [] },
        transcript: [], recoveryCount: 0, recoveryDeadline: null, attemptStartedAt: 0, lastProgressAt: 20_000,
        cancelReason: null, sessionId: null, sessionConfirmed: false, child: null, attemptBase: [],
      };
      const settlements: Parameters<RecoveryPorts['settle']>[0][] = [];
      const launches: string[] = [];
      let retry: Promise<string> | undefined;
      const store = {
        load: async () => current,
        advance: async ({ nextRunId, events }: Parameters<DurableRunStore['advance']>[0]) => {
          current = { ...current, runId: nextRunId, message: { ...current.message, runId: nextRunId, events: [...events] } };
          return true;
        },
        recoveryClock: async () => {},
      } as unknown as DurableRunStore;
      const recovery = createDurableRecovery({
        store, now: () => 20_000, mintRunId: () => 'next', probe: async () => 'dead', attach: () => {},
        cancelAttempt: async ({ runId }) => { abort.abort(); f.runs.forget({ runId }, { preservePending: true }); },
        verifyChildDead: async () => true, supportsNativeResume: () => false,
        launch: async ({ run, request }) => {
          launches.push(run.runId);
          const decoded = JSON.parse(request.contextRef);
          retry = f.runs.start({ runId: run.runId, messageId: decoded.assistantMessageId,
            context: { ...context, publish: f.context.publish, signal: new AbortController().signal, state: decoded.agentPluginState } });
        },
        settle: async value => { settlements.push(value); return true; },
      }, { logger: { info() {} } });
      assert.equal(await recovery.recover({ messageId: 'answer', trigger: 'boot' }, {}), checkpointed ? 'finalized' : 'continued');
      if (checkpointed) {
        assert.deepEqual(launches, []);
        assert.equal(settlements.length, 1);
        assert.deepEqual(settlements[0]?.events.at(-1), { kind: 'status', label: AWAITING_ANSWER_NOTICE });
      } else {
        assert.deepEqual(launches, ['next']);
        assert.equal(current.runId, 'next', 'exercise recover.ts minting a replacement attempt');
      }
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(f.surfaceExchanges.size(), 1, 'attempt disposal must keep the unanswered exchange');
      assert.equal(answer(exchangeId).ok, true);
      const notes = [await first];
      if (retry) notes.push(await retry);
      const decidedContext = { ...context, publish: f.context.publish, signal: new AbortController().signal };
      notes.push(await f.runs.start({ runId: 'next', messageId: checkpointed ? 'following-answer' : 'answer', context: decidedContext }));
      assert.equal(cards, 1, 'pending, decided and late-answer retries must reuse the original question');
      assert.equal(f.surfaceExchanges.size(), 0);
      const decided = { decision: { selected, asked: true }, excluded: action === 'use' ? ['synthetic-01'] : ['synthetic-00', 'synthetic-01'] };
      assert.deepEqual(f.published.at(-1)?.state, decided);
      assert.equal(f.published.length, 1, 'late consent is carried into the following turn');
      for (const note of notes) {
        if (action === 'use') { assert.match(note, /synthetic-00/); assert.doesNotMatch(note, /synthetic-01/); }
        else assert.equal(note, '');
      }
      await assert.rejects(f.runs.start({ runId: 'next', context: { ...decidedContext, conversationId: 'another-chat' } }), /unavailable/);
      await assert.rejects(f.runs.start({ runId: 'next', context: { ...decidedContext, principal: { id: 'bob' } } }), /unavailable/);
      f.runs.forget({ runId: 'next' });
      f.runs.forget({ runId: 'old' });
      // Logical disposal allows a fresh controller, with no aliases pointing at the old one.
      await f.runs.start({ runId: 'next', messageId: 'answer', context: decidedContext });
      assert.equal(cards, 2);
      assert.equal(f.surfaceExchanges.size(), 0);
      f.runs.forget({ runId: 'next' });
    });
  }
}

test('controller identity binds principal and conversation; disposal removes every attempt alias', async t => {
  const f = await fixture(t);
  await f.runs.start({ runId: 'one', messageId: 'answer', context: f.context });
  await assert.rejects(f.runs.start({ runId: 'one', messageId: 'answer', context: { ...f.context, conversationId: 'other-chat' } }), /unavailable/);
  await assert.rejects(f.runs.start({ runId: 'two', messageId: 'answer', context: { ...f.context, conversationId: 'other-chat' } }), /unavailable/);
  await assert.rejects(f.runs.start({ runId: 'two', messageId: 'answer', context: { ...f.context, principal: { id: 'bob' } } }), /unavailable/);
  await f.runs.start({ runId: 'two', messageId: 'answer', context: f.context });
  f.runs.forget({ runId: 'one' });
  assert.match(await f.runs.prepareGuidance({ principal: f.context.principal, run: { id: 'two' }, tool: { id: 'theme_reset_file', metadata: themeMetadata.theme_reset_file }, signal: f.context.signal }), /Use holographic layout discipline/);
  f.runs.forget({ runId: 'two' });
  assert.equal(await f.runs.prepareGuidance({ principal: f.context.principal, run: { id: 'two' }, tool: { id: 'theme_reset_file', metadata: themeMetadata.theme_reset_file }, signal: f.context.signal }), '');
  // Reusing both identities after disposal constructs a clean, independently bound controller.
  await f.runs.start({ runId: 'two', messageId: 'answer', context: { ...f.context, conversationId: 'other-chat', principal: { id: 'bob' } } });
  assert.match(await f.runs.prepareGuidance({ principal: { id: 'bob' }, run: { id: 'two' }, tool: { id: 'theme_reset_file', metadata: themeMetadata.theme_reset_file }, signal: f.context.signal }), /Use holographic layout discipline/);
  f.runs.forget({ runId: 'two' });
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
  const read = async (principalId: string) => {
    const setting = await getEffective({ repo: f.settingsRepo }, { namespace: 'core.interface', key: 'chatAgentPlugins', scopeContext: { workspaceId: f.workspaceId, principalId } });
    assert.ok(setting, 'the registered preference must resolve');
    return setting;
  };
  assert.match(await f.runs.start({ runId: 'ask-auto', context: { ...f.context, emitSurface: async emission => {
    if (emission.channel === 'user_message') {
      assert.equal(typeof emission.payload.surfaceUri, 'string');
      assert.equal(typeof emission.payload.text, 'string');
      return;
    }
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

test('CLI preflight preserves the answer receipt channel in the durable run stream', async () => {
  const resource = { type: 'resource', resource: { uri: 'ui://tovu/ask-choice/alice/one', mimeType: 'text/html', text: '<form>Choose</form>' } };
  const receipt = { id: 'answer:one', surfaceUri: resource.resource.uri, text: 'Agent plugins: GitHub', answerText: 'GitHub' };
  const wire: Record<string, unknown>[] = [];
  await captureDaemonRun({ conversationId: 'chat', prompt: 'Use the repository' }, {
    lifecycle: { waitForTerminal: () => new Promise(() => {}), onCancelRequested: () => () => {}, stream: async () => {},
      emit: async ({ input }: { input: { data: Record<string, unknown> } }) => { wire.push(input.data); } },
    bindings: {
      automaticPluginRuns: { forget() {}, start: async ({ context }: { context: AutomaticPluginRun }) => {
        await context.emitSurface({ channel: 'mcp-ui', payload: { resource } });
        await context.emitSurface({ channel: 'user_message', payload: receipt });
        return '';
      } },
      routeDeps: { agentSessions: { getSessionId: async () => null, setSessionId: async () => {} } },
      liveRunTracker: { register() {}, hasConcurrentLiveRun: () => false },
      waitForStoppingRuns: async () => {}, STOPPING_RUN_WAIT_MS: 20_000,
    },
  });
  assert.deepEqual(wire, [
    { type: 'mcp-ui', toolUseId: 'agent-plugins:daemon-test-run', resource },
    { type: 'user_message', ...receipt },
  ]);
});

for (const maturity of ['untested', 'soon', undefined] as const) {
  test(`load_agent_plugin carries maturity ${maturity ?? '(absent)'}`, async t => {
    const f = await fixture(t, { maturity });
    t.after(() => f.runs.forget({ runId: 'maturity' }));
    await f.runs.start({ runId: 'maturity', context: { ...f.context, query: 'unrelated' } });
    const registry = createToolRegistry({});
    registry.register(f.runs.loadRegistration);
    const executor = createToolExecutor({ registry }, { prepareGuidance: f.runs.prepareGuidance });
    const result = await executor.execute({ principal: f.context.principal, run: { id: 'maturity' }, toolId: 'load_agent_plugin', input: { pluginId: f.pluginId } });
    assert.equal(result.status, 'completed');
    const output = result.output as { status: string; maturity?: string };
    assert.equal(output.status, 'loaded');
    assert.equal(output.maturity, maturity);
    assert.equal(Object.hasOwn(output, 'maturity'), maturity !== undefined);
    assert.equal(JSON.stringify(output).includes("Before saving keys or acting with this plugin"), maturity !== undefined);
  });
}

test('automatic tool guidance warns before actions for an untested plugin', async t => {
  const f = await fixture(t, { maturity: 'untested' });
  t.after(() => f.runs.forget({ runId: 'maturity-auto' }));
  await f.runs.start({ runId: 'maturity-auto', context: f.context });
  const guidance = await f.runs.prepareGuidance({ principal: f.context.principal, run: { id: 'maturity-auto' }, tool: { id: 'theme_reset_file', metadata: themeMetadata.theme_reset_file }, signal: f.context.signal });
  assert.match(guidance, /Before saving keys or acting with this plugin/);
  assert.match(guidance, /Use holographic layout discipline/);
});

test('load_agent_plugin uses the real resolver and publishes the loaded chip through the real executor', async t => {
  const f = await fixture(t);
  await f.runs.start({ runId: 'explicit', context: { ...f.context, query: 'unrelated' } });
  assert.equal(f.published.length, 0);
  const registry = createToolRegistry({});
  registry.register(f.runs.loadRegistration);
  const executor = createToolExecutor({ registry }, { prepareGuidance: f.runs.prepareGuidance });
  const result = await executor.execute({ principal: f.context.principal, run: { id: 'explicit' }, toolId: 'load_agent_plugin', input: { pluginId: f.pluginId } });
  assert.equal(result.status, 'completed');
  assert.equal((result.output as { status: string }).status, 'loaded');
  assert.match(JSON.stringify(result.output), /Use holographic layout discipline/);
  assert.deepEqual(f.published.at(-1)?.plugins, [{ id: f.pluginId, name: 'Synthetic Author' }]);
  assert.equal(await f.runs.prepareGuidance({ principal: f.context.principal, run: { id: 'explicit' }, tool: { id: 'theme_reset_file', metadata: themeMetadata.theme_reset_file }, signal: f.context.signal }), '');
  const missing = await executor.execute({ principal: f.context.principal, run: { id: 'explicit' }, toolId: 'load_agent_plugin', input: { pluginId: 'not-installed' } });
  assert.equal(missing.status, 'completed');
  assert.equal((missing.output as { status: string }).status, 'missing');
  assert.doesNotMatch((missing.output as { note: string }).note, /plugins_set_enabled|enabled:true|agent_plugin_not_installed/);
  f.runs.forget({ runId: 'explicit' });
});

test('inactive Higgsfield returns the exact activation and retry calls without activating it', async t => {
  const f = await fixture(t, { pluginId: 'higgsfield-media' });
  await setAgentPluginEnabled({ agentPluginLayout: f.layout, workspaceId: f.workspaceId, pluginId: f.pluginId, enabled: false, actor: 'fixture' });
  await f.runs.start({ runId: 'inactive', context: f.context });
  const registry = createToolRegistry({});
  registry.register(f.runs.loadRegistration);
  const executor = createToolExecutor({ registry });
  const input = { principal: f.context.principal, run: { id: 'inactive' }, toolId: 'load_agent_plugin', input: { pluginId: f.pluginId } };
  const result = await executor.execute(input);
  assert.equal(result.status, 'completed');
  const output = result.output as { status: string; guidance: string; note: string };
  assert.equal(output.status, 'installed-but-inactive');
  assert.equal(output.guidance, '');
  assert.ok(output.note.includes('plugins_set_enabled({family:"agent-plugin",pluginId:"higgsfield-media",enabled:true})'));
  assert.ok(output.note.includes('load_agent_plugin({pluginId:"higgsfield-media"})'));
  assert.doesNotMatch(output.note, /agent_plugin_higgsfield_media/);
  assert.equal(f.published.length, 0);
  const stillInactive = await executor.execute(input);
  assert.equal((stillInactive.output as { status: string }).status, 'installed-but-inactive');
  await setAgentPluginEnabled({ agentPluginLayout: f.layout, workspaceId: f.workspaceId, pluginId: f.pluginId, enabled: true, actor: 'fixture' });
  const retry = await executor.execute(input);
  assert.equal((retry.output as { status: string }).status, 'loaded');
  assert.match((retry.output as { guidance: string }).guidance, /Use holographic layout discipline/);
  const again = await executor.execute(input);
  assert.equal((again.output as { status: string }).status, 'already-loaded');
  assert.doesNotMatch((again.output as { note: string }).note, /plugins_set_enabled|enabled:true/);
  f.runs.forget({ runId: 'inactive' });
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
  assert.equal((excluded.output as { status: string }).status, 'excluded');
  assert.doesNotMatch((excluded.output as { note: string }).note, /plugins_set_enabled|enabled:true/);
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

for (const denied of ['ask', 'off', 'untrusted', 'unavailable'] as const) {
  test(`explicit loader and guarded write refuse ${denied} through the real executor`, async t => {
    const f = await fixture(t, { trusted: denied !== 'untrusted' });
    if (denied === 'unavailable') await unlink(path.join(f.workspace.pluginPackagesDir({ pluginId: f.pluginId }), 'a'.repeat(64), 'skills', f.pluginId, 'SKILL.md'));
    if (denied === 'ask' || denied === 'off') {
      await f.principalRepo.save({ id: 'alice', workspaceId: f.workspaceId, kind: 'user', displayName: 'Alice', status: 'active', createdAt: f.clock.nowIso() });
      const { createSettingsPrincipalLookup } = await import('../../features/settings/index.js');
      await set({ deps: { repo: f.settingsRepo, clock: f.clock, ids: f.idGen, principals: createSettingsPrincipalLookup({ repo: f.principalRepo }), authorize: async () => ({ allowed: true, reason: 'fixture' }) },
        input: { namespace: 'core.interface', key: 'chatAgentPlugins', scope: 'user', workspaceId: f.workspaceId, principalId: 'alice', callerPrincipalId: 'alice', authWorkspaceId: f.workspaceId, value: denied } });
    }
    const context = { ...f.context, state: { decision: { selected: [], asked: true }, excluded: [] } };
    const note = await f.runs.start({ runId: denied, context });
    if (denied === 'ask' || denied === 'off') assert.equal(note, '');
    const registry = createToolRegistry({});
    registry.register(f.runs.loadRegistration);
    registry.register({ descriptor: { id: 'guarded_write', description: 'Fixture theme write', metadata: themeMetadata.theme_reset_file }, policy: { authorize: async () => 'allow' as const }, handler: async () => ({ written: true }) });
    const executor = createToolExecutor({ registry }, { prepareGuidance: f.runs.prepareGuidance });
    const result = await executor.execute({ principal: context.principal, run: { id: denied }, toolId: 'load_agent_plugin', input: { pluginId: f.pluginId } });
    assert.equal(result.status, 'completed');
    assert.equal((result.output as { guidance: string }).guidance, '');
    assert.equal((result.output as { status: string }).status, denied === 'ask' ? 'excluded' : denied);
    assert.doesNotMatch((result.output as { note: string }).note, /plugins_set_enabled|enabled:true|agent_plugin_synthetic_author/);
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

test('a turn whose signal is already aborted registers no controller and returns no note', async t => {
  const f = await fixture(t);
  const aborted = new AbortController();
  aborted.abort();
  assert.equal(await f.runs.start({ runId: 'gone', context: { ...f.context, signal: aborted.signal } }), '');
  assert.equal(await f.runs.prepareGuidance({ principal: f.context.principal, run: { id: 'gone' }, tool: { id: 'theme_reset_file', metadata: themeMetadata.theme_reset_file }, signal: f.context.signal }), '');
});

test('a tool without guidance capabilities loads no plugin guidance', async t => {
  const f = await fixture(t);
  await f.runs.start({ runId: 'plain', context: f.context });
  assert.equal(await f.runs.prepareGuidance({ principal: f.context.principal, run: { id: 'plain' }, tool: { id: 'plain_tool' }, signal: f.context.signal }), '');
  assert.equal(f.published.length, 0);
  f.runs.forget({ runId: 'plain' });
});

test('a failing guidance preparation is logged without detail and yields no guidance', async t => {
  const warn = t.mock.method(console, 'warn', () => {});
  const f = await fixture(t);
  await f.principalRepo.save({ id: 'alice', workspaceId: f.workspaceId, kind: 'user', displayName: 'Alice', status: 'active', createdAt: f.clock.nowIso() });
  await set({ deps: { repo: f.settingsRepo, clock: f.clock, ids: f.idGen, principals: createSettingsPrincipalLookup({ repo: f.principalRepo }), authorize: async () => ({ allowed: true, reason: 'test' }) },
    input: { namespace: 'core.interface', key: 'chatAgentPlugins', scope: 'user', workspaceId: f.workspaceId, principalId: 'alice', callerPrincipalId: 'alice', authWorkspaceId: f.workspaceId, value: 'ask' } });
  // The consent card cannot be shown, so asking fails inside the controller's preparation.
  const context = { ...f.context, emitSurface: async () => { throw new Error('surface closed: secret detail'); } };
  await assert.rejects(f.runs.start({ runId: 'broken', context }), { message: 'surface closed: secret detail' });
  assert.equal(await f.runs.prepareGuidance({ principal: f.context.principal, run: { id: 'broken' }, tool: { id: 'theme_reset_file', metadata: themeMetadata.theme_reset_file }, signal: f.context.signal }), '');
  assert.deepEqual(warn.mock.calls.map(call => call.arguments), [['[agent-plugins] automatic tool guidance unavailable']]);
  f.runs.forget({ runId: 'broken' });
});

test('load_agent_plugin refuses any input key other than pluginId', async t => {
  const f = await fixture(t);
  await f.runs.start({ runId: 'strict', context: f.context });
  await assert.rejects(f.runs.loadRegistration.handler({ executionId: 'x', principal: f.context.principal, run: { id: 'strict' }, input: { pluginId: f.pluginId, extra: true }, signal: f.context.signal }),
    { name: 'ToolInputError', message: 'Only pluginId is accepted' });
  f.runs.forget({ runId: 'strict' });
});

test('a disposed Ask turn publishes nothing after its pending question is aborted', async t => {
  const f = await fixture(t, { count: 2 });
  await f.principalRepo.save({ id: 'alice', workspaceId: f.workspaceId, kind: 'user', displayName: 'Alice', status: 'active', createdAt: f.clock.nowIso() });
  await set({ deps: { repo: f.settingsRepo, clock: f.clock, ids: f.idGen, principals: createSettingsPrincipalLookup({ repo: f.principalRepo }), authorize: async () => ({ allowed: true, reason: 'test' }) },
    input: { namespace: 'core.interface', key: 'chatAgentPlugins', scope: 'user', workspaceId: f.workspaceId, principalId: 'alice', callerPrincipalId: 'alice', authWorkspaceId: f.workspaceId, value: 'ask' } });
  let opened!: () => void;
  const opening = new Promise<void>(resolve => { opened = resolve; });
  const started = f.runs.start({ runId: 'asked', context: { ...f.context, emitSurface: async () => { opened(); } } });
  await opening;
  f.runs.forget({ runId: 'asked' });
  await started.catch(() => '');
  assert.deepEqual(f.published, []);
});
