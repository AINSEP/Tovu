import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { installLazyChatLoader, loadChatAssets } from '@jini-ai/chat/browser/lazy-loader';
import { startSiteChatLoader } from '../loader-host';

for (const variant of ['react', 'vanilla']) test(`loader host binds ${variant} assets only on demand and preserves open intent`, async () => {
  const dom = new JSDOM(`<div id="tovu-site-assistant-root"></div><button data-jini-chat-loader data-widget="${variant}"></button>`, { url: 'https://example.test/' });
  const configs: Parameters<Parameters<typeof startSiteChatLoader>[0]['install']>[0][] = [];
  const loads: string[] = [];
  startSiteChatLoader({ install: args => { configs.push(args); return { activate: async () => {} }; },
    loadAssets: async ({ scriptUrl, styleUrl }) => { loads.push(scriptUrl, styleUrl); } },
  { document: dom.window.document, location: dom.window.location, events: dom.window as unknown as Window,
    loadState: () => ({ open: true, messages: [] }), hasQueued: () => false });
  assert.deepEqual(loads, []);
  assert.equal(configs[0].resume, true);
  assert.equal(dom.window.document.getElementById('tovu-site-assistant-root')!.dataset.chatOpen, 'true');
  await configs[0].load();
  const name = variant === 'vanilla' ? 'site-assistant-vanilla' : 'site-assistant';
  assert.deepEqual(loads, [`/site-chat/${name}.js`, `/site-chat/${name}.css`]);
  let opens = 0;
  dom.window.document.getElementById('tovu-site-assistant-root')!.addEventListener('jini-chat-open', () => opens++);
  configs[0].open({ focus: true });
  assert.equal(opens, 1);
  assert.equal(dom.window.document.getElementById('tovu-site-assistant-root')!.dataset.chatFocus, 'true');
  configs[0].open({ focus: false });
  assert.equal(opens, 1);
  dom.window.close();
});

for (const link of ['/#open-chat', '/?open-chat=1']) test(`explicit deep link ${link} opens lazily`, () => {
  const dom = new JSDOM('<div id="tovu-site-assistant-root"></div><button data-jini-chat-loader></button>', { url: `https://example.test${link}` });
  let deepLink = false;
  startSiteChatLoader({ install: args => { deepLink = args.deepLink; return { activate: async () => {} }; }, loadAssets: async () => {} },
    { document: dom.window.document, location: dom.window.location, events: dom.window as unknown as Window,
      loadState: () => ({ open: false, messages: [] }), hasQueued: () => false });
  assert.equal(deepLink, true);
  assert.equal(dom.window.document.getElementById('tovu-site-assistant-root')!.dataset.chatOpen, 'true');
  dom.window.close();
});

for (const variant of ['react', 'vanilla']) test(`${variant}: pending destination effects preload only the lightweight widget while closed`, () => {
  const dom = new JSDOM(`<div id="tovu-site-assistant-root"></div><button data-jini-chat-loader data-widget="${variant}"></button>`, { url: 'https://example.test/' });
  let config: Parameters<Parameters<typeof startSiteChatLoader>[0]['install']>[0] | undefined;
  startSiteChatLoader({ install: args => { config = args; return { activate: async () => {} }; }, loadAssets: async () => {} },
    { document: dom.window.document, location: dom.window.location, events: dom.window as unknown as Window,
      loadState: () => ({ open: false, messages: [] }), hasQueued: () => true });
  assert.equal(config!.preload, variant === 'vanilla');
  assert.equal(config!.resume, false);
  assert.equal(dom.window.document.getElementById('tovu-site-assistant-root')!.dataset.chatOpen, undefined);
  dom.window.close();
});

