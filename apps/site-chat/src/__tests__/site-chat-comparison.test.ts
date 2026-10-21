/** wcmp: exercise the diagnostic adapters through native events and DI conversation owners. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { createReactSiteComparisonControl, installSiteChatComparisonSend, readSiteChatComparisonVariant } from '../site-chat-comparison';
import { siteStorageKey } from '../session-store';
import { startSiteChatLoader } from '../loader-host';

function fixture(variant?: string) {
  const dom = new JSDOM('<div id="tovu-site-assistant-root"></div>', { url: 'https://site.test/__compare/site-chat/react' });
  const root = dom.window.document.getElementById('tovu-site-assistant-root')!;
  if (variant) root.dataset.chatCompare = variant;
  return { dom, root, send: (text: string) => new Promise<string | undefined>(resolve => {
    root.dispatchEvent(new dom.window.CustomEvent('tovu-compare-send', { detail: { text, done: resolve } }));
  }) };
}

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

test('wcmp: common-send adapters preserve exact failures, prevent concurrent sends, and remove listeners', async () => {
  const f = fixture('vanilla');
  let complete!: () => void;
  const texts: string[] = [];
  const dispose = installSiteChatComparisonSend({ root: f.root, send: ({ text }) => {
    texts.push(text); return new Promise<void>(resolve => { complete = resolve; });
  } });
  const first = f.send('Ask the same thing');
  await Promise.resolve();
  assert.equal(await f.send('duplicate'), 'This pane is already replying.');
  assert.deepEqual(texts, ['Ask the same thing']);
  complete(); assert.equal(await first, undefined);
  dispose();
  const failing = installSiteChatComparisonSend({ root: f.root, send: async () => { throw new Error('Provider is unavailable.'); } });
  assert.equal(await f.send('retry'), 'Provider is unavailable.');
  failing();
  f.root.dispatchEvent(new f.dom.window.CustomEvent('tovu-compare-send', { detail: { text: 'removed', done: () => { throw new Error('listener leaked'); } } }));
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
    loadState: () => ({ open: true, messages: [] }), hasQueued: () => false,
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

test('wcmp: malformed send requests are ignored, and a non-Error failure is reported as text', async () => {
  const f = fixture('vanilla');
  let calls = 0;
  const dispose = installSiteChatComparisonSend({ root: f.root, send: async () => { calls += 1; throw 'quota exhausted'; } });
  for (const detail of [null, { text: 42, done: () => {} }, { text: 'no callback', done: 'nope' }]) {
    f.root.dispatchEvent(new f.dom.window.CustomEvent('tovu-compare-send', { detail }));
  }
  await Promise.resolve();
  assert.equal(calls, 0, 'a request without text and a done callback never sends');
  assert.equal(await f.send('go'), 'quota exhausted');
  assert.equal(calls, 1);
  dispose(); f.dom.window.close();
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
