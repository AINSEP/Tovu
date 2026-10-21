/**
 * The three standalone build entries, imported for real into the isolated jsdom page
 * (`react-dom-harness.ts`): each must wire its product bindings into the page the moment it loads.
 * Stylesheet imports are the bundler's job, so a module hook resolves `.css` to an empty module here
 * (Vite emits them as separate assets; nothing in the entries reads them).
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test, { after } from 'node:test';
import { act, installDom } from './react-dom-harness';
import { clearHighlight } from '../highlight';

const cssHooks = registerHooks({
  load(url, context, nextLoad) {
    if (/\.css(\?|$)/.test(url)) return { format: 'module', source: '', shortCircuit: true };
    return nextLoad(url, context);
  },
});
after(() => cssHooks.deregister());

const ROOT = '<div id="tovu-site-assistant-root"></div>';
const settle = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms));

test('loader-entry binds the lazy loader to the page button; activating it loads the React widget assets', async t => {
  const { dom, restore } = installDom({ html: `<!doctype html><body>${ROOT}<button data-jini-chat-loader>Chat</button></body>` }, { url: 'https://example.test/' });
  t.after(restore);
  await import('../loader-entry');
  assert.equal(dom.window.document.querySelector('link[href="/site-chat/site-assistant.css"]'), null, 'nothing loads before activation');
  dom.window.document.querySelector('button')!.click();
  await settle();
  assert.ok(dom.window.document.querySelector('link[href="/site-chat/site-assistant.css"]'), 'activation inserts the widget stylesheet');
});

test('vanilla-entry mounts the vanilla widget into the page root', async t => {
  const { dom, restore } = installDom({ html: `<!doctype html><body>${ROOT}</body>` }, { url: 'https://example.test/' });
  t.after(restore);
  await import('../vanilla-entry');
  const root = dom.window.document.getElementById('tovu-site-assistant-root')!;
  assert.ok(root.children.length > 0, 'the widget rendered into the root');
});

test('main mounts the React widget, runs a queued highlight, and creates its own root when a page has none', async () => {
  // The mounted widgets keep timers running after this test, so this page stays installed until the
  // file ends rather than being torn down under them.
  const { dom, restore } = installDom({
    html: `<!doctype html><body>${ROOT}<article><h1 class="entry-title">Example Post</h1></article></body>`,
  }, { url: 'https://example.test/' });
  after(restore);
  const heading = dom.window.document.querySelector('.entry-title')!;
  let scrolls = 0;
  heading.scrollIntoView = () => { scrolls += 1; };
  dom.window.sessionStorage.setItem('tovu.site-assistant.action-queue.v1',
    JSON.stringify({ type: 'highlight', target: { slug: 'example-post', title: 'Example Post', path: '/example-post' } }));
  const main = await import('../main');
  await settle(100);
  assert.ok(dom.window.document.getElementById('tovu-site-assistant-root')!.children.length > 0, 'the widget mounted');
  assert.equal(scrolls, 1);
  assert.equal(heading.classList.contains('tovu-site-assistant__highlight'), true);
  assert.equal(dom.window.sessionStorage.getItem('tovu.site-assistant.action-queue.v1'), null, 'the queue was drained on mount');

  // scroll_to scrolls without highlighting; navigate, junk and a missing target do nothing.
  heading.classList.remove('tovu-site-assistant__highlight');
  const target = { slug: 'example-post', title: 'Example Post', path: '/example-post' };
  main.executeDrainedAction({ type: 'scroll_to', target });
  main.executeDrainedAction({ type: 'navigate', target, auto: true } as never);
  main.executeDrainedAction(null);
  main.executeDrainedAction({ type: 'highlight', target: { ...target, title: 'Nowhere' } });
  await settle();
  assert.equal(scrolls, 2);
  assert.equal(heading.classList.contains('tovu-site-assistant__highlight'), false);

  dom.window.document.getElementById('tovu-site-assistant-root')!.id = 'old-root';
  const second = main.mount();
  await settle();
  const created = dom.window.document.getElementById('tovu-site-assistant-root');
  assert.ok(created, 'a root was created');
  assert.ok(created.children.length > 0, 'and the widget mounted into it');
  await act(async () => { second.unmount(); main.mountedRoot.unmount(); });
  // The highlight's 21 s fallback-cleanup timer would otherwise fire after this page is torn down.
  clearHighlight();
});
