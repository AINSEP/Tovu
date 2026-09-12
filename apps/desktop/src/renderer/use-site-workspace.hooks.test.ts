/**
 * @file Behavioural tests for `use-site-workspace.hooks.ts`: the project tab toolbar's back, forward
 * and reload buttons, the Cmd+[ / Cmd+] routing, and the failed-load remount that has to survive
 * Reload no longer being a remount.
 *
 * `useSiteWorkspace` itself calls React hooks, and this package has no React renderer (see
 * `use-site-rename.hooks.test.ts`'s header). Every decision it makes is a plain exported function,
 * so these tests call those directly with a fake `<webview>` that records its own calls. Nothing
 * here asserts against source text; `site-toolbar-wiring.test.ts` checks that `App.tsx` uses them.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createWorkspaceActions,
  initialSiteWorkspaceState,
  loadResetKey,
  readHistory,
  siteSurfaceUrl,
  siteWorkspaceReducer,
  stepHistory,
  subscribeSiteHistory,
  surfaceOfUrl,
  trackGuestNavigation,
  type SiteWorkspaceAction,
  type SiteWorkspaceState,
  type WorkspaceGuest,
} from './use-site-workspace.hooks.js';
import type { RunnerInventoryBridge } from './runner-api.js';
import type { SiteHistoryCommand } from '../contracts/project.js';

type NavigationListener = (event: { url: string; isMainFrame?: boolean }) => void;

interface FakeGuestOptions {
  canGoBack?: boolean;
  canGoForward?: boolean;
  /** Models a guest that is not attached yet: Electron throws from every method until it is. */
  notReady?: boolean;
  /** Models `loadURL` rejecting because a newer navigation aborted it. */
  abortLoad?: boolean;
}

/** A `<webview>` stand-in that records every imperative call and holds its listeners by event name. */
function fakeGuest(options: FakeGuestOptions = {}) {
  const calls: string[] = [];
  const listeners = new Map<string, NavigationListener>();
  const ready = () => {
    if (options.notReady) throw new Error('The WebView must be attached to the DOM');
  };
  const guest = {
    canGoBack: () => {
      ready();
      return options.canGoBack ?? false;
    },
    canGoForward: () => {
      ready();
      return options.canGoForward ?? false;
    },
    goBack: () => {
      ready();
      calls.push('goBack');
    },
    goForward: () => {
      ready();
      calls.push('goForward');
    },
    reload: () => {
      ready();
      calls.push('reload');
    },
    loadURL: (url: string) => {
      ready();
      calls.push(`loadURL ${url}`);
      return options.abortLoad ? Promise.reject(new Error('ERR_ABORTED (-3)')) : Promise.resolve();
    },
    addEventListener: (event: string, listener: NavigationListener) => {
      listeners.set(event, listener);
    },
    removeEventListener: (event: string, listener: NavigationListener) => {
      if (listeners.get(event) === listener) listeners.delete(event);
    },
  };
  const fire = (event: string, payload: { url: string; isMainFrame?: boolean }) => {
    const listener = listeners.get(event);
    assert.ok(listener, `no ${event} listener is attached`);
    listener(payload);
  };
  return { guest: guest as unknown as WorkspaceGuest, calls, listeners, fire, options };
}

function recorder() {
  const dispatched: SiteWorkspaceAction[] = [];
  return { dispatched, dispatch: (action: SiteWorkspaceAction) => void dispatched.push(action) };
}

function actionsFor(input: {
  guest: WorkspaceGuest | null;
  failed?: boolean;
  stalled?: boolean;
  state?: SiteWorkspaceState;
  dispatch: (action: SiteWorkspaceAction) => void;
  bridge?: RunnerInventoryBridge;
}) {
  return createWorkspaceActions({
    guest: input.guest,
    failed: input.failed ?? false,
    stalled: input.stalled ?? false,
    state: input.state ?? initialSiteWorkspaceState,
    dispatch: input.dispatch,
    bridge: input.bridge,
    siteId: 'site-1',
    port: 4100,
  });
}

// ---------------------------------------------------------------------------------------------
// Back / forward enabled state
// ---------------------------------------------------------------------------------------------

test('a guest that is not attached yet reads as no history rather than throwing', () => {
  assert.deepEqual(readHistory(fakeGuest({ notReady: true, canGoBack: true }).guest), {
    canGoBack: false,
    canGoForward: false,
  });
  assert.deepEqual(readHistory(null), { canGoBack: false, canGoForward: false });
});

