import assert from 'node:assert/strict';
import test from 'node:test';
import { DaemonCoreError } from '#src/assistant/daemon-core-protocol';
import type { AiTraceEvent } from '@jini-ai/core/contracts/ai-trace';
import { createDaemonCoreClient } from '../agent-daemon-core-client.js';

/**
 * @file The daemon's private retained-state client beyond settings reads: the durable run-store
 * operations (validated before use), the session lookup, the trace capture level the site pushes
 * back, and the bounded telemetry queue whose failures stay local diagnostics.
 */

type Sent = { operation: string; input: unknown };
const BASE = { baseUrl: 'http://127.0.0.1:1234', token: 'fixture-private-rpc' };

/** A fetch that records each envelope and answers with `reply(request)` as the RPC value. */
function rpc(reply: (request: Sent) => { status?: number; value?: unknown; traceCapture?: string; hang?: boolean }) {
  const sent: Sent[] = [];
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as Sent;
    sent.push(request);
    const answer = reply(request);
    if (answer.hang) {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted by the client')));
      });
    }
    const body = { value: answer.value ?? null, ...(answer.traceCapture ? { traceCapture: answer.traceCapture } : {}) };
    return new Response(JSON.stringify(body), { status: answer.status ?? 200 });
  };
  return { sent, fetch };
}

const HEAD = {
  runId: 'run-1', workspaceId: 'site-1', messageId: 'msg-1', conversationId: 'conv-1', principalId: null,
  cancelReason: null, message: { runStatus: 'running' }, request: { contextRef: '{"a":1}' },
};

test('durable find answers null for an absent run and the validated head for a retained one', async () => {
  const { sent, fetch } = rpc(({ input }) => ({ value: (input as { runId: string }).runId === 'run-1' ? HEAD : null }));
  const client = createDaemonCoreClient(BASE, { fetch });
  assert.equal(await client.durable.find({ runId: 'missing' } as never), null);
  assert.deepEqual(await client.durable.find({ runId: 'run-1' } as never), HEAD);
  assert.deepEqual(sent, [{ operation: 'find', input: { runId: 'missing' } }, { operation: 'find', input: { runId: 'run-1' } }]);
});

test('durable find refuses a retained head without its authority fields instead of using it', async () => {
  const { fetch } = rpc(() => ({ value: { ...HEAD, workspaceId: undefined, principalId: 7 } }));
  const client = createDaemonCoreClient(BASE, { fetch });
  await assert.rejects(client.durable.find({ runId: 'run-1' } as never), (error: unknown) =>
    error instanceof Error && error.name === 'ZodError' && /workspaceId/.test(error.message) && /principalId/.test(error.message));
});

test('the durable session and tool-ledger operations send their own operation names and validate each answer', async () => {
  const answers: Record<string, unknown> = { captureSession: true, clearSession: null, guardTool: 'stale', completeTool: null, sessionForAttempt: 'sess-9' };
  const { sent, fetch } = rpc(({ operation }) => ({ value: answers[operation] }));
  const client = createDaemonCoreClient(BASE, { fetch });
  assert.equal(await client.durable.captureSession({ runId: 'run-1', sessionId: 's' } as never), true);
  assert.equal(await client.durable.clearSession({ runId: 'run-1' } as never), undefined);
  assert.equal(await client.durable.guardTool({ runId: 'run-1', toolUseId: 't' } as never), 'stale');
  assert.equal(await client.durable.completeTool({ runId: 'run-1', toolUseId: 't' } as never), undefined);
  assert.equal(await client.getSessionForAttempt({ runId: 'run-1' }), 'sess-9');
  assert.deepEqual(sent.map(request => request.operation), ['captureSession', 'clearSession', 'guardTool', 'completeTool', 'sessionForAttempt']);
  assert.deepEqual(sent[2]!.input, { runId: 'run-1', toolUseId: 't' });

  answers.guardTool = 'granted';
  await assert.rejects(client.durable.guardTool({ runId: 'run-1', toolUseId: 't' } as never), { name: 'ZodError' });
  answers.captureSession = 'yes';
  await assert.rejects(client.durable.captureSession({ runId: 'run-1', sessionId: 's' } as never), { name: 'ZodError' });
  answers.sessionForAttempt = null;
  assert.equal(await client.getSessionForAttempt({ runId: 'run-1' }), null);
});

test('a control request over 16 MiB is refused before anything is sent', async () => {
  const { sent, fetch } = rpc(() => ({ value: null }));
  const client = createDaemonCoreClient(BASE, { fetch });
  await assert.rejects(client.getSessionForAttempt({ runId: 'x'.repeat(16 * 1024 * 1024) }), (error: unknown) =>
    error instanceof DaemonCoreError && error.message === 'retained-state request exceeds 16 MiB');
  assert.deepEqual(sent, []);
});

test('the trace sink starts at the requested capture level and follows the level the site answers with', async () => {
  const { sent, fetch } = rpc(({ operation }) => (operation === 'sessionForAttempt' ? { value: null, traceCapture: 'off' } : { value: null }));
  const client = createDaemonCoreClient(BASE, { fetch });
  const sink = client.trace({ capture: 'full' });
  assert.equal(sink.capture, 'full');
  await client.getSessionForAttempt({ runId: 'run-1' });
  assert.equal(sink.capture, 'off', 'a later RPC envelope carries the live provider policy');
  const event = { kind: 'span', name: 'model-call' } as unknown as AiTraceEvent;
  sink.record(event);
  await sink.flush();
  assert.deepEqual(sent.slice(1), [{ operation: 'telemetryTrace', input: event }, { operation: 'telemetryFlush', input: {} }]);
});

