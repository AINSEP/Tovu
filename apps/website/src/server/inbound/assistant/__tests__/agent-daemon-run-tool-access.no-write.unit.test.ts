import assert from 'node:assert/strict';
import test from 'node:test';
import { createRunToolChoice } from '../agent-daemon-run-tool-access.js';
import type { RunPorts } from '../agent-daemon-run-start.js';

// A CLI that cannot honor individual OFF switches and loads no personal MCP sources, so the
// launch plan's consent keys are exactly the capabilities the owner switched off.
const def = { id: 'cli', name: 'Cli', supportsNativeToolAccess: false, mcpIsolation: 'no-client' as const };

/** Minimal run ports: the policy snapshot reflects whatever `allowRunTools` last saved. */
function fakeRun({ off }: { off: readonly string[] }) {
  const capabilities: Record<string, boolean> = Object.fromEntries(off.map(key => [key, false]));
  const events: { type: string; name?: string; label?: string; detail?: string }[] = [];
  const allowed: string[][] = [];
  const cards: string[][] = [];
  let finished: string | null = null;
  let revisionSeq = 7;
  const ports = {
    run: { id: 'run-1' }, principal: { id: 'owner' }, env: {}, pluginAbort: new AbortController(),
    isDisposed: () => false, state: { revokedToolRuns: new Set<string>() }, randomUUID: () => 'tool-use-1',
    surfaceExchanges: {}, resolveHostSignals: () => ({}), getAgentDef: () => def,
    resolveAgentLaunch: () => ({ launchPath: '/usr/bin/cli' }),
    assistantInventory: { listAssistantAgents: async () => [{ id: 'cli', name: 'Cli', available: true, authStatus: 'ok' }] },
    readAssistantRunToolPolicy: async () => ({ isOwner: true, def, settings: {}, effective: {}, nativeCapabilities: { ...capabilities },
      policy: { nativeToolAccess: true, nativeCapabilities: { ...capabilities } }, lock: undefined, settingsSource: 'site' }),
    routeDeps: { workspaceId: 'site-1',
      readToolConsentSnapshot: async () => ({ allowed: true, revisionSeq, permissions: { enabled: true, capabilities: { ...capabilities } } }),
      allowRunTools: async ({ keys, expectedRevisionSeq }: { keys: readonly string[]; expectedRevisionSeq: number }) => {
        if (expectedRevisionSeq !== revisionSeq) return false;
        allowed.push([...keys]); for (const key of keys) capabilities[key] = true; revisionSeq += 1; return true;
      } },
    requestAssistantToolConsent: async ({ keys }: { keys: readonly string[] }) => { cards.push([...keys]); return { status: 'cancelled' }; },
    runLifecycle: { get: async () => (finished ? { state: finished } : { state: 'running' }),
      emit: async ({ input }: { input: { data: { type: string; name?: string; label?: string; detail?: string } } }) => { events.push(input.data); },
      finish: async ({ status }: { status: string }) => { finished = status; } },
  };
  return { ports: ports as unknown as RunPorts, events, allowed, cards, capabilities, finished: () => finished };
}

const cardShown = (events: ReturnType<typeof fakeRun>['events']) => events.some(event => event.type === 'tool_use' && event.name === 'settings_set_value');

test('a run whose missing switches cannot write starts without the consent card and still discloses the access', async () => {
  const fake = fakeRun({ off: ['web', 'subagents'] });
  const selected = await createRunToolChoice(fake.ports).prepareRunToolAccess({ selectedAgentId: 'cli' });
  assert.equal(selected, 'cli');
  assert.equal(cardShown(fake.events), false, 'no Settings Set Value card for a no-write run');
  assert.deepEqual(fake.cards, []);
  assert.deepEqual(fake.allowed, [['web', 'subagents']], 'only the read-only keys the plan asked for are turned on');
  const notice = fake.events.find(event => event.type === 'status' && event.label === 'tool_access');
  assert.ok(notice, 'the prelaunch access disclosure is still emitted');
  assert.match(notice.detail!, /Cli runs with Web fetch\/search and Subagents\/Task on/);
  assert.match(notice.detail!, /other chats on this site/);
  assert.equal(fake.finished(), null);
});

test('a run that needs a write switch still stops at the consent card and grants nothing by itself', async () => {
  const fake = fakeRun({ off: ['fileWrite'] });
  const selected = await createRunToolChoice(fake.ports).prepareRunToolAccess({ selectedAgentId: 'cli' });
  assert.equal(selected, null);
  assert.equal(cardShown(fake.events), true);
  assert.deepEqual(fake.cards, [['fileWrite']]);
  assert.deepEqual(fake.allowed, []);
  assert.equal(fake.capabilities.fileWrite, false);
  assert.equal(fake.finished(), 'cancelled');
});

test('a run mixing read-only and write switches shows the card for all of them and grants nothing silently', async () => {
  const fake = fakeRun({ off: ['web', 'shell'] });
  const selected = await createRunToolChoice(fake.ports).prepareRunToolAccess({ selectedAgentId: 'cli' });
  assert.equal(selected, null);
  assert.equal(cardShown(fake.events), true);
  assert.deepEqual(fake.cards, [['web', 'shell']]);
  assert.deepEqual(fake.allowed, [], 'the read-only half is not granted behind the card');
  assert.equal(fake.capabilities.web, false);
});

test('a no-write run whose fresh settings no longer allow the owner falls back to the card', async () => {
  const fake = fakeRun({ off: ['web'] });
  const routeDeps = (fake.ports as unknown as { routeDeps: { readToolConsentSnapshot: () => Promise<unknown> } }).routeDeps;
  routeDeps.readToolConsentSnapshot = async () => ({ allowed: false, revisionSeq: 7, permissions: { enabled: true, capabilities: { web: false } } });
  await createRunToolChoice(fake.ports).prepareRunToolAccess({ selectedAgentId: 'cli' });
  assert.deepEqual(fake.allowed, []);
  assert.equal(cardShown(fake.events), true);
});
