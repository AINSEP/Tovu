/**
 * @file The sites home window's Cmd+F find bar: opening it, routing a query to whichever surface is
 * actually on screen, and the match counter ("3 of 17") that surface reports back.
 *
 * **Two different targets, two different mechanisms.** When a project tab is the visible surface,
 * its `<webview>` guest is the target, and Electron's `WebviewTag` exposes `findInPage`/
 * `stopFindInPage` and a `found-in-page` event directly on that DOM element — no IPC needed, the
 * renderer already holds the node (`registerGuest`, wired from `App.tsx`'s `SiteWorkspace` the same
 * way `guestRef` already is). When the Projects screen itself is on screen (no tab visible), there
 * is no such element for the window's OWN top-level content — `webContents` is main-process-only —
 * so that target goes through `contracts/find-in-page.ts`'s IPC channels
 * (`find-in-page-ipc.ts`/`RunnerInventoryBridge.findInPage`) instead. {@link resolveFindTarget}
 * is the one place that decides which.
 *
 * **Opening needs main; everything after does not.** Cmd+F is a menu accelerator
 * (`find-menu.ts`) because it is the one key binding that still fires while focus is inside a
 * project tab's `<webview>` guest — the same gap `App.hooks.ts`'s `useExpandedMode` documents for
 * Escape. Once the bar is open, typing, Enter, Shift+Enter and Escape are ordinary keydowns on the
 * bar's own input, which lives in THIS document (`App.tsx`'s `FindBar`), so only `onFindToggle`
 * needs the bridge.
 *
 * **`findNext`'s meaning is Electron's own, and it reads backwards.** `true` begins a NEW search
 * session (the right value for a fresh or changed query); `false` is a follow-up within the current
 * session (the right value for stepping to the next/previous match). See {@link runFind}.
 *
 * Every decision is a plain exported function, so `use-find-in-page.hooks.test.ts` covers them with
 * fakes — this package has no React renderer, same constraint `use-site-workspace.hooks.ts` and
 * `use-site-rename.hooks.ts` document for their own hooks.
 */
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { runnerInventoryBridge, type RunnerInventoryBridge } from './runner-api.js';
import type { FindInPageResult } from '../contracts/find-in-page.js';

/** The slice of Electron's `<webview>` this file drives. A fake of it is what tests pass. */
export type FindableGuest = Pick<HTMLWebViewElement, 'findInPage' | 'stopFindInPage' | 'addEventListener' | 'removeEventListener'>;

/** The slice of {@link RunnerInventoryBridge} this file drives. */
export type FindBridge = Pick<RunnerInventoryBridge, 'onFindToggle' | 'findInPage' | 'stopFindInPage' | 'onFindResult'>;

export interface FindBarState {
  readonly open: boolean;
  readonly query: string;
  readonly result: FindInPageResult | null;
  /** Bumped on every `toggle`, including a repeat Cmd+F while already open — see `useFindInPage`'s
   *  focus effect, which keys on this rather than on `open` so a second Cmd+F still refocuses. */
  readonly focusNonce: number;
}

export const initialFindBarState: FindBarState = { open: false, query: '', result: null, focusNonce: 0 };

export type FindBarAction =
  | { type: 'toggle' }
  | { type: 'set-query'; query: string }
  | { type: 'result'; result: FindInPageResult }
  | { type: 'close' };

/**
 * @complexity O(1).
 */
export function findBarReducer(state: FindBarState, action: FindBarAction): FindBarState {
  switch (action.type) {
    case 'toggle':
      return { ...state, open: true, focusNonce: state.focusNonce + 1 };
    case 'set-query':
      // A cleared query drops the last result at once rather than leaving a stale "3 of 17" up
      // while `runFind`'s own stop-instead-of-search takes effect.
      return { ...state, query: action.query, result: action.query === '' ? null : state.result };
    case 'result':
      return { ...state, result: action.result };
    case 'close':
      return initialFindBarState;
  }
}

/** Which surface a search should run against right now. */
export type FindTarget = { kind: 'guest'; element: FindableGuest } | { kind: 'top' } | { kind: 'none' };

