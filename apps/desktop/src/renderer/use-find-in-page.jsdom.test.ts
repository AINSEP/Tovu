/**
 * @file `useFindInPage` and `useComposedGuestRef` rendered from their REAL module under jsdom, with
 * the hook's two ports (`bridge`, `clock`) injected as hand-written fakes — no module mocks.
 *
 * `use-find-in-page.hooks.test.ts` covers every exported decision directly and executes the hook's
 * source through a transpiled copy, which the coverage report cannot attribute to the file. These
 * tests drive the hook the way `App.tsx` does — a real React root, a real `<input>` holding the
 * bar's `inputRef`, real DOM focus — and step the clock's frames and timers by hand, so each
 * assertion names an observable outcome: which surface was searched with which options, what the
 * counter reads, where keyboard focus is, and what is left scheduled.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { act, createElement } from 'react';

import { createFindQueryScheduler, FIND_QUERY_SETTLE_MS } from './find-query-scheduler.js';
import {
  FIND_FOCUS_RECLAIM_MS,
  liveAnchorSelection,
  liveFindClock,
  useComposedGuestRef,
  useFindInPage,
  type FindBridge,
  type FindFocusClock,
  type FindInPage,
  type FindableGuest,
} from './use-find-in-page.hooks.js';
import type { FindInPageResult } from '../contracts/find-in-page.js';

type TestContext = { after: (fn: () => void) => void };

// One jsdom for the whole file: node --test runs each test file in its own process.
const { JSDOM } = createRequire(import.meta.url)('jsdom');
const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  IS_REACT_ACT_ENVIRONMENT: true,
});
// Loaded only now: react-dom probes `document` for input-event support when it is first evaluated,
// and a static import would evaluate it before the jsdom globals above exist.
const { createRoot } = await import('react-dom/client');

/** A clock whose frames and timers run only when the test says so. */
function manualClock() {
  let now = 1000;
  let nextId = 0;
  const frames = new Map<number, () => void>();
  const timers = new Map<number, () => void>();
  const delays: number[] = [];
  const clock: FindFocusClock = {
    now: () => now,
    requestFrame: (callback) => { frames.set(++nextId, callback); return nextId; },
    cancelFrame: (frame) => { frames.delete(frame); },
    schedule: (callback, delay) => { delays.push(delay); timers.set(++nextId, callback); return nextId; },
    cancel: (timer) => { timers.delete(timer as number); },
  };
  const drain = (queue: Map<number, () => void>) => act(() => {
    const pending = [...queue.values()];
    queue.clear();
    for (const callback of pending) callback();
  });
  return {
    clock, frames, timers, delays,
    runFrames: () => drain(frames),
    runTimers: () => drain(timers),
    advance: (ms: number) => { now += ms; },
  };
}

/** The find slice of the preload bridge, recording every call and holding its two listeners. */
function fakeBridge() {
  const calls: unknown[] = [];
  let toggle: (() => void) | null = null;
  let report: ((result: FindInPageResult) => void) | null = null;
  const bridge: FindBridge = {
    onFindToggle: (listener) => { toggle = listener; return () => { toggle = null; }; },
    findInPage: async (query) => { calls.push(['find', query]); },
    stopFindInPage: async () => { calls.push(['stop']); },
    onFindResult: (listener) => { report = listener; return () => { report = null; }; },
  };
  return {
    bridge, calls,
    toggle: () => act(() => toggle!()),
    report: (result: FindInPageResult) => act(() => report!(result)),
    subscribed: () => ({ toggle: toggle !== null, report: report !== null }),
  };
}

/** A `<webview>` stand-in: records find calls and holds its `found-in-page` listener. */
function fakeGuest() {
  const calls: unknown[] = [];
  const listeners = new Map<string, (event: { result: FindInPageResult }) => void>();
  const guest = {
    findInPage: (text: string, options: unknown) => { calls.push(['find', text, options]); return 1; },
    stopFindInPage: (action: string) => { calls.push(['stop', action]); },
    addEventListener: (name: string, listener: (event: { result: FindInPageResult }) => void) => { listeners.set(name, listener); },
    removeEventListener: (name: string) => { listeners.delete(name); },
  } as unknown as FindableGuest;
  return { guest, calls, listeners, found: (result: FindInPageResult) => act(() => listeners.get('found-in-page')!({ result })) };
}

