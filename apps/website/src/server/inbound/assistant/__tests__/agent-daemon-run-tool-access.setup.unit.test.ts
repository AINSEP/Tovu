import assert from 'node:assert/strict';
import test from 'node:test';
import { createRandomUuidGenerator, createSystemClock } from '@jini-ai/platform/system';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createRunToolChoice } from '../agent-daemon-run-tool-access.js';
import type { RunPorts } from '../agent-daemon-run-start.js';

/**
 * @file The SETUP side of run tool access and the consent card's answers: an agent that cannot run
 * here (not installed, signed out, or its switches locked by the host) either offers a qualified
 * other agent on a setup card or fails the run with a plain reason; an answered consent card either
 * runs the selected agent once its grant is saved or switches to the offered alternative.
 */

interface Agent { id: string; name: string; available: boolean; authStatus: string }
interface Emitted { type: string; resource?: { resource: { text: string } } }

const cli = { id: 'cli', name: 'Cli', supportsNativeToolAccess: false, mcpIsolation: 'no-client' as const };
const other = { id: 'other', name: 'Other', supportsNativeToolAccess: false, mcpIsolation: 'no-client' as const };
const DEFS: Record<string, typeof cli | undefined> = { cli, other };

/**
 * Run ports for agent `cli`. `installed` lists agents that have a launch path, `off` the switches the
 * owner left off, `lock` the host lock. Policy reads follow the agent asked for and the switches the
 * last `allowRunTools` turned on; card emissions and failures are recorded.
 */
function fakeRun({ inventory, installed = ['cli', 'other'], off = [], lock, consent, routine = false, defs = DEFS }: {
  inventory: readonly Agent[]; installed?: readonly string[]; off?: readonly string[]; lock?: string; routine?: boolean;
  consent?: (input: { keys: readonly string[]; allowSelected: (input: { keys: readonly string[]; expectedRevisionSeq: number }) => Promise<boolean> }) => Promise<unknown>;
  defs?: Record<string, typeof cli | undefined>;
}) {
  const capabilities: Record<string, boolean> = Object.fromEntries(off.map(key => [key, false]));
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' });
  const emitted: Emitted[] = [];
  const failures: string[] = [];
  const policyReads: string[] = [];
  const consentCards: string[][] = [];
  const allowed: string[][] = [];
  const ports = {
    run: { id: 'run-1' }, principal: { id: 'owner' }, env: {}, pluginAbort: new AbortController(),
    isDisposed: () => false, state: { revokedToolRuns: new Set<string>() }, randomUUID: () => 'tool-use-1',
    surfaceExchanges, resolveHostSignals: () => ({}), getAgentDef: ({ id }: { id: string }) => defs[id],
    resolveAgentLaunch: ({ def }: { def: { id: string } }) => (installed.includes(def.id) ? { launchPath: `/usr/bin/${def.id}` } : {}),
    assistantInventory: { listAssistantAgents: async () => inventory },
    readAssistantRunToolPolicy: async ({ agentId }: { agentId: string }) => {
      policyReads.push(agentId);
      return { isOwner: true, def: defs[agentId], settings: {}, effective: {}, nativeCapabilities: { ...capabilities },
        policy: { nativeToolAccess: true, nativeCapabilities: { ...capabilities } }, lock, settingsSource: 'site' };
    },
    routeDeps: { workspaceId: 'site-1',
      readToolConsentSnapshot: async () => ({ allowed: true, revisionSeq: 7, permissions: { enabled: true, capabilities: { ...capabilities } } }),
      allowRunTools: async ({ keys }: { keys: readonly string[] }) => { allowed.push([...keys]); for (const key of keys) capabilities[key] = true; return true; } },
    requestAssistantToolConsent: async (input: Parameters<NonNullable<typeof consent>>[0]) => {
      consentCards.push([...input.keys]);
      return consent ? consent(input) : { status: 'cancelled' };
    },
    failRunBeforeStart: async ({ message }: { message: string }) => { failures.push(message); },
    runLifecycle: { get: async () => ({ state: 'running' }), finish: async () => {},
      emit: async ({ input }: { input: { data: Emitted } }) => { emitted.push(input.data); } },
    ...(routine ? { routine: { routineId: 'r1', runId: 'run-1', catchUp: false, slotAt: null } } : {}),
  };
  return { ports: ports as unknown as RunPorts, surfaceExchanges, emitted, failures, policyReads, consentCards, allowed };
}

