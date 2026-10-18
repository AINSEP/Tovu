import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTovuAssistantTransport } from '../assistant-transport';
import { FakeEventSource, resetFakeEventSource, streamFromChunks, flushMicrotasks } from './assistant-transport.test-helpers';

const handlers = () => ({ onEvent: vi.fn(), onError: vi.fn(), onDone: vi.fn() });
const key = 'jini:chat-agent-plugins:chat';
const state = { decision: { selected: ['theme'] }, excluded: ['design'] };
beforeEach(() => { localStorage.clear(); localStorage.setItem(key, JSON.stringify(state)); resetFakeEventSource(); vi.stubGlobal('EventSource', FakeEventSource); });
afterEach(() => vi.unstubAllGlobals());
describe('plugin state on every assistant turn', () => {
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
