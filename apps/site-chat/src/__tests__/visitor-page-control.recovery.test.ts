import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { JSDOM } from 'jsdom';
import { createVisitorPageControl } from '../visitor-page-control';
import { createSiteAssistantTransport } from '../site-assistant-transport';
import type { ChatMessage } from '@jini-ai/chat/core';
import type { RunHandlers, StartRunInput } from '@jini-ai/chat/react';

test('visitor page actions recover after a dropped stream before the next message is sent', async () => {
  const dom = new JSDOM('<script id="tovu-visitor-publication" type="application/json">{"revision":"reviewed","elements":[{"handle":"menu","action":"menu"}]}</script><main data-visitor-page-root data-agent-publication="reviewed"><button data-agent-element="menu">Menu</button></main>', { url: 'https://example.test/' });
  const constructors = ['Element', 'Text', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLDetailsElement'] as const;
  const previous = constructors.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  for (const name of constructors) Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
  const streams: ReadableStreamDefaultController<Uint8Array>[] = [];
  const responses: Record<string, unknown>[] = [];
  const responsesReady = new EventTarget();
  const frame = (index: number, value: unknown) => streams[index]!.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`));
  const send: typeof fetch = async (url, init) => {
    if (String(url).endsWith('/credentials')) return Response.json({ tabCredential: 'tab' });
    if (String(url).includes('/stream?')) return new Response(new ReadableStream<Uint8Array>({ start(controller) { streams.push(controller); } }));
    responses.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    assert.equal(new Headers(init?.headers).get('x-frontend-bind-token'), 'recovered-token');
    responsesReady.dispatchEvent(new Event("response"));
    return Response.json({ settled: true });
  };
  const control = createVisitorPageControl({ document: dom.window.document, beforeNavigate() {} }, { fetch: send });
  const turn = () => new Promise<void>(resolve => setImmediate(resolve));
  try {
    const first = control.headers();
    await turn();
    frame(0, { type: 'attached', sessionId: 'first', bindToken: 'old-token' });
    assert.equal((await first)['x-frontend-bind-token'], 'old-token');
    streams[0]!.close();
    await turn();
    const next = control.headers();
    let sent = false;
    void next.then(() => { sent = true; });
    await turn();
    assert.equal(sent, false, 'the next send must wait for a new binding');
    assert.equal(streams.length, 2);
    frame(1, { type: 'attached', sessionId: 'second', bindToken: 'recovered-token' });
    assert.equal((await next)['x-frontend-bind-token'], 'recovered-token');
    let clicks = 0;
    dom.window.document.querySelector('button')!.addEventListener('click', () => { clicks++; });
    const responseSent = once(responsesReady, "response", { signal: AbortSignal.timeout(2_000) });
    frame(1, { type: 'invocation', invocationId: 'click-menu', capabilityId: 'page.click', input: {
      handle: 'menu', __visitorPage: { revision: 'reviewed', approved: true, pages: [] },
    } });
    // Page writes settle the DOM before responding; one event-loop turn is not that contract.
    await responseSent;
    assert.equal(responses.at(-1)?.ok, true, JSON.stringify(responses.at(-1)));
    assert.equal(clicks, 1);
  } finally {
    control.close(); dom.window.close();
    constructors.forEach((name, index) => {
      const descriptor = previous[index];
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (globalThis as Record<string, unknown>)[name];
    });
  }
});

const PAGE_HTML = '<script id="tovu-visitor-publication" type="application/json">{"revision":"reviewed","elements":[{"handle":"menu","action":"menu"}]}</script><main data-visitor-page-root data-agent-publication="reviewed"><button data-agent-element="menu">Menu</button></main>';
const CLICK_INPUT = { handle: 'menu', __visitorPage: { revision: 'reviewed', approved: true, pages: [] } };
const NAVIGATE_INPUT = { page: 'about', __visitorPage: { revision: 'reviewed', approved: true, path: '/about', pages: [{ id: 'about', label: 'About' }] } };

/** One visitor page whose stream attaches at once; every begin and response request is recorded. */
function visitorPage({ log = [] as string[], html = PAGE_HTML } = {}) {
  const dom = new JSDOM(html, { url: 'https://example.test/' });
  const constructors = ['Element', 'Text', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLDetailsElement'] as const;
  const previous = constructors.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  for (const name of constructors) Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
  const begins: { body: Record<string, unknown>; headers: Headers }[] = [];
  const responses: Record<string, unknown>[] = [];
  const settled = new EventTarget();
  const send: typeof fetch = async (url, init) => {
    if (String(url).endsWith('/credentials')) return Response.json({ tabCredential: 'tab' });
    if (String(url).includes('/stream?')) return new Response(new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'attached', sessionId: 's1', bindToken: 'live-token' })}\n\n`));
    } }));
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    if (String(url).endsWith('/begin')) {
      begins.push({ body, headers: new Headers(init?.headers) });
      log.push(`begin:${String(body.invocationId)}`);
      return Response.json({ begun: true });
    }
    responses.push(body);
    log.push(`response:${String(body.invocationId)}`);
    settled.dispatchEvent(new Event('response'));
    return Response.json({ settled: true });
  };
  const assigned: string[] = [];
  const persisted: (ChatMessage[] | undefined)[] = [];
  const control = createVisitorPageControl({ document: dom.window.document, beforeNavigate({ messages }) { log.push(messages ? 'persist' : 'prepare'); persisted.push(messages); } }, {
    fetch: send, assign({ path }) { log.push(`assign:${path}`); assigned.push(path); },
  });
  let clicks = 0;
  dom.window.document.querySelector('button')!.addEventListener('click', () => { clicks++; });
  const restore = () => {
    control.close(); dom.window.close();
    constructors.forEach((name, index) => {
      const descriptor = previous[index];
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (globalThis as Record<string, unknown>)[name];
    });
  };
  return { control, document: dom.window.document, begins, responses, settled, assigned, persisted, log, clicks: () => clicks, restore };
}

