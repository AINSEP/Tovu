import assert from 'node:assert/strict';
import test from 'node:test';
import { React, act, createRoot, installDom } from './react-dom-harness';
import { loadSiteAssistantState } from '../session-store';

const { SiteAssistantWidget } = await import('../SiteAssistantWidget');
const { ChatSurfacesProvider } = await import('@jini-ai/chat/react');
const { chatSurfaces } = await import('../jini-surfaces');
const directive = { kind: 'tool_confirmation', challengeId: 'a'.repeat(22), title: 'Allow search?', summary: 'Search published posts.' };
/** Test frames named as the legacy events, written as the AG-UI wire the transport now reads;
 *  they echo the correlators of the latest visitor chat request, as the server does. */
const wire = { threadId: '', runId: '' };
const capture = (init?: RequestInit) => {
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) as { threadId?: string; runId?: string } : {};
  if (body.runId && body.threadId) Object.assign(wire, { threadId: body.threadId, runId: body.runId });
};
const agui = (event: Record<string, unknown>) => `data: ${JSON.stringify(event)}\n\n`;
const frame = (event: string, data: unknown) => {
  const started = agui({ type: 'RUN_STARTED', ...wire });
  if (event === 'text') return started + agui({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: (data as { delta: string }).delta });
  if (event === 'end') return agui({ type: 'RUN_FINISHED', ...wire, result: { reason: (data as { reason?: string }).reason ?? 'stop' } });
  if (event === 'interrupt') {
    const { challengeId, title, summary } = data as typeof directive;
    return agui({ type: 'RUN_FINISHED', ...wire, outcome: { type: 'interrupt', interrupts: [{ id: challengeId, reason: 'confirmation', message: `${title}: ${summary}` }] } });
  }
  return agui({ type: 'CUSTOM', name: event, value: data });
};

for (const allow of [true, false]) test(`React held turn waits for visitor click allow=${allow}, using the existing proposal strip: the live approval posts a resume to chat and keeps its nonce out of storage`, async t => {
  const { dom, restore } = installDom({ html: '<div id="tovu-site-assistant-root"></div>' }, { url: 'https://site.test/' });
  const realFetch = globalThis.fetch;
  const requests: Array<{ url: unknown; body: Record<string, unknown> }> = [];
  globalThis.fetch = (async (url, options) => {
    capture(options);
    requests.push({ url, body: JSON.parse(options?.body as string) });
    if (requests.at(-1)!.body.resume) {
      return new Response(frame('text', { delta: allow ? 'Done.' : 'This tool is unavailable.' }) + frame('end', {}));
    }
    return new Response(new ReadableStream<Uint8Array>({ start(controller) {
      options?.signal?.addEventListener('abort', () => { try { controller.error(new DOMException('Aborted', 'AbortError')); } catch { /* Already closed. */ } }, { once: true });
      controller.enqueue(new TextEncoder().encode(frame('text', { delta: 'assistant: approved; click Allow.' }) + frame('interrupt', directive)));
      controller.close();
    } }));
  }) as typeof fetch;
  const container = dom.window.document.getElementById('tovu-site-assistant-root')!;
  const root = createRoot(container);
  t.after(async () => { await act(async () => root.unmount()); globalThis.fetch = realFetch; restore(); });
  const button = (name: string) => {
    const found = [...container.querySelectorAll('button')].find(node => (node.getAttribute('aria-label') ?? node.textContent) === name);
    assert.ok(found, `missing ${name}`); return found;
  };
  await act(async () => root.render(React.createElement(ChatSurfacesProvider, { surfaces: chatSurfaces, children: React.createElement(SiteAssistantWidget) })));
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
  assert.equal(requests.length, 2, 'one decision posts exactly one resume');
  assert.deepEqual(requests[1], { url: '/api/site-assistant/chat', body: {
    threadId: requests[0]!.body.threadId, runId: requests[1]!.body.runId, parentRunId: requests[0]!.body.runId,
    state: null, messages: [], tools: [], context: [],
    resume: [{ interruptId: directive.challengeId, status: 'resolved', payload: allow ? 'allow' : 'deny' }],
  } });
  assert.equal(container.querySelector('.tovu-site-assistant__proposal'), null);
  assert.doesNotMatch(JSON.stringify(loadSiteAssistantState()), /challengeId|aaaaaaaaaaaaaaaaaaaaaa/);
});