/** Render the bar as `App.tsx` does: the input exists only while open and holds `inputRef`. */
function renderFind(t: TestContext, ports: Parameters<typeof useFindInPage>[1], initialGuestId: string | null = null) {
  let latest!: FindInPage;
  let guestId = initialGuestId;
  function Bar() {
    latest = useFindInPage(guestId, ports);
    return latest.open ? createElement('input', { ref: latest.inputRef, 'data-find': '' }) : null;
  }
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  let mounted = true;
  const unmount = () => { if (mounted) { mounted = false; act(() => root.unmount()); host.remove(); } };
  t.after(unmount);
  const rerender = () => act(() => root.render(createElement(Bar)));
  rerender();
  return {
    current: () => latest,
    input: () => host.querySelector<HTMLInputElement>('input[data-find]'),
    showGuest: (id: string | null) => { guestId = id; rerender(); },
    rerender,
    unmount,
    act: (run: () => void) => act(run),
  };
}

const result = (activeMatchOrdinal: number, matches: number) => ({ activeMatchOrdinal, matches }) as FindInPageResult;
const focused = (input: HTMLInputElement | null) => input !== null && document.activeElement === input;

test('without a desktop bridge the bar has nothing to open and stays inert', (t) => {
  const time = manualClock();
  // No `bridge` port: the default reads `window.tovuRunner`, which a plain DOM does not have.
  const bar = renderFind(t, { clock: time.clock });
  assert.equal(bar.current().open, false);
  assert.equal(bar.current().countLabel, '');
  bar.act(() => bar.current().setQuery('anything'));
  time.runTimers();
  assert.equal(bar.input(), null, 'the bar never opened, so no input is rendered');
});

test('Cmd+F opens and focuses the bar; a typed query searches the window once typing settles', (t) => {
  const time = manualClock();
  const window = fakeBridge();
  const bar = renderFind(t, { bridge: window.bridge, clock: time.clock });
  window.toggle();
  assert.equal(bar.current().open, true);
  assert.ok(focused(bar.input()), 'opening focuses the input');
  assert.deepEqual(window.calls, [['stop']], 'an open bar with no query stops any stale search');
  window.calls.length = 0;

  bar.act(() => bar.current().setQuery('bak'));
  assert.deepEqual(window.calls, [], 'nothing is searched while typing has not settled');
  assert.ok(time.delays.includes(FIND_QUERY_SETTLE_MS));
  time.runTimers();
  assert.deepEqual(window.calls, [['find', { text: 'bak', forward: true, findNext: true }]]);
  assert.equal(window.subscribed().report, true, 'a non-empty query listens for the window\'s results');

  // Chromium takes focus on a match; the frame loop takes it back until the find reports.
  bar.input()!.blur();
  assert.equal(focused(bar.input()), false);
  time.runTimers(); // the deferred blur reclaim
  assert.ok(focused(bar.input()), 'a blur right after issuing a find is undone');
  bar.input()!.blur();
  time.runFrames();
  assert.ok(focused(bar.input()), 'each frame re-asserts focus while awaiting the report');
  assert.equal(time.frames.size, 1, 'and schedules the next frame');

  window.report(result(2, 17));
  assert.equal(bar.current().countLabel, '2 of 17');
  assert.deepEqual(bar.current().result, result(2, 17));
  time.runFrames();
  assert.equal(time.frames.size, 0, 'a reported find ends the per-frame reclaim');
});

test('Enter and Shift+Enter step within the session; stepping with a pending query runs that query instead', (t) => {
  const time = manualClock();
  const window = fakeBridge();
  const bar = renderFind(t, { bridge: window.bridge, clock: time.clock });
  window.toggle();
  bar.act(() => bar.current().setQuery('a'));
  time.runTimers();
  window.calls.length = 0;
  time.frames.clear();

  bar.act(() => bar.current().next());
  bar.act(() => bar.current().previous());
  assert.deepEqual(window.calls, [
    ['find', { text: 'a', forward: true, findNext: false }],
    ['find', { text: 'a', forward: false, findNext: false }],
  ]);
  assert.equal(time.frames.size, 0, 'a step never arms the per-frame reclaim');

  window.calls.length = 0;
  bar.act(() => bar.current().setQuery('ab'));
  bar.act(() => bar.current().next());
  assert.deepEqual(window.calls, [['find', { text: 'ab', forward: true, findNext: true }]],
    'Enter before typing settles starts the new query rather than stepping the stale one');
  window.calls.length = 0;
  bar.act(() => bar.current().setQuery('abc'));
  bar.act(() => bar.current().previous());
  assert.deepEqual(window.calls, [['find', { text: 'abc', forward: true, findNext: true }]]);
});