const sseFrame = (event: Record<string, unknown>) => `data: ${JSON.stringify(event)}\n\n`;
/** A complete reviewed page action as the server projects it onto the visitor's AG-UI segment. */
function pageActionFrames({ toolCallId, action }: { toolCallId: string; action: Record<string, unknown> }) {
  const json = JSON.stringify(action);
  return [
    sseFrame({ type: 'TOOL_CALL_START', toolCallId, toolCallName: 'tovu.page_action', parentMessageId: 'm1' }),
    sseFrame({ type: 'TOOL_CALL_ARGS', toolCallId, delta: json.slice(0, 20) }),
    sseFrame({ type: 'TOOL_CALL_ARGS', toolCallId, delta: json.slice(20) }),
    sseFrame({ type: 'TOOL_CALL_END', toolCallId }),
  ];
}
/** The visitor chat endpoint answering one turn with the given frames between text and terminal. */
function chatAnswering({ middle, reason = 'stop', posts = [] as Record<string, unknown>[] }: { middle: string[]; reason?: string; posts?: Record<string, unknown>[] }): typeof fetch {
  return (async (_url: string, init: RequestInit) => {
    const ids = JSON.parse(String(init.body)) as { threadId: string; runId: string };
    posts.push({ runId: ids.runId, headers: new Headers(init.headers) });
    const frames = [sseFrame({ type: 'RUN_STARTED', ...ids }), sseFrame({ type: 'TEXT_MESSAGE_START', messageId: 'm1', role: 'assistant' }),
      sseFrame({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'On it.' }), sseFrame({ type: 'TEXT_MESSAGE_END', messageId: 'm1' }),
      ...middle, sseFrame({ type: 'RUN_FINISHED', ...ids, result: { reason } })];
    return new Response(new ReadableStream<Uint8Array>({ start(controller) {
      for (const value of frames) controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    } }), { headers: { 'content-type': 'text/event-stream' } });
  }) as typeof fetch;
}
const visitorTurn = (content: string): StartRunInput => ({ history: [{ id: 'u1', role: 'user', content }], signal: new AbortController().signal });
const quietHandlers = () => {
  const errors: Error[] = [];
  let done!: () => void;
  const finished = new Promise<void>(resolve => { done = resolve; });
  return { errors, finished, handlers: { onEvent() {}, onError: (error: Error) => { errors.push(error); }, onDone: () => done() } satisfies RunHandlers };
};

