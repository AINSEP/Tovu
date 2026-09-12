/**
 * @file Coverage for `workspace-chat-transport.ts` — the demultiplexer/reducer pair described in
 * that file's own header.
 *
 * Every function this module defines except `createWorkspaceChatTransport` is module-private (no
 * `export`), so there is no seam to import them through directly. That is not a testability gap:
 * `createWorkspaceChatTransport(bridge)` is the ONE public entry point, and every private helper is
 * reachable from it in exactly one of two directions —
 *
 *   - renderer -> bridge: `startRun`/`reattachRun`/`fetchRunStatus`/`stopRun` call the bridge, so a
 *     fake bridge that records its own invocations exposes `mintSubscriptionId`, `toChatRunStatus`,
 *     `buildChatStartPayload`, and `wireCancelSignal`'s effects.
 *   - bridge -> renderer: `bridge.onChatEvent(listener)` installs the one shared demux, so calling
 *     that captured `listener` with synthetic `WorkspaceChatEventMessage`s drives `applyRunEvent`,
 *     `applyAgentEvent`, every `translate*` function, `settle`, and `exitDescription` exactly as a
 *     real main-process push would.
 *
 * So every test below drives the transport through its real, public surface — a fake
 * `RunnerInventoryBridge` standing in for Electron IPC — and asserts on what a real caller can see:
 * the promises `startRun`/`reattachRun`/`fetchRunStatus`/`stopRun` return, the `RunHandlers`
 * callbacks they invoke, and the payloads handed to the bridge. Nothing here asserts on private
 * function names or internal state.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorkspaceChatTransport } from './workspace-chat-transport.js';
import type { RunnerInventoryBridge } from './runner-api.js';
import { mcpToolNameForVerb } from '../contracts/workspace-chat.js';
import type {
  WorkspaceChatEventMessage,
  WorkspaceChatReattachInput,
  WorkspaceChatRunSnapshot,
  WorkspaceChatStartInput,
  WorkspaceChatStartResult,
} from '../contracts/workspace-chat.js';
import type { AgentEvent, ChatMessage, ReattachRunOptions, RunHandlers, StartRunInput } from '@jini-ai/chat/core';
import { RUN_PROTOCOL_VERSION } from '@jini-ai/protocol';
import type { RunAgentPayload, RunEndPayload, RunErrorPayload, RunProtocolEvent } from '@jini-ai/protocol';

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

interface FakeBridgeOverrides {
  chatStart?: (input: WorkspaceChatStartInput) => Promise<WorkspaceChatStartResult>;
  chatReattach?: (input: WorkspaceChatReattachInput) => Promise<void>;
  chatDetach?: (subscriptionId: string) => Promise<void>;
  chatStop?: (runId: string) => Promise<void>;
  chatStatus?: (runId: string) => Promise<WorkspaceChatRunSnapshot | null>;
}

interface FakeBridge {
  /** Cast to `RunnerInventoryBridge` — the transport only ever calls the six chat methods below. */
  bridge: RunnerInventoryBridge;
  calls: {
    chatStart: WorkspaceChatStartInput[];
    chatReattach: WorkspaceChatReattachInput[];
    chatDetach: string[];
    chatStop: string[];
  };
  /** Pushes a synthetic main -> renderer message through the ONE listener the transport installed. */
  emit: (message: WorkspaceChatEventMessage) => void;
  /** How many times the transport's teardown unsubscribed from `onChatEvent`. */
  unsubscribeCount: () => number;
}

function createFakeBridge(overrides: FakeBridgeOverrides = {}): FakeBridge {
  const calls = {
    chatStart: [] as WorkspaceChatStartInput[],
    chatReattach: [] as WorkspaceChatReattachInput[],
    chatDetach: [] as string[],
    chatStop: [] as string[],
  };
  let listener: ((message: WorkspaceChatEventMessage) => void) | null = null;
  let unsubscribed = 0;
  let runSeq = 0;

  const chatMethods = {
    chatStart: (input: WorkspaceChatStartInput): Promise<WorkspaceChatStartResult> => {
      calls.chatStart.push(input);
      runSeq += 1;
      return overrides.chatStart ? overrides.chatStart(input) : Promise.resolve({ runId: `run-${runSeq}` });
    },
    chatReattach: (input: WorkspaceChatReattachInput): Promise<void> => {
      calls.chatReattach.push(input);
      return overrides.chatReattach ? overrides.chatReattach(input) : Promise.resolve(undefined);
    },
    chatDetach: (subscriptionId: string): Promise<void> => {
      calls.chatDetach.push(subscriptionId);
      return overrides.chatDetach ? overrides.chatDetach(subscriptionId) : Promise.resolve(undefined);
    },
    chatStop: (runId: string): Promise<void> => {
      calls.chatStop.push(runId);
      return overrides.chatStop ? overrides.chatStop(runId) : Promise.resolve(undefined);
    },
    chatStatus: (runId: string): Promise<WorkspaceChatRunSnapshot | null> =>
      overrides.chatStatus ? overrides.chatStatus(runId) : Promise.resolve(null),
    onChatEvent: (l: (message: WorkspaceChatEventMessage) => void): (() => void) => {
      listener = l;
      return () => {
        unsubscribed += 1;
        listener = null;
      };
    },
  };

  return {
    bridge: chatMethods as unknown as RunnerInventoryBridge,
    calls,
    emit: (message: WorkspaceChatEventMessage): void => {
      if (listener === null) throw new Error('fixture error: no onChatEvent listener registered yet');
      listener(message);
    },
    unsubscribeCount: () => unsubscribed,
  };
}

