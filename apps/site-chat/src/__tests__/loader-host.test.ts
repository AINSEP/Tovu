import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
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

test('a pending destination effect preloads without turning a closed conversation into an open one', () => {
  const dom = new JSDOM('<div id="tovu-site-assistant-root"></div><button data-jini-chat-loader></button>', { url: 'https://example.test/' });
  let config: Parameters<Parameters<typeof startSiteChatLoader>[0]['install']>[0] | undefined;
  startSiteChatLoader({ install: args => { config = args; return { activate: async () => {} }; }, loadAssets: async () => {} },
    { document: dom.window.document, location: dom.window.location, events: dom.window as unknown as Window,
      loadState: () => ({ open: false, messages: [] }), hasQueued: () => true });
  assert.equal(config!.preload, true);
  assert.equal(config!.resume, false);
  assert.equal(dom.window.document.getElementById('tovu-site-assistant-root')!.dataset.chatOpen, undefined);
  dom.window.close();
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
