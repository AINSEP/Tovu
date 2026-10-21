/**
 * The vanilla widget's product adapters, driven through the args `createSiteVanillaArgs` hands Jini
 * and through `mountSiteVanillaChat` with an injected `mount`. Page globals (document,
 * sessionStorage, requestAnimationFrame) come from `react-dom-harness.ts`'s isolated jsdom, the
 * environment these adapters are written for; navigation is injected through the `assign` port.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { installDom } from './react-dom-harness';

const { createSiteVanillaArgs, mountSiteVanillaChat } = await import('../vanilla-host');

const PAGE = '<!doctype html><html><body><div id="tovu-site-assistant-root"></div><article><h1 class="entry-title">Example Post</h1></article></body></html>';
const target = { slug: 'example-post', title: 'Example Post', path: '/example-post' };

test('vanilla adapters: ids, aborts, session persistence and the action queue', t => {
  const { dom, restore } = installDom({ html: PAGE }, { url: 'https://example.test/' });
  t.after(restore);
  const args = createSiteVanillaArgs({ element: dom.window.document.getElementById('tovu-site-assistant-root')! });
  assert.equal(args.document, dom.window.document, 'the page document is the default');
  assert.equal(args.copy.proposalLabel({ title: 'About' }), 'Go to “About”?');
  assert.match(args.ids(), /^[0-9a-f-]{36}$/);
  assert.notEqual(args.ids(), args.ids());
  assert.ok(args.createAbortController() instanceof AbortController);
  args.session.save({ state: { open: true, messages: [] } });
  assert.equal(args.session.load().open, true);
  args.session.clear();
  assert.equal(args.session.load().open, false);
  args.session.enqueue({ action: { type: 'scroll_to', target } });
  assert.deepEqual(args.session.drain(), { type: 'scroll_to', target });
  assert.equal(args.session.drain(), null, 'a drained action runs once');
});

test('vanilla page actions: navigate through the port, scroll or highlight a found target, refuse the rest', t => {
  const { dom, restore } = installDom({ html: PAGE }, { url: 'https://example.test/' });
  t.after(restore);
  const assigned: string[] = [];
  const args = createSiteVanillaArgs({ element: dom.window.document.getElementById('tovu-site-assistant-root')! },
    { assign: ({ path }) => void assigned.push(path) });
  assert.equal(args.pageActions.navigate({ action: { type: 'navigate', auto: true, target: { ...target, path: '//evil.test' } } }), false);
  assert.equal(args.pageActions.navigate({ action: { type: 'navigate', auto: true, target } }), true);
  assert.deepEqual(assigned, ['/example-post']);

  const heading = dom.window.document.querySelector('.entry-title')!;
  let scrolls = 0;
  heading.scrollIntoView = () => { scrolls += 1; };
  assert.equal(args.pageActions.execute({ action: { type: 'scroll_to', target: { ...target, path: 'https://evil.test' } } }), false);
  assert.equal(args.pageActions.execute({ action: { type: 'highlight', target: { ...target, title: 'Missing Post' } } }), false);
  assert.equal(args.pageActions.execute({ action: { type: 'scroll_to', target } }), true);
  assert.equal(heading.classList.contains('tovu-site-assistant__highlight'), false);
  assert.equal(args.pageActions.execute({ action: { type: 'highlight', target } }), true);
  assert.equal(heading.classList.contains('tovu-site-assistant__highlight'), true);
  assert.equal(scrolls, 2);
  args.pageActions.clearHighlight();
  assert.equal(heading.classList.contains('tovu-site-assistant__highlight'), false);
});

test('vanilla frames run on the next animation frame and can be cancelled', async t => {
  const { dom, restore } = installDom({ html: PAGE }, { url: 'https://example.test/' });
  t.after(restore);
  const args = createSiteVanillaArgs({ element: dom.window.document.getElementById('tovu-site-assistant-root')! });
  const ran: string[] = [];
  args.scheduleFrame({ callback: () => ran.push('kept') });
  const cancel = args.scheduleFrame({ callback: () => ran.push('cancelled') });
  cancel();
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.deepEqual(ran, ['kept']);
});

test('the default navigation port is the page location', t => {
  const { dom, restore } = installDom({ html: PAGE }, { url: 'https://example.test/' });
  t.after(restore);
  const errors: string[] = [];
  dom.virtualConsole.on('jsdomError', (error: Error) => errors.push(error.message));
  const args = createSiteVanillaArgs({ element: dom.window.document.getElementById('tovu-site-assistant-root')! });
  assert.equal(args.pageActions.navigate({ action: { type: 'navigate', auto: false, target } }), true);
  assert.ok(errors.some(message => message.includes('navigation')), 'jsdom reports the attempted location.assign');
});

type Mount = Parameters<typeof mountSiteVanillaChat>[0]['mount'];

test('mountSiteVanillaChat mounts into the page root with its open intent, and does nothing without one', t => {
  const { dom, restore } = installDom({ html: '<!doctype html><body></body>' }, { url: 'https://example.test/' });
  t.after(restore);
  const opens: boolean[] = [];
  const mount: Mount = (_args, { initialOpen }) => { opens.push(initialOpen); return { controller: { send: async () => {}, getState: () => ({ busy: false, error: null }) } }; };
  mountSiteVanillaChat({ mount });
  assert.deepEqual(opens, []);
  const root = dom.window.document.body.appendChild(dom.window.document.createElement('div'));
  root.id = 'tovu-site-assistant-root';
  mountSiteVanillaChat({ mount });
  root.dataset.chatOpen = 'true';
  mountSiteVanillaChat({ mount });
  assert.deepEqual(opens, [false, true]);
});

test('in the comparison frame, a send relays to the widget and reports busy and error states', async t => {
  const { dom, restore } = installDom({ html: '<!doctype html><body><div id="tovu-site-assistant-root" data-chat-compare="vanilla"></div></body>' }, { url: 'https://example.test/' });
  t.after(restore);
  const root = dom.window.document.getElementById('tovu-site-assistant-root')!;
  const state = { busy: false, error: null as string | null };
  const sent: string[] = [];
  mountSiteVanillaChat({ mount: () => ({ controller: {
    send: async ({ text }) => { sent.push(text); },
    getState: () => state,
  } }) });
  // The comparison channel releases its own lock just after `done`; let it settle between sends.
  const send = async (text: string) => {
    const reply = await new Promise<string | undefined>(resolve => {
      root.dispatchEvent(new dom.window.CustomEvent('tovu-compare-send', { detail: { text, done: resolve } }));
    });
    await new Promise(resolve => setImmediate(resolve));
    return reply;
  };
  assert.equal(await send('hello'), undefined);
  state.error = 'Provider is unavailable.';
  assert.equal(await send('again'), 'Provider is unavailable.');
  state.busy = true;
  assert.equal(await send('third'), 'This pane is already replying.');
  assert.deepEqual(sent, ['hello', 'again']);
});
