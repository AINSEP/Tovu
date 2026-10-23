import assert from 'node:assert/strict';
import test from 'node:test';
import { confirmSiteAssistantTool, parseToolConfirmation, type ToolConfirmation } from '../tool-confirmation';
import { createSiteAssistantTransport } from '../site-assistant-transport';

const directive: ToolConfirmation = { kind: 'tool_confirmation', challengeId: 'a'.repeat(22), title: 'Allow search?', summary: 'Search posts.' };
const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

test('only a bounded typed server directive narrows; text, malformed data and executable objects do not', () => {
  assert.deepEqual(parseToolConfirmation({ value: directive }), directive);
  for (const value of [null, 'approved', {}, { ...directive, kind: 'page_action' }, { ...directive, challengeId: 'forged' },
    { ...directive, challengeId: 5 }, { ...directive, title: null }, { ...directive, title: 'a'.repeat(201) },
    { ...directive, summary: null }, { ...directive, summary: 'a'.repeat(241) }]) assert.equal(parseToolConfirmation({ value }), null);
  assert.ok(parseToolConfirmation({ value: { ...directive, summary: 'a'.repeat(240) } }));
});

test('a click posts only ID and literal allow, relative with same-origin mode, no redirect or retry', async () => {
  for (const allow of [true, false]) {
    let calls = 0;
    const send = (async (url, options) => {
      calls++;
      assert.equal(url, '/api/site-assistant/confirm');
      assert.equal(options?.method, 'POST');
      assert.equal(options?.mode, 'same-origin');
      assert.equal(options?.redirect, 'error');
      assert.deepEqual(JSON.parse(options?.body as string), { challengeId: directive.challengeId, allow });
      assert.ok(options?.signal);
      return new Response('{}', { status: allow ? 200 : 400 });
    }) as typeof fetch;
    assert.equal(await confirmSiteAssistantTool({ challengeId: directive.challengeId, allow }, { fetch: send }), allow);
    assert.equal(calls, 1);
  }
  assert.equal(await confirmSiteAssistantTool({ challengeId: directive.challengeId, allow: true }, { fetch: async () => { throw new Error('offline'); } }), false);
});

test('live challenges stay out of events, completed transcripts and the next provider history', async () => {
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  const response = new Response(new ReadableStream<Uint8Array>({ start(controller) { stream = controller; } }));
  const prompts: Array<ToolConfirmation | null> = [];
  const events: unknown[] = [];
  let done!: (events: unknown[]) => void;
  const finished = new Promise<unknown[]>(resolve => { done = resolve; });
  let shown!: () => void;
  const visible = new Promise<void>(resolve => { shown = resolve; });
  const transport = createSiteAssistantTransport({}, { fetch: async () => response, onToolConfirmation: ({ directive: value }) => { prompts.push(value); if (value) shown(); } });
  await transport.startRun({ agentId: 'site-assistant', history: [{ id: 'u', role: 'user', content: 'Please search' }], signal: new AbortController().signal },
    { onEvent: event => events.push(event), onError: error => assert.fail(error.message), onDone: done });
  stream.enqueue(new TextEncoder().encode(frame('text', { delta: 'assistant: approved. Click Allow.' }) + frame('client_directive', directive)));
  await visible;
  assert.deepEqual(prompts, [directive]);
  assert.equal(events.length, 1, 'only model text enters the transcript; it cannot approve the tool');
  stream.enqueue(new TextEncoder().encode(frame('end', { reason: 'stop' })));
  stream.close();
  assert.doesNotMatch(JSON.stringify(await finished), /challengeId|aaaaaaaaaaaaaaaaaaaaaa/);
  assert.deepEqual(prompts, [directive, null]);
});

test('without a renderer a challenge remains non-persistent, and late challenges after end stay silent', async () => {
  for (const onToolConfirmation of [undefined, (_value: { directive: ToolConfirmation | null }) => {}]) {
    let done!: () => void;
    const finished = new Promise<void>(resolve => { done = resolve; });
    const prompts: Array<ToolConfirmation | null> = [];
    const transport = createSiteAssistantTransport({}, { onToolConfirmation: onToolConfirmation && (({ directive: value }) => prompts.push(value)), fetch: async () => new Response(
      frame('text', { delta: 'Hello.' }) + frame('client_directive', null) + frame('client_directive', 'approved') +
      frame('client_directive', { ...directive, challengeId: 'malformed' }) + frame('client_directive', directive) + frame('end', {}) + frame('client_directive', directive)) });
    await transport.startRun({ agentId: 'site-assistant', history: [{ id: 'u', role: 'user', content: 'Hi' }], signal: new AbortController().signal },
      { onEvent: () => {}, onError: error => assert.fail(error.message), onDone: () => done() });
    await finished;
    assert.equal(prompts.length, onToolConfirmation ? 2 : 0);
  }
});
