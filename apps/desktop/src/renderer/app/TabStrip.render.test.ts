/**
 * @file `TabStrip` rendered from its own module with the real `useTabStrip`: the permanent "All"
 * tab, one select/close pair per open site, and scroll arrows only while the strip overflows.
 */
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createElement } from 'react';
import { act, dom, mount, site, type TestContext } from './component-harness.js';
import { closeHost } from '../app-render-harness.js';
import { TabStrip } from './TabStrip.js';
import type { SiteRecord } from '../../contracts/project.js';

after(closeHost);

function renderStrip(t: TestContext, { projects, activeTab }: { projects: readonly SiteRecord[]; activeTab: string | null }) {
  const calls: string[] = [];
  const view = mount({ t, element: createElement(TabStrip, {
    projects, activeTab,
    onSelectSitesHome: () => { calls.push('home'); },
    onSelectTab: (id) => { calls.push(`select:${id}`); },
    onCloseTab: (id) => { calls.push(`close:${id}`); },
  }) });
  return { ...view, calls, tabs: () => view.all('[role="tab"]') };
}

test('TabStrip: with no site selected the All tab is the selected one and the only tab stop', (t) => {
  const view = renderStrip(t, { projects: [site('a'), site('b')], activeTab: null });
  const [all, a, b] = view.tabs();
  assert.equal(all?.textContent, 'All');
  assert.ok(all?.classList.contains('tab--sites-home'));
  assert.ok(all?.classList.contains('is-active'));
  assert.deepEqual([all, a, b].map((tab) => tab?.getAttribute('aria-selected')), ['true', 'false', 'false']);
  assert.deepEqual([all, a, b].map((tab) => tab?.getAttribute('tabindex')), ['0', '-1', '-1']);
});

test('TabStrip: a selected site tab is marked, carries its status dot and full-name tooltip', (t) => {
  const name = 'A very long website name that will not fit';
  const view = renderStrip(t, { projects: [site('a', { status: 'running', displayName: name }), site('b')], activeTab: 'a' });
  const [all, a] = view.tabs();
  assert.equal(all?.getAttribute('aria-selected'), 'false');
  assert.equal(all?.classList.contains('is-active'), false);
  assert.equal(a?.getAttribute('aria-selected'), 'true');
  assert.ok(a?.parentElement?.classList.contains('is-active'));
  assert.ok(a?.querySelector('.tab__dot.is-running'));
  assert.equal(a?.querySelector('.tab__label')?.getAttribute('title'), name);
  assert.ok(view.byLabel(`Close ${name}`), 'each site tab has its own named close button');
});

test('TabStrip: All, a site tab and a close button each report their own action', async (t) => {
  const view = renderStrip(t, { projects: [site('a'), site('b')], activeTab: 'a' });
  await view.click(view.tabs()[0]);
  await view.click(view.tabs()[2]);
  await view.click(view.byLabel('Close Site a'));
  assert.deepEqual(view.calls, ['home', 'select:b', 'close:a']);
});

test('TabStrip: no arrows until the strip overflows, then each is disabled on its exhausted side', async (t) => {
  const view = renderStrip(t, { projects: [site('a'), site('b')], activeTab: null });
  assert.equal(view.all('.tabstrip-arrow').length, 0);
  const strip = view.container.querySelector<HTMLElement>('[role="tablist"]')!;
  const scrolled: number[] = [];
  Object.defineProperties(strip, {
    scrollWidth: { value: 900, configurable: true }, clientWidth: { value: 300, configurable: true },
    scrollLeft: { value: 0, configurable: true, writable: true },
  });
  strip.scrollBy = ((options: ScrollToOptions) => { scrolled.push(options.left ?? 0); }) as typeof strip.scrollBy;
  await act(async () => { strip.dispatchEvent(new dom.window.Event('scroll')); });
  assert.equal(view.byLabel('Scroll tabs left')?.hasAttribute('disabled'), true, 'already at the left edge');
  assert.equal(view.byLabel('Scroll tabs right')?.hasAttribute('disabled'), false);
  await view.click(view.byLabel('Scroll tabs right'));
  strip.scrollLeft = 600;
  await act(async () => { strip.dispatchEvent(new dom.window.Event('scroll')); });
  assert.equal(view.byLabel('Scroll tabs left')?.hasAttribute('disabled'), false);
  assert.equal(view.byLabel('Scroll tabs right')?.hasAttribute('disabled'), true, 'now at the right edge');
  await view.click(view.byLabel('Scroll tabs left'));
  assert.deepEqual(scrolled, [200, -200]);
});

test('TabStrip: a selected tab that is no longer open leaves All as the one tab stop', (t) => {
  const view = renderStrip(t, { projects: [site('a'), site('b')], activeTab: 'closed' });
  assert.deepEqual(view.tabs().map((tab) => tab.getAttribute('tabindex')), ['0', '-1', '-1']);
});

test('TabStrip: arrow keys on a tab move focus and selection to the next tab, wrapping at the ends', async (t) => {
  const view = renderStrip(t, { projects: [site('a'), site('b')], activeTab: null });
  const [all, a, b] = view.tabs();
  const press = (tab: HTMLElement | undefined, key: string) => act(async () => {
    tab!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true }));
  });
  await press(all, 'ArrowRight');
  assert.equal(dom.window.document.activeElement, a);
  await press(all, 'ArrowLeft');
  assert.equal(dom.window.document.activeElement, b, 'left from the first tab wraps to the last');
  assert.deepEqual(view.calls, ['select:a', 'select:b']);
});