/** A `RunHandlers` set whose `onError` fails the test loudly — override it in tests that expect one. */
function dummyHandlers(overrides: Partial<RunHandlers> = {}): RunHandlers {
  return {
    onEvent: () => {},
    onError: (err) => {
      throw err;
    },
    onDone: () => {},
    ...overrides,
  };
}

let eventSeq = 0;

function agentEvent(payload: RunAgentPayload, runId = 'run-x'): Extract<RunProtocolEvent, { kind: 'agent' }> {
  eventSeq += 1;
  return {
    runId,
    eventId: `evt-${eventSeq}`,
    opaqueCursor: `cursor-${eventSeq}`,
    protocolVersion: RUN_PROTOCOL_VERSION,
    ts: eventSeq,
    kind: 'agent',
    payload,
    durability: 'durable',
  };
}

function endEvent(payload: RunEndPayload, runId = 'run-x'): Extract<RunProtocolEvent, { kind: 'end' }> {
  eventSeq += 1;
  return {
    runId,
    eventId: `evt-${eventSeq}`,
    opaqueCursor: `cursor-${eventSeq}`,
    protocolVersion: RUN_PROTOCOL_VERSION,
    ts: eventSeq,
    kind: 'end',
    payload,
    durability: 'durable',
  };
}

function errorEvent(payload: RunErrorPayload, runId = 'run-x'): Extract<RunProtocolEvent, { kind: 'error' }> {
  eventSeq += 1;
  return {
    runId,
    eventId: `evt-${eventSeq}`,
    opaqueCursor: `cursor-${eventSeq}`,
    protocolVersion: RUN_PROTOCOL_VERSION,
    ts: eventSeq,
    kind: 'error',
    payload,
    durability: 'durable',
  };
}

/** `start`/`stdout`/`stderr` — the three kinds `NOOP_RUN_EVENT_KINDS` drops before they reach the reducer. */
function noopEvent(kind: 'start' | 'stdout' | 'stderr', runId = 'run-x'): RunProtocolEvent {
  eventSeq += 1;
  // Annotated so the literal fields (protocolVersion, durability) are contextually checked against
  // `RunProtocolEvent`'s literal types instead of being independently widened to `number`/`string`.
  const base: Pick<RunProtocolEvent, 'runId' | 'eventId' | 'opaqueCursor' | 'protocolVersion' | 'ts' | 'durability'> = {
    runId,
    eventId: `evt-${eventSeq}`,
    opaqueCursor: `cursor-${eventSeq}`,
    protocolVersion: RUN_PROTOCOL_VERSION,
    ts: eventSeq,
    durability: 'durable',
  };
  if (kind === 'start') return { ...base, kind: 'start', payload: { runId, contextRef: 'ctx' } };
  return { ...base, kind, payload: { chunk: 'x' } };
}

function startInput(overrides: Partial<StartRunInput> = {}): StartRunInput {
  return { history: [], agentId: 'a', signal: new AbortController().signal, ...overrides };
}

async function flushMicrotasks(times = 5): Promise<void> {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

/** Fails if `action` leaves behind an unhandled promise rejection — the regression this guards
 *  against is a removed `.catch(() => {})` on a fire-and-forget teardown call. */
async function assertNoUnhandledRejection(action: () => Promise<void>): Promise<void> {
  let caught: unknown;
  const onUnhandledRejection = (reason: unknown): void => {
    caught = reason;
  };
  process.once('unhandledRejection', onUnhandledRejection);
  try {
    await action();
    await flushMicrotasks();
  } finally {
    process.removeListener('unhandledRejection', onUnhandledRejection);
  }
  assert.equal(caught, undefined, `unexpected unhandled rejection: ${String(caught)}`);
}

// ---------------------------------------------------------------------------------------------
// startRun validation, subscription minting, and the chatStart payload (buildChatStartPayload)
// ---------------------------------------------------------------------------------------------

test('startRun refuses before contacting main when no agent is chosen', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  await assert.rejects(
    transport.startRun(startInput({ agentId: undefined }), dummyHandlers()),
    (err: unknown) => err instanceof Error && err.message === 'Choose an agent runtime before sending a message.',
  );
  assert.equal(fake.calls.chatStart.length, 0);
});

test('startRun also refuses an empty-string agentId', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  await assert.rejects(
    transport.startRun(startInput({ agentId: '' }), dummyHandlers()),
    (err: unknown) => err instanceof Error && err.message === 'Choose an agent runtime before sending a message.',
  );
  assert.equal(fake.calls.chatStart.length, 0);
});

