/**
 * @file One project tab's toolbar: which surface the tab asked for, where its guest actually is,
 * whether it can go back or forward, and how Reload, the view toggle and Cmd+[ / Cmd+] reach the
 * guest.
 *
 * **Reload keeps history.** A healthy guest reloads through `webview.reload()`, which leaves its
 * session history alone. Remounting the `<webview>` (a `reloadNonce` bump, which is its `key`)
 * throws that history away with the process, so it is kept only for the case it was built for:
 * recovering a guest that FAILED or STALLED (`useWebviewLoadFailure`), or one that cannot take an
 * imperative call yet. A soft load still changes `loadResetKey`, so the stall timer re-arms for it
 * exactly as it did when every reload was a remount.
 *
 * **`view` is what was asked for; `liveUrl` is where the guest is.** Back and Forward can cross
 * between the admin and the public site, and `src` must not be rewritten to follow them: changing
 * `src` is itself a navigation, and it would wipe the forward stack the operator just made. So the
 * toggle's highlight and the url text follow `liveUrl`, `src` follows `view`, and choosing the
 * surface `src` already names loads it with `loadURL` because re-setting `src` would do nothing.
 *
 * Every decision is a plain exported function (the reducer, `createWorkspaceActions`,
 * `trackGuestNavigation`, `subscribeSiteHistory`), so `use-site-workspace.hooks.test.ts` covers
 * them with a fake guest. This package has no React renderer; `useSiteWorkspace` only wires them to
 * `useReducer` and two effects.
 */
import { useEffect, useReducer, type Dispatch } from 'react';
import { useWebviewLoadFailure } from './App.hooks.js';
import { runnerInventoryBridge, type RunnerInventoryBridge } from './runner-api.js';
import type { SiteHistoryCommand, SiteRecord, SiteSurface } from '../contracts/project.js';

/** Whether the guest's own session history has an entry either side of the current one. */
export interface SiteHistory {
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
}

const NO_HISTORY: SiteHistory = { canGoBack: false, canGoForward: false };

/** The slice of Electron's `<webview>` this file drives. A fake of it is what the tests pass. */
export type WorkspaceGuest = Pick<
  HTMLWebViewElement,
  'canGoBack' | 'canGoForward' | 'goBack' | 'goForward' | 'reload' | 'loadURL' | 'addEventListener' | 'removeEventListener'
>;

export interface SiteWorkspaceState {
  /** The surface the toggle last asked for. `src` is built from this, and only this. */
  readonly view: SiteSurface;
  /** The `<webview>`'s `key`. Bumping it remounts the guest, which is recovery, not reload. */
  readonly reloadNonce: number;
  /** Imperative loads (`reload()`, `loadURL()`) that kept the guest. Only feeds `loadResetKey`. */
  readonly softLoads: number;
  /** The main frame's url as the guest last reported it; `null` until it reports one. */
  readonly liveUrl: string | null;
  readonly history: SiteHistory;
}

export const initialSiteWorkspaceState: SiteWorkspaceState = {
  view: 'admin',
  reloadNonce: 0,
  softLoads: 0,
  liveUrl: null,
  history: NO_HISTORY,
};

export type SiteWorkspaceAction =
  | { type: 'select-view'; view: SiteSurface }
  | { type: 'remount' }
  | { type: 'soft-load' }
  /** `url` is `null` for a subframe's in-page navigation: it moves history, not the main url. */
  | { type: 'navigated'; url: string | null; history: SiteHistory }
  | { type: 'guest-changed'; history: SiteHistory };

/**
 * @complexity O(1).
 */
export function siteWorkspaceReducer(state: SiteWorkspaceState, action: SiteWorkspaceAction): SiteWorkspaceState {
  switch (action.type) {
    case 'select-view':
      // Highlight the choice at once; the guest's next `did-navigate` says where it really landed.
      return { ...state, view: action.view, liveUrl: null };
    case 'remount':
      return { ...state, reloadNonce: state.reloadNonce + 1 };
    case 'soft-load':
      return { ...state, softLoads: state.softLoads + 1 };
    case 'navigated':
      return { ...state, liveUrl: action.url ?? state.liveUrl, history: action.history };
    case 'guest-changed':
      return { ...state, liveUrl: null, history: action.history };
  }
}

