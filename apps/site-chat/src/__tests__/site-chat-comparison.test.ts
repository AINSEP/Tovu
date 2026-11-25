/** wcmp: exercise the diagnostic adapters through native events and DI conversation owners. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { createEmbedSendAgentControl, installEmbedSendBridge } from '@jini-ai/chat/browser/embed-send-bridge';
import { isSiteChatComparisonRoot, readSiteChatComparisonVariant, SITE_CHAT_COMPARISON_COPY, SITE_CHAT_COMPARISON_NAMES } from '../site-chat-comparison';
import { siteStorageKey } from '../session-store';
import { startSiteChatLoader } from '../loader-host';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mountVanillaChat } from '@jini-ai/chat/vanilla';
import { React, act, createRoot, installDom } from './react-dom-harness';
import { createSiteVanillaArgs } from '../vanilla-host';
import { loadSiteAssistantState } from '../session-store';

const { SiteAssistantWidget } = await import('../SiteAssistantWidget');
const { ChatSurfacesProvider } = await import('@jini-ai/chat/react');
const { chatSurfaces } = await import('../jini-surfaces');

function fixture(variant?: string) {
  const dom = new JSDOM('<div id="tovu-site-assistant-root"></div>', { url: 'https://site.test/__compare/site-chat/react' });
  const root = dom.window.document.getElementById('tovu-site-assistant-root')!;
  if (variant) root.dataset.chatCompare = variant;
  return { dom, root, send: (text: string) => new Promise<string | undefined>(resolve => {
    root.dispatchEvent(new dom.window.CustomEvent('tovu-compare-send', { detail: { text, done: resolve } }));
  }) };
}

// Binds Jini's embed send bridge exactly as SiteAssistantActivation.hooks.ts and vanilla-host.ts do;
// generic bridge behaviour (busy guard, malformed requests, non-Error failures, disposer) is tested
// in Jini `packages/chat/src/embed-widget/browser/__tests__/embed-send-bridge.test.ts`.
const createReactSiteComparisonControl = ({ root }: { root: HTMLElement | null }) => createEmbedSendAgentControl(
  { root, enabled: isSiteChatComparisonRoot({ root }), ...SITE_CHAT_COMPARISON_NAMES }, SITE_CHAT_COMPARISON_COPY);
const installSiteChatComparisonSend = ({ root, send }: { root: HTMLElement; send: (input: { text: string }) => Promise<void> }) => installEmbedSendBridge(
  { root, send, enabled: isSiteChatComparisonRoot({ root }), requestEventName: SITE_CHAT_COMPARISON_NAMES.requestEventName, readyMessageType: SITE_CHAT_COMPARISON_NAMES.readyMessageType },
  { busyMessage: SITE_CHAT_COMPARISON_COPY.busyMessage });

test('wcmp: normal visitors get neither bridge nor a diagnostic listener', () => {
  const f = fixture();
  assert.equal(createReactSiteComparisonControl({ root: f.root }), undefined);
  let calls = 0;
  const dispose = installSiteChatComparisonSend({ root: f.root, send: async () => { calls++; } });
  f.root.dispatchEvent(new f.dom.window.CustomEvent('tovu-compare-send', { detail: { text: 'hello', done: () => {} } }));
  assert.equal(calls, 0);
  assert.equal(f.root.dataset.compareReady, undefined);
  dispose(); f.dom.window.close();
});

test('wcmp: React comparison relays the exact prompt to the existing ChatPane capability', async () => {
  const f = fixture('react');
  const control = createReactSiteComparisonControl({ root: f.root })!;
  const actions: unknown[] = [];
  const dispose = control.bridgeAccess!.subscribe(action => {
    actions.push(action);
    void control.bridgeAccess!.respondSuccess(action.invocationId, { sent: true });
  });
  assert.equal(f.root.dataset.compareReady, 'true');
  assert.equal(await f.send('**Show me the posts**'), undefined);
  assert.deepEqual(actions, [{ invocationId: 'site-chat-comparison', capabilityId: 'chat.send_message', input: { prompt: '**Show me the posts**' } }]);
  dispose();
  assert.equal(f.root.dataset.compareReady, undefined);
  f.dom.window.close();
});

test('wcmp: comparison storage keys separate both panes from the real visitor thread', () => {
  const react = fixture('react'); const vanilla = fixture('vanilla'); const visitor = fixture();
  for (const key of ['tovu.site-assistant.transcript.v1', 'tovu.site-assistant.action-queue.v1']) {
    assert.equal(siteStorageKey({ key }, { root: react.root }), `${key}.compare.react`);
    assert.equal(siteStorageKey({ key }, { root: vanilla.root }), `${key}.compare.vanilla`);
    assert.equal(siteStorageKey({ key }, { root: visitor.root }), key);
  }
  react.dom.window.close(); vanilla.dom.window.close(); visitor.dom.window.close();
});

test('wcmp: navigating inside the vanilla comparison frame keeps its widget and transcript namespace', async () => {
  const dom = new JSDOM('<iframe data-chat-compare="vanilla"></iframe>', { url: 'https://site.test/__compare/site-chat' });
  const frame = dom.window.document.querySelector('iframe')!;
  const document = frame.contentDocument!;
  document.body.innerHTML = '<div id="tovu-site-assistant-root"></div><button data-jini-chat-loader data-widget="react"></button>';
  assert.equal(readSiteChatComparisonVariant({ document }), 'vanilla');
  assert.equal(siteStorageKey({ key: 'tovu.site-assistant.transcript.v1' }, { root: document.getElementById('tovu-site-assistant-root') }), 'tovu.site-assistant.transcript.v1.compare.vanilla');
  const assets: string[] = [];
  let load!: () => Promise<void>;
  startSiteChatLoader({ install: args => { load = args.load; return { activate: async () => {} }; }, loadAssets: async args => { assets.push(args.scriptUrl, args.styleUrl); } }, {
    document, location: { hash: '', search: '' }, events: document.defaultView as unknown as Window,
    loadState: () => ({ open: true, messages: [] }),
  });
  await load();
  assert.deepEqual(assets, ['/site-chat/site-assistant-vanilla.js', '/site-chat/site-assistant-vanilla.css']);
  dom.window.close();
});

for (const variant of ['react', 'vanilla']) test(`comparison root ${variant} wins before reading the parent`, t => {
  const f = fixture(variant);
  t.after(() => f.dom.window.close());
  Object.defineProperty(f.dom.window, 'parent', { get: () => { throw new Error('parent must not be read'); } });
  assert.equal(readSiteChatComparisonVariant({ document: f.root.ownerDocument }), variant);
});

for (const parentPath of ['/ordinary', '/__compare/site-chat']) {
  for (const variant of ['react', 'vanilla', 'invalid', '']) test(`comparison frame variant=${variant}, parent=${parentPath}`, t => {
    const dom = new JSDOM('<iframe></iframe>', { url: `https://site.test${parentPath}` });
    t.after(() => dom.window.close());
    const frame = dom.window.document.querySelector('iframe')!;
    if (variant) frame.setAttribute('data-chat-compare', variant);
    const document = frame.contentDocument!;
    document.body.innerHTML = '<div id="tovu-site-assistant-root" data-chat-compare="invalid"></div>';
    assert.equal(readSiteChatComparisonVariant({ document }), parentPath === '/__compare/site-chat' && ['react', 'vanilla'].includes(variant) ? variant : null);
    document.getElementById('tovu-site-assistant-root')!.remove();
    assert.equal(readSiteChatComparisonVariant({ document }), parentPath === '/__compare/site-chat' && ['react', 'vanilla'].includes(variant) ? variant : null);
  });
}

test('comparison rejects detached documents and comparison pages without a frame', t => {
  const f = fixture();
  t.after(() => f.dom.window.close());
  assert.equal(readSiteChatComparisonVariant({ document: f.root.ownerDocument.implementation.createHTMLDocument() }), null);
  f.dom.reconfigure({ url: 'https://site.test/__compare/site-chat' });
  assert.equal(readSiteChatComparisonVariant({ document: f.root.ownerDocument }), null);
});

test('comparison catches cross-origin parent access without enabling a channel', t => {
  const f = fixture('invalid');
  t.after(() => f.dom.window.close());
  Object.defineProperty(f.dom.window, 'parent', { get: () => { throw new f.dom.window.DOMException('Blocked parent', 'SecurityError'); } });
  assert.equal(readSiteChatComparisonVariant({ document: f.root.ownerDocument }), null);
});

test('wcmp: a React pane relays capability errors, and unmounting rejects a send still in flight', async () => {
  const f = fixture('react');
  const control = createReactSiteComparisonControl({ root: f.root })!;
  let dispose = control.bridgeAccess!.subscribe(action => {
    void control.bridgeAccess!.respondError(action.invocationId, 'The agent refused.');
  });
  assert.equal(await f.send('first'), 'The agent refused.');
  dispose();

  dispose = control.bridgeAccess!.subscribe(() => {});
  const pending = f.send('never answered');
  await new Promise(resolve => setImmediate(resolve));
  dispose();
  assert.equal(await pending, 'Comparison pane was unmounted.');
  // With nothing pending, late responses and a second unmount are harmless no-ops.
  await control.bridgeAccess!.respondSuccess('site-chat-comparison', {});
  await control.bridgeAccess!.respondError('site-chat-comparison', 'late');
  f.dom.window.close();
});

// The recorded server stream for a plain reply, with the recording's placeholder ids swapped for the
// ids of the request it now answers (the transport ignores a RUN_STARTED for any other ids).
const GOLDEN_PATH = resolve(import.meta.dirname, '../../../website/src/server/__tests__/goldens/site-chat-stream.ag-ui.golden.json');
const recordedPlainReply = (JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as Record<string, { body: string }>)['plain reply']!.body;
const PROMPT = 'What can I find on this site?';

/** `dropFrameType` is only the mutation seam: it removes one recorded frame kind before delivery. */
function recordedServer({ dropFrameType }: { dropFrameType?: string } = {}) {
  return (async (_url: string, init?: RequestInit) => {
    const { threadId, runId } = JSON.parse(String(init?.body)) as { threadId: string; runId: string };
    const body = recordedPlainReply.replaceAll('thread-1', threadId).replaceAll('run-1', runId).replaceAll('msg_<uuid>', 'm1')
      .split('\n\n').filter(part => part && !(dropFrameType && part.includes(`"type":"${dropFrameType}"`))).map(part => `${part}\n\n`).join('');
    return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
  }) as typeof fetch;
}