test('every startRun mints a distinct subscription id, shaped sub-<seq>-<random>', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  for (let i = 0; i < 5; i += 1) {
    await transport.startRun(startInput(), dummyHandlers());
  }
  const ids = fake.calls.chatStart.map((c) => c.subscriptionId);
  assert.equal(new Set(ids).size, 5, `expected 5 distinct subscription ids, got: ${ids.join(', ')}`);
  for (const id of ids) assert.match(id, /^sub-\d+-.+$/);
});

test('a rejected chatStart invoke removes the subscription and rethrows the SAME error', async () => {
  const failure = new Error('daemon offline');
  const fake = createFakeBridge({ chatStart: () => Promise.reject(failure) });
  const transport = createWorkspaceChatTransport(fake.bridge);
  await assert.rejects(transport.startRun(startInput(), dummyHandlers()), (err: unknown) => err === failure);

  // The dead subscription is not routable: an event tagged with its id must not throw or render.
  const subscriptionId = fake.calls.chatStart[0]!.subscriptionId;
  fake.emit({ subscriptionId, kind: 'event', event: agentEvent({ type: 'raw', line: 'x' }) });

  // And dispose has nothing left to detach for it.
  transport.dispose();
  assert.deepEqual(fake.calls.chatDetach, []);
});

test('buildChatStartPayload flattens history through the REAL buildTranscript, scoped to the target agent', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);

  await transport.startRun(startInput({ history: [] }), dummyHandlers());
  assert.equal(fake.calls.chatStart[0]!.prompt, '');

  // A prior assistant turn from a DIFFERENT agent family must be dropped from the transcript —
  // this only happens if `agentId` really reaches `buildTranscript`'s `targetAgentId` option.
  const history: ChatMessage[] = [
    { id: '1', role: 'assistant', content: 'old reply', agentId: 'agent-A' },
    { id: '2', role: 'user', content: 'hello agent B' },
  ];
  await transport.startRun(startInput({ history, agentId: 'agent-B' }), dummyHandlers());
  assert.equal(fake.calls.chatStart[1]!.prompt, '## user\nhello agent B');
});

test('buildChatStartPayload carries model/reasoning from context, coerced to strings, and omits them when absent', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);

  await transport.startRun(startInput({ context: { model: 5, reasoning: 'high' } }), dummyHandlers());
  const withContext = fake.calls.chatStart[0]!;
  assert.equal(withContext.model, '5');
  assert.equal(withContext.reasoning, 'high');

  await transport.startRun(startInput(), dummyHandlers());
  const withoutContext = fake.calls.chatStart[1]!;
  assert.ok(!('model' in withoutContext), 'model must be omitted, not sent as undefined');
  assert.ok(!('reasoning' in withoutContext), 'reasoning must be omitted, not sent as undefined');
});

test('buildChatStartPayload omits attachmentPaths for both undefined and empty attachments', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  await transport.startRun(startInput({ attachments: undefined }), dummyHandlers());
  await transport.startRun(startInput({ attachments: [] }), dummyHandlers());
  for (const payload of fake.calls.chatStart) {
    assert.ok(!('attachmentPaths' in payload), `attachmentPaths leaked: ${JSON.stringify(payload)}`);
  }
});

test('buildChatStartPayload maps attachments to their bare paths only, in order', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  await transport.startRun(
    startInput({
      attachments: [
        { path: '/tmp/a.png', name: 'a.png', kind: 'image' },
        { path: '/tmp/b.txt', name: 'b.txt', kind: 'file', size: 10 },
      ],
    }),
    dummyHandlers(),
  );
  assert.deepEqual(fake.calls.chatStart[0]!.attachmentPaths, ['/tmp/a.png', '/tmp/b.txt']);
});

// ---------------------------------------------------------------------------------------------
// fetchRunStatus / toChatRunStatus
// ---------------------------------------------------------------------------------------------

test('fetchRunStatus resolves null when the daemon has no snapshot for the run', async () => {
  const fake = createFakeBridge({ chatStatus: () => Promise.resolve(null) });
  const transport = createWorkspaceChatTransport(fake.bridge);
  assert.equal(await transport.fetchRunStatus('missing'), null);
});

const RUN_STATE_MAP = [
  ['queued', 'queued'],
  ['starting', 'queued'],
  ['running', 'running'],
  ['succeeded', 'succeeded'],
  ['failed', 'failed'],
  ['cancelled', 'canceled'], // protocol spells it with two Ls; chat-core spells it with one.
] as const;

for (const [daemonState, chatStatus] of RUN_STATE_MAP) {
  test(`fetchRunStatus maps daemon state "${daemonState}" to chat status "${chatStatus}"`, async () => {
    const fake = createFakeBridge({ chatStatus: () => Promise.resolve({ runId: 'run-1', state: daemonState }) });
    const transport = createWorkspaceChatTransport(fake.bridge);
    assert.equal(await transport.fetchRunStatus('run-1'), chatStatus);
  });
}

// ---------------------------------------------------------------------------------------------
// stopRun
// ---------------------------------------------------------------------------------------------

