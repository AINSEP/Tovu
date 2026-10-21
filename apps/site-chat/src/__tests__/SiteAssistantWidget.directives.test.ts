/**
 * `SiteAssistantWidget`'s page-action handling (SPEC-046 REQ-4/D-1), driven end to end: a visitor
 * sends a prompt, the server's SSE reply (a stubbed `fetch`, the transport's network port) carries a
 * `client_directive`, and the widget acts once the run settles. jsdom cannot navigate, so a
 * navigation is observed as jsdom's "Not implemented: navigation" report.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { React, act, createRoot, installDom } from './react-dom-harness';
import { clearHighlight } from '../highlight';
import { drainQueuedPageAction, hasQueuedPageAction, loadSiteAssistantState } from '../session-store';

const { SiteAssistantWidget } = await import('../SiteAssistantWidget');

const about = { slug: 'about', title: 'About', path: '/about' };
const post = { slug: 'example-post', title: 'Example Post', path: '/example-post' };
const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const directive = (action: unknown) => frame('client_directive', { kind: 'page_action', action });

/** Render the widget on a page with a post heading, send one prompt answered by `frames`. */
async function sendWith(t: { after: (fn: () => void | Promise<void>) => void }, frames: string[]) {
  const { dom, restore } = installDom({
    html: '<div id="tovu-site-assistant-root"></div><article><h1 class="entry-title">Example Post</h1></article>',
  }, { url: 'https://example.test/' });
  const navigations: string[] = [];
  dom.virtualConsole.on('jsdomError', (error: Error) => { if (error.message.includes('navigation')) navigations.push(error.message); });
  const heading = dom.window.document.querySelector('.entry-title')!;
  let scrolls = 0;
  heading.scrollIntoView = () => { scrolls += 1; };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(frames.join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } })) as typeof fetch;
  const container = dom.window.document.getElementById('tovu-site-assistant-root')!;
  const root = createRoot(container);
  t.after(async () => {
    clearHighlight();
    await act(async () => root.unmount());
    globalThis.fetch = realFetch;
    restore();
  });
  const button = (name: string) => {
    const found = Array.from(container.querySelectorAll('button')).find(node => (node.getAttribute('aria-label') ?? node.textContent) === name);
    assert.ok(found, `missing ${name}`);
    return found;
  };
  await act(async () => root.render(React.createElement(SiteAssistantWidget)));
  act(() => button('Chat with this site').click());
  act(() => button('What can I find on this site?').click());
  await act(async () => { button('Send').click(); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });
  return { dom, container, heading, navigations, button, scrolls: () => scrolls };
}

test('a highlight directive scrolls to and highlights its target on this page', async t => {
  const page = await sendWith(t, [frame('text', { delta: 'Here it is.' }), directive({ type: 'highlight', target: post }), frame('end', { reason: 'stop' })]);
  assert.equal(page.scrolls(), 1);
  assert.equal(page.heading.classList.contains('tovu-site-assistant__highlight'), true);
  assert.deepEqual(page.navigations, []);
});

test('a reply with no page action, or an action for a missing target, leaves the page alone', async t => {
  const page = await sendWith(t, [frame('text', { delta: 'Just text.' }), directive({ type: 'scroll_to', target: { ...about, title: 'Not On This Page' } }), frame('end', { reason: 'stop' })]);
  assert.equal(page.scrolls(), 0);
  assert.deepEqual(page.navigations, []);
  assert.ok(page.container.textContent?.includes('Just text.'));
});

test('a proposed navigation waits for the visitor, then queues the bundled effect and navigates', async t => {
  const page = await sendWith(t, [
    frame('text', { delta: 'The about page has it.' }),
    directive({ type: 'navigate', target: about, auto: false }),
    directive({ type: 'scroll_to', target: about }),
    frame('end', { reason: 'stop' }),
  ]);
  assert.deepEqual(page.navigations, [], 'nothing navigates before the visitor agrees');
  assert.ok(page.container.textContent?.includes('Go to “About”?'));
  act(() => page.button('Go there').click());
  assert.equal(page.navigations.length, 1);
  assert.deepEqual(drainQueuedPageAction(), { type: 'scroll_to', target: about });
  assert.equal(page.container.textContent?.includes('Go to “About”?'), false, 'the proposal is consumed');
});

test('a proposal with no bundled effect navigates without queueing anything', async t => {
  const page = await sendWith(t, [frame('text', { delta: 'See About.' }), directive({ type: 'navigate', target: about, auto: false }), frame('end', { reason: 'stop' })]);
  act(() => page.button('Go there').click());
  assert.equal(page.navigations.length, 1);
  assert.equal(hasQueuedPageAction(), false);
});

test('an auto navigation the visitor asked for queues its effect and navigates at once', async t => {
  const page = await sendWith(t, [
    frame('text', { delta: 'Taking you there.' }),
    directive({ type: 'navigate', target: about, auto: true }),
    directive({ type: 'highlight', target: about }),
    frame('end', { reason: 'stop' }),
  ]);
  assert.equal(page.navigations.length, 1);
  assert.deepEqual(drainQueuedPageAction(), { type: 'highlight', target: about });
  assert.ok(loadSiteAssistantState().messages.some(message => message.content.includes('Taking you there.')), 'the transcript is flushed before leaving');
});

test('an auto navigation with nothing bundled queues nothing', async t => {
  const page = await sendWith(t, [frame('text', { delta: 'Going.' }), directive({ type: 'navigate', target: about, auto: true }), frame('end', { reason: 'stop' })]);
  assert.equal(page.navigations.length, 1);
  assert.equal(hasQueuedPageAction(), false);
});
