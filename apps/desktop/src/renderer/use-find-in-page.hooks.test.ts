/**
 * @file Behavioural tests for `use-find-in-page.hooks.ts`: the reducer, which target a search
 * routes to, and the (deliberately backwards) `findNext` semantics `runFind`/`stopFind` apply.
 *
 * `useFindInPage` itself calls React hooks, and this package has no React renderer (see
 * `use-site-workspace.hooks.test.ts`'s own header for the identical constraint). Every decision it
 * makes is a plain exported function, so these tests call those directly with fake guests/bridges.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findBarReducer,
  formatMatchCount,
  initialFindBarState,
  resolveFindTarget,
  runFind,
  stopFind,
  type FindBarState,
  type FindableGuest,
  type FindBridge,
} from './use-find-in-page.hooks.js';

/** A `<webview>` stand-in that records every imperative call. */
function fakeGuest(options: { notAttached?: boolean } = {}): FindableGuest & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  const ready = () => {
    if (options.notAttached) throw new Error('The WebView must be attached to the DOM');
  };
  return {
    calls,
    findInPage: (...args: unknown[]) => {
      ready();
      calls.push(['findInPage', ...args]);
      return 1;
    },
    stopFindInPage: (...args: unknown[]) => {
      ready();
      calls.push(['stopFindInPage', ...args]);
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

/** A `RunnerInventoryBridge` stand-in narrowed to the find slice. */
function fakeBridge(): FindBridge & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    onFindToggle: () => () => {},
    findInPage: async (query) => {
      calls.push(['findInPage', query]);
    },
    stopFindInPage: async () => {
      calls.push(['stopFindInPage']);
    },
    onFindResult: () => () => {},
  };
}

test('toggle opens the bar and bumps focusNonce, even when already open', () => {
  const opened = findBarReducer(initialFindBarState, { type: 'toggle' });
  assert.equal(opened.open, true);
  assert.equal(opened.focusNonce, 1);

  const reopened = findBarReducer(opened, { type: 'toggle' });
  assert.equal(reopened.open, true);
  assert.equal(reopened.focusNonce, 2, 'a repeat Cmd+F while already open must still bump the focus signal');
});

test('set-query to non-empty text keeps the last result; clearing to "" drops it', () => {
  const withResult: FindBarState = { open: true, query: 'foo', result: { activeMatchOrdinal: 2, matches: 5 }, focusNonce: 1 };

  const retyped = findBarReducer(withResult, { type: 'set-query', query: 'foobar' });
  assert.equal(retyped.query, 'foobar');
  assert.deepEqual(retyped.result, { activeMatchOrdinal: 2, matches: 5 });

  const cleared = findBarReducer(withResult, { type: 'set-query', query: '' });
  assert.equal(cleared.query, '');
  assert.equal(cleared.result, null);
});

test('result records whatever the target reported; close resets to the initial state', () => {
  const found = findBarReducer(initialFindBarState, { type: 'result', result: { activeMatchOrdinal: 1, matches: 3 } });
  assert.deepEqual(found.result, { activeMatchOrdinal: 1, matches: 3 });

  const closed = findBarReducer(found, { type: 'close' });
  assert.deepEqual(closed, initialFindBarState);
});

test('resolveFindTarget prefers the active guest when it is actually mounted', () => {
  const guest = fakeGuest();
  const target = resolveFindTarget({ activeGuestId: 'site-1', guests: new Map([['site-1', guest]]), bridge: fakeBridge() });
  assert.equal(target.kind, 'guest');
  assert.equal((target as { kind: 'guest'; element: FindableGuest }).element, guest);
});

test('resolveFindTarget falls back to top when the active guest id has no mounted element', () => {
  const target = resolveFindTarget({ activeGuestId: 'site-missing', guests: new Map(), bridge: fakeBridge() });
  assert.equal(target.kind, 'top');
});

test('resolveFindTarget is top with no active tab, and none with no bridge either', () => {
  assert.equal(resolveFindTarget({ activeGuestId: null, guests: new Map(), bridge: fakeBridge() }).kind, 'top');
  assert.equal(resolveFindTarget({ activeGuestId: null, guests: new Map(), bridge: undefined }).kind, 'none');
  assert.equal(resolveFindTarget({ activeGuestId: 'site-1', guests: new Map(), bridge: undefined }).kind, 'none');
});

test('runFind on a guest target calls the guest directly, never the bridge', () => {
  const guest = fakeGuest();
  const bridge = fakeBridge();
  runFind({ kind: 'guest', element: guest }, bridge, 'hello', { forward: true, findNext: true });
  assert.deepEqual(guest.calls, [['findInPage', 'hello', { forward: true, findNext: true }]]);
  assert.deepEqual(bridge.calls, []);
});

test('runFind on a guest not yet attached to the DOM is swallowed, not thrown', () => {
  const guest = fakeGuest({ notAttached: true });
  assert.doesNotThrow(() => runFind({ kind: 'guest', element: guest }, fakeBridge(), 'x', { forward: true, findNext: true }));
});

test('runFind on the top target calls the bridge with the query merged into the options', () => {
  const bridge = fakeBridge();
  runFind({ kind: 'top' }, bridge, 'hello', { forward: false, findNext: false });
  assert.deepEqual(bridge.calls, [['findInPage', { text: 'hello', forward: false, findNext: false }]]);
});

test('runFind/stopFind on none, or on top with no bridge, are no-ops', () => {
  assert.doesNotThrow(() => runFind({ kind: 'none' }, fakeBridge(), 'x', { forward: true, findNext: true }));
  assert.doesNotThrow(() => runFind({ kind: 'top' }, undefined, 'x', { forward: true, findNext: true }));
  assert.doesNotThrow(() => stopFind({ kind: 'none' }, fakeBridge()));
  assert.doesNotThrow(() => stopFind({ kind: 'top' }, undefined));
});

test('stopFind clears the guest with clearSelection, or stops the bridge search', () => {
  const guest = fakeGuest();
  stopFind({ kind: 'guest', element: guest }, fakeBridge());
  assert.deepEqual(guest.calls, [['stopFindInPage', 'clearSelection']]);

  const bridge = fakeBridge();
  stopFind({ kind: 'top' }, bridge);
  assert.deepEqual(bridge.calls, [['stopFindInPage']]);
});

test('stopFind on a guest not yet attached is swallowed, not thrown', () => {
  const guest = fakeGuest({ notAttached: true });
  assert.doesNotThrow(() => stopFind({ kind: 'guest', element: guest }, fakeBridge()));
});

test('formatMatchCount: blank until a result exists, "No results" for zero matches, "N of M" otherwise', () => {
  assert.equal(formatMatchCount(null), '');
  assert.equal(formatMatchCount({ activeMatchOrdinal: 0, matches: 0 }), 'No results');
  assert.equal(formatMatchCount({ activeMatchOrdinal: 3, matches: 17 }), '3 of 17');
});
