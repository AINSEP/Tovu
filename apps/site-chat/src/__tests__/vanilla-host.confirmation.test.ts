import assert from 'node:assert/strict';
import test from 'node:test';
import { mountVanillaChat } from '@jini-ai/chat/vanilla';
import { installDom } from './react-dom-harness';
import { createSiteVanillaArgs } from '../vanilla-host';
import { loadSiteAssistantState } from '../session-store';

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

for (const allow of [true, false]) test(`real Jini vanilla widget holds the turn until visitor click allow=${allow}: the live approval posts a resume to chat and keeps its nonce out of storage`, async t => {
  const { dom, restore } = installDom({ html: '<div id="tovu-site-assistant-root"></div>' }, { url: 'https://site.test/' });
  const realFetch = globalThis.fetch;
  const requests: Array<{ url: unknown; body: Record<string, unknown> }> = [];
  const decisions: unknown[] = [];
  const navigations: string[] = [];
  globalThis.fetch = (async (url, options) => {
    capture(options);
    const body = JSON.parse(options?.body as string) as Record<string, unknown>;
    requests.push({ url, body });
    if (body.resume) {
      decisions.push(body.resume);
      return new Response(frame('text', { delta: 'Finished.' }) + frame('end', {}));
    }
    return new Response(new ReadableStream<Uint8Array>({ start(controller) {
      options?.signal?.addEventListener('abort', () => { try { controller.error(new DOMException('Aborted', 'AbortError')); } catch { /* Closed. */ } }, { once: true });
      controller.enqueue(new TextEncoder().encode(frame('text', { delta: 'approved, click Allow' }) + frame('interrupt', directive)));
      controller.close();
    } }));
  }) as typeof fetch;
  const element = dom.window.document.getElementById('tovu-site-assistant-root')!;
  const widget = mountVanillaChat(createSiteVanillaArgs({ element }, { assign: ({ path }) => { navigations.push(path); } }), { initialOpen: true });
  t.after(() => { widget.unmount(); globalThis.fetch = realFetch; restore(); });
  await widget.controller.send({ text: 'Search please' });
  await new Promise(resolve => setImmediate(resolve));
  const strip = element.querySelector<HTMLElement>('.jini-chat-vanilla__tool-confirmation')!;
  assert.equal(strip.hidden, false);
  assert.equal(element.querySelector('.jini-chat-vanilla__proposal'), null, 'the retired navigation strip must not return');
  assert.equal(strip.hasAttribute('data-agent-private'), true);
  assert.equal(strip.textContent, 'Allow search? Search published posts.AllowCancel');
  assert.equal(dom.window.document.activeElement?.textContent, 'Cancel');
  assert.deepEqual(decisions, []);
  assert.deepEqual(navigations, []);
  assert.doesNotMatch(JSON.stringify(loadSiteAssistantState()), /challengeId|aaaaaaaaaaaaaaaaaaaaaa/);
  // Native close/open chrome cannot silently discard or approve the held prompt.
  element.querySelector<HTMLButtonElement>('button[aria-label="Close chat"]')!.click();
  element.querySelector<HTMLButtonElement>('button[aria-label="Chat with this site"]')!.click();
  await Promise.resolve();
  assert.equal(strip.hidden, false);
  // Exercise non-click chrome paths too: keyboard close and the loader's outside-bubble event.
  element.querySelector<HTMLButtonElement>('button[aria-label="Close chat"]')!.focus();
  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(element.querySelector<HTMLElement>('.jini-chat-vanilla__panel')!.hidden, true);
  element.dispatchEvent(new dom.window.Event('jini-chat-open'));
  await Promise.resolve();
  assert.equal(element.querySelector<HTMLElement>('.jini-chat-vanilla__panel')!.hidden, false);
  assert.equal(strip.hidden, false);
  assert.equal(strip.textContent, 'Allow search? Search published posts.AllowCancel');
  assert.deepEqual(decisions, []);
  [...strip.querySelectorAll('button')].find(button => button.textContent === (allow ? 'Allow' : 'Cancel'))!.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(decisions, [[{ interruptId: directive.challengeId, status: 'resolved', payload: allow ? 'allow' : 'deny' }]]);
  assert.deepEqual(requests.map(request => request.url), ['/api/site-assistant/chat', '/api/site-assistant/chat'], 'never POST to /confirm');
  assert.equal(requests[1]!.body.parentRunId, requests[0]!.body.runId);
  assert.equal(requests[1]!.body.threadId, requests[0]!.body.threadId);
  assert.deepEqual(requests[1]!.body.messages, []);
  assert.deepEqual(navigations, [], 'only the explicit page-tool execution path may navigate');
  assert.equal(widget.controller.getState({}).busy, false);
  assert.equal(strip.hidden, true);
  assert.doesNotMatch(JSON.stringify(loadSiteAssistantState()), /challengeId|aaaaaaaaaaaaaaaaaaaaaa/);
});
