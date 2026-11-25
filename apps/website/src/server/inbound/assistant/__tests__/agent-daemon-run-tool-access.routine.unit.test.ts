import assert from 'node:assert/strict';
import test from 'node:test';
import { createRunToolChoice } from '../agent-daemon-run-tool-access.js';
import type { RunPorts } from '../agent-daemon-run-start.js';

/**
 * @file The strict routine branch of tool access (P3 test debt). A trusted routine run has nobody
 * watching, so it must never open a consent card or offer another agent; it either proceeds on
 * no-card read-only grants or fails with a plain reason. A person's run keeps the interactive path.
 */

const def = { id: 'cli', name: 'Cli', supportsNativeToolAccess: false, mcpIsolation: 'no-client' as const };
const other = { id: 'other', name: 'Other', available: true, authStatus: 'ok' };
const MARKER = { routineId: 'r1', runId: 'run-1', catchUp: false, slotAt: null };

/** Minimal run ports; `routine` makes it a trusted routine run, `off` are the switches the owner left off. */
function fakeRun({ off, routine }: { off: readonly string[]; routine: boolean }) {
  const capabilities: Record<string, boolean> = Object.fromEntries(off.map(key => [key, false]));
  const cards: string[][] = [];
  const failures: string[] = [];
  const allowed: string[][] = [];
  const finished: string[] = [];
  const ports = {
    run: { id: 'run-1' }, principal: { id: 'owner' }, env: {}, pluginAbort: new AbortController(),
    isDisposed: () => false, state: { revokedToolRuns: new Set<string>() }, randomUUID: () => 'tool-use-1',
    surfaceExchanges: {}, resolveHostSignals: () => ({}), getAgentDef: () => def,
    resolveAgentLaunch: () => ({ launchPath: '/usr/bin/cli' }),
    // A second qualified agent exists, so an interactive run COULD be offered an alternative.
    assistantInventory: { listAssistantAgents: async () => [{ id: 'cli', name: 'Cli', available: true, authStatus: 'ok' }, other] },
    readAssistantRunToolPolicy: async () => ({ isOwner: true, def, settings: {}, effective: {}, nativeCapabilities: { ...capabilities },
      policy: { nativeToolAccess: true, nativeCapabilities: { ...capabilities } }, lock: undefined, settingsSource: 'site' }),
    routeDeps: { workspaceId: 'site-1',
      readToolConsentSnapshot: async () => ({ allowed: true, revisionSeq: 7, permissions: { enabled: true, capabilities: { ...capabilities } } }),
      allowRunTools: async ({ keys }: { keys: readonly string[] }) => { allowed.push([...keys]); for (const key of keys) capabilities[key] = true; return true; } },
    requestAssistantToolConsent: async ({ keys }: { keys: readonly string[] }) => { cards.push([...keys]); return { status: 'cancelled' }; },
    failRunBeforeStart: async ({ message }: { message: string }) => { failures.push(message); },
    runLifecycle: { get: async () => ({ state: 'running' }), emit: async () => {}, finish: async ({ status }: { status: string }) => { finished.push(status); } },
    ...(routine ? { routine: MARKER } : {}),
  };
  return { ports: ports as unknown as RunPorts, cards, failures, allowed, finished };
}

const choose = (fake: ReturnType<typeof fakeRun>) => createRunToolChoice(fake.ports).prepareRunToolAccess({ selectedAgentId: 'cli' });

test('a routine run that needs a write switch fails with a plain reason: no card, no alternative, nothing granted', async () => {
  const fake = fakeRun({ off: ['fileWrite'], routine: true });
  assert.equal(await choose(fake), null);
  assert.deepEqual(fake.cards, [], 'an unattended run never opens the consent card');
  assert.deepEqual(fake.allowed, []);
  assert.equal(fake.failures.length, 1);
  assert.match(fake.failures[0]!, /This routine could not run: Cli needs tool access that only a person can approve/);
  assert.deepEqual(fake.finished, [], 'it fails through failRunBeforeStart, it is not left cancelled by a card');
});

test('a routine run whose missing switches are read-only proceeds on the no-card grant', async () => {
  const fake = fakeRun({ off: ['web'], routine: true });
  assert.equal(await choose(fake), 'cli');
  assert.deepEqual(fake.cards, []);
  assert.deepEqual(fake.allowed, [['web']]);
  assert.deepEqual(fake.failures, []);
});

test('the same missing write switch on a person\'s run (no routine marker) still opens the consent card', async () => {
  const fake = fakeRun({ off: ['fileWrite'], routine: false });
  assert.equal(await choose(fake), null);
  assert.deepEqual(fake.cards, [['fileWrite']]);
  assert.deepEqual(fake.failures, [], 'the interactive path cancels through the card, not the routine failure');
  assert.deepEqual(fake.finished, ['cancelled']);
});
