import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test, { type TestContext } from 'node:test';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { useTheme, type ThemePreference } from './theme.js';

// Author Checklist: reject defaulting to system, ignoring saved preferences, applying the OS
// to explicit preferences, omitting persistence/DOM updates, or leaving the system listener
// attached after a preference change/unmount. Real React effects and EventTarget routing run.
// The workspace's installed admin DOM dependency; React/ReactDOM are Runner's real dependencies.
const { JSDOM } = createRequire(new URL('../../../admin/package.json', import.meta.url))('jsdom');

function mountTheme(t: TestContext, stored: string | null, dark: boolean) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://runner.test/' });
  const replacements: Record<string, unknown> = {
    window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const descriptors = new Map(Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  if (stored !== null) dom.window.localStorage.setItem('tovu-runner.theme', stored);
  const media = new dom.window.EventTarget();
  Object.defineProperty(media, 'matches', { configurable: true, writable: true, value: dark });
  dom.window.matchMedia = (query: string) => {
    assert.equal(query, '(prefers-color-scheme: dark)');
    return media;
  };
  let latest!: ReturnType<typeof useTheme>;
  function Probe() {
    latest = useTheme();
    return createElement('output', null, latest[0]);
  }
  const root = createRoot(dom.window.document.getElementById('root')!);
  t.after(() => {
    act(() => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  act(() => root.render(createElement(Probe)));
  return {
    document: dom.window.document,
    storage: dom.window.localStorage,
    choose(next: ThemePreference) { act(() => latest[1](next)); },
    // F3.2: a real MediaQueryList emits change only when its match state changes.
    os(dark: boolean) {
      if (media.matches === dark) return;
      act(() => { media.matches = dark; media.dispatchEvent(new dom.window.Event('change')); });
    },
    unmount() { act(() => root.unmount()); },
  };
}

function assertTheme(h: ReturnType<typeof mountTheme>, preference: ThemePreference, resolved: 'dark' | 'light') {
  assert.equal(h.document.querySelector('output')?.textContent, preference);
  assert.equal(h.storage.getItem('tovu-runner.theme'), preference);
  assert.equal(h.document.documentElement.dataset.theme, resolved);
  assert.equal(h.document.documentElement.style.colorScheme, resolved);
}

// F2.3/F3.5/F6.4: real React effects execute and both active DOM and storage are read back.
for (const stored of [null, 'unsupported']) {
  test(`missing or invalid saved preference (${stored}) defaults to light even on a dark OS`, (t) => {
    const h = mountTheme(t, stored, true);
    assertTheme(h, 'light', 'light');
    h.os(false);
    assertTheme(h, 'light', 'light');
  });
}

for (const preference of ['light', 'dark'] as const) {
  test(`restores explicit ${preference} and ignores subsequent OS changes`, (t) => {
    const h = mountTheme(t, preference, preference !== 'dark');
    assertTheme(h, preference, preference);
    h.os(preference === 'dark');
    assertTheme(h, preference, preference);
  });
}

test('system resolves both OS states, and switching to an explicit choice removes the OS subscription', (t) => {
  const h = mountTheme(t, 'system', true);
  assertTheme(h, 'system', 'dark');
  h.os(false);
  assertTheme(h, 'system', 'light');
  h.os(true);
  assertTheme(h, 'system', 'dark');
  h.choose('light');
  assertTheme(h, 'light', 'light');
  h.os(false);
  assertTheme(h, 'light', 'light');
  h.os(true);
  assertTheme(h, 'light', 'light');
  h.choose('system');
  assertTheme(h, 'system', 'dark');
  h.os(false);
  assertTheme(h, 'system', 'light');
});

test('unmount removes the system listener so later OS changes cannot alter the document', (t) => {
  const h = mountTheme(t, 'system', true);
  assertTheme(h, 'system', 'dark');
  h.unmount();
  h.os(false);
  assert.equal(h.document.documentElement.dataset.theme, 'dark');
  assert.equal(h.document.documentElement.style.colorScheme, 'dark');
  assert.equal(h.storage.getItem('tovu-runner.theme'), 'system');
});