test('an effect from another run is ignored', async () => {
  const page = visitorPage();
  try {
    const transport = createSiteAssistantTransport({}, { frontend: page.control, fetch: chatAnswering({ middle: [
      ...pageActionFrames({ toolCallId: 'current-invocation', action: { runId: 'logical-run', invocationId: 'current-invocation', capabilityId: 'page.click', input: CLICK_INPUT } }),
      ...pageActionFrames({ toolCallId: 'other-invocation', action: { runId: 'previous-logical-run', invocationId: 'other-invocation', capabilityId: 'page.click', input: CLICK_INPUT } }),
    ] }) });
    const { handlers, errors, finished } = quietHandlers();
    const responded = once(page.settled, 'response', { signal: AbortSignal.timeout(2_000) });
    await transport.startRun(visitorTurn('open the menu'), handlers);
    await finished;
    await responded;
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual(errors, []);
    assert.deepEqual(page.begins.map(begin => begin.body), [{ sessionId: 's1', runId: 'logical-run', invocationId: 'current-invocation' }]);
    // Begin travels with the original attachment's credentials and the live bind token.
    assert.equal(page.begins[0]!.headers.get('x-frontend-tab'), 'tab');
    assert.equal(page.begins[0]!.headers.get('x-visitor-publication'), 'reviewed');
    assert.equal(page.begins[0]!.headers.get('x-frontend-bind-token'), 'live-token');
    assert.deepEqual(page.responses.map(response => response.invocationId), ['current-invocation']);
    assert.equal(page.clicks(), 1);
    // Without a live turn binding (the page closed it), nothing reaches the bridge at all.
    page.control.close();
    page.control.acceptBrowserInvocation({ runId: 'logical-run', action: { invocationId: 'late-invocation', capabilityId: 'page.click', input: CLICK_INPUT } });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(page.begins.length, 1);
  } finally { page.restore(); }
});

test('result carries the invocation id', async () => {
  const page = visitorPage();
  const posts: Record<string, unknown>[] = [];
  try {
    const transport = createSiteAssistantTransport({}, { frontend: page.control, fetch: chatAnswering({ posts, middle: [
      // A model-side call id that differs from the delivered tool call is not a capability.
      ...pageActionFrames({ toolCallId: 'reg-inv-2', action: { runId: 'logical-run-1', invocationId: 'model-call-9', capabilityId: 'page.click', input: CLICK_INPUT } }),
      ...pageActionFrames({ toolCallId: 'reg-inv-1', action: { runId: 'logical-run-1', invocationId: 'reg-inv-1', capabilityId: 'page.click', input: CLICK_INPUT } }),
    ] }) });
    const { handlers, errors, finished } = quietHandlers();
    const responded = once(page.settled, 'response', { signal: AbortSignal.timeout(2_000) });
    const { runId } = await transport.startRun(visitorTurn('open the menu'), handlers);
    await finished;
    await responded;
    assert.deepEqual(errors, []);
    // The claim names the server's logical run from the delivery, not the client's AG-UI run id.
    assert.equal(posts[0]!.runId, runId);
    assert.notEqual(runId, 'logical-run-1');
    assert.deepEqual(page.begins.map(begin => begin.body), [{ sessionId: 's1', runId: 'logical-run-1', invocationId: 'reg-inv-1' }]);
    assert.deepEqual(page.responses.map(response => response.invocationId), ['reg-inv-1']);
    assert.equal(page.clicks(), 1);
  } finally { page.restore(); }
});

