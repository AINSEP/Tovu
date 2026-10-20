/**
 * @file Unit tests for `ui/dom.mjs`, the browser helpers every panel builds its DOM with, run in a
 * jsdom frame (`frame-harness.mjs`): the host connection listens on the given frame window and posts
 * only to its parent at the host's origin, `h` turns strings into text (never markup), `busy`
 * disables a region's buttons for exactly one request, and the failure sentence falls back to a
 * fixed one.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';

import { busy, connectToHost, failureText, h, show, wait } from '../ui/dom.mjs';
import { HOST_ORIGIN, MARKUP, MOUNT_ID, createFrame, flush } from './frame-harness.mjs';

let frame;
beforeEach(() => { frame = createFrame(); });
afterEach(() => { mock.timers.reset(); mock.restoreAll(); frame.close(); });

test('connectToHost: the client learns the host from its parent window and posts there, to the host origin only', async () => {
  frame.respond.set('status', () => ({ ok: 'yes' }));
  const client = connectToHost({ window: frame.window });
  frame.init();
  await client.ready;
  assert.deepEqual(await client.call({ action: 'status', payload: {} }), { ok: 'yes' });
  assert.deepEqual(frame.posted.map((entry) => [entry.targetOrigin, entry.message.mountId, entry.message.action]), [[HOST_ORIGIN, MOUNT_ID, 'status']]);
  client.close();
});

test('connectToHost: messages from any window other than the parent are ignored', async () => {
  const client = connectToHost({ window: frame.window });
  let ready = false;
  client.ready.then(() => { ready = true; });
  frame.deliver({ protocol: 'jini.admin-surface', version: 1, kind: 'init', mountId: MOUNT_ID }, { source: frame.window });
  await flush();
  assert.equal(ready, false);
  client.close();
});

test('connectToHost: closing the client removes exactly the message listener it added', () => {
  const added = mock.method(frame.window, 'addEventListener');
  const removed = mock.method(frame.window, 'removeEventListener');
  const client = connectToHost({ window: frame.window });
  client.close();
  assert.equal(added.mock.calls[0].arguments[0], 'message');
  assert.deepEqual(removed.mock.calls.map((call) => call.arguments), [added.mock.calls[0].arguments]);
});

test('h: string children become text nodes, never parsed markup', () => {
  const element = h('p', {}, [MARKUP]);
  assert.equal(element.textContent, MARKUP);
  assert.equal(element.querySelector('img'), null);
  assert.equal(element.childNodes[0].nodeType, frame.window.Node.TEXT_NODE);
});

test('h: string props become attributes, true becomes an empty attribute, false and undefined are left out', () => {
  const element = h('input', { type: 'checkbox', checked: true, disabled: false, title: undefined });
  assert.deepEqual(element.getAttributeNames().sort(), ['checked', 'type']);
  assert.equal(element.getAttribute('checked'), '');
  assert.equal(element.getAttribute('type'), 'checkbox');
});

test('h: an on<Event> function becomes a listener for that lower-case event, not an attribute', () => {
  let clicks = 0;
  const element = h('button', { onClick: () => { clicks += 1; } }, ['Go']);
  element.click();
  assert.equal(clicks, 1);
  assert.equal(element.hasAttribute('onClick'), false);
});

test('h: null and undefined children are skipped, nodes are appended in order', () => {
  const element = h('div', {}, [null, h('b', {}, ['x']), undefined, 'y']);
  assert.equal(element.innerHTML, '<b>x</b>y');
});

test('h: props and children default to none', () => {
  const element = h('hr');
  assert.equal(element.outerHTML, '<hr>');
});

test('show: replaces the region content and skips empty slots', () => {
  const root = frame.document.getElementById('app');
  root.append(h('p', {}, ['old']));
  show(root, null, h('p', {}, ['new']), undefined, false);
  assert.equal(root.innerHTML, '<p>new</p>');
});

test('failureText: the host or plugin sentence when the failure carries one', () => {
  assert.equal(failureText(new Error('Reconnect Google, then try again.')), 'Reconnect Google, then try again.');
});

test('failureText: a fixed sentence when the failure has no usable message', () => {
  for (const error of [undefined, null, {}, new Error(''), { message: 42 }]) {
    assert.equal(failureText(error), 'Something went wrong. Try again.');
  }
});

test('busy: every button in the region is disabled while the work runs, and enabled again after', async () => {
  const root = frame.document.getElementById('app');
  show(root, h('button', {}, ['A']), h('div', {}, [h('button', {}, ['B'])]));
  const buttons = [...root.querySelectorAll('button')];
  let during;
  const result = await busy(root, async () => { during = buttons.map((control) => control.disabled); return 'done'; });
  assert.deepEqual({ during, after: buttons.map((control) => control.disabled), result }, { during: [true, true], after: [false, false], result: 'done' });
});

test('busy: a failed work still re-enables the buttons and passes the failure on', async () => {
  const root = frame.document.getElementById('app');
  show(root, h('button', {}, ['A']));
  const control = root.querySelector('button');
  await assert.rejects(busy(root, async () => { throw new Error('host refused'); }), { message: 'host refused' });
  assert.equal(control.disabled, false);
});

test('wait: resolves only after the given milliseconds', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  let done = false;
  wait(3000).then(() => { done = true; });
  mock.timers.tick(2999);
  await flush();
  const early = done;
  mock.timers.tick(1);
  await flush();
  assert.deepEqual({ early, done }, { early: false, done: true });
});