for (const queued of [false, true]) test(`React chat with queued=${queued} inserts no assets until open, then loads CSS and the bundle once`, async t => {
  const dom = new JSDOM('<div id="tovu-site-assistant-root"></div><button data-jini-chat-loader data-widget="react"></button>', { url: 'https://example.test/' });
  t.after(() => dom.window.close());
  const document = dom.window.document;
  const button = document.querySelector('button')!;
  const root = document.getElementById('tovu-site-assistant-root')!;
  let finished!: Promise<void>;
  let dispose!: () => void;
  startSiteChatLoader({
    install: args => {
      const loader = installLazyChatLoader(args);
      dispose = () => loader.dispose();
      return loader;
    },
    loadAssets: args => (finished = loadChatAssets(args)),
  }, { document, location: dom.window.location, events: dom.window as unknown as Window,
    loadState: () => ({ open: false, messages: [] }), hasQueued: () => queued });
  t.after(() => dispose());

  await new Promise(resolve => setImmediate(resolve));
  assert.equal(document.querySelectorAll('script, link[rel="stylesheet"], link[rel="modulepreload"]').length, 0);
  assert.equal(root.dataset.chatOpen, undefined);
  button.click();
  button.click();
  await new Promise(resolve => setImmediate(resolve));
  const stylesheet = document.querySelector('link')!;
  assert.equal(stylesheet.getAttribute('href'), '/site-chat/site-assistant.css');
  assert.equal(document.querySelector('script'), null, 'CSS must be ready before React loads');
  stylesheet.dispatchEvent(new dom.window.Event('load'));
  await new Promise(resolve => setImmediate(resolve));
  const script = document.querySelector('script')!;
  assert.equal(script.getAttribute('src'), '/site-chat/site-assistant.js');
  root.dataset.chatMounted = 'true';
  script.dispatchEvent(new dom.window.Event('load'));
  await finished;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(document.querySelectorAll('script').length, 1);
  assert.equal(document.querySelectorAll('link').length, 1);
  assert.equal(root.dataset.chatOpen, 'true');
  assert.equal(root.dataset.chatFocus, 'true');
  assert.equal(button.hidden, true);
});

test('an open-chat anchor activates after loading even when its hash is already selected', () => {
  const dom = new JSDOM('<div id="tovu-site-assistant-root"></div><button data-jini-chat-loader></button><a href="#open-chat">Open</a>', { url: 'https://example.test/#open-chat' });
  let activations = 0;
  startSiteChatLoader({ install: () => ({ activate: async () => { activations++; } }), loadAssets: async () => {} },
    { document: dom.window.document, location: dom.window.location, events: dom.window as unknown as Window,
      loadState: () => ({ open: false, messages: [] }), hasQueued: () => false });
  const event = new dom.window.MouseEvent('click', { bubbles: true, cancelable: true });
  dom.window.document.querySelector('a')!.dispatchEvent(event);
  assert.equal(activations, 1);
  assert.equal(event.defaultPrevented, true);
  dom.window.close();
});


test('host passes the root as the mount-readiness boundary', async () => {
  const dom = new JSDOM('<div id="tovu-site-assistant-root"></div><button data-jini-chat-loader></button>', { url: 'https://example.test/' });
  let config: Parameters<Parameters<typeof startSiteChatLoader>[0]['install']>[0] | undefined;
  let received: HTMLElement | undefined;
  startSiteChatLoader({ install: args => { config = args; return { activate: async () => {} }; }, loadAssets: async ({ mount }) => { received = mount; } },
    { document: dom.window.document, location: dom.window.location, events: dom.window as unknown as Window,
      loadState: () => ({ open: false, messages: [] }), hasQueued: () => false });
  await config!.load();
  assert.equal(received, dom.window.document.getElementById('tovu-site-assistant-root'));
  dom.window.close();
});

for (const markup of ['<button data-jini-chat-loader></button>', '<div id="tovu-site-assistant-root"></div>', '']) {
  test(`loader requires both mount and button: ${markup}`, t => {
    const dom = new JSDOM(markup, { url: 'https://example.test/' });
    t.after(() => dom.window.close());
    startSiteChatLoader({ install: () => { assert.fail('must not install'); }, loadAssets: async () => {} }, {
      document: dom.window.document, location: dom.window.location, events: dom.window as unknown as Window,
      loadState: () => { assert.fail('must not read state'); }, hasQueued: () => { assert.fail('must not inspect queue'); },
    });
  });
}