test('navigation persists before the document is replaced and never replays', async () => {
  const page = visitorPage();
  try {
    const transport = createSiteAssistantTransport({}, { frontend: page.control, fetch: chatAnswering({ reason: 'navigation', middle:
      pageActionFrames({ toolCallId: 'reg-nav-1', action: { runId: 'logical-run-1', invocationId: 'reg-nav-1', capabilityId: 'page.navigate', input: NAVIGATE_INPUT } }) }) });
    const { handlers, errors, finished } = quietHandlers();
    await transport.startRun(visitorTurn('take me to about'), handlers);
    await finished;
    for (let i = 0; i < 50 && page.assigned.length === 0; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(errors, []);
    assert.deepEqual(page.log, ['begin:reg-nav-1', 'prepare', 'response:reg-nav-1', 'persist', 'assign:/about']);
    // What survives the reload is chat only: the saved reply carries no page action to act on again.
    const saved = page.persisted.at(-1)!.at(-1)!;
    assert.equal(saved.content, 'On it.');
    assert.ok((saved.events ?? []).every(event => event.kind === 'text'), JSON.stringify(saved.events));
    page.control.finish({ navigation: true, messages: page.persisted.at(-1) });
    assert.deepEqual(page.assigned, ['/about'], 'a terminal alone never repeats the accepted navigation');
  } finally { page.restore(); }
});

test('closing an attached page drops its live headers and does not reattach on a later read', async t => {
  const page = visitorPage();
  t.after(page.restore);
  assert.deepEqual(page.control.currentHeaders(), {});
  await page.control.ready;
  assert.deepEqual(await page.control.headers(), {
    'x-frontend-tab': 'tab', 'x-visitor-publication': 'reviewed', 'x-frontend-bind-token': 'live-token',
  });
  assert.deepEqual(page.control.currentHeaders(), {
    'x-frontend-tab': 'tab', 'x-visitor-publication': 'reviewed', 'x-frontend-bind-token': 'live-token',
  });
  page.control.close();
  assert.deepEqual(page.control.currentHeaders(), {});
  assert.deepEqual(await page.control.headers(), {});
});

test('an approved form submits once, only after its acknowledgement and terminal transcript', { timeout: 3_000 }, async t => {
  const page = visitorPage({ html: `
    <script id="tovu-visitor-publication" type="application/json">{"revision":"reviewed","elements":[{"handle":"send","action":"submit","target":{"action":"/contact","method":"get"}}]}</script>
    <main data-visitor-page-root data-agent-publication="reviewed">
      <form action="/contact"><button type="submit" data-agent-element="send">Send the form</button></form>
    </main>` });
  t.after(page.restore);
  const form = page.document.querySelector('form')!;
  const submitters: (string | null)[] = [];
  form.addEventListener('submit', event => {
    event.preventDefault();
    page.log.push('submit');
    submitters.push(event.submitter?.textContent ?? null);
  });
  const submitted = new Promise<void>(resolve => form.addEventListener('submit', () => resolve(), { once: true }));

  await page.control.headers();
  const acknowledged = once(page.settled, 'response', { signal: AbortSignal.timeout(2_000) });
  page.control.acceptBrowserInvocation({ runId: 'logical-form-run', action: {
    invocationId: 'submit-contact', capabilityId: 'page.click',
    input: { handle: 'send', __visitorPage: { revision: 'reviewed', approved: true, pages: [] } },
  } });
  await acknowledged;

  assert.deepEqual(page.begins.map(begin => begin.body), [{ sessionId: 's1', runId: 'logical-form-run', invocationId: 'submit-contact' }]);
  assert.equal(page.responses[0]?.ok, true);
  assert.deepEqual(page.responses[0]?.output, { accepted: true, terminalSubmission: true });
  assert.deepEqual(page.log, ['begin:submit-contact', 'prepare', 'response:submit-contact']);
  assert.deepEqual(submitters, []);

  const messages: ChatMessage[] = [{ id: 'completed', role: 'assistant', content: 'The form is ready to submit.' }];
  page.control.finish({ navigation: true, messages });
  await submitted;
  assert.deepEqual(page.log, ['begin:submit-contact', 'prepare', 'response:submit-contact', 'persist', 'submit']);
  assert.deepEqual(page.persisted, [undefined, messages]);
  assert.deepEqual(page.assigned, [], 'native form submission is not a location assignment');
  page.control.finish({ navigation: true, messages });
  assert.deepEqual(submitters, ['Send the form']);
});