test('stopRun delegates straight to the bridge with the given run id', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  await transport.stopRun('run-5');
  assert.deepEqual(fake.calls.chatStop, ['run-5']);
});

// ---------------------------------------------------------------------------------------------
// wireCancelSignal (StartRunInput.cancelSignal) vs. the pane-lifetime signal (StartRunInput.signal)
// ---------------------------------------------------------------------------------------------

test('an already-aborted cancelSignal stops the run the moment its run id is known', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  const cancelController = new AbortController();
  cancelController.abort();
  const { runId } = await transport.startRun(startInput({ cancelSignal: cancelController.signal }), dummyHandlers());
  assert.deepEqual(fake.calls.chatStop, [runId]);
});

test('a cancelSignal aborted later stops the run exactly once, not before', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  const cancelController = new AbortController();
  const { runId } = await transport.startRun(startInput({ cancelSignal: cancelController.signal }), dummyHandlers());
  assert.deepEqual(fake.calls.chatStop, []);
  cancelController.abort();
  assert.deepEqual(fake.calls.chatStop, [runId]);
  cancelController.abort(); // a second dispatch on an already-fired AbortSignal is a no-op anyway
  assert.deepEqual(fake.calls.chatStop, [runId]);
});

test('a rejecting chatStop from an ALREADY-aborted cancelSignal never surfaces as an unhandled rejection', async () => {
  await assertNoUnhandledRejection(async () => {
    const fake = createFakeBridge({ chatStop: () => Promise.reject(new Error('offline')) });
    const transport = createWorkspaceChatTransport(fake.bridge);
    const cancelController = new AbortController();
    cancelController.abort();
    await transport.startRun(startInput({ cancelSignal: cancelController.signal }), dummyHandlers());
  });
});

test('a rejecting chatStop from a cancelSignal aborted LATER also never surfaces as an unhandled rejection', async () => {
  // Distinct code path from the "already aborted" case above: this one exercises the
  // `addEventListener('abort', ...)` branch's own `.catch(() => {})`, not the immediate branch's.
  await assertNoUnhandledRejection(async () => {
    const fake = createFakeBridge({ chatStop: () => Promise.reject(new Error('offline')) });
    const transport = createWorkspaceChatTransport(fake.bridge);
    const cancelController = new AbortController();
    await transport.startRun(startInput({ cancelSignal: cancelController.signal }), dummyHandlers());
    cancelController.abort();
  });
});

test('aborting the pane-lifetime signal detaches the browser side WITHOUT stopping the run', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  const controller = new AbortController();
  await transport.startRun(startInput({ signal: controller.signal }), dummyHandlers());
  const subscriptionId = fake.calls.chatStart[0]!.subscriptionId;
  controller.abort();
  assert.deepEqual(fake.calls.chatDetach, [subscriptionId]);
  assert.deepEqual(fake.calls.chatStop, []); // the run keeps going in main — only the listener leaves
});

test('a rejecting chatDetach during pane-lifetime teardown never surfaces as an unhandled rejection', async () => {
  await assertNoUnhandledRejection(async () => {
    const fake = createFakeBridge({ chatDetach: () => Promise.reject(new Error('window gone')) });
    const transport = createWorkspaceChatTransport(fake.bridge);
    const controller = new AbortController();
    await transport.startRun(startInput({ signal: controller.signal }), dummyHandlers());
    controller.abort();
  });
});

// ---------------------------------------------------------------------------------------------
// The demultiplexer: one shared onChatEvent listener, fanned out by subscriptionId
// ---------------------------------------------------------------------------------------------

test('createWorkspaceChatTransport installs exactly ONE onChatEvent listener, however many runs start', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  await transport.startRun(startInput(), dummyHandlers());
  await transport.startRun(startInput(), dummyHandlers());
  transport.dispose();
  assert.equal(fake.unsubscribeCount(), 1);
});

test('one shared push channel demultiplexes by subscription id and never bleeds one run into another', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  const eventsA: AgentEvent[] = [];
  const eventsB: AgentEvent[] = [];
  await transport.startRun(
    startInput(),
    dummyHandlers({ onEvent: (e) => eventsA.push(e) }),
  );
  await transport.startRun(
    startInput(),
    dummyHandlers({ onEvent: (e) => eventsB.push(e) }),
  );
  const subA = fake.calls.chatStart[0]!.subscriptionId;
  const subB = fake.calls.chatStart[1]!.subscriptionId;
  assert.notEqual(subA, subB);

  fake.emit({ subscriptionId: subA, kind: 'event', event: agentEvent({ type: 'text_delta', delta: 'to A' }) });
  fake.emit({ subscriptionId: subB, kind: 'event', event: agentEvent({ type: 'text_delta', delta: 'to B' }) });
  // A message for a subscription nobody holds (already torn down, or simply bogus) is silently ignored.
  fake.emit({ subscriptionId: 'no-such-subscription', kind: 'event', event: agentEvent({ type: 'text_delta', delta: 'nobody' }) });

  assert.deepEqual(eventsA, [{ kind: 'text', text: 'to A' }]);
  assert.deepEqual(eventsB, [{ kind: 'text', text: 'to B' }]);
});