test('tracker capture and error go out as telemetry; an error is redacted and names its operation', async () => {
  const { sent, fetch } = rpc(() => ({ value: null }));
  const client = createDaemonCoreClient(BASE, { fetch });
  client.tracker.capture({ name: 'run_started', userId: 'owner' }, { properties: { agent: 'cli', turns: 2 } });
  client.tracker.error({ error: new Error('upstream refused key tok-secret-a') },
    { context: { route: '/runs', level: 'warning', exactSecrets: ['tok-secret-a'], attributes: { runId: 'run-1' } } } as never);
  client.tracker.error({ error: new Error('plain failure') });
  await client.flush();
  assert.deepEqual(sent[0], { operation: 'telemetryCapture', input: { name: 'run_started', userId: 'owner', properties: { agent: 'cli', turns: 2 } } });
  const routed = sent[1]!.input as { name: string; message: string; operation: string; level: string; attributes: Record<string, string> };
  assert.equal(sent[1]!.operation, 'telemetryError');
  assert.equal(routed.name, 'Error');
  assert.equal(routed.message.includes('tok-secret-a'), false, 'an exact secret never leaves the daemon');
  assert.match(routed.message, /upstream refused key/);
  assert.equal(routed.operation, '/runs', 'the route names the operation when no operation is given');
  assert.equal(routed.level, 'warning');
  assert.deepEqual(routed.attributes, { runId: 'run-1', process: 'daemon' });
  const fallback = sent[2]!.input as { operation: string; attributes: Record<string, string> };
  assert.equal(fallback.operation, 'daemon');
  assert.deepEqual(fallback.attributes, { process: 'daemon' });
  assert.equal(sent[3]!.operation, 'telemetryFlush');
});

test('a refused telemetry delivery is a local warning, never a run failure, and later events still go out', async (t) => {
  const warnings: unknown[][] = [];
  t.mock.method(console, 'warn', (...args: unknown[]) => { warnings.push(args); });
  let refuse = true;
  const { sent, fetch } = rpc(() => ({ status: refuse ? 503 : 200, value: null }));
  const client = createDaemonCoreClient(BASE, { fetch });
  client.tracker.capture({ name: 'first', userId: 'owner' });
  await assert.rejects(client.flush(), (error: unknown) => error instanceof DaemonCoreError && /refused \(503\)/.test(error.message));
  assert.deepEqual(warnings, [['[agent-daemon] telemetry delivery failed']]);
  refuse = false;
  client.tracker.capture({ name: 'second', userId: 'owner' });
  await client.flush();
  assert.deepEqual(sent.map(request => (request.input as { name?: string }).name ?? request.operation),
    ['first', 'telemetryFlush', 'second', 'telemetryFlush']);
});

test('an event that cannot be serialized or is over 2 MiB is dropped with a warning, not queued', async (t) => {
  const warnings: string[] = [];
  t.mock.method(console, 'warn', (message: string) => { warnings.push(message); });
  const { sent, fetch } = rpc(() => ({ value: null }));
  const client = createDaemonCoreClient(BASE, { fetch });
  const cyclic: Record<string, unknown> = { kind: 'span' };
  cyclic.self = cyclic;
  client.trace({ capture: 'full' }).record(cyclic as unknown as AiTraceEvent);
  client.tracker.capture({ name: 'big', userId: 'x'.repeat(2 * 1024 * 1024) });
  client.tracker.capture({ name: 'kept', userId: 'owner' });
  await client.flush();
  assert.deepEqual(warnings, ['[agent-daemon] telemetry serialization failed', '[agent-daemon] telemetry queue is full']);
  assert.deepEqual(sent.map(request => request.operation), ['telemetryCapture', 'telemetryFlush']);
  assert.equal((sent[0]!.input as { name: string }).name, 'kept');
});

test('a drain that outlasts one second stops the sender: flush returns and later events are not sent', async (t) => {
  const warnings: string[] = [];
  t.mock.method(console, 'warn', (message: string) => { warnings.push(message); });
  const { sent, fetch } = rpc(({ operation }) => (operation === 'telemetryFlush' ? { hang: true } : { value: null }));
  const client = createDaemonCoreClient(BASE, { fetch });
  const started = Date.now();
  await client.flush();
  assert.ok(Date.now() - started >= 900, 'flush waited for its one-second bound');
  assert.deepEqual(warnings, ['[agent-daemon] telemetry drain exceeded one second']);
  client.tracker.capture({ name: 'late', userId: 'owner' });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(sent.map(request => request.operation), ['telemetryFlush'], 'a stopped sender queues nothing');
});

test('close drains what was accepted, then refuses further telemetry', async () => {
  const { sent, fetch } = rpc(() => ({ value: null }));
  const client = createDaemonCoreClient(BASE, { fetch });
  client.tracker.capture({ name: 'before-close', userId: 'owner' });
  await client.close();
  client.tracker.capture({ name: 'after-close', userId: 'owner' });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(sent.map(request => (request.input as { name?: string }).name ?? request.operation), ['before-close', 'telemetryFlush']);
});

test('a setting with no stored value reads back as null, not as a parsed record', async () => {
  const { sent, fetch } = rpc(() => ({ value: null }));
  const client = createDaemonCoreClient(BASE, { fetch });
  const coordinate = { namespace: 'core.interface', key: 'replyLength', scopeContext: { workspaceId: 'ws-1', principalId: 'owner' } };
  assert.equal(await client.getEffective({ deps: { repo: {} as never }, ...coordinate }), null);
  assert.deepEqual(sent, [{ operation: 'getEffective', input: coordinate }]);
});