test('clearing the query stops the search and the counter; closing stops it and resets the bar', (t) => {
  const time = manualClock();
  const window = fakeBridge();
  const bar = renderFind(t, { bridge: window.bridge, clock: time.clock });
  window.toggle();
  bar.act(() => bar.current().setQuery('x'));
  time.runTimers();
  window.report(result(1, 1));
  window.calls.length = 0;

  bar.act(() => bar.current().setQuery(''));
  assert.deepEqual(window.calls, [['stop']]);
  assert.equal(bar.current().countLabel, '');
  assert.equal(window.subscribed().report, false, 'an empty query does not listen for results');

  bar.act(() => bar.current().setQuery('y'));
  time.runTimers();
  bar.input()!.blur(); // a reclaim timer is now pending
  window.calls.length = 0;
  bar.act(() => bar.current().close());
  assert.deepEqual(window.calls, [['stop']]);
  assert.equal(bar.current().open, false);
  assert.equal(bar.current().query, '');
  assert.equal(bar.input(), null);
  assert.equal(time.timers.size, 0, 'close cancels the pending blur reclaim');
  assert.equal(time.frames.size, 0, 'close cancels the per-frame reclaim');
});

test('a re-summon while open refocuses and reselects the existing query', (t) => {
  const time = manualClock();
  const window = fakeBridge();
  const bar = renderFind(t, { bridge: window.bridge, clock: time.clock });
  window.toggle();
  const input = bar.input()!;
  input.value = 'bakery';
  input.blur();
  window.toggle();
  assert.ok(focused(input));
  assert.equal(input.selectionStart, 0);
  assert.equal(input.selectionEnd, 'bakery'.length);
});

test('a blur long after the last find, or before any find, is the user clicking away and sticks', (t) => {
  const time = manualClock();
  const window = fakeBridge();
  const bar = renderFind(t, { bridge: window.bridge, clock: time.clock });
  window.toggle();
  bar.input()!.blur();
  time.runTimers();
  assert.equal(focused(bar.input()), false, 'no find issued yet: the blur stands');

  bar.input()!.focus();
  bar.act(() => bar.current().setQuery('q'));
  time.runTimers();
  window.report(result(1, 2));
  time.advance(FIND_FOCUS_RECLAIM_MS);
  bar.input()!.blur();
  bar.input()!.focus();
  bar.input()!.blur();
  assert.equal(time.timers.size, 1, 'a second blur replaces the first pending reclaim');
  time.runTimers();
  assert.equal(focused(bar.input()), false, 'outside the reclaim window the blur stands');
});

test('an IME composition is never interrupted: searches wait for it and reports do not refocus', (t) => {
  const time = manualClock();
  const window = fakeBridge();
  const bar = renderFind(t, { bridge: window.bridge, clock: time.clock });
  window.toggle();
  const input = bar.input()!;
  window.calls.length = 0;
  input.dispatchEvent(new dom.window.Event('compositionstart'));
  bar.act(() => bar.current().setQuery('日'));
  time.runTimers();
  assert.deepEqual(window.calls, [], 'mid-composition, the settled query reschedules instead of searching');
  assert.equal(time.timers.size, 1);

  input.dispatchEvent(new dom.window.Event('compositionend'));
  time.runTimers();
  assert.deepEqual(window.calls, [['find', { text: '日', forward: true, findNext: true }]]);

  input.dispatchEvent(new dom.window.Event('compositionstart'));
  input.blur();
  time.runFrames();
  assert.equal(focused(input), false, 'the frame loop stops rather than ending the composition');
  window.report(result(1, 1));
  assert.equal(focused(input), false, 'a report during composition does not refocus');
  assert.equal(bar.current().countLabel, '1 of 1', 'but its result is still shown');
  bar.act(() => bar.current().next());
  assert.equal(focused(input), false, 'a step during composition does not refocus either');
  input.dispatchEvent(new dom.window.Event('compositionend'));
  window.report(result(1, 1));
  assert.ok(focused(input), 'after composition a report refocuses again');
});

