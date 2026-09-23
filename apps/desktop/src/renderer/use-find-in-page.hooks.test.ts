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
  restoreFindInputFocus,
  runFind,
  shouldCloseOnGuestChange,
  shouldReclaimFindFocus,
  stopFind,
  subscribeToFindResults,
  FIND_FOCUS_RECLAIM_MS,
  type FindBarState,
  type FindableGuest,
  type FindBridge,
  type AnchorSelection,
} from './use-find-in-page.hooks.js';
import type { FindInPageResult } from '../contracts/find-in-page.js';

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

test('shouldCloseOnGuestChange: true only when the bar is open AND the visible surface actually changed', () => {
  assert.equal(shouldCloseOnGuestChange('a', 'a', true), false, 'same tab, no-op');
  assert.equal(shouldCloseOnGuestChange('a', 'b', true), true, 'switched tabs while open');
  assert.equal(shouldCloseOnGuestChange(null, 'a', true), true, 'Projects screen -> a tab, while open');
  assert.equal(shouldCloseOnGuestChange('a', null, true), true, 'a tab -> Projects screen, while open');
  assert.equal(shouldCloseOnGuestChange('a', 'b', false), false, 'switched while already closed: nothing to close');
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

/** Records the ORDER of a top-level find's two effects, since ordering is the whole point: the
 *  selection has to be gone by the time Chromium reads it. */
function orderedTopFind(): { bridge: FindBridge; selection: AnchorSelection; order: string[] } {
  const order: string[] = [];
  return {
    order,
    bridge: {
      onFindToggle: () => () => {},
      findInPage: async () => {
        order.push('findInPage');
      },
      stopFindInPage: async () => {
        order.push('stopFindInPage');
      },
      onFindResult: () => () => {},
    },
    selection: {
      removeAllRanges: () => {
        order.push('removeAllRanges');
      },
    },
  };
}

test('runFind on the top target clears the document selection BEFORE searching', () => {
  const { bridge, selection, order } = orderedTopFind();
  runFind({ kind: 'top' }, bridge, 'hello', { forward: true, findNext: false }, selection);
  assert.deepEqual(order, ['removeAllRanges', 'findInPage'], 'a selection still present when Chromium reads it re-anchors the search on the find bar itself');
});

test('runFind on a guest target ALSO clears the host selection first', () => {
  const { selection, order } = orderedTopFind();
  const guest = fakeGuest();
  runFind({ kind: 'guest', element: guest }, undefined, 'hello', { forward: true, findNext: false }, selection);
  // Not belt-and-braces: Chromium serves a guest's find from the WINDOW's find manager once that
  // manager exists, and a rerouted search anchors on THIS frame's selection — the find bar's own
  // caret. See this file's header for the measurement.
  assert.deepEqual(order, ['removeAllRanges'], 'the host selection must be gone before a guest search too');
  assert.deepEqual(guest.calls, [['findInPage', 'hello', { forward: true, findNext: false }]]);
});

test('runFind on the top target with no bridge does not clear the selection either', () => {
  const { selection, order } = orderedTopFind();
  runFind({ kind: 'top' }, undefined, 'hello', { forward: true, findNext: false }, selection);
  assert.deepEqual(order, [], 'no search to anchor, so nothing to clear');
});

test('restoreFindInputFocus refocuses the input, and tolerates a closed bar', () => {
  let focused = 0;
  const input = {
    focus: () => {
      focused += 1;
    },
  };
  // Every reported result means Chromium moved focus somewhere: ClearFocusedElement blurred the
  // host input for a top-level match, or SetFocusedFrame moved keyboard focus into the guest frame
  // for a guest match. Both need the identical restore.
  restoreFindInputFocus(input);
  assert.equal(focused, 1);
  restoreFindInputFocus(input);
  assert.equal(focused, 2, 'every reported result restores focus, not just the first');
  assert.doesNotThrow(() => restoreFindInputFocus(null), 'the bar can be closed by the time a result lands');
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

/** A guest whose `found-in-page` listeners a test can fire, and a bridge whose relayed window
 *  results a test can fire — the two sources a search can be reported on. */
function twoSourceFakes() {
  const guestListeners = new Set<(event: { result: FindInPageResult }) => void>();
  const windowListeners = new Set<(result: FindInPageResult) => void>();
  const guest: FindableGuest = {
    findInPage: () => 1,
    stopFindInPage: () => {},
    // Cast because `HTMLWebViewElement`'s listener methods are an OVERLOAD SET over every webview
    // event; this fake only ever receives `'found-in-page'`, whose payload is the one shape below.
    addEventListener: ((_event: string, listener: (event: { result: FindInPageResult }) => void) => void guestListeners.add(listener)) as FindableGuest['addEventListener'],
    removeEventListener: ((_event: string, listener: (event: { result: FindInPageResult }) => void) => void guestListeners.delete(listener)) as FindableGuest['removeEventListener'],
  };
  const bridge: FindBridge = {
    onFindToggle: () => () => {},
    findInPage: async () => {},
    stopFindInPage: async () => {},
    onFindResult: (listener) => {
      windowListeners.add(listener);
      return () => void windowListeners.delete(listener);
    },
  };
  return {
    guest,
    bridge,
    guestCount: () => guestListeners.size,
    windowCount: () => windowListeners.size,
    emitGuest: (result: FindInPageResult) => guestListeners.forEach((l) => l({ result })),
    emitWindow: (result: FindInPageResult) => windowListeners.forEach((l) => l(result)),
  };
}

test('subscribeToFindResults: a GUEST target reports on both sources, and a result on the GUEST\'s own event also restores focus — a guest find moves keyboard focus into the guest', () => {
  const fakes = twoSourceFakes();
  const results: FindInPageResult[] = [];
  let reportedCount = 0;
  const unsubscribe = subscribeToFindResults({ kind: 'guest', element: fakes.guest }, fakes.bridge, {
    onResult: (result) => results.push(result),
    onReported: () => {
      reportedCount += 1;
    },
  });
  assert.equal(fakes.guestCount(), 1, "the guest's own event");
  assert.equal(fakes.windowCount(), 1, "the window's relayed event — the source that reports once its find manager exists");

  fakes.emitGuest({ activeMatchOrdinal: 1, matches: 98 });
  assert.deepEqual(results, [{ activeMatchOrdinal: 1, matches: 98 }]);
  // A cold window (no find run yet) serves a guest find from the guest's OWN find manager, and
  // Chromium's TextFinder::FindInternal runs SetFocusedFrame on the guest frame unconditionally —
  // the same focus theft ClearFocusedElement does for a host-document match. This is the bug: that
  // event used to restore nothing, so the bar accepted exactly one character.
  assert.equal(reportedCount, 1, "a guest-reported result also moved keyboard focus into the guest, so it must restore focus too");

  fakes.emitWindow({ activeMatchOrdinal: 2, matches: 98 });
  assert.deepEqual(results.at(-1), { activeMatchOrdinal: 2, matches: 98 }, 'a rerouted guest find still reaches the counter');
  assert.equal(reportedCount, 2, 'a window-reported result blurred the input and must restore focus too');

  unsubscribe();
  assert.equal(fakes.guestCount(), 0);
  assert.equal(fakes.windowCount(), 0, 'both listeners come off together');
});

test('subscribeToFindResults: a TOP target listens to the window alone', () => {
  const fakes = twoSourceFakes();
  const results: FindInPageResult[] = [];
  let reportedCount = 0;
  const unsubscribe = subscribeToFindResults({ kind: 'top' }, fakes.bridge, {
    onResult: (result) => results.push(result),
    onReported: () => {
      reportedCount += 1;
    },
  });
  assert.equal(fakes.guestCount(), 0, 'no guest element to listen to');
  fakes.emitWindow({ activeMatchOrdinal: 3, matches: 12 });
  assert.deepEqual(results, [{ activeMatchOrdinal: 3, matches: 12 }]);
  assert.equal(reportedCount, 1);
  unsubscribe();
  assert.equal(fakes.windowCount(), 0);
});

test('subscribeToFindResults: no bridge (outside a desktop window) still subscribes a guest, restores focus on its own event, and unsubscribing is safe', () => {
  const fakes = twoSourceFakes();
  let reportedCount = 0;
  const unsubscribe = subscribeToFindResults({ kind: 'guest', element: fakes.guest }, undefined, {
    onResult: () => {},
    onReported: () => {
      reportedCount += 1;
    },
  });
  assert.equal(fakes.guestCount(), 1);
  fakes.emitGuest({ activeMatchOrdinal: 1, matches: 1 });
  assert.equal(reportedCount, 1, 'no bridge to relay a window result, but the guest still took focus and still needs it restored');
  assert.doesNotThrow(unsubscribe);
  assert.equal(fakes.guestCount(), 0);
  assert.doesNotThrow(() => subscribeToFindResults({ kind: 'none' }, undefined, { onResult: () => {}, onReported: () => {} })());
});

test('shouldReclaimFindFocus: only while open and within FIND_FOCUS_RECLAIM_MS of the last issued find', () => {
  assert.equal(
    shouldReclaimFindFocus({ open: true, lastFindAt: 1000, now: 1000 + FIND_FOCUS_RECLAIM_MS - 1 }),
    true,
    'still within the reclaim window',
  );
  assert.equal(
    shouldReclaimFindFocus({ open: true, lastFindAt: 1000, now: 1000 + FIND_FOCUS_RECLAIM_MS }),
    false,
    'the window has passed — a genuine click away from the bar should not be undone',
  );
  assert.equal(shouldReclaimFindFocus({ open: false, lastFindAt: 1000, now: 1000 }), false, 'the bar is closed');
  assert.equal(
    shouldReclaimFindFocus({ open: true, lastFindAt: null, now: 1000 }),
    false,
    'no find has been issued yet — a user click-away must not be undone',
  );
});
