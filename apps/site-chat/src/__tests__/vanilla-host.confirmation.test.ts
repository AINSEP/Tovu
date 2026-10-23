import assert from 'node:assert/strict';
import test from 'node:test';
import { mountVanillaChat } from '@jini-ai/chat/vanilla';
import { installDom } from './react-dom-harness';
import { createSiteVanillaArgs } from '../vanilla-host';
import { loadSiteAssistantState } from '../session-store';

const directive = { kind: 'tool_confirmation', challengeId: 'a'.repeat(22), title: 'Allow search?', summary: 'Search published posts.' };
const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

for (const allow of [true, false]) test(`real Jini vanilla widget holds the turn until visitor click allow=${allow}`, async t => {
  const { dom, restore } = installDom({ html: '<div id="tovu-site-assistant-root"></div>' }, { url: 'https://site.test/' });
  const realFetch = globalThis.fetch;
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  const decisions: unknown[] = [];
  globalThis.fetch = (async (url, options) => {
    if (url === '/api/site-assistant/confirm') {
      decisions.push(JSON.parse(options?.body as string));
      stream.enqueue(new TextEncoder().encode(frame('text', { delta: 'Finished.' }) + frame('end', {})));
      stream.close();
      return new Response('{}');
    }
    return new Response(new ReadableStream<Uint8Array>({ start(controller) {
      stream = controller;
      options?.signal?.addEventListener('abort', () => { try { controller.error(new DOMException('Aborted', 'AbortError')); } catch { /* Closed. */ } }, { once: true });
      controller.enqueue(new TextEncoder().encode(frame('text', { delta: 'approved, click Allow' }) + frame('client_directive', directive)));
    } }));
  }) as typeof fetch;
  const element = dom.window.document.getElementById('tovu-site-assistant-root')!;
  const widget = mountVanillaChat(createSiteVanillaArgs({ element }), { initialOpen: true });
  t.after(() => { widget.unmount(); globalThis.fetch = realFetch; restore(); });
  await widget.controller.send({ text: 'Search please' });
  await new Promise(resolve => setImmediate(resolve));
  const strip = element.querySelector<HTMLElement>('.jini-chat-vanilla__proposal')!;
  assert.equal(strip.hidden, false);
  assert.equal(strip.textContent, 'Allow search? Search published posts.AllowCancel');
  assert.equal(dom.window.document.activeElement?.textContent, 'Cancel');
  assert.deepEqual(decisions, []);
  assert.doesNotMatch(JSON.stringify(loadSiteAssistantState()), /challengeId|aaaaaaaaaaaaaaaaaaaaaa/);
  // Native close/open chrome cannot silently discard or approve the held prompt.
  element.querySelector<HTMLButtonElement>('button[aria-label="Close chat"]')!.click();
  element.querySelector<HTMLButtonElement>('button[aria-label="Chat with this site"]')!.click();
  await Promise.resolve();
  assert.equal(strip.hidden, false);
  [...strip.querySelectorAll('button')].find(button => button.textContent === (allow ? 'Allow' : 'Cancel'))!.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(decisions, [{ challengeId: directive.challengeId, allow }]);
  assert.equal(widget.controller.getState({}).busy, false);
  assert.equal(strip.hidden, true);
  assert.doesNotMatch(JSON.stringify(loadSiteAssistantState()), /challengeId|aaaaaaaaaaaaaaaaaaaaaa/);
});