/**
 * Decides {@link FindTarget}: the visible project tab's guest when one is on screen and its element
 * has actually mounted, otherwise the window's own top-level page — as long as a bridge exists to
 * reach it (never true outside a real desktop window). `'none'` only when neither is available,
 * which callers treat as an inert no-op rather than an error.
 *
 * @complexity O(1) — one `Map.get`.
 */
export function resolveFindTarget(input: {
  activeGuestId: string | null;
  guests: ReadonlyMap<string, FindableGuest>;
  bridge: FindBridge | undefined;
}): FindTarget {
  if (input.activeGuestId !== null) {
    const element = input.guests.get(input.activeGuestId);
    if (element) return { kind: 'guest', element };
  }
  return input.bridge ? { kind: 'top' } : { kind: 'none' };
}

/**
 * Runs one `findInPage` request against `target`. A guest not yet attached throws from every
 * method (same as `use-site-workspace.hooks.ts`'s guest calls) — swallowed here because there is
 * nothing to recover: the next query change or keypress tries again against whatever is mounted by
 * then.
 *
 * @param options.findNext Electron's own meaning, not the button's: `true` begins a NEW session
 *   (pass it for a query CHANGE), `false` is a follow-up within the current one (pass it for
 *   Enter/Shift+Enter). See this file's own header.
 * @complexity O(1) beyond Chromium's own search cost.
 */
export function runFind(target: FindTarget, bridge: FindBridge | undefined, text: string, options: { forward: boolean; findNext: boolean }): void {
  if (target.kind === 'guest') {
    try {
      target.element.findInPage(text, options);
    } catch {
      // Not attached yet — nothing to recover; see this function's own doc.
    }
    return;
  }
  if (target.kind === 'top') void bridge?.findInPage({ text, ...options });
}

/**
 * Stops any in-flight search on `target` and clears its highlights. Same not-attached-yet tolerance
 * as {@link runFind}.
 *
 * @complexity O(1).
 */
export function stopFind(target: FindTarget, bridge: FindBridge | undefined): void {
  if (target.kind === 'guest') {
    try {
      target.element.stopFindInPage('clearSelection');
    } catch {
      // Not attached yet — nothing to stop.
    }
    return;
  }
  if (target.kind === 'top') void bridge?.stopFindInPage();
}

/** The bar's own counter text: `"<ordinal> of <total>"`, or `"No results"` once a query has
 *  actually returned zero matches — never shown for an empty query, which has no `result` yet
 *  (see `findBarReducer`'s `set-query`). */
export function formatMatchCount(result: FindInPageResult | null): string {
  if (result === null) return '';
  if (result.matches === 0) return 'No results';
  return `${result.activeMatchOrdinal} of ${result.matches}`;
}

export interface FindInPage {
  open: boolean;
  query: string;
  result: FindInPageResult | null;
  /** Text for the counter — see {@link formatMatchCount}. */
  countLabel: string;
  inputRef: (node: HTMLInputElement | null) => void;
  setQuery: (text: string) => void;
  next: () => void;
  previous: () => void;
  close: () => void;
  /** Wired into every mounted project tab's `<webview>` ref — see `useComposedGuestRef`. `null`
   *  deregisters (the tab closed or its guest remounted). */
  registerGuest: (projectId: string, element: FindableGuest | null) => void;
}

/**
 * The find bar's whole state machine: open/close, the query, the live target, and the result
 * whichever target reports.
 *
 * @param activeGuestId the visible project tab's id, or `null` when the Projects screen itself is
 *   on screen (`App`'s `showSiteTab ? visibleWorkspaceId : null`).
 * @complexity O(1) per action, beyond `runFind`/`stopFind`'s own cost.
 */