for (const scenario of [
  { widget: 'vanilla', compare: 'react', open: false, search: '?open-chat=0', hash: '', expected: 'site-assistant', deep: false, queued: false },
  { widget: 'react', compare: 'vanilla', open: true, search: '', hash: '', expected: 'site-assistant-vanilla', deep: false, queued: true },
  { widget: 'unknown', compare: 'invalid', open: false, search: '?open-chat=true', hash: '#other', expected: 'site-assistant', deep: false, queued: false },
  { widget: 'vanilla', compare: '', open: false, search: '?open-chat=1', hash: '', expected: 'site-assistant-vanilla', deep: true, queued: true },
  { widget: 'vanilla', compare: '', open: false, search: '', hash: '', expected: 'site-assistant-vanilla', deep: false, queued: true },
]) test(`loader pins widget precedence and open/queue ordering: ${JSON.stringify(scenario)}`, async t => {
  const dom = new JSDOM(`<div id="tovu-site-assistant-root" data-chat-compare="${scenario.compare}"></div><button data-jini-chat-loader data-widget="${scenario.widget}"></button>`, { url: 'https://example.test/' });
  t.after(() => dom.window.close());
  const root = dom.window.document.getElementById('tovu-site-assistant-root')!;
  let config: Parameters<Parameters<typeof startSiteChatLoader>[0]['install']>[0] | undefined;
  let queueReads = 0;
  const assets: string[] = [];
  startSiteChatLoader({ install: args => { config = args; return { activate: async () => {} }; },
    loadAssets: async ({ scriptUrl, styleUrl, mount }) => { assets.push(scriptUrl, styleUrl); assert.equal(mount, root); } }, {
    document: dom.window.document, location: scenario, events: dom.window as unknown as Window,
    loadState: () => ({ open: scenario.open, messages: [] }), hasQueued: () => {
      queueReads++;
      assert.equal(root.dataset.chatOpen, scenario.open || scenario.deep ? 'true' : undefined);
      return true;
    },
  });
  assert.ok(config);
  assert.equal(config.resume, scenario.open);
  assert.equal(config.deepLink, scenario.deep);
  assert.equal(config.preload, scenario.queued);
  assert.equal(queueReads, Number(scenario.queued));
  assert.equal(root.dataset.chatOpen, scenario.open || scenario.deep ? 'true' : undefined);
  assert.equal(config.loadingLabel, 'Loading chat…');
  assert.equal(config.retryLabel, 'Chat could not load. Activate to retry.');
  await config.load();
  assert.deepEqual(assets, [`/site-chat/${scenario.expected}.js`, `/site-chat/${scenario.expected}.css`]);
});

test('loader defaults use the browser document, location, events and session state', t => {
  const dom = new JSDOM('<div id="tovu-site-assistant-root"></div><button data-jini-chat-loader data-widget="vanilla"></button>', { url: 'https://example.test/#open-chat' });
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  t.after(() => {
    if (prior) Object.defineProperty(globalThis, 'window', prior);
    else Reflect.deleteProperty(globalThis, 'window');
    dom.window.close();
  });
  let config: Parameters<Parameters<typeof startSiteChatLoader>[0]['install']>[0] | undefined;
  startSiteChatLoader({ install: args => { config = args; return { activate: async () => {} }; }, loadAssets: async () => {} });
  assert.ok(config);
  assert.equal(config.resume, false);
  assert.equal(config.deepLink, true);
  assert.equal(config.preload, false);
});

test('a later hash change to #open-chat activates the loader; any other hash does not', () => {
  const dom = new JSDOM('<div id="tovu-site-assistant-root"></div><button data-jini-chat-loader></button>', { url: 'https://example.test/' });
  let activations = 0;
  const location = { hash: '', search: '' };
  const listeners = new Map<string, (event: Event) => void>();
  startSiteChatLoader({ install: () => ({ activate: async () => { activations += 1; } }), loadAssets: async () => {} },
    { document: dom.window.document, location, events: { addEventListener: (type: string, listener: (event: Event) => void) => listeners.set(type, listener) } as unknown as Window,
      loadState: () => ({ open: false, messages: [] }), hasQueued: () => false });
  location.hash = '#comments';
  listeners.get('hashchange')!(new dom.window.Event('hashchange'));
  assert.equal(activations, 0);
  location.hash = '#open-chat';
  listeners.get('hashchange')!(new dom.window.Event('hashchange'));
  assert.equal(activations, 1);
  dom.window.close();
});

test('a focused open still announces itself in a document with no window of its own', () => {
  const dom = new JSDOM('', { url: 'https://example.test/' });
  const document = dom.window.document.implementation.createHTMLDocument('detached');
  document.body.innerHTML = '<div id="tovu-site-assistant-root"></div><button data-jini-chat-loader></button>';
  assert.equal(document.defaultView, null);
  let config: Parameters<Parameters<typeof startSiteChatLoader>[0]['install']>[0] | undefined;
  startSiteChatLoader({ install: args => { config = args; return { activate: async () => {} }; }, loadAssets: async () => {} },
    { document, location: { hash: '', search: '' }, events: { addEventListener: () => {} } as unknown as Window,
      loadState: () => ({ open: false, messages: [] }), hasQueued: () => false });
  const root = document.getElementById('tovu-site-assistant-root')!;
  const opened: string[] = [];
  root.addEventListener('jini-chat-open', event => opened.push(event.type));
  // In a browser the global Event is the page realm's; stand jsdom's in for it, as a page would have.
  const nodeEvent = globalThis.Event;
  globalThis.Event = dom.window.Event as unknown as typeof Event;
  try { config!.open({ focus: true }); } finally { globalThis.Event = nodeEvent; }
  assert.deepEqual(opened, ['jini-chat-open']);
  dom.window.close();
});
