/**
 * @file `FindBar` rendered from its own module with a recording `FindInPage`: closed renders
 * nothing; open, every key and button reaches exactly one of the find actions.
 */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createElement } from 'react';
import { mount } from './component-harness.js';
import { closeHost } from '../app-render-harness.js';
import { FindBar } from './FindBar.js';
import type { FindInPage } from '../use-find-in-page.hooks.js';

after(closeHost);

function fakeFind(fields: Partial<FindInPage> = {}): { find: FindInPage; calls: string[] } {
  const calls: string[] = [];
  const find: FindInPage = {
    open: true, query: 'tovu', result: null, countLabel: '2 of 5', inputRef: () => {},
    setQuery: (text) => { calls.push(`query:${text}`); },
    next: () => { calls.push('next'); }, previous: () => { calls.push('previous'); }, close: () => { calls.push('close'); },
    registerGuest: () => {},
    ...fields,
  };
  return { find, calls };
}

test('FindBar: closed renders nothing at all', (t) => {
  const { find } = fakeFind({ open: false });
  const view = mount({ t, element: createElement(FindBar, { find }) });
  assert.equal(view.container.innerHTML, '');
});

test('FindBar: open shows the query and the count, and typing hands the text to setQuery', async (t) => {
  const { find, calls } = fakeFind();
  const view = mount({ t, element: createElement(FindBar, { find }) });
  const input = view.container.querySelector<HTMLInputElement>('.findbar__input')!;
  assert.equal(view.container.querySelector('.findbar')?.getAttribute('role'), 'search');
  assert.equal(input.value, 'tovu');
  assert.equal(view.container.querySelector('.findbar__count')?.textContent, '2 of 5');
  await view.type(input, 'tovu site');
  assert.deepEqual(calls, ['query:tovu site']);
});

test('FindBar: Enter steps forward, Shift+Enter back, Escape closes, any other key does nothing', (t) => {
  const { find, calls } = fakeFind();
  const view = mount({ t, element: createElement(FindBar, { find }) });
  const input = view.container.querySelector<HTMLInputElement>('.findbar__input')!;
  const pressed = (init: Record<string, unknown>) => {
    const event = new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    input.dispatchEvent(event);
    return event.defaultPrevented;
  };
  assert.equal(pressed({ key: 'Enter' }), true, 'Enter is consumed by the bar');
  assert.equal(pressed({ key: 'Enter', shiftKey: true }), true);
  assert.equal(pressed({ key: 'Escape' }), true, 'Escape is consumed by the bar');
  assert.equal(pressed({ key: 'a' }), false, 'ordinary typing is left alone');
  assert.deepEqual(calls, ['next', 'previous', 'close']);
});

test('FindBar: previous, next and close buttons each run their own action', async (t) => {
  const { find, calls } = fakeFind();
  const view = mount({ t, element: createElement(FindBar, { find }) });
  await view.click(view.byLabel('Previous match'));
  await view.click(view.byLabel('Next match'));
  await view.click(view.byLabel('Close find bar'));
  assert.deepEqual(calls, ['previous', 'next', 'close']);
});

test('FindBar: with nothing typed there is nothing to step through, so previous and next are disabled', (t) => {
  const { find } = fakeFind({ query: '' });
  const view = mount({ t, element: createElement(FindBar, { find }) });
  assert.equal(view.byLabel('Previous match')?.hasAttribute('disabled'), true);
  assert.equal(view.byLabel('Next match')?.hasAttribute('disabled'), true);
  assert.equal(view.byLabel('Close find bar')?.hasAttribute('disabled'), false, 'close always works');
});