test('did-navigate re-reads canGoBack/canGoForward from the guest and reports the new url', () => {
  const fake = fakeGuest();
  const { dispatched, dispatch } = recorder();
  trackGuestNavigation(fake.guest, dispatch);

  fake.options.canGoBack = true;
  fake.fire('did-navigate', { url: 'http://127.0.0.1:4100/admin/posts' });

  assert.deepEqual(dispatched, [
    { type: 'navigated', url: 'http://127.0.0.1:4100/admin/posts', history: { canGoBack: true, canGoForward: false } },
  ]);
});

test('did-navigate-in-page (the admin router pushState) updates the arrows too', () => {
  const fake = fakeGuest({ canGoBack: true, canGoForward: true });
  const { dispatched, dispatch } = recorder();
  trackGuestNavigation(fake.guest, dispatch);

  fake.fire('did-navigate-in-page', { url: 'http://127.0.0.1:4100/admin/media', isMainFrame: true });

  assert.deepEqual(dispatched, [
    { type: 'navigated', url: 'http://127.0.0.1:4100/admin/media', history: { canGoBack: true, canGoForward: true } },
  ]);
});

test('an in-page navigation inside a SUBFRAME refreshes the arrows but never replaces the main url', () => {
  const fake = fakeGuest({ canGoBack: true });
  const { dispatched, dispatch } = recorder();
  trackGuestNavigation(fake.guest, dispatch);

  fake.fire('did-navigate-in-page', { url: 'http://127.0.0.1:4100/preview#frame', isMainFrame: false });

  assert.deepEqual(dispatched, [{ type: 'navigated', url: null, history: { canGoBack: true, canGoForward: false } }]);
  const next = siteWorkspaceReducer({ ...initialSiteWorkspaceState, liveUrl: 'http://127.0.0.1:4100/admin/' }, dispatched[0]!);
  assert.equal(next.liveUrl, 'http://127.0.0.1:4100/admin/');
});

test('the teardown detaches both navigation listeners', () => {
  const fake = fakeGuest();
  const teardown = trackGuestNavigation(fake.guest, recorder().dispatch);
  assert.deepEqual([...fake.listeners.keys()].sort(), ['did-navigate', 'did-navigate-in-page']);
  teardown();
  assert.equal(fake.listeners.size, 0);
});

test('the reducer stores what a navigation reported, and a new guest node starts with no history', () => {
  const navigated = siteWorkspaceReducer(initialSiteWorkspaceState, {
    type: 'navigated',
    url: 'http://127.0.0.1:4100/about',
    history: { canGoBack: true, canGoForward: false },
  });
  assert.equal(navigated.liveUrl, 'http://127.0.0.1:4100/about');
  assert.deepEqual(navigated.history, { canGoBack: true, canGoForward: false });

  const remounted = siteWorkspaceReducer(navigated, { type: 'guest-changed', history: { canGoBack: false, canGoForward: false } });
  assert.equal(remounted.liveUrl, null);
  assert.deepEqual(remounted.history, { canGoBack: false, canGoForward: false });
});

// ---------------------------------------------------------------------------------------------
// Back / forward commands
// ---------------------------------------------------------------------------------------------

test('Back calls goBack only when the guest can go back', () => {
  const able = fakeGuest({ canGoBack: true });
  assert.equal(stepHistory(able.guest, 'back'), true);
  assert.deepEqual(able.calls, ['goBack']);

  const unable = fakeGuest({ canGoBack: false, canGoForward: true });
  assert.equal(stepHistory(unable.guest, 'back'), false);
  assert.deepEqual(unable.calls, []);
});

test('Forward calls goForward only when the guest can go forward', () => {
  const able = fakeGuest({ canGoForward: true });
  assert.equal(stepHistory(able.guest, 'forward'), true);
  assert.deepEqual(able.calls, ['goForward']);

  const unable = fakeGuest({ canGoBack: true, canGoForward: false });
  assert.equal(stepHistory(unable.guest, 'forward'), false);
  assert.deepEqual(unable.calls, []);
});

test('Back and Forward are no-ops with no guest mounted or a guest not attached yet', () => {
  assert.equal(stepHistory(null, 'back'), false);
  assert.equal(stepHistory(fakeGuest({ notReady: true, canGoForward: true }).guest, 'forward'), false);
});

test('the toolbar actions route goBack/goForward to the guest', () => {
  const fake = fakeGuest({ canGoBack: true, canGoForward: true });
  const actions = actionsFor({ guest: fake.guest, dispatch: recorder().dispatch });
  actions.goBack();
  actions.goForward();
  assert.deepEqual(fake.calls, ['goBack', 'goForward']);
});