/**
 * `useWebviewLoadFailure`'s reset key. Any fresh load clears a stale failure and re-arms the stall
 * timer: a remount, a view switch, or a soft load on the guest already mounted.
 */
export function loadResetKey(state: SiteWorkspaceState): string {
  return `${state.reloadNonce}:${state.view}:${state.softLoads}`;
}

/** Trailing slash on `/admin/` on purpose: `/admin` answers 301, a visible flash on every open. */
export function siteSurfaceUrl(port: number, view: SiteSurface): string {
  return `http://127.0.0.1:${port}${view === 'site' ? '/' : '/admin/'}`;
}

/** Which surface a guest url belongs to: the admin by its path, everything else is the site. */
export function surfaceOfUrl(url: string): SiteSurface {
  const { pathname } = new URL(url);
  return pathname === '/admin' || pathname.startsWith('/admin/') ? 'admin' : 'site';
}

/** The surface on screen: the guest's own url once it has reported one, the request until then. */
function liveSurface(state: SiteWorkspaceState): SiteSurface {
  return state.liveUrl === null ? state.view : surfaceOfUrl(state.liveUrl);
}

/**
 * Reads the guest's history, or no history when there is no guest or it cannot answer yet —
 * Electron throws from every `<webview>` method until the guest is attached.
 */
export function readHistory(guest: WorkspaceGuest | null): SiteHistory {
  if (guest === null) return NO_HISTORY;
  try {
    return { canGoBack: guest.canGoBack(), canGoForward: guest.canGoForward() };
  } catch {
    return NO_HISTORY;
  }
}

/**
 * Reports every main-frame navigation's url and the history it left behind.
 *
 * Both events, because the admin is a single-page app: its router `pushState`s, which Chromium
 * records as history but reports only as `did-navigate-in-page`. A subframe's in-page navigation
 * is history too, so it refreshes the arrows, but its url is not the page's.
 *
 * @returns the teardown that detaches both listeners.
 */
export function trackGuestNavigation(guest: WorkspaceGuest, dispatch: Dispatch<SiteWorkspaceAction>): () => void {
  const onNavigate = (event: WebviewDidNavigateEvent) => {
    dispatch({ type: 'navigated', url: event.url, history: readHistory(guest) });
  };
  const onNavigateInPage = (event: WebviewDidNavigateInPageEvent) => {
    dispatch({ type: 'navigated', url: event.isMainFrame ? event.url : null, history: readHistory(guest) });
  };
  guest.addEventListener('did-navigate', onNavigate);
  guest.addEventListener('did-navigate-in-page', onNavigateInPage);
  return () => {
    guest.removeEventListener('did-navigate', onNavigate);
    guest.removeEventListener('did-navigate-in-page', onNavigateInPage);
  };
}

/**
 * One step back or forward, asked of the guest itself at the moment of the step rather than of the
 * last rendered state.
 *
 * @returns whether the guest was told to move.
 */
export function stepHistory(guest: WorkspaceGuest | null, command: SiteHistoryCommand): boolean {
  const history = readHistory(guest);
  const allowed = command === 'back' ? history.canGoBack : history.canGoForward;
  if (guest === null || !allowed) return false;
  if (command === 'back') guest.goBack();
  else guest.goForward();
  return true;
}

/**
 * Routes the app menu's Back/Forward (Cmd+[ / Cmd+]) to this tab. Every open tab stays mounted, so
 * only the one on screen subscribes; with no site tab showing, every tab is hidden and the
 * accelerator does nothing.
 *
 * @returns the unsubscribe, or `undefined` when this tab is hidden or there is no desktop bridge.
 */
export function subscribeSiteHistory(input: {
  bridge: RunnerInventoryBridge | undefined;
  hidden: boolean;
  guest: WorkspaceGuest | null;
}): (() => void) | undefined {
  if (input.hidden || input.bridge === undefined) return undefined;
  return input.bridge.onSiteHistory((command) => void stepHistory(input.guest, command));
}

