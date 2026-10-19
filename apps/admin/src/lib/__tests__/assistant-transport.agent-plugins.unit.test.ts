import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTovuAssistantTransport } from '../assistant-transport';
import type { ChatMessage } from '@jini-ai/chat/core';
import { FakeEventSource, resetFakeEventSource, streamFromChunks, flushMicrotasks } from './assistant-transport.test-helpers';

const handlers = () => ({ onEvent: vi.fn(), onError: vi.fn(), onDone: vi.fn() });
const key = 'jini:chat-agent-plugins:chat';
const state = { decision: { selected: ['theme'] }, excluded: ['design'] };
beforeEach(() => { localStorage.clear(); localStorage.setItem(key, JSON.stringify(state)); resetFakeEventSource(); vi.stubGlobal('EventSource', FakeEventSource); });
afterEach(() => vi.unstubAllGlobals());
describe('plugin state on every assistant turn', () => {
  it('captures only the latest distinct state: unchanged checkpoints and matching live events do not write or notify again', async () => {
    vi.useFakeTimers();
    localStorage.removeItem(key);
    const decided = { decision: { selected: ['theme'], asked: true }, excluded: ['design'] };
    const usage = (value: typeof decided): NonNullable<ChatMessage['events']>[number] => ({ kind: 'ext', name: 'agent_plugins', data: { conversationId: 'chat', state: value, plugins: [] } });
    const message: ChatMessage = { id: 'answer', role: 'assistant', content: '', runId: 'pending-ask', runStatus: 'running', events: [
      usage({ decision: { selected: ['obsolete'], asked: true }, excluded: [] }), usage(decided),
    ] };
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ message }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    const notifications = vi.fn();
    window.addEventListener('jini:agent-plugin-state', notifications);
    const abort = new AbortController();
    const observed = { ...handlers(), onCheckpoint: vi.fn() };
    try {
      await createTovuAssistantTransport({}).reattachRun!('pending-ask', observed, { signal: abort.signal });
      await vi.advanceTimersByTimeAsync(1_000);
      expect(observed.onCheckpoint).toHaveBeenCalled();
      expect(writes).toHaveBeenCalledTimes(1);
      expect(notifications).toHaveBeenCalledTimes(1);
      expect(JSON.parse(localStorage.getItem(key)!)).toEqual(decided);
      const checkpoints = observed.onCheckpoint.mock.calls.length;
      FakeEventSource.instances.at(-1)?.emit('agent', JSON.stringify({ kind: 'agent', payload: { type: 'agent_plugins', conversationId: 'chat', state: decided, plugins: [] } }));
      await vi.advanceTimersByTimeAsync(2_000);
      expect(observed.onCheckpoint.mock.calls.length).toBeGreaterThan(checkpoints);
      expect(writes).toHaveBeenCalledTimes(1);
      expect(notifications).toHaveBeenCalledTimes(1);
      const skipped = { decision: { selected: [], asked: true }, excluded: ['theme', 'design'] };
      message.events!.push(usage(skipped));
      await vi.advanceTimersByTimeAsync(1_000);
      expect(writes).toHaveBeenCalledTimes(2);
      expect(notifications).toHaveBeenCalledTimes(2);
      // Storage unions exclusions, existing first.
      expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ ...skipped, excluded: ['design', 'theme'] });
      await vi.advanceTimersByTimeAsync(1_000);
      expect(writes).toHaveBeenCalledTimes(2);
      expect(notifications).toHaveBeenCalledTimes(2);
    } finally {
      abort.abort(); window.removeEventListener('jini:agent-plugin-state', notifications); writes.mockRestore(); vi.useRealTimers();
    }
  });

  it.each(['running', 'succeeded'] as const)('captures a %s checkpoint decision before rendering and keeps it across reload', async runStatus => {
    vi.useFakeTimers();
    localStorage.removeItem(key);
    const decided = { decision: { selected: ['theme'], asked: true }, excluded: ['design'] };
    const message: ChatMessage = { id: 'answer', role: 'assistant', content: '', runId: 'pending-ask', runStatus,
      events: [{ kind: 'ext', name: 'agent_plugins', data: { conversationId: 'chat', state: decided, plugins: [] } }] };
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(String(input).endsWith('/recover') ? { message } : { run: { id: 'next' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const pending = new AbortController();
    const next = new AbortController();
    const observed = { ...handlers(), onCheckpoint: vi.fn(() => {
      expect(JSON.parse(localStorage.getItem(key)!)).toEqual(decided);
    }) };
    try {
      await createTovuAssistantTransport({}).reattachRun!('pending-ask', observed, { signal: pending.signal });
      FakeEventSource.instances.at(-1)?.emit('agent', JSON.stringify({ kind: 'agent', payload: { type: 'agent_plugins', conversationId: 'chat', state: decided, plugins: [] } }));
      await vi.advanceTimersByTimeAsync(1_000);
      expect(observed.onCheckpoint).toHaveBeenCalledWith(message);
      expect(observed.onEvent).not.toHaveBeenCalled();
      expect(JSON.parse(localStorage.getItem(key)!)).toEqual(decided);
      pending.abort();
      await createTovuAssistantTransport({}).startRun({ history: [{ id: 'u', role: 'user', content: 'continue' }], context: { conversationId: 'chat' }, signal: next.signal }, handlers());
      const dispatch = fetcher.mock.calls.find(([input, init]) => String(input) === '/api/runs' && init?.method === 'POST');
      expect(dispatch).toBeDefined();
      expect(JSON.parse(JSON.parse(String(dispatch![1]?.body)).contextRef).agentPluginState).toEqual(decided);
    } finally { pending.abort(); next.abort(); vi.useRealTimers(); }
  });
  it('CLI sends the current conversation state and stores returned decisions', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ run: { id: 'r' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const transport = createTovuAssistantTransport({});
    await transport.startRun({ history: [{ id: 'u', role: 'user', content: 'design a theme' }], context: { conversationId: 'chat' }, signal: new AbortController().signal }, handlers());
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(JSON.parse(body.contextRef)).toMatchObject({ agentPluginState: state, conversationId: 'chat', userPrompt: 'design a theme' });
    const decided = { decision: { selected: ['theme'], asked: true }, excluded: ['design'] };
    FakeEventSource.instances.at(-1)?.emit('agent', JSON.stringify({ runId: 'r', kind: 'agent', payload: { type: 'agent_plugins', conversationId: 'chat', state: decided, plugins: [{ id: 'theme', name: 'Theme' }] } }));
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(decided);
    FakeEventSource.instances.at(-1)?.emit('end', JSON.stringify({ status: 'succeeded' }));
  });
  it('persists an Ask answer received after reload and sends it on the next turn', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ run: { id: 'next' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const reloaded = createTovuAssistantTransport({});
    const observed = handlers();
    const pending = new AbortController();
    await reloaded.reattachRun!('pending-ask', observed, { signal: pending.signal });
    const decided = { decision: { selected: ['theme'], asked: true }, excluded: ['design'] };
    FakeEventSource.instances.at(-1)?.emit('agent', JSON.stringify({ runId: 'pending-ask', kind: 'agent', payload: { type: 'agent_plugins', conversationId: 'chat', state: decided, plugins: [{ id: 'theme', name: 'Theme' }] } }));
    expect(observed.onEvent).toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(decided);
    pending.abort();
    const next = new AbortController();
    await createTovuAssistantTransport({}).startRun({ history: [{ id: 'u', role: 'user', content: 'continue' }], context: { conversationId: 'chat' }, signal: next.signal }, handlers());
    expect(JSON.parse(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)).contextRef).agentPluginState).toEqual(decided);
    next.abort();
  });
  it('BYOK adopts identity before dispatch and sends the same state', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(streamFromChunks(['event: end\ndata: {"reason":"done"}\n\n']), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const transport = createTovuAssistantTransport({ ensureConversationId: async () => 'chat', getExecutionConfig: () => ({ mode: 'byok', localCli: { agentId: null }, byok: { protocol: 'anthropic', providerId: 'anthropic', apiKey: '', baseUrl: '', model: 'fixture', maxTokens: 512 } }) });
    await transport.startRun({ history: [{ id: 'u', role: 'user', content: 'design a theme' }], signal: new AbortController().signal }, handlers());
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({ conversationId: 'chat', agentPluginState: state });
    await flushMicrotasks();
  });
});