// ---------------------------------------------------------------------------------------------
// translateAgentPayload's dispatch table — one realistic turn exercising every wire variant
// ---------------------------------------------------------------------------------------------

test('a full turn translates every RunAgentPayload variant to its exact AgentEvent, in order', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  const events: AgentEvent[] = [];
  const toolInputDeltas: Array<[string, string, string]> = [];
  const doneCalls: AgentEvent[][] = [];
  await transport.startRun(
    startInput(),
    dummyHandlers({
      onEvent: (e) => events.push(e),
      onToolInputDelta: (id, name, delta) => toolInputDeltas.push([id, name, delta]),
      onDone: (e) => doneCalls.push(e),
    }),
  );
  const sub = fake.calls.chatStart[0]!.subscriptionId;
  const desktopStatusToolName = mcpToolNameForVerb('desktop.status'); // a real desktop.* verb, real mapping

  const push = (payload: RunAgentPayload): void => fake.emit({ subscriptionId: sub, kind: 'event', event: agentEvent(payload) });

  push({ type: 'status', label: 'Reticulating splines' });
  push({ type: 'status', label: 'Thinking', detail: 'about ants' });
  push({ type: 'thinking_start' }); // a bracket with no content — renders nothing
  push({ type: 'thinking_delta', delta: 'Hmm' });
  push({ type: 'text_delta', delta: 'Hello ' });
  push({ type: 'text_delta', delta: 'world' });
  push({ type: 'tool_use', id: 'toolu_1', name: 'Read', input: { path: '/a' } });
  // At-least-once delivery: the identical tool_use id arrives again and must be deduped, not doubled.
  push({ type: 'tool_use', id: 'toolu_1', name: 'Read', input: { path: '/a' } });
  push({ type: 'tool_input_delta', id: 'toolu_2', name: 'Bash', delta: '{"cmd":"ls' });
  push({ type: 'tool_result', toolUseId: 'toolu_1', content: 'file contents' }); // isError omitted -> false
  // A desktop.* verb is mirrored: its own tool_use AND the tool_result that follows are both dropped.
  push({ type: 'tool_use', id: 'toolu_3', name: desktopStatusToolName, input: {} });
  push({ type: 'tool_result', toolUseId: 'toolu_3', content: '{"ok":true}' });
  push({
    type: 'tool_result',
    toolUseId: 'toolu_4',
    content: 'see attached',
    isError: true,
    media: [
      { type: 'text', text: 'caption' },
      { type: 'image', mimeType: 'image/png', data: 'ZmFrZQ==' },
      { type: 'bogus' }, // not a recognised block — filtered out, not trusted through
    ],
  });
  push({ type: 'usage', usage: { input_tokens: 100, output_tokens: 50 }, costUsd: 0.12, durationMs: 3400 });
  push({ type: 'usage' }); // no fields at all -> {kind:'usage'} exactly, nothing defaulted in
  push({ type: 'raw', line: '[debug] tick' });
  // Unrecognised variant: carried through the `ext` escape hatch rather than dropped.
  push({ type: 'stage_start', stageId: 's1', label: 'Build' });

  assert.deepEqual(events, [
    { kind: 'status', label: 'Reticulating splines' },
    { kind: 'status', label: 'Thinking', detail: 'about ants' },
    { kind: 'thinking', text: 'Hmm' },
    { kind: 'text', text: 'Hello ' },
    { kind: 'text', text: 'world' },
    { kind: 'tool_use', id: 'toolu_1', name: 'Read', input: { path: '/a' } },
    { kind: 'tool_result', toolUseId: 'toolu_1', content: 'file contents', isError: false },
    {
      kind: 'tool_result',
      toolUseId: 'toolu_4',
      content: 'see attached',
      isError: true,
      media: [
        { type: 'text', text: 'caption' },
        { type: 'image', mimeType: 'image/png', data: 'ZmFrZQ==' },
      ],
    },
    { kind: 'usage', inputTokens: 100, outputTokens: 50, costUsd: 0.12, durationMs: 3400 },
    { kind: 'usage' },
    { kind: 'raw', line: '[debug] tick' },
    { kind: 'ext', name: 'stage_start', data: { type: 'stage_start', stageId: 's1', label: 'Build' } },
  ]);
  assert.deepEqual(toolInputDeltas, [['toolu_2', 'Bash', '{"cmd":"ls']]);

  fake.emit({ subscriptionId: sub, kind: 'event', event: endEvent({ code: 0, signal: null, status: 'succeeded' }) });
  assert.equal(doneCalls.length, 1);
  assert.deepEqual(doneCalls[0], events);
});

test('a status event with an EMPTY detail string still carries it — not a falsy-string omission', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  const events: AgentEvent[] = [];
  await transport.startRun(startInput(), dummyHandlers({ onEvent: (e) => events.push(e) }));
  const sub = fake.calls.chatStart[0]!.subscriptionId;
  fake.emit({ subscriptionId: sub, kind: 'event', event: agentEvent({ type: 'status', label: 'X', detail: '' }) });
  assert.deepEqual(events, [{ kind: 'status', label: 'X', detail: '' }]);
});