const choose = (fake: ReturnType<typeof fakeRun>) => createRunToolChoice(fake.ports).prepareRunToolAccess({ selectedAgentId: 'cli' });
const agent = (id: string, name: string, overrides: Partial<Agent> = {}): Agent => ({ id, name, available: true, authStatus: 'ok', ...overrides });

/** Waits for the setup card, then answers it as the owner with `params`; returns the card's HTML. */
async function answerSetupCard(fake: ReturnType<typeof fakeRun>, params: Record<string, string>): Promise<string> {
  for (let tries = 0; tries < 50 && !fake.emitted.some(event => event.type === 'mcp-ui'); tries++) await new Promise(resolve => setImmediate(resolve));
  const card = fake.emitted.find(event => event.type === 'mcp-ui');
  assert.ok(card?.resource, 'a setup card was emitted on the run');
  const html = card.resource.resource.text;
  const exchangeId = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`))![1]!;
  assert.deepEqual(fake.surfaceExchanges.deliver({ exchangeId, principalId: 'owner', params }, { toolId: 'settings_set_value' }), { ok: true });
  return html;
}

// Mutations: drop the `alternatives.length` card (always fail); return null from the card branch.
test('an agent that is not installed offers a qualified agent on a setup card and runs with the one the person confirms', async () => {
  const fake = fakeRun({ inventory: [agent('cli', 'Cli'), agent('other', 'Other')], installed: ['other'] });
  const pending = choose(fake);
  const html = await answerSetupCard(fake, { decision: 'confirm' });
  assert.equal(await pending, 'other');
  assert.match(html, /<title>Cli needs setup\.<\/title>/);
  assert.match(html, /Cli isn(?:'|&#39;|&#x27;|&apos;)t installed\. Install it or pick another agent\./);
  assert.match(html, /Use Other/);
  assert.deepEqual(fake.failures, []);
  assert.deepEqual(fake.policyReads, ['cli', 'other'], 'the chosen agent is read fresh before it runs');
  assert.deepEqual(fake.emitted.map(event => event.type), ['tool_use', 'mcp-ui', 'tool_result']);
});

// Mutation: `if (alternative) return alternative` to `return alternative` (a decline must fail the run, not hang it).
test('a declined setup card fails the run with the setup reason', async () => {
  const fake = fakeRun({ inventory: [agent('cli', 'Cli'), agent('other', 'Other')], installed: ['other'] });
  const pending = choose(fake);
  await answerSetupCard(fake, { decision: 'cancel' });
  assert.equal(await pending, null);
  assert.deepEqual(fake.failures, ["Cli isn't installed. Install it or pick another agent."]);
  assert.deepEqual(fake.policyReads, ['cli']);
});

// Mutations: drop `!agent.available`, `agent.authStatus === 'missing'`, or the selected-agent skip (each opens a card).
test('an agent that cannot run, with no qualified other agent, fails the run without opening a card', async () => {
  const fake = fakeRun({
    inventory: [agent('cli', 'Cli'), agent('away', 'Away', { available: false }), agent('signed-out', 'Signed out', { authStatus: 'missing' }), agent('ghost', 'Ghost')],
    installed: [], defs: { cli, away: other, 'signed-out': other },
  });
  assert.equal(await choose(fake), null);
  assert.deepEqual(fake.failures, ["Cli isn't installed. Install it or pick another agent."]);
  assert.deepEqual(fake.emitted, [], 'no setup card is opened without a qualified agent');
});

// Mutations: drop the `detected?.authStatus` spread (signed-out agent would run); default an unlisted agent to 'missing'.
test('a signed-out agent gets the sign-in reason, while an agent missing from the inventory is not treated as signed out', async () => {
  const signedOut = fakeRun({ inventory: [agent('cli', 'Cli', { authStatus: 'missing' })] });
  assert.equal(await choose(signedOut), null);
  assert.deepEqual(signedOut.failures, ["Cli isn't signed in. Sign in once, then send again."]);
  const unlisted = fakeRun({ inventory: [] });
  assert.equal(await choose(unlisted), 'cli');
  assert.deepEqual(unlisted.failures, []);
});

// Mutations: drop the lock spread or the keys spread in the setup message.
test('switches the host has locked fail the run naming the switches and the lock', async () => {
  const fake = fakeRun({ inventory: [agent('cli', 'Cli')], off: ['fileWrite'], lock: 'hosted' });
  assert.equal(await choose(fake), null);
  assert.deepEqual(fake.failures, ["Cli needs fileWrite on, and they're off on hosted sites."]);
  assert.deepEqual(fake.consentCards, [], 'a locked switch never opens the consent card');
});

// Mutation: `snapshot.def?.name ?? selected` to `snapshot.def!.name` (a routine for an unknown agent must still fail plainly).
test('a routine run for an agent with no definition fails naming the agent id', async () => {
  const fake = fakeRun({ inventory: [], routine: true, defs: {} });
  assert.equal(await choose(fake), null);
  assert.deepEqual(fake.failures, ['This routine could not run: cli needs tool access that only a person can approve. Open the assistant, allow it there, then run the routine again.']);
});

// Mutation: `snapshot.def?.name ?? selected` to `snapshot.def!.name` in the person's (non-routine) setup path.
test('a person\'s run for an agent with no definition fails naming the agent id as not installed', async () => {
  const fake = fakeRun({ inventory: [agent('cli', 'Cli')], defs: {} });
  assert.equal(await choose(fake), null);
  assert.deepEqual(fake.failures, ["cli isn't installed. Install it or pick another agent."]);
  assert.deepEqual(fake.emitted, []);
});

// Mutation: `if (result.status === 'allowed') return selected` removed (an allowed card would cancel the run).
test('an allowed consent card runs the selected agent once its saved grant makes the plan runnable', async () => {
  const fake = fakeRun({ inventory: [agent('cli', 'Cli')], off: ['fileWrite'],
    consent: async ({ keys, allowSelected }) => (await allowSelected({ keys, expectedRevisionSeq: 7 }) ? { status: 'allowed' } : { status: 'cancelled' }) });
  assert.equal(await choose(fake), 'cli');
  assert.deepEqual(fake.consentCards, [['fileWrite']]);
  assert.deepEqual(fake.allowed, [['fileWrite']]);
  assert.deepEqual(fake.policyReads, ['cli', 'cli'], 'the plan is re-read after the grant');
  assert.deepEqual(fake.failures, []);
});

// Mutation: `if (result.status === 'alternative') return result.agentId` removed.
test('choosing the offered alternative on the consent card switches the run to that agent and asks again for it', async () => {
  let answers = 0;
  const fake = fakeRun({ inventory: [agent('cli', 'Cli'), agent('other', 'Other')], off: ['fileWrite'],
    // First card (for Cli): the person picks Other. Other needs the same switch, so its own card opens and is allowed.
    consent: async ({ keys, allowSelected }) => (answers++ === 0 ? { status: 'alternative', agentId: 'other' }
      : await allowSelected({ keys, expectedRevisionSeq: 7 }) ? { status: 'allowed' } : { status: 'cancelled' }) });
  assert.equal(await choose(fake), 'other');
  assert.deepEqual(fake.consentCards, [['fileWrite'], ['fileWrite']]);
  assert.deepEqual(fake.policyReads, ['cli', 'other', 'other']);
  assert.deepEqual(fake.failures, []);
});

// Mutation: the loop's trailing `return null` to `return selectedAgentId`.
test('a run revoked before preparation starts gets no agent and reads no tool policy', async () => {
  const fake = fakeRun({ inventory: [agent('cli', 'Cli')] });
  fake.ports.state.revokedToolRuns.add('run-1');
  assert.equal(await choose(fake), null);
  assert.deepEqual(fake.policyReads, []);
  assert.deepEqual(fake.emitted, []);
});
