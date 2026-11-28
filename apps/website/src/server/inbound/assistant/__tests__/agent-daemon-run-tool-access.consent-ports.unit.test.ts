import assert from 'node:assert/strict';
import test from 'node:test';
import { createRunToolChoice } from '../agent-daemon-run-tool-access.js';
import type { RunPorts } from '../agent-daemon-run-start.js';

/**
 * @file The ports the run's consent card is handed: who may approve it (only the person in this
 * live chat, and only while they are still the site's active owner), the fresh settings read, and
 * the Allow write that turns into a no-op once the run is no longer live.
 */

const def = { id: 'cli', name: 'Cli', supportsNativeToolAccess: false, mcpIsolation: 'no-client' as const };

interface CardPorts {
  surfaces: { assertAccessApprover: (input: { principalId: string }) => Promise<void> };
  readFresh: () => Promise<unknown>;
  allowSelected: (input: { keys: readonly string[]; revisionSeq: number }) => Promise<boolean>;
}

/** Run ports whose consent card records the ports it was given and answers `cancelled`. */
function fakeRun() {
  const capabilities: Record<string, boolean> = { fileWrite: false };
  const consent = { allowed: true };
  const revoked = new Set<string>();
  const cards: CardPorts[] = [];
  const allowed: unknown[] = [];
  const snapshotReads: unknown[] = [];
  let state = 'running';
  const ports = {
    run: { id: 'run-1' }, principal: { id: 'owner' }, env: {}, pluginAbort: new AbortController(),
    isDisposed: () => false, state: { revokedToolRuns: revoked }, randomUUID: () => 'tool-use-1',
    surfaceExchanges: {}, resolveHostSignals: () => ({}), getAgentDef: () => def,
    resolveAgentLaunch: () => ({ launchPath: '/usr/bin/cli' }),
    assistantInventory: { listAssistantAgents: async () => [{ id: 'cli', name: 'Cli', available: true, authStatus: 'ok' }] },
    readAssistantRunToolPolicy: async () => ({ isOwner: true, def, settings: {}, effective: {}, nativeCapabilities: { ...capabilities },
      policy: { nativeToolAccess: true, nativeCapabilities: { ...capabilities } }, lock: undefined, settingsSource: 'site' }),
    routeDeps: { workspaceId: 'site-1',
      readToolConsentSnapshot: async (input: unknown) => {
        snapshotReads.push(input);
        return { allowed: consent.allowed, revisionSeq: 7, permissions: { enabled: true, capabilities: { ...capabilities } } };
      },
      allowRunTools: async (input: unknown) => { allowed.push(input); return true; } },
    requestAssistantToolConsent: async (input: CardPorts) => { cards.push(input); return { status: 'cancelled' }; },
    failRunBeforeStart: async () => {},
    runLifecycle: { get: async () => ({ state }), emit: async () => {}, finish: async () => { state = 'cancelled'; } },
  };
  return {
    ports: ports as unknown as RunPorts, cards, allowed, snapshotReads, consent, revoked,
    setState: (next: string) => { state = next; },
  };
}

/** Opens the card for a write switch and returns the ports it was handed. */
async function cardPorts(fake: ReturnType<typeof fakeRun>): Promise<CardPorts> {
  assert.equal(await createRunToolChoice(fake.ports).prepareRunToolAccess({ selectedAgentId: 'cli' }), null);
  assert.equal(fake.cards.length, 1, 'a write switch opens exactly one consent card');
  fake.setState('running');
  return fake.cards[0]!;
}

test('only the person who started this live chat may approve its tool access card', async () => {
  const fake = fakeRun();
  const { surfaces } = await cardPorts(fake);
  await assert.rejects(surfaces.assertAccessApprover({ principalId: 'someone-else' }),
    { message: 'Tool access requires the person in this live chat.' });
  assert.deepEqual(fake.snapshotReads, [], 'another principal is refused before settings are read');
  assert.equal(await surfaces.assertAccessApprover({ principalId: 'owner' }), undefined);
  assert.deepEqual(fake.snapshotReads, [{ runId: 'run-1', agentId: 'cli' }]);
});

test('the right person is still refused once the run is revoked or has ended', async () => {
  const fake = fakeRun();
  const { surfaces } = await cardPorts(fake);
  fake.revoked.add('run-1');
  await assert.rejects(surfaces.assertAccessApprover({ principalId: 'owner' }),
    { message: 'Tool access requires the person in this live chat.' });
  fake.revoked.clear();
  fake.setState('succeeded');
  await assert.rejects(surfaces.assertAccessApprover({ principalId: 'owner' }),
    { message: 'Tool access requires the person in this live chat.' });
});

test('an approver who is no longer the active owner in fresh settings is refused', async () => {
  const fake = fakeRun();
  const { surfaces } = await cardPorts(fake);
  fake.consent.allowed = false;
  await assert.rejects(surfaces.assertAccessApprover({ principalId: 'owner' }),
    { message: 'Tool access requires the active owner of this site.' });
});

test('the card reads fresh settings for this run and agent, and Allow writes only while the run is live', async () => {
  const fake = fakeRun();
  const { readFresh, allowSelected } = await cardPorts(fake);
  const fresh = await readFresh() as { revisionSeq: number };
  assert.equal(fresh.revisionSeq, 7);
  assert.deepEqual(fake.snapshotReads.at(-1), { runId: 'run-1', agentId: 'cli' });

  assert.equal(await allowSelected({ keys: ['fileWrite'], revisionSeq: 7 }), true);
  assert.deepEqual(fake.allowed, [{ runId: 'run-1', keys: ['fileWrite'], revisionSeq: 7 }]);

  fake.setState('failed');
  assert.equal(await allowSelected({ keys: ['fileWrite'], revisionSeq: 7 }), false);
  assert.equal(fake.allowed.length, 1, 'an ended run grants nothing');
});