export interface WorkspaceActions {
  reload: () => void;
  /** The recovery panels' retry: always a remount, because the guest it replaces failed. */
  recover: () => void;
  goBack: () => void;
  goForward: () => void;
  selectView: (option: SiteSurface) => void;
  openInBrowser: () => void;
}

/**
 * The toolbar's actions over one render's guest, flags and state.
 *
 * @complexity O(1) per action.
 */
export function createWorkspaceActions(input: {
  guest: WorkspaceGuest | null;
  failed: boolean;
  stalled: boolean;
  state: SiteWorkspaceState;
  dispatch: Dispatch<SiteWorkspaceAction>;
  bridge: RunnerInventoryBridge | undefined;
  siteId: string;
  port: number;
}): WorkspaceActions {
  const { guest, state, dispatch } = input;
  const surface = liveSurface(state);
  const remount = () => dispatch({ type: 'remount' });
  // A guest that is not attached yet throws from `reload()`/`loadURL()`; remounting it is the only
  // load left to try.
  const loadOrRemount = (load: (target: WorkspaceGuest) => void) => {
    if (guest === null) return remount();
    try {
      load(guest);
    } catch {
      return remount();
    }
    dispatch({ type: 'soft-load' });
  };

  return {
    reload: () => (input.failed || input.stalled ? remount() : loadOrRemount((target) => target.reload())),
    recover: remount,
    goBack: () => void stepHistory(guest, 'back'),
    goForward: () => void stepHistory(guest, 'forward'),
    selectView: (option) => {
      if (option === surface) return;
      dispatch({ type: 'select-view', view: option });
      // A different `src` is the navigation. The same `src` would navigate nowhere, so load it.
      if (option !== state.view) return;
      // `loadURL` rejects when a newer navigation aborts it, which is ordinary, not a failure.
      loadOrRemount((target) => void target.loadURL(siteSurfaceUrl(input.port, option)).catch(() => undefined));
    },
    // An id and a surface, never a url: main rebuilds the url from the registry row. A rejection
    // means the project stopped existing, and the next poll takes the tab away.
    openInBrowser: () => void input.bridge?.openSiteExternal({ siteId: input.siteId, view: surface }).catch(() => undefined),
  };
}

export interface SiteWorkspace extends WorkspaceActions {
  /** The guest's `src`: the requested surface's root. */
  src: string;
  /** The url to show: where the guest is, or where it was sent until it says. */
  displayUrl: string;
  /** The surface on screen, for the toggle's highlight. */
  surface: SiteSurface;
  history: SiteHistory;
  reloadNonce: number;
  failed: boolean;
  stalled: boolean;
  guestRef: (node: HTMLWebViewElement | null) => void;
}

/**
 * Per tab, never lifted into `App`: every open project stays mounted at once, so a shared value
 * would move every other tab's guest too.
 */
export function useSiteWorkspace(project: SiteRecord, hidden: boolean): SiteWorkspace {
  const [state, dispatch] = useReducer(siteWorkspaceReducer, initialSiteWorkspaceState);
  const { failed, stalled, guest, guestRef } = useWebviewLoadFailure(loadResetKey(state));

  // A new guest node (a remount, or the guest appearing at all) has its own, empty history.
  useEffect(() => {
    dispatch({ type: 'guest-changed', history: readHistory(guest) });
    return guest === null ? undefined : trackGuestNavigation(guest, dispatch);
  }, [guest]);

  useEffect(() => subscribeSiteHistory({ bridge: runnerInventoryBridge(), hidden, guest }), [hidden, guest]);

  const src = siteSurfaceUrl(project.port, state.view);
  const actions = createWorkspaceActions({
    guest,
    failed,
    stalled,
    state,
    dispatch,
    bridge: runnerInventoryBridge(),
    siteId: project.id,
    port: project.port,
  });
  return {
    ...actions,
    src,
    displayUrl: state.liveUrl ?? src,
    surface: liveSurface(state),
    history: state.history,
    reloadNonce: state.reloadNonce,
    failed,
    stalled,
    guestRef,
  };
}
