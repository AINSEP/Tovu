import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { JSDOM } from 'jsdom';
import { createVisitorPageControl } from '../visitor-page-control';

test('visitor page actions recover after a dropped stream before the next message is sent', async () => {
  const dom = new JSDOM('<script id="tovu-visitor-publication" type="application/json">{"revision":"reviewed","elements":[{"handle":"menu","action":"menu"}]}</script><main data-visitor-page-root data-agent-publication="reviewed"><button data-agent-element="menu">Menu</button></main>', { url: 'https://example.test/' });
  const constructors = ['Element', 'HTMLElement', 'HTMLButtonElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLDetailsElement'] as const;
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
    assert.equal(clicks, 1);
    assert.equal(responses.at(-1)?.ok, true);
  } finally {
    control.close(); dom.window.close();
    constructors.forEach((name, index) => {
      const descriptor = previous[index];
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete (globalThis as Record<string, unknown>)[name];
    });
  }
});