test('usage zeros are kept, not dropped as falsy', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  const events: AgentEvent[] = [];
  await transport.startRun(startInput(), dummyHandlers({ onEvent: (e) => events.push(e) }));
  const sub = fake.calls.chatStart[0]!.subscriptionId;
  fake.emit({
    subscriptionId: sub,
    kind: 'event',
    event: agentEvent({ type: 'usage', usage: { input_tokens: 0, output_tokens: 0 }, costUsd: 0, durationMs: 0 }),
  });
  assert.deepEqual(events, [{ kind: 'usage', inputTokens: 0, outputTokens: 0, costUsd: 0, durationMs: 0 }]);
});

test('a tool_input_delta with no onToolInputDelta handler wired is a harmless no-op', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  const events: AgentEvent[] = [];
  // dummyHandlers() supplies no onToolInputDelta at all — exercises the `?.()` undefined branch.
  await transport.startRun(startInput(), dummyHandlers({ onEvent: (e) => events.push(e) }));
  const sub = fake.calls.chatStart[0]!.subscriptionId;
  fake.emit({
    subscriptionId: sub,
    kind: 'event',
    event: agentEvent({ type: 'tool_input_delta', id: 't1', name: 'Bash', delta: 'x' }),
  });
  assert.deepEqual(events, []);
});

test('a tool_result carrying no media, or non-array media, renders with no media key at all', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  const events: AgentEvent[] = [];
  await transport.startRun(startInput(), dummyHandlers({ onEvent: (e) => events.push(e) }));
  const sub = fake.calls.chatStart[0]!.subscriptionId;
  fake.emit({
    subscriptionId: sub,
    kind: 'event',
    event: agentEvent({ type: 'tool_result', toolUseId: 't1', content: 'ok', media: { not: 'an array' } }),
  });
  assert.deepEqual(events, [{ kind: 'tool_result', toolUseId: 't1', content: 'ok', isError: false }]);
  assert.ok(!('media' in events[0]!));
});

test('isMediaBlock rejects a non-object entry and a null entry, not just a wrong-shaped object', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  const events: AgentEvent[] = [];
  await transport.startRun(startInput(), dummyHandlers({ onEvent: (e) => events.push(e) }));
  const sub = fake.calls.chatStart[0]!.subscriptionId;
  fake.emit({
    subscriptionId: sub,
    kind: 'event',
    event: agentEvent({
      type: 'tool_result',
      toolUseId: 't2',
      content: 'ok',
      media: [42, 'a string', null, { type: 'text', text: 'kept' }],
    }),
  });
  assert.deepEqual(events, [
    { kind: 'tool_result', toolUseId: 't2', content: 'ok', isError: false, media: [{ type: 'text', text: 'kept' }] },
  ]);
});

// ---------------------------------------------------------------------------------------------
// applyRunEvent: NOOP kinds, error/end interplay, exitDescription, and settle idempotency
// ---------------------------------------------------------------------------------------------

test('start/stdout/stderr are diagnostics-only and never render, per NOOP_RUN_EVENT_KINDS', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  const events: AgentEvent[] = [];
  const doneCalls: AgentEvent[][] = [];
  await transport.startRun(
    startInput(),
    dummyHandlers({ onEvent: (e) => events.push(e), onDone: (e) => doneCalls.push(e) }),
  );
  const sub = fake.calls.chatStart[0]!.subscriptionId;
  fake.emit({ subscriptionId: sub, kind: 'event', event: noopEvent('start') });
  fake.emit({ subscriptionId: sub, kind: 'event', event: noopEvent('stdout') });
  fake.emit({ subscriptionId: sub, kind: 'event', event: noopEvent('stderr') });
  assert.deepEqual(events, []);
  assert.equal(doneCalls.length, 0);

  // The record is still alive afterward — these three did not accidentally settle it.
  fake.emit({ subscriptionId: sub, kind: 'event', event: agentEvent({ type: 'raw', line: 'still alive' }) });
  assert.deepEqual(events, [{ kind: 'raw', line: 'still alive' }]);
});

test('exitDescription names the signal when the process was terminated by one', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  const errors: string[] = [];
  await transport.startRun(startInput(), dummyHandlers({ onError: (e) => errors.push(e.message) }));
  const sub = fake.calls.chatStart[0]!.subscriptionId;
  fake.emit({ subscriptionId: sub, kind: 'event', event: endEvent({ code: null, signal: 'SIGKILL', status: 'failed' }) });
  assert.deepEqual(errors, ['The agent process was terminated by SIGKILL.']);
});

test('exitDescription names the exit code when there is no signal', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  const errors: string[] = [];
  await transport.startRun(startInput(), dummyHandlers({ onError: (e) => errors.push(e.message) }));
  const sub = fake.calls.chatStart[0]!.subscriptionId;
  fake.emit({ subscriptionId: sub, kind: 'event', event: endEvent({ code: 2, signal: null, status: 'failed' }) });
  assert.deepEqual(errors, ['The agent process exited with code 2.']);
});

