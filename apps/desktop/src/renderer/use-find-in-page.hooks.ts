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
 * **The top-level target searches the document this bar is IN, so the bar's own caret is in the
 * way as a search ANCHOR — not, it turns out, as the cause of the focus loss below.** Chromium
 * anchors a find on the frame's live selection when there is one; with a caret sitting in the find
 * input, every search re-anchored on the bar's own position instead of advancing past the previous
 * match, so Enter appeared to do nothing. {@link runFind} clears the selection itself, first, for
 * that target only — a `<webview>` guest searches its own document, which this frame's selection
 * has no bearing on.
 *
 * **Every match steals keyboard focus, and that is `TextFinder::FindInternal`'s own doing, not a
 * side effect of clearing the selection.** Chromium's finder runs `ClearFocusedElement()` then
 * `SetFocusedFrame()` on the searched frame unconditionally, on every match, whichever target. For
 * a top-level match that blurs the find input, which lives in the very document being searched. For
 * a guest match it moves keyboard focus into the GUEST frame instead — same mechanism, same result:
 * the host input loses focus. A focused text input always holds a selection (a caret is one), so
 * there is no way to keep focus through the search either way; {@link restoreFindInputFocus}
 * restores it after.
 *
 * **A guest's find does not always stay in the guest, and that is Chromium's doing, not ours.**
 * `WebContents::GetFindRequestManager` walks UP the outer-WebContents chain and reuses the first
 * manager it finds. A `<webview>` guest is an inner WebContents of this window, so the moment the
 * window itself has run one find — one Cmd+F on the Projects screen is enough — every later guest
 * find is served by the WINDOW's manager instead of the guest's own. Measured, not assumed: with a
 * cold window the guest reports `1 of 98` on its own `found-in-page` and the window reports
 * nothing; after a single `webContents.findInPage` on the window, the identical guest find reports
 * on the WINDOW and the guest's event never fires. Nothing in the renderer can opt out, so this
 * file tolerates both: {@link runFind} clears this frame's selection for either target, results are
 * subscribed from both sources whenever a guest is the target, and focus is restored for EVERY
 * reported result regardless of which source carried it — see {@link subscribeToFindResults}'s
 * `onReported`. Left unhandled on the guest's own event, the bar took exactly one keystroke before
 * every later character fell through to whatever frame Chromium had just focused.
 *
 * **`findNext`'s meaning is Electron's own, and it reads backwards.** `true` begins a NEW search
 * session (the right value for a fresh or changed query); `false` is a follow-up within the current
 * session (the right value for stepping to the next/previous match). See {@link runFind}.
 *
 * Every decision is a plain exported function, so `use-find-in-page.hooks.test.ts` covers them with
 * fakes — this package has no React renderer, same constraint `use-site-workspace.hooks.ts` and
 * `use-site-rename.hooks.ts` document for their own hooks. The hook itself is additionally rendered
 * from this module under jsdom, with its `bridge`/`clock` ports injected
 * ({@link FindInPagePorts}), in `use-find-in-page.jsdom.test.ts`.
 */
import { useCallback } from 'react';
import { runnerInventoryBridge } from './runner-api.js';
import type { FindInPageResult } from '../contracts/find-in-page.js';
import type { FindBridge, FindableGuest } from './find-target.js';
import { formatMatchCount } from './find-bar-state.js';
import { liveFindClock, type FindFocusClock } from './find-focus-clock.js';
import { useFindBarState as useFindBarStateHook } from './use-find-bar-state.hooks.js';
import { useFindFocusReclaim as useFindFocusReclaimHook } from './use-find-focus-reclaim.hooks.js';
import { useFindBarEffects as useFindBarEffectsHook } from './use-find-bar-effects.hooks.js';
import { useFindInputBinding as useFindInputBindingHook } from './use-find-input-binding.hooks.js';

export interface FindInPage {
  open: boolean;
  query: string;
  result: FindInPageResult | null;
  /** Text for the counter — see {@link formatMatchCount}. */
  countLabel: string;
  inputRef: (node: HTMLInputElement | null) => void;
  setQuery: (input: { text: string }) => void;
  next: () => void;
  previous: () => void;
  close: () => void;
  /** Wired into every mounted project tab's `<webview>` ref — see `useComposedGuestRef`. `null`
   *  deregisters (the tab closed or its guest remounted). */
  registerGuest: (projectId: string, element: FindableGuest | null) => void;
}

