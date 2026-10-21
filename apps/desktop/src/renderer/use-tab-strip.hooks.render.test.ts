/**
 * @file `useTabStrip` rendered from its real module under jsdom (see `dom-hook-harness.ts`), with
 * `ResizeObserver` injected through its port — jsdom has none, and a fake lets the test fire a
 * resize on demand. jsdom also has no layout, so each test sets the strip's measured widths on the
 * element itself. The pure helpers have direct tests in `tab-strip-keyboard.test.ts`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { act, createElement, type RefObject } from 'react';
import { createRoot } from 'react-dom/client';

import type { SiteRecord } from '../contracts/project.js';
import { installDom } from './dom-hook-harness.js';
import { useTabStrip } from './use-tab-strip.hooks.js';

const SITES = [{ id: '/a', displayName: 'A' }, { id: '/b', displayName: 'B' }] as unknown as SiteRecord[];

/** A recording `ResizeObserver` whose callback the test fires by hand. */
function fakeResizeObserver() {
  const log: string[] = [];
  let fire: () => void = () => undefined;
  class FakeResizeObserver {
    constructor(callback: () => void) { fire = callback; log.push('created'); }
    observe() { log.push('observe'); }
    disconnect() { log.push('disconnect'); }
  }
  return { Impl: FakeResizeObserver as unknown as typeof ResizeObserver, log, resize: () => act(() => fire()) };
}

/** Render a strip with one tab button per site, the active one marked; returns the hook's latest value. */
function renderStrip(t: { after: (fn: () => void) => void }, input: { activeTab: string | null; Impl: typeof ResizeObserver; mounted?: boolean }) {
  const window = installDom();
  const reveals: string[] = [];
  let latest!: ReturnType<typeof useTabStrip>;
  let activeTab = input.activeTab;
  function Strip() {
    latest = useTabStrip({ activeTab, projects: SITES }, { ResizeObserverImpl: input.Impl });
    if (input.mounted === false) return null;
    return createElement('div', { ref: latest.stripRef as RefObject<HTMLDivElement> }, SITES.map((site) => createElement('button', {
      key: site.id, role: 'tab', className: site.id === activeTab ? 'is-active' : undefined,
      ref: (node: HTMLButtonElement | null) => { if (node) node.scrollIntoView = () => void reveals.push(site.id); },
    }, site.displayName)));
  }
  const root = createRoot(window.document.body.appendChild(window.document.createElement('div')));
  act(() => root.render(createElement(Strip)));
  t.after(() => act(() => root.unmount()));
  return {
    current: () => latest,
    reveals,
    select: (id: string) => { activeTab = id; act(() => root.render(createElement(Strip))); },
  };
}

/** Give the strip a layout: jsdom measures every element as 0 wide. */
function measure(strip: HTMLElement, { scrollWidth, clientWidth, scrollLeft }: { scrollWidth: number; clientWidth: number; scrollLeft: number }) {
  Object.defineProperties(strip, {
    scrollWidth: { configurable: true, value: scrollWidth },
    clientWidth: { configurable: true, value: clientWidth },
    scrollLeft: { configurable: true, value: scrollLeft, writable: true },
  });
}

test('the strip reveals the active tab and shows arrows only while it overflows', (t) => {
  const ro = fakeResizeObserver();
  const strip = renderStrip(t, { activeTab: '/b', Impl: ro.Impl });
  assert.deepEqual(strip.reveals, ['/b']);
  assert.deepEqual(ro.log, ['created', 'observe']);
  assert.equal(strip.current().showArrows, false, 'jsdom: zero-width strip, nothing hidden');

  const node = strip.current().stripRef.current!;
  measure(node, { scrollWidth: 600, clientWidth: 300, scrollLeft: 0 });
  ro.resize();
  assert.deepEqual(strip.current().overflow, { left: false, right: true });
  assert.equal(strip.current().showArrows, true);
  assert.deepEqual(strip.reveals, ['/b', '/b'], 'a resize re-reveals the active tab');

  measure(node, { scrollWidth: 600, clientWidth: 300, scrollLeft: 300 });
  act(() => { node.dispatchEvent(new (installDom().Event)('scroll')); });
  assert.deepEqual(strip.current().overflow, { left: true, right: false });

  strip.select('/a');
  assert.deepEqual(ro.log, ['created', 'observe', 'disconnect', 'created', 'observe'], 'a new selection re-subscribes');
  assert.equal(strip.reveals.at(-1), '/a');
});

test('the arrows scroll the strip by a fixed step, and arrow keys move between tabs', (t) => {
  const ro = fakeResizeObserver();
  const strip = renderStrip(t, { activeTab: '/a', Impl: ro.Impl });
  const node = strip.current().stripRef.current!;
  const scrolls: unknown[] = [];
  node.scrollBy = ((options: ScrollToOptions) => void scrolls.push(options)) as HTMLElement['scrollBy'];
  strip.current().scrollLeft();
  strip.current().scrollRight();
  assert.deepEqual(scrolls, [{ left: -200, behavior: 'smooth' }, { left: 200, behavior: 'smooth' }]);

  const tabs = Array.from(node.querySelectorAll('button'));
  const clicked: string[] = [];
  tabs.forEach((tab) => tab.addEventListener('click', () => clicked.push(tab.textContent!)));
  let prevented = false;
  strip.current().onKeyDown({ key: 'ArrowRight', target: tabs[0], preventDefault: () => { prevented = true; } } as never);
  assert.deepEqual(clicked, ['B']);
  assert.equal(prevented, true);
  assert.equal(strip.current().tabIndex({ tabId: '/a' }), 0);
  assert.equal(strip.current().tabIndex({ tabId: '/b' }), -1);
});

test('with no strip mounted the hook observes nothing and its controls are inert', (t) => {
  const ro = fakeResizeObserver();
  const strip = renderStrip(t, { activeTab: null, Impl: ro.Impl, mounted: false });
  assert.deepEqual(ro.log, []);
  assert.equal(strip.current().scrollLeft(), undefined);
  assert.equal(strip.current().scrollRight(), undefined);
  strip.current().onKeyDown({ key: 'ArrowRight' } as never);
  assert.equal(strip.current().tabIndex({ tabId: null }), 0, 'All is the tab stop when nothing is selected');
});