test('exitDescription falls back to a generic message with neither code nor signal', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  const errors: string[] = [];
  await transport.startRun(startInput(), dummyHandlers({ onError: (e) => errors.push(e.message) }));
  const sub = fake.calls.chatStart[0]!.subscriptionId;
  fake.emit({ subscriptionId: sub, kind: 'event', event: endEvent({ code: null, status: 'failed' }) });
  assert.deepEqual(errors, ['The agent run failed before producing a result.']);
});

test('a run that already reported its own "error" event does not get a second, generic one from "end"', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  const errors: string[] = [];
  const doneCalls: AgentEvent[][] = [];
  await transport.startRun(
    startInput(),
    dummyHandlers({ onError: (e) => errors.push(e.message), onDone: (e) => doneCalls.push(e) }),
  );
  const sub = fake.calls.chatStart[0]!.subscriptionId;
  fake.emit({ subscriptionId: sub, kind: 'event', event: errorEvent({ message: 'stream broke' }) });
  fake.emit({ subscriptionId: sub, kind: 'event', event: endEvent({ code: 1, signal: null, status: 'failed' }) });
  assert.deepEqual(errors, ['stream broke']);
  assert.equal(doneCalls.length, 1);
});

test('a succeeded end settles quietly, with no error at all', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  const errors: string[] = [];
  const doneCalls: AgentEvent[][] = [];
  await transport.startRun(
    startInput(),
    dummyHandlers({ onError: (e) => errors.push(e.message), onDone: (e) => doneCalls.push(e) }),
  );
  const sub = fake.calls.chatStart[0]!.subscriptionId;
  fake.emit({ subscriptionId: sub, kind: 'event', event: endEvent({ code: 0, signal: null, status: 'succeeded' }) });
  assert.deepEqual(errors, []);
  assert.equal(doneCalls.length, 1);
});

test('once settled, further protocol events for the same subscription are inert', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  const events: AgentEvent[] = [];
  const doneCalls: AgentEvent[][] = [];
  await transport.startRun(
    startInput(),
    dummyHandlers({ onEvent: (e) => events.push(e), onDone: (e) => doneCalls.push(e) }),
  );
  const sub = fake.calls.chatStart[0]!.subscriptionId;
  fake.emit({ subscriptionId: sub, kind: 'event', event: endEvent({ code: 0, signal: null, status: 'succeeded' }) });
  assert.equal(doneCalls.length, 1);
  fake.emit({ subscriptionId: sub, kind: 'event', event: agentEvent({ type: 'raw', line: 'too late' }) });
  assert.deepEqual(events, []);
  assert.equal(doneCalls.length, 1);
});

// ---------------------------------------------------------------------------------------------
// The 'closed' push message (WorkspaceChatEventMessage, not a RunProtocolEvent)
// ---------------------------------------------------------------------------------------------

test('closed:terminal settles quietly — the "end" event already told the story', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  const errors: string[] = [];
  const doneCalls: AgentEvent[][] = [];
  await transport.startRun(
    startInput(),
    dummyHandlers({ onError: (e) => errors.push(e.message), onDone: (e) => doneCalls.push(e) }),
  );
  const sub = fake.calls.chatStart[0]!.subscriptionId;
  fake.emit({ subscriptionId: sub, kind: 'closed', reason: 'terminal' });
  assert.deepEqual(errors, []);
  assert.equal(doneCalls.length, 1);
  assert.deepEqual(doneCalls[0], []);
});

test('closed:unknown-run reports a specific, actionable error before settling', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  const errors: string[] = [];
  const doneCalls: AgentEvent[][] = [];
  await transport.startRun(
    startInput(),
    dummyHandlers({ onError: (e) => errors.push(e.message), onDone: (e) => doneCalls.push(e) }),
  );
  const sub = fake.calls.chatStart[0]!.subscriptionId;
  fake.emit({ subscriptionId: sub, kind: 'closed', reason: 'unknown-run' });
  assert.deepEqual(errors, ['Runner no longer has this run; send the message again.']);
  assert.equal(doneCalls.length, 1);
});

test('closed:replay-gap reports the replay-specific error before settling', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  const errors: string[] = [];
  const doneCalls: AgentEvent[][] = [];
  await transport.startRun(
    startInput(),
    dummyHandlers({ onError: (e) => errors.push(e.message), onDone: (e) => doneCalls.push(e) }),
  );
  const sub = fake.calls.chatStart[0]!.subscriptionId;
  fake.emit({ subscriptionId: sub, kind: 'closed', reason: 'replay-gap' });
  assert.deepEqual(errors, ["Runner couldn't replay this run's history; send the message again."]);
  assert.equal(doneCalls.length, 1);
});

