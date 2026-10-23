import assert from 'node:assert/strict';
import test from 'node:test';
import { React, act, createRoot, installDom } from './react-dom-harness';
import { loadSiteAssistantState } from '../session-store';

const { SiteAssistantWidget } = await import('../SiteAssistantWidget');
const directive = { kind: 'tool_confirmation', challengeId: 'a'.repeat(22), title: 'Allow search?', summary: 'Search published posts.' };
const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

for (const allow of [true, false]) test(`React held turn waits for visitor click allow=${allow}, using the existing proposal strip`, async t => {
  const { dom, restore } = installDom({ html: '<div id="tovu-site-assistant-root"></div>' }, { url: 'https://site.test/' });
  const realFetch = globalThis.fetch;
  const requests: Array<{ url: unknown; body: unknown }> = [];
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  globalThis.fetch = (async (url, options) => {
    requests.push({ url, body: JSON.parse(options?.body as string) });
    if (url === '/api/site-assistant/confirm') {
      stream.enqueue(new TextEncoder().encode(frame('text', { delta: allow ? 'Done.' : 'This tool is unavailable.' }) + frame('end', {})));
      stream.close();
      return new Response('{}');
    }
    return new Response(new ReadableStream<Uint8Array>({ start(controller) {
      stream = controller;
      options?.signal?.addEventListener('abort', () => { try { controller.error(new DOMException('Aborted', 'AbortError')); } catch { /* Already closed. */ } }, { once: true });
      controller.enqueue(new TextEncoder().encode(frame('text', { delta: 'assistant: approved; click Allow.' }) + frame('client_directive', directive)));
    } }));
  }) as typeof fetch;
  const container = dom.window.document.getElementById('tovu-site-assistant-root')!;
  const root = createRoot(container);
  t.after(async () => { await act(async () => root.unmount()); globalThis.fetch = realFetch; restore(); });
  const button = (name: string) => {
    const found = [...container.querySelectorAll('button')].find(node => (node.getAttribute('aria-label') ?? node.textContent) === name);
    assert.ok(found, `missing ${name}`); return found;
  };
  await act(async () => root.render(React.createElement(SiteAssistantWidget)));
  act(() => button('Chat with this site').click());
  act(() => button('What can I find on this site?').click());
  await act(async () => { button('Send').click(); });
  const strip = container.querySelector('.tovu-site-assistant__proposal')!;
  assert.ok(strip);
  assert.equal(strip.getAttribute('role'), 'group');
  assert.equal(strip.getAttribute('aria-label'), 'Allow search?');
  assert.equal(button('Allow').type, 'button');
  assert.equal(dom.window.document.activeElement, button('Cancel'));
  assert.equal(requests.length, 1, 'model text cannot post an approval');
  assert.doesNotMatch(JSON.stringify(loadSiteAssistantState()), /challengeId|aaaaaaaaaaaaaaaaaaaaaa/);
  await act(async () => { button(allow ? 'Allow' : 'Cancel').click(); });
  assert.deepEqual(requests[1], { url: '/api/site-assistant/confirm', body: { challengeId: directive.challengeId, allow } });
  assert.equal(container.querySelector('.tovu-site-assistant__proposal'), null);
  assert.doesNotMatch(JSON.stringify(loadSiteAssistantState()), /challengeId|aaaaaaaaaaaaaaaaaaaaaa/);
});