/** Optional ports for {@link useFindInPage}; production passes none. */
export interface FindInPagePorts {
  /** Defaults to this window's preload bridge (absent outside a real desktop window). */
  bridge?: FindBridge;
  /** Defaults to {@link liveFindClock}. */
  clock?: FindFocusClock;
  useFindBarState?: typeof useFindBarStateHook;
  useFindFocusReclaim?: typeof useFindFocusReclaimHook;
  useFindBarEffects?: typeof useFindBarEffectsHook;
  useFindInputBinding?: typeof useFindInputBindingHook;
}

/**
 * The find bar's whole state machine: open/close, the query, the live target, and the result
 * whichever target reports.
 *
 * @param input.activeGuestId the visible project tab's id, or `null` when the Projects screen itself is
 *   on screen (`App`'s `showSiteTab ? visibleWorkspaceId : null`).
 * @complexity O(1) per action, beyond `runFind`/`stopFind`'s own cost.
 */
export function useFindInPage(
  { activeGuestId }: { activeGuestId: string | null }, { bridge = runnerInventoryBridge(), clock = liveFindClock, useFindBarState = useFindBarStateHook, useFindFocusReclaim = useFindFocusReclaimHook, useFindBarEffects = useFindBarEffectsHook, useFindInputBinding = useFindInputBindingHook }: FindInPagePorts = {},
): FindInPage {
  const {
    state, dispatch, guests, inputElement, lastFindAt, reclaimTimer, restoringFocus, awaitingReport, composing, reclaimFrame, queryScheduler, registerGuest,
    target,
  } = useFindBarState({ clock, activeGuestId, bridge });
  const { cancelReclaimFrame, issueFind, clearReclaimTimer } = useFindFocusReclaim({ reclaimFrame, clock, inputElement, lastFindAt, awaitingReport, composing, restoringFocus, target, bridge, reclaimTimer });
  useFindBarEffects({
    bridge, dispatch, state, inputElement, restoringFocus, target, awaitingReport, composing, activeGuestId, queryScheduler, cancelReclaimFrame, issueFind,
    guests,
  });
  const { inputRef, close } = useFindInputBinding({
    restoringFocus, clearReclaimTimer, reclaimTimer, clock, inputElement, lastFindAt, composing, queryScheduler, cancelReclaimFrame, awaitingReport, target,
    bridge, dispatch,
  });

  return {
    open: state.open,
    query: state.query,
    result: state.result,
    countLabel: formatMatchCount({ result: state.result }),
    inputRef,
    setQuery: ({ text }) => dispatch({ type: 'set-query', query: text }),
    // Follow-up requests within the current session — `findNext: false` — never a new one.
    next: () => { if (!queryScheduler.flush()) issueFind(state.query, { forward: true, findNext: false }); },
    previous: () => { if (!queryScheduler.flush()) issueFind(state.query, { forward: false, findNext: false }); },
    close,
    registerGuest,
  };
}

/**
 * Composes a project tab's own `guestRef` (`useSiteWorkspace`'s callback ref, which feeds
 * `useWebviewLoadFailure`'s `setGuest`) with {@link FindInPage.registerGuest}, so `App.tsx` sets ONE
 * `ref` on the `<webview>` rather than two. Memoized on its stable inputs — `guestRef` is a
 * `useState` setter (always stable), `registerGuest` is `useCallback`-stable, and `projectId` does
 * not change for a mounted tab's own instance — so this is not a fresh function every render, which
 * would otherwise make React detach and reattach the ref on every commit for no reason.
 *
 * @param options.extra an optional third registration, called last, for a feature with its own per-guest
 *   registry — `use-zoom.hooks.ts`'s `registerGuest`, wrapped by its caller as
 *   `(node) => zoom.registerGuest(projectId, node)`. Not typed against `FindableGuest`: a second
 *   feature's own narrower `Pick<HTMLWebViewElement, ...>` is a different type from this file's,
 *   and the real DOM node this ref actually receives satisfies both, so the caller narrows it, not
 *   this function.
 * @complexity O(1).
 */
export function useComposedGuestRef(
  { guestRef, registerGuest, projectId }: { guestRef: (node: HTMLWebViewElement | null) => void; registerGuest: (projectId: string, element: FindableGuest | null) => void; projectId: string }, { extra }: { extra?: (node: HTMLWebViewElement | null) => void } = {},
): (node: HTMLWebViewElement | null) => void {
  return useCallback(
    (node: HTMLWebViewElement | null) => {
      guestRef(node);
      registerGuest(projectId, node);
      extra?.(node);
    },
    [guestRef, registerGuest, projectId, extra],
  );
}