test('a "closed" message after the run already ended does not double-fire onDone or invent an error', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  const errors: string[] = [];
  const doneCalls: AgentEvent[][] = [];
  await transport.startRun(
    startInput(),
    dummyHandlers({ onError: (e) => errors.push(e.message), onDone: (e) => doneCalls.push(e) }),
  );
  const sub = fake.calls.chatStart[0]!.subscriptionId;
  fake.emit({ subscriptionId: sub, kind: 'event', event: endEvent({ code: 0, signal: null, status: 'succeeded' }) });
  assert.equal(doneCalls.length, 1);
  fake.emit({ subscriptionId: sub, kind: 'closed', reason: 'unknown-run' }); // arrives late — must be inert
  assert.deepEqual(errors, []);
  assert.equal(doneCalls.length, 1);
});

// ---------------------------------------------------------------------------------------------
// reattachRun
// ---------------------------------------------------------------------------------------------

test(
  'reattachRun stays pending until the stream ends, like an SSE reader, then delivers the full log',
  { timeout: 2000 },
  async () => {
    const fake = createFakeBridge();
    const transport = createWorkspaceChatTransport(fake.bridge);
    let resolved = false;
    const events: AgentEvent[] = [];
    const donePromise = transport
      .reattachRun('run-99', dummyHandlers({ onEvent: (e) => events.push(e) }))
      .then(() => {
        resolved = true;
      });

    await flushMicrotasks();
    assert.equal(resolved, false, 'reattachRun resolved before the run ended');
    const subscriptionId = fake.calls.chatReattach[0]!.subscriptionId;

    fake.emit({ subscriptionId, kind: 'event', event: agentEvent({ type: 'text_delta', delta: 'hi' }) });
    assert.equal(resolved, false);
    fake.emit({ subscriptionId, kind: 'closed', reason: 'terminal' });
    await donePromise;
    assert.equal(resolved, true);
    assert.deepEqual(events, [{ kind: 'text', text: 'hi' }]);
  },
);

test('reattachRun resolves immediately without contacting main when the caller aborted before it started', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  const controller = new AbortController();
  controller.abort();
  const options: ReattachRunOptions = { signal: controller.signal };
  await transport.reattachRun('run-1', dummyHandlers(), options);
  assert.equal(fake.calls.chatReattach.length, 0, 'chatReattach must not be called for a pre-aborted reattach');
});

test(
  'aborting mid-reattach detaches AND resolves the pending promise, so a caller awaiting it is never stuck',
  { timeout: 2000 },
  async () => {
    const fake = createFakeBridge();
    const transport = createWorkspaceChatTransport(fake.bridge);
    const controller = new AbortController();
    const donePromise = transport.reattachRun('run-7', dummyHandlers(), { signal: controller.signal });
    await flushMicrotasks();
    const subscriptionId = fake.calls.chatReattach[0]!.subscriptionId;
    controller.abort();
    await donePromise; // must resolve, not hang
    assert.deepEqual(fake.calls.chatDetach, [subscriptionId]);
  },
);

test('a rejected chatReattach invoke removes the subscription and rethrows the SAME error', async () => {
  const failure = new Error('daemon unreachable');
  const fake = createFakeBridge({ chatReattach: () => Promise.reject(failure) });
  const transport = createWorkspaceChatTransport(fake.bridge);
  await assert.rejects(transport.reattachRun('run-1', dummyHandlers()), (err: unknown) => err === failure);
  const subscriptionId = fake.calls.chatReattach[0]!.subscriptionId;
  // The dead subscription is unrouteable — must not throw.
  fake.emit({ subscriptionId, kind: 'event', event: agentEvent({ type: 'raw', line: 'x' }) });
});

// ---------------------------------------------------------------------------------------------
// dispose
// ---------------------------------------------------------------------------------------------

test('dispose tears down the shared listener and detaches every still-open subscription', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  await transport.startRun(startInput(), dummyHandlers());
  await transport.startRun(startInput(), dummyHandlers());
  const subs = fake.calls.chatStart.map((c) => c.subscriptionId);
  transport.dispose();
  assert.equal(fake.unsubscribeCount(), 1);
  assert.deepEqual([...fake.calls.chatDetach].sort(), [...subs].sort());
});

test('dispose does not re-detach a subscription the demux already closed out', async () => {
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  await transport.startRun(startInput(), dummyHandlers());
  const sub = fake.calls.chatStart[0]!.subscriptionId;
  fake.emit({ subscriptionId: sub, kind: 'closed', reason: 'terminal' });
  transport.dispose();
  assert.deepEqual(fake.calls.chatDetach, []);
});

test('a pane-unmount detach that loses the race with the demux is a harmless no-op, not a second chatDetach', async () => {
  // The demux already deleted this subscription (run finished naturally) by the time the pane's
  // OWN unmount signal fires — `detach`'s `!records.delete(...)` guard must make the second call inert.
  const fake = createFakeBridge();
  const transport = createWorkspaceChatTransport(fake.bridge);
  const controller = new AbortController();
  await transport.startRun(startInput({ signal: controller.signal }), dummyHandlers());
  const sub = fake.calls.chatStart[0]!.subscriptionId;
  fake.emit({ subscriptionId: sub, kind: 'closed', reason: 'terminal' });
  controller.abort();
  assert.deepEqual(fake.calls.chatDetach, []);
});