// ---------------------------------------------------------------------------------------------
// Reload keeps history; the remount survives only as failed/stalled recovery
// ---------------------------------------------------------------------------------------------

test('Reload on a healthy guest calls webview.reload() and does NOT remount, so history survives', () => {
  const fake = fakeGuest({ canGoBack: true });
  const { dispatched, dispatch } = recorder();
  actionsFor({ guest: fake.guest, dispatch }).reload();

  assert.deepEqual(fake.calls, ['reload']);
  assert.deepEqual(dispatched, [{ type: 'soft-load' }]);

  const next = siteWorkspaceReducer(initialSiteWorkspaceState, { type: 'soft-load' });
  assert.equal(next.reloadNonce, initialSiteWorkspaceState.reloadNonce, 'the <webview> key must not change');
  assert.notEqual(
    loadResetKey(next),
    loadResetKey(initialSiteWorkspaceState),
    'the load-failure reset key must change, or a reload that hangs is never caught by the stall timer',
  );
});

test('Reload while the load FAILED remounts the guest instead of calling reload()', () => {
  const fake = fakeGuest();
  const { dispatched, dispatch } = recorder();
  // `failed` unmounts the guest in `App.tsx`, so the hook sees no node at all.
  actionsFor({ guest: null, failed: true, dispatch }).reload();
  assert.deepEqual(dispatched, [{ type: 'remount' }]);
  assert.deepEqual(fake.calls, []);
});

test('Reload while the load STALLED remounts, even though the guest is still mounted', () => {
  const fake = fakeGuest();
  const { dispatched, dispatch } = recorder();
  actionsFor({ guest: fake.guest, stalled: true, dispatch }).reload();
  assert.deepEqual(dispatched, [{ type: 'remount' }]);
  assert.deepEqual(fake.calls, [], 'a wedged guest must not be asked to reload itself');
});

test('Reload on a guest that is not attached yet falls back to the remount', () => {
  const { dispatched, dispatch } = recorder();
  actionsFor({ guest: fakeGuest({ notReady: true }).guest, dispatch }).reload();
  assert.deepEqual(dispatched, [{ type: 'remount' }]);
});

test('the recovery panel retry always remounts, and a remount changes the <webview> key', () => {
  const { dispatched, dispatch } = recorder();
  actionsFor({ guest: fakeGuest().guest, dispatch }).recover();
  assert.deepEqual(dispatched, [{ type: 'remount' }]);

  const next = siteWorkspaceReducer(initialSiteWorkspaceState, { type: 'remount' });
  assert.equal(next.reloadNonce, initialSiteWorkspaceState.reloadNonce + 1);
  assert.notEqual(loadResetKey(next), loadResetKey(initialSiteWorkspaceState));
});

// ---------------------------------------------------------------------------------------------
// The View admin / View site toggle after history crosses between the two
// ---------------------------------------------------------------------------------------------

test('surfaceOfUrl reads the admin from its path and everything else as the site', () => {
  assert.equal(surfaceOfUrl('http://127.0.0.1:4100/admin/'), 'admin');
  assert.equal(surfaceOfUrl('http://127.0.0.1:4100/admin'), 'admin');
  assert.equal(surfaceOfUrl('http://127.0.0.1:4100/admin/posts?id=1'), 'admin');
  assert.equal(surfaceOfUrl('http://127.0.0.1:4100/'), 'site');
  assert.equal(surfaceOfUrl('http://127.0.0.1:4100/administrators'), 'site');
  assert.equal(siteSurfaceUrl(4100, 'admin'), 'http://127.0.0.1:4100/admin/');
  assert.equal(siteSurfaceUrl(4100, 'site'), 'http://127.0.0.1:4100/');
});

test('choosing the surface already on screen does nothing', () => {
  const fake = fakeGuest();
  const { dispatched, dispatch } = recorder();
  const state = { ...initialSiteWorkspaceState, view: 'site' as const, liveUrl: 'http://127.0.0.1:4100/admin/posts' };
  actionsFor({ guest: fake.guest, state, dispatch }).selectView('admin');
  assert.deepEqual(dispatched, []);
  assert.deepEqual(fake.calls, []);
});

test('choosing a surface other than the requested one changes src', () => {
  const fake = fakeGuest();
  const { dispatched, dispatch } = recorder();
  actionsFor({ guest: fake.guest, dispatch }).selectView('site');
  assert.deepEqual(dispatched, [{ type: 'select-view', view: 'site' }]);
  assert.deepEqual(fake.calls, [], 'the src change is the navigation; nothing imperative runs');
});