const transcript = () => loadSiteAssistantState().messages.map(({ role, content }) => ({ role, content }));

async function reactTranscript({ fetch }: { fetch: typeof globalThis.fetch }) {
  const { dom, restore } = installDom({ html: '<div id="tovu-site-assistant-root"></div>' }, { url: 'https://site.test/' });
  const realFetch = globalThis.fetch;
  globalThis.fetch = fetch;
  const container = dom.window.document.getElementById('tovu-site-assistant-root')!;
  const root = createRoot(container);
  const button = (name: string) => [...container.querySelectorAll('button')].find(node => (node.getAttribute('aria-label') ?? node.textContent) === name)!;
  try {
    await act(async () => root.render(React.createElement(ChatSurfacesProvider, { surfaces: chatSurfaces, children: React.createElement(SiteAssistantWidget) })));
    act(() => button('Chat with this site').click());
    act(() => button(PROMPT).click());
    await act(async () => { button('Send').click(); });
    await act(async () => { await new Promise(resolve => setImmediate(resolve)); });
    return { messages: transcript(), shown: container.textContent ?? '' };
  } finally { await act(async () => root.unmount()); globalThis.fetch = realFetch; restore(); }
}

async function vanillaTranscript({ fetch }: { fetch: typeof globalThis.fetch }) {
  const { dom, restore } = installDom({ html: '<div id="tovu-site-assistant-root"></div>' }, { url: 'https://site.test/' });
  const realFetch = globalThis.fetch;
  globalThis.fetch = fetch;
  const element = dom.window.document.getElementById('tovu-site-assistant-root')!;
  const widget = mountVanillaChat(createSiteVanillaArgs({ element }), { initialOpen: true });
  try {
    await widget.controller.send({ text: PROMPT });
    await new Promise(resolve => setImmediate(resolve));
    return { messages: transcript(), shown: element.textContent ?? '' };
  } finally { widget.unmount(); globalThis.fetch = realFetch; restore(); }
}

test('both renderers render the same transcript from one recorded AG-UI stream', async () => {
  const react = await reactTranscript({ fetch: recordedServer() });
  const vanilla = await vanillaTranscript({ fetch: recordedServer() });
  assert.deepEqual(react.messages, [{ role: 'user', content: PROMPT }, { role: 'assistant', content: 'Hello from the site.' }]);
  assert.deepEqual(vanilla.messages, react.messages);
  for (const host of [react, vanilla]) {
    assert.match(host.shown, /Hello from the site\./);
    assert.ok(host.shown.includes(PROMPT));
  }
});