export function useFindInPage(activeGuestId: string | null): FindInPage {
  const [state, dispatch] = useReducer(findBarReducer, initialFindBarState);
  const bridge = runnerInventoryBridge();
  // A ref, not state: registering a guest must never itself trigger a render — every mounted tab
  // calls it on every commit (see `useComposedGuestRef`), and the map's CONTENTS are only ever read
  // at the moment a search actually runs, never rendered.
  const guests = useRef(new Map<string, FindableGuest>()).current;
  const inputElement = useRef<HTMLInputElement | null>(null);

  const registerGuest = useCallback(
    (projectId: string, element: FindableGuest | null) => {
      if (element) guests.set(projectId, element);
      else guests.delete(projectId);
    },
    [guests],
  );

  const target = resolveFindTarget({ activeGuestId, guests, bridge });

  // The app menu's Find (Cmd+F): open (or, if already open, bump `focusNonce` so the effect below
  // refocuses even though `open` itself does not change).
  useEffect(() => {
    if (!bridge) return undefined;
    return bridge.onFindToggle(() => dispatch({ type: 'toggle' }));
  }, [bridge]);

  // Focuses and selects the input every time the bar opens OR is re-summoned while already open —
  // matching Chrome's own Cmd+F, which reselects the existing query for a fast re-type.
  useEffect(() => {
    if (!state.open) return;
    inputElement.current?.focus();
    inputElement.current?.select();
  }, [state.open, state.focusNonce]);

  // Subscribes to results from whichever target is live, only while the bar is open — an empty
  // query never subscribes at all (see the early return), matching `runFind`'s own stop-not-search.
  useEffect(() => {
    if (!state.open || state.query === '') return undefined;
    if (target.kind === 'guest') {
      const onFound = (event: WebviewFoundInPageEvent) => dispatch({ type: 'result', result: event.result });
      target.element.addEventListener('found-in-page', onFound);
      return () => target.element.removeEventListener('found-in-page', onFound);
    }
    if (target.kind === 'top') return bridge?.onFindResult((result) => dispatch({ type: 'result', result }));
    return undefined;
    // `target` is a fresh object every render (`resolveFindTarget` builds one), so this depends on
    // its STABLE identity components instead — the guest map is a ref (never itself a dependency
    // trigger) and `activeGuestId` is what actually changes which entry it names.
    // biome-ignore lint/correctness/useExhaustiveDependencies: depends on target's stable inputs (activeGuestId, bridge), not the fresh `target` object itself — see the comment above.
  }, [state.open, state.query === '', activeGuestId, bridge]);

  // A query change — including the FIRST non-empty character — is a NEW search session
  // (`findNext: true`, per this file's header); clearing back to '' stops it instead of searching
  // for nothing.
  useEffect(() => {
    if (!state.open) return;
    if (state.query === '') {
      stopFind(target, bridge);
      return;
    }
    runFind(target, bridge, state.query, { forward: true, findNext: true });
    // biome-ignore lint/correctness/useExhaustiveDependencies: depends on target's stable inputs (activeGuestId), not the fresh `target`/`bridge` objects themselves.
  }, [state.query, state.open, activeGuestId]);

  const close = () => {
    stopFind(target, bridge);
    dispatch({ type: 'close' });
  };

  return {
    open: state.open,
    query: state.query,
    result: state.result,
    countLabel: formatMatchCount(state.result),
    inputRef: (node) => {
      inputElement.current = node;
    },
    setQuery: (text) => dispatch({ type: 'set-query', query: text }),
    // Follow-up requests within the current session — `findNext: false` — never a new one.
    next: () => runFind(target, bridge, state.query, { forward: true, findNext: false }),
    previous: () => runFind(target, bridge, state.query, { forward: false, findNext: false }),
    close,
    registerGuest,
  };
}

/**
 * Composes a project tab's own `guestRef` (`useSiteWorkspace`'s callback ref, which feeds
 * `useWebviewLoadFailure`'s `setGuest`) with {@link FindInPage.registerGuest}, so `App.tsx` sets ONE
 * `ref` on the `<webview>` rather than two. Memoized on its three stable inputs — `guestRef` is a
 * `useState` setter (always stable), `registerGuest` is `useCallback`-stable, and `projectId` does
 * not change for a mounted tab's own instance — so this is not a fresh function every render, which
 * would otherwise make React detach and reattach the ref on every commit for no reason.
 *
 * @complexity O(1).
 */
export function useComposedGuestRef(
  guestRef: (node: HTMLWebViewElement | null) => void,
  registerGuest: (projectId: string, element: FindableGuest | null) => void,
  projectId: string,
): (node: HTMLWebViewElement | null) => void {
  return useCallback(
    (node: HTMLWebViewElement | null) => {
      guestRef(node);
      registerGuest(projectId, node);
    },
    [guestRef, registerGuest, projectId],
  );
}