test('after Back crossed to the other surface, choosing the requested one loads it imperatively', async () => {
  // `src` already equals the admin url, so re-setting it would change nothing and navigate nowhere.
  // `abortLoad`: an aborted load must be swallowed, or it surfaces as an unhandled rejection.
  const fake = fakeGuest({ abortLoad: true });
  const { dispatched, dispatch } = recorder();
  const state = { ...initialSiteWorkspaceState, view: 'admin' as const, liveUrl: 'http://127.0.0.1:4100/about' };
  actionsFor({ guest: fake.guest, state, dispatch }).selectView('admin');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(fake.calls, ['loadURL http://127.0.0.1:4100/admin/']);
  assert.deepEqual(dispatched, [{ type: 'select-view', view: 'admin' }, { type: 'soft-load' }]);
});

test('that imperative load falls back to a remount when the guest cannot take it', () => {
  const { dispatched, dispatch } = recorder();
  const state = { ...initialSiteWorkspaceState, view: 'admin' as const, liveUrl: 'http://127.0.0.1:4100/about' };
  actionsFor({ guest: null, state, dispatch }).selectView('admin');
  assert.deepEqual(dispatched, [{ type: 'select-view', view: 'admin' }, { type: 'remount' }]);
});

test('selecting a view highlights it at once, until the guest reports where it landed', () => {
  const state = { ...initialSiteWorkspaceState, liveUrl: 'http://127.0.0.1:4100/admin/posts' };
  const next = siteWorkspaceReducer(state, { type: 'select-view', view: 'site' });
  assert.equal(next.view, 'site');
  assert.equal(next.liveUrl, null);
});

test('Open in browser sends the surface on screen, not the one last requested', async () => {
  const sent: Array<{ siteId: string; view: string }> = [];
  const bridge = {
    openSiteExternal: (input: { siteId: string; view: string }) => {
      sent.push(input);
      // Rejects the way a project removed since the last poll does; that must not escape.
      return Promise.reject(new Error('unknown site'));
    },
  } as unknown as RunnerInventoryBridge;
  const state = { ...initialSiteWorkspaceState, view: 'admin' as const, liveUrl: 'http://127.0.0.1:4100/about' };
  actionsFor({ guest: null, state, dispatch: recorder().dispatch, bridge }).openInBrowser();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(sent, [{ siteId: 'site-1', view: 'site' }]);
});

// ---------------------------------------------------------------------------------------------
// Cmd+[ / Cmd+] routing
// ---------------------------------------------------------------------------------------------

function fakeHistoryBridge() {
  const subscribers: Array<(command: SiteHistoryCommand) => void> = [];
  let unsubscribed = 0;
  const bridge = {
    onSiteHistory: (listener: (command: SiteHistoryCommand) => void) => {
      subscribers.push(listener);
      return () => {
        unsubscribed += 1;
      };
    },
  } as unknown as RunnerInventoryBridge;
  return { bridge, subscribers, unsubscribedCount: () => unsubscribed };
}

test('a HIDDEN tab does not subscribe to the accelerator, so only the active tab moves', () => {
  const fake = fakeHistoryBridge();
  assert.equal(subscribeSiteHistory({ bridge: fake.bridge, hidden: true, guest: fakeGuest({ canGoBack: true }).guest }), undefined);
  assert.equal(fake.subscribers.length, 0);
});

test('the visible tab steps its own guest back and forward on the accelerator', () => {
  const fake = fakeHistoryBridge();
  const guest = fakeGuest({ canGoBack: true, canGoForward: true });
  const teardown = subscribeSiteHistory({ bridge: fake.bridge, hidden: false, guest: guest.guest });
  assert.equal(fake.subscribers.length, 1);

  fake.subscribers[0]!('back');
  fake.subscribers[0]!('forward');
  assert.deepEqual(guest.calls, ['goBack', 'goForward']);

  assert.ok(teardown);
  teardown();
  assert.equal(fake.unsubscribedCount(), 1);
});

test('the accelerator is a no-op on a visible tab whose guest is not mounted', () => {
  const fake = fakeHistoryBridge();
  subscribeSiteHistory({ bridge: fake.bridge, hidden: false, guest: null });
  assert.doesNotThrow(() => fake.subscribers[0]!('back'));
});

test('with no desktop bridge there is nothing to subscribe to', () => {
  assert.equal(subscribeSiteHistory({ bridge: undefined, hidden: false, guest: fakeGuest().guest }), undefined);
});