test('a mounted guest is searched directly, reports on its own event, and a tab switch closes the bar', (t) => {
  const time = manualClock();
  const window = fakeBridge();
  const site = fakeGuest();
  const bar = renderFind(t, { bridge: window.bridge, clock: time.clock }, 'site-a');
  bar.act(() => bar.current().registerGuest('site-a', site.guest));
  bar.rerender();
  window.toggle();
  assert.deepEqual(site.calls, [['stop', 'clearSelection']], 'opening with no query clears the guest');
  site.calls.length = 0;
  bar.act(() => bar.current().setQuery('menu'));
  time.runTimers();
  assert.deepEqual(site.calls, [['find', 'menu', { forward: true, findNext: true }]]);
  assert.deepEqual(window.calls, [], 'a guest target never searches the window');

  bar.input()!.blur();
  site.found(result(3, 4));
  assert.equal(bar.current().countLabel, '3 of 4');
  assert.ok(focused(bar.input()), 'a guest report restores focus');

  bar.showGuest(null);
  assert.deepEqual(site.calls.at(-1), ['stop', 'clearSelection'], 'the OUTGOING guest is cleared');
  assert.equal(bar.current().open, false);
  assert.equal(site.listeners.size, 0, 'the guest listener is removed');

  bar.showGuest('site-a');
  assert.equal(bar.current().open, false, 'switching while closed does nothing');
  bar.act(() => bar.current().registerGuest('site-a', null));
  bar.rerender();
  window.toggle();
  bar.act(() => bar.current().setQuery('menu'));
  time.runTimers();
  assert.deepEqual(window.calls.at(-1), ['find', { text: 'menu', forward: true, findNext: true }],
    'a deregistered guest falls back to the window');
});

test('unmounting cancels every pending query, frame and blur reclaim', (t) => {
  const time = manualClock();
  const window = fakeBridge();
  const bar = renderFind(t, { bridge: window.bridge, clock: time.clock });
  window.toggle();
  bar.act(() => bar.current().setQuery('a'));
  time.runTimers();
  bar.input()!.blur();
  bar.act(() => bar.current().setQuery('ab'));
  assert.ok(time.timers.size >= 2 && time.frames.size === 1);
  bar.unmount();
  assert.equal(time.timers.size, 0);
  assert.equal(time.frames.size, 0);
  assert.deepEqual(window.subscribed(), { toggle: false, report: false });
});

test('useComposedGuestRef feeds one webview node to every registration, and is stable across renders', (t) => {
  const calls: unknown[] = [];
  const guestRef = (node: unknown) => calls.push(['guest', node]);
  const registerGuest = (id: string, node: unknown) => calls.push(['find', id, node]);
  const extra = (node: unknown) => calls.push(['zoom', node]);
  const refs: Array<(node: HTMLWebViewElement | null) => void> = [];
  let withExtra = true;
  function Probe() {
    refs.push(useComposedGuestRef(guestRef, registerGuest, 'site-a', withExtra ? extra : undefined));
    return null;
  }
  const root = createRoot(document.body.appendChild(document.createElement('div')));
  t.after(() => act(() => root.unmount()));
  act(() => root.render(createElement(Probe)));
  act(() => root.render(createElement(Probe)));
  assert.equal(refs[0], refs[1], 'unchanged inputs keep the same ref callback');
  const node = {} as HTMLWebViewElement;
  refs[1](node);
  assert.deepEqual(calls, [['guest', node], ['find', 'site-a', node], ['zoom', node]]);

  withExtra = false;
  act(() => root.render(createElement(Probe)));
  calls.length = 0;
  refs.at(-1)!(null);
  assert.deepEqual(calls, [['guest', null], ['find', 'site-a', null]]);
});

test('the live ports read the real window: selection, clock, frames and timers', async () => {
  assert.equal(liveAnchorSelection(), document.getSelection());
  const before = liveFindClock.now();
  assert.equal(typeof before, 'number');
  const fired: string[] = [];
  await new Promise<void>((resolve) => {
    liveFindClock.requestFrame(() => { fired.push('frame'); resolve(); });
  });
  const cancelledFrame = liveFindClock.requestFrame(() => fired.push('cancelled frame'));
  liveFindClock.cancelFrame(cancelledFrame);
  const cancelledTimer = liveFindClock.schedule(() => fired.push('cancelled timer'), 0);
  liveFindClock.cancel(cancelledTimer);
  await new Promise<void>((resolve) => { liveFindClock.schedule(() => { fired.push('timer'); resolve(); }, 0); });
  await new Promise<void>((resolve) => { liveFindClock.requestFrame(() => resolve()); });
  assert.deepEqual(fired, ['frame', 'timer']);
  assert.ok(liveFindClock.now() >= before);
});

test('the query scheduler\'s default clock is the real timer: cancel drops, settle runs', async () => {
  const runs: string[] = [];
  const scheduler = createFindQueryScheduler();
  scheduler.schedule({ run: () => runs.push('cancelled') });
  scheduler.cancel();
  await new Promise<void>((resolve) => {
    scheduler.schedule({ run: () => { runs.push('settled'); resolve(); } });
  });
  assert.deepEqual(runs, ['settled']);
});
