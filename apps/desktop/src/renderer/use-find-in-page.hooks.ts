import { createFindQueryScheduler } from './find-query-scheduler.js';
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
 * `use-site-rename.hooks.ts` document for their own hooks.
 */
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { runnerInventoryBridge, type RunnerInventoryBridge } from './runner-api.js';
import type { FindInPageResult } from '../contracts/find-in-page.js';

/** The slice of the DOM `Selection` API this file drives — see {@link runFind}. A fake of it is
 *  what tests pass. */
export type AnchorSelection = Pick<Selection, 'removeAllRanges'>;

/**
 * This window's own document selection, or `null` where there is no DOM at all (this package's
 * tests run on bare node — see this file's header). Only the top-level target needs it; a
 * `<webview>` guest searches its OWN document, whose selection this one cannot touch.
 *
 * @complexity O(1).
 */
export function liveAnchorSelection(): AnchorSelection | null {
  return typeof document === 'undefined' ? null : document.getSelection();
}

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
 * **The top-level target must have NO document selection when Chromium reads it, so the search
 * ANCHORS on the previous match instead of the find bar itself.** The find bar's input lives in
 * the very document that target searches, so a caret sitting in it IS this frame's selection, and
 * Chromium's find takes a live selection as the search's anchor. Left in place, every search
 * re-resolved from the find bar's own position in the DOM instead of advancing past the previous
 * match, so Enter appeared to do nothing. Clearing the selection ourselves first leaves Chromium
 * continuing from the previous match instead. This is NOT what causes the focus loss — that is
 * `ClearFocusedElement()`/`SetFocusedFrame()`, which Chromium runs unconditionally on every match
 * regardless of any selection; see this file's header and {@link restoreFindInputFocus}. Only the
 * `top` target needs the selection clear: a guest searches its own document, which this one's
 * selection has no bearing on.
 *
 * @param options.findNext Electron's own meaning, not the button's: `true` begins a NEW session
 *   (pass it for a query CHANGE), `false` is a follow-up within the current one (pass it for
 *   Enter/Shift+Enter). See this file's own header.
 * @param selection this window's own selection; defaults to the live one, so no call site can
 *   forget it. Tests pass a fake to assert it is cleared BEFORE the search, which is the whole
 *   point — a selection still standing when Chromium reads it is the bug.
 * @complexity O(1) beyond Chromium's own search cost.
 */
export function runFind(
  target: FindTarget,
  bridge: FindBridge | undefined,
  text: string,
  options: { forward: boolean; findNext: boolean },
  selection: AnchorSelection | null = liveAnchorSelection(),
): void {
  // Cleared before EITHER target's search, and only when one is actually issued. For `top` it is
  // this frame's own search anchor (below). For a guest it is insurance that costs nothing:
  // Chromium reroutes a guest's find to the WINDOW's find manager once that manager exists (see
  // this file's header), and a rerouted search reads this frame's selection as its anchor after
  // all. When it is not rerouted, the guest searches its own document and this clearing is inert.
  if (target.kind === 'guest') {
    selection?.removeAllRanges();
    try {
      target.element.findInPage(text, options);
    } catch {
      // Not attached yet — nothing to recover; see this function's own doc.
    }
    return;
  }
  if (target.kind === 'top' && bridge) {
    selection?.removeAllRanges();
    void bridge.findInPage({ text, ...options });
  }
}

/**
 * Puts focus back in the find input after ANY reported find result — every one of them means
 * Chromium just moved keyboard focus somewhere else.
 *
 * `TextFinder::FindInternal` runs unconditionally on a match, whichever frame it is in:
 * `ClearFocusedElement()` on the frame that was searched, then `SetFocusedFrame()` onto it. For a
 * top-level match that blurs the find input, which lives in the same document. For a guest match
 * it does the same to the GUEST frame, which — because a focused text input always holds a
 * selection (a caret is one) — takes keyboard focus away from the host input the identical way.
 * There is no way to keep focus through the search either way; it has to be restored after.
 * Without this the bar accepts exactly one character and Enter reaches nobody.
 *
 * **`blur()` first, then `focus()` — a bare `focus()` is a no-op exactly when it matters.** After a
 * guest match the host input is STILL this document's `activeElement` and `document.hasFocus()` is
 * still `true`: Chromium moved the BROWSER's keyboard routing into the guest without telling this
 * frame. `focus()` on an element Blink already considers focused changes nothing, so the browser
 * never hears that this frame wants the keys back, and every later OS keystroke lands in the guest.
 * Measured live with real OS keystrokes (`scripts/verify-find-in-page.ts`'s native-key phase):
 * typing "the" left "t" in the bar; a `blur()`+`focus()` between keys let every one land. Playwright's
 * `keyboard.type` never saw it — CDP delivers keys to the page it targets, not to wherever the
 * browser's focus routing points — which is why the live verifier passed while the app was broken.
 *
 * The `blur()` fires this input's own `blur` event synchronously, which `useFindInPage`'s blur
 * listener would otherwise read as another Chromium theft and answer with ANOTHER restore — a
 * blur/focus loop for the whole {@link FIND_FOCUS_RECLAIM_MS} window. `restoring` is raised for
 * exactly the duration of that `blur()` so the listener can ignore it.
 *
 * Not keyed on which target was asked, because that and where the result reports come apart: a
 * guest's find is rerouted to the window's own find manager once that manager exists, and only
 * then does the window report instead of the guest. Both sources took focus, so both call this —
 * see {@link subscribeToFindResults}'s `onReported`.
 *
 * @complexity O(1).
 */
export function restoreFindInputFocus(input: { blur(): void; focus(): void } | null, restoring: { current: boolean } = { current: false }): void {
  if (!input) return;
  restoring.current = true;
  try {
    input.blur();
  } finally {
    restoring.current = false;
  }
  input.focus();
}

/** How long after ISSUING a find a blur on the find input is treated as Chromium's own focus
 *  theft rather than the user genuinely clicking away — see {@link shouldReclaimFindFocus}. */
export const FIND_FOCUS_RECLAIM_MS = 1000;

/**
 * Whether a blur on the find input, while the bar is `open`, should be undone because it is
 * almost certainly Chromium's `ClearFocusedElement`/`SetFocusedFrame` reaction to a find this file
 * just issued — not the user clicking away. `false` once {@link FIND_FOCUS_RECLAIM_MS} has passed
 * since the last issued find (a genuine click-away has to stick), `false` when no find has been
 * issued yet (`lastFindAt: null`), and `false` when the bar is already closed.
 *
 * @complexity O(1).
 */
export function shouldReclaimFindFocus(input: { open: boolean; lastFindAt: number | null; now: number }): boolean {
  if (!input.open || input.lastFindAt === null) return false;
  return input.now - input.lastFindAt < FIND_FOCUS_RECLAIM_MS;
}

/**
 * Whether `useFindInPage`'s per-frame reclaim should restore focus again on this animation frame.
 *
 * **Why every frame, and not just once per result.** Measured live with real OS keystrokes: the
 * guest takes the keys the moment it selects its FIRST match, but its `found-in-page` only arrives
 * once it has finished COUNTING every match — 100-600ms later on a real admin page. A key typed in
 * that gap reaches the find input's `keydown` but its text is inserted into the guest instead, and
 * nothing at all — no `blur`, no `focusout`, no `document.hasFocus()` change, no main-process
 * `focus` event — fires on the host when the theft happens, so there is no signal to react to. The
 * only thing that closes the gap is re-asserting focus on every frame from the moment a find is
 * issued until it reports.
 *
 * `false` once the find has reported (`awaitingReport` — the report's own restore takes over),
 * outside {@link shouldReclaimFindFocus}'s window, and during IME composition (`composing`): a
 * `blur()` ends a composition, so reclaiming mid-composition would make the bar untypeable in any
 * input method that composes.
 *
 * @complexity O(1).
 */
export function shouldKeepReclaimingFindFocus(input: {
  open: boolean;
  lastFindAt: number | null;
  now: number;
  awaitingReport: boolean;
  composing: boolean;
}): boolean {
  if (!input.awaitingReport || input.composing) return false;
  return shouldReclaimFindFocus(input);
}

/**
 * Whether a bar that is currently `open` should close because the visible surface just changed
 * (a different tab, or Projects screen <-> a tab) — never for a re-render that left
 * `activeGuestId` the same, and never while already closed (nothing open to reset).
 *
 * Extracted as a plain decision, not inlined in the effect that calls it, for the same reason
 * every other routing choice in this file is a function: `useFindInPage` cannot be unit tested
 * directly (see this file's own header), so the DECISION has to be testable on its own.
 *
 * @complexity O(1).
 */
export function shouldCloseOnGuestChange(previousGuestId: string | null, activeGuestId: string | null, open: boolean): boolean {
  return open && previousGuestId !== activeGuestId;
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

/**
 * Subscribes to every source that could report the search running against `target`, and hands back
 * one unsubscribe for all of them.
 *
 * The WINDOW's own results are subscribed for every target, not just `top`: Chromium serves a
 * guest's find from the window's find manager once that manager exists, and then the guest's own
 * `found-in-page` never fires (see this file's header). A guest target subscribes to BOTH, because
 * which one reports is Chromium's choice and not observable from here.
 *
 * @param handlers.onResult every reported result, whichever source carried it.
 * @param handlers.onReported called first, for EVERY reported result whichever source carried
 *   it — Chromium moves keyboard focus for a guest match exactly as it does for a top-level one
 *   (`ClearFocusedElement`/`SetFocusedFrame`), so both sources need the same restore. See
 *   {@link restoreFindInputFocus}.
 * @complexity O(1); at most two listeners, both removed by the returned cleanup.
 */
export function subscribeToFindResults(
  target: FindTarget,
  bridge: FindBridge | undefined,
  handlers: { onResult: (result: FindInPageResult) => void; onReported: () => void },
): () => void {
  const unsubscribeWindow = bridge?.onFindResult((result) => {
    handlers.onReported();
    handlers.onResult(result);
  });
  if (target.kind !== 'guest') return () => unsubscribeWindow?.();
  const onFound = (event: WebviewFoundInPageEvent) => {
    handlers.onReported();
    handlers.onResult(event.result);
  };
  target.element.addEventListener('found-in-page', onFound);
  return () => {
    target.element.removeEventListener('found-in-page', onFound);
    unsubscribeWindow?.();
  };
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
  // When the last find was ISSUED (not when a result was reported) — see `issueFind` and
  // {@link shouldReclaimFindFocus}. A ref, not state: recording it must never itself trigger a
  // render.
  const lastFindAt = useRef<number | null>(null);
  // The pending deferred reclaim (see the blur listener below), so `close`/unmount can cancel one
  // scheduled for a bar that is no longer open by the time it would run.
  const reclaimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Raised while {@link restoreFindInputFocus} blurs the input itself, so the blur listener below
  // does not mistake that for a Chromium theft — see that function's doc.
  const restoringFocus = useRef(false);
  // Between ISSUING a find and its first reported result — see {@link shouldKeepReclaimingFindFocus}.
  const awaitingReport = useRef(false);
  // An IME composition is in progress in the find input — reclaiming would end it.
  const composing = useRef(false);
  const reclaimFrame = useRef<number | null>(null);
  const queryScheduler = useRef(createFindQueryScheduler({}, {})).current;

  const registerGuest = useCallback(
    (projectId: string, element: FindableGuest | null) => {
      if (element) guests.set(projectId, element);
      else guests.delete(projectId);
    },
    [guests],
  );

  const target = resolveFindTarget({ activeGuestId, guests, bridge });

  // Runs a find and records WHEN, so a blur shortly after can be told apart from the user clicking
  // away — see {@link shouldReclaimFindFocus}. Every call site that starts or steps a search goes
  // through this instead of calling `runFind` directly.
  const cancelReclaimFrame = useCallback(() => {
    if (reclaimFrame.current !== null) {
      cancelAnimationFrame(reclaimFrame.current);
      reclaimFrame.current = null;
    }
  }, []);

  // Re-asserts focus on every frame until the find just issued reports — see
  // {@link shouldKeepReclaimingFindFocus} for why no single, event-driven restore can do this.
  const reclaimUntilReported = useCallback(() => {
    cancelReclaimFrame();
    const tick = () => {
      reclaimFrame.current = null;
      const keepGoing = shouldKeepReclaimingFindFocus({
        open: inputElement.current !== null,
        lastFindAt: lastFindAt.current,
        now: performance.now(),
        awaitingReport: awaitingReport.current,
        composing: composing.current,
      });
      if (!keepGoing) return;
      restoreFindInputFocus(inputElement.current, restoringFocus);
      reclaimFrame.current = requestAnimationFrame(tick);
    };
    reclaimFrame.current = requestAnimationFrame(tick);
  }, [cancelReclaimFrame]);

  const issueFind = useCallback(
    (text: string, options: { forward: boolean; findNext: boolean }) => {
      lastFindAt.current = performance.now();
      awaitingReport.current = true;
      runFind(target, bridge, text, options);
      // Reclaim immediately for a typed query as well as on subsequent frames/results.
      if (options.findNext && !composing.current) restoreFindInputFocus(inputElement.current, restoringFocus);
      // Only for a NEW session (a typed character): Enter/Shift+Enter's step must not be disturbed
      // mid-flight. Each reclaim's focus() puts the input's caret back as this frame's selection, and
      // a follow-up find that reads it anchors on the find bar instead of the previous match (see
      // {@link runFind}) — measured live, the per-frame reclaim turned Enter's 2 -> 3 -> 4 into
      // 2 -> 3 -> 2. Stepping is keyed on Enter, not on text going into the input, so its keys are
      // not the ones the gap loses; the report's own restore still covers it.
      if (options.findNext) reclaimUntilReported();
    },
    [target, bridge, reclaimUntilReported],
  );

  const clearReclaimTimer = useCallback(() => {
    if (reclaimTimer.current !== null) {
      clearTimeout(reclaimTimer.current);
      reclaimTimer.current = null;
    }
  }, []);

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
    // blur()+focus(), not a bare focus(): Cmd+F pressed while typing in the guest leaves the browser
    // routing keys into the guest, and on a re-summon the input is already this document's
    // activeElement — a bare focus() is then a no-op the browser never hears about. See
    // {@link restoreFindInputFocus}.
    restoreFindInputFocus(inputElement.current, restoringFocus);
    inputElement.current?.select();
  }, [state.open, state.focusNonce]);

  // Subscribes to results from whichever target is live, only while the bar is open — an empty
  // query never subscribes at all (see the early return), matching `runFind`'s own stop-not-search.
  useEffect(() => {
    if (!state.open || state.query === '') return undefined;
    return subscribeToFindResults(target, bridge, {
      onReported: () => {
        awaitingReport.current = false;
        if (!composing.current) restoreFindInputFocus(inputElement.current, restoringFocus);
      },
      onResult: (result) => dispatch({ type: 'result', result }),
    });
    // `target` is a fresh object every render (`resolveFindTarget` builds one), so this depends on
    // its STABLE identity components instead — the guest map is a ref (never itself a dependency
    // trigger) and `activeGuestId` is what actually changes which entry it names.
    // biome-ignore lint/correctness/useExhaustiveDependencies: depends on target's stable inputs (activeGuestId, bridge), not the fresh `target` object itself — see the comment above.
  }, [state.open, state.query === '', activeGuestId, bridge]);

  // A query change — including the FIRST non-empty character — is a NEW search session
  // (`findNext: true`, per this file's header); clearing back to '' stops it instead of searching
  // for nothing.
  useEffect(() => {
    queryScheduler.cancel();
    if (!state.open) return;
    if (state.query === '') {
      awaitingReport.current = false;
      cancelReclaimFrame();
      stopFind(target, bridge);
      return;
    }
    const run = () => {
      // Blurring during an IME composition would discard the text still being composed.
      if (composing.current) { queryScheduler.schedule({ run }); return; }
      issueFind(state.query, { forward: true, findNext: true });
    };
    queryScheduler.schedule({ run });
    return () => queryScheduler.cancel();
    // biome-ignore lint/correctness/useExhaustiveDependencies: depends on target's stable inputs (activeGuestId), not the fresh `target`/`bridge` objects themselves.
  }, [state.query, state.open, activeGuestId]);

  // Closes (and clears the OUTGOING surface's own highlights) on a tab switch while the bar is
  // open — known rough edge until now: switching tabs left the bar open, still showing the
  // previous tab's stale query/count, and never cleared that tab's own highlight because nothing
  // called `stopFind` for it once it went off screen. Mirrors `App.hooks.ts`'s
  // `expandedAfterWorkspaceChange` precedent for the identical class of problem (collapse-on-
  // workspace-change). `previousGuestIdRef` — not `target` — resolves the OUTGOING guest: by the
  // time this effect runs post-commit, `activeGuestId` (and therefore `target`) already point at
  // the NEW surface.
  const previousGuestIdRef = useRef(activeGuestId);
  useEffect(() => {
    if (shouldCloseOnGuestChange(previousGuestIdRef.current, activeGuestId, state.open)) {
      const outgoing = resolveFindTarget({ activeGuestId: previousGuestIdRef.current, guests, bridge });
      stopFind(outgoing, bridge);
      dispatch({ type: 'close' });
    }
    previousGuestIdRef.current = activeGuestId;
    // biome-ignore lint/correctness/useExhaustiveDependencies: keys on activeGuestId's stable identity only, matching this file's other target-derived effects above.
  }, [activeGuestId]);

  // Reclaims focus the moment Chromium takes it, BEFORE the result round trip — on a big page that
  // trip can take long enough for a fast typist's next letters to reach the guest. A native `blur`
  // listener, not React's `onBlur`: the theft is a PAGE-level focus loss (`document.activeElement`
  // stays the input), which does not fire through React's root `focusout` delegation the way a real
  // blur-to-another-element does (memory `component_logic_belongs_hooks` — this stays in the hook,
  // not `App.tsx`). Deferred with `setTimeout(0)` rather than refocusing inline: the host-side blur
  // fires SYNCHRONOUSLY inside Chromium's own find, so an inline refocus would fight it. Never calls
  // `issueFind`/`runFind`/`stopFind` from here — Chromium steals focus once per issued find, so one
  // reclaim per find settles it; re-running the search on refocus is the focus-fight loop a guest
  // theft can otherwise trigger.
  const attachBlurReclaim = useCallback(
    (node: HTMLInputElement) => {
      const onBlur = () => {
        if (restoringFocus.current) return;
        clearReclaimTimer();
        reclaimTimer.current = setTimeout(() => {
          reclaimTimer.current = null;
          // Re-reads `inputElement.current`, not the closed-over `node`: the bar may have closed
          // (and unmounted the input) by the time this deferred callback runs.
          if (shouldReclaimFindFocus({ open: inputElement.current !== null, lastFindAt: lastFindAt.current, now: performance.now() })) {
            restoreFindInputFocus(inputElement.current, restoringFocus);
          }
        }, 0);
      };
      const onCompositionStart = () => {
        composing.current = true;
      };
      const onCompositionEnd = () => {
        composing.current = false;
      };
      node.addEventListener('blur', onBlur);
      node.addEventListener('compositionstart', onCompositionStart);
      node.addEventListener('compositionend', onCompositionEnd);
      return () => {
        node.removeEventListener('blur', onBlur);
        node.removeEventListener('compositionstart', onCompositionStart);
        node.removeEventListener('compositionend', onCompositionEnd);
        composing.current = false;
      };
    },
    [clearReclaimTimer],
  );

  // Detaches the previous node's blur listener before attaching the next one, so a remount (or the
  // bar closing) never leaves a stale listener on a detached node.
  const detachBlurReclaim = useRef<(() => void) | null>(null);
  const inputRef = useCallback(
    (node: HTMLInputElement | null) => {
      detachBlurReclaim.current?.();
      detachBlurReclaim.current = null;
      inputElement.current = node;
      if (node) detachBlurReclaim.current = attachBlurReclaim(node);
    },
    [attachBlurReclaim],
  );

  useEffect(() => () => {
    queryScheduler.cancel();
    clearReclaimTimer();
    cancelReclaimFrame();
  }, [queryScheduler, clearReclaimTimer, cancelReclaimFrame]);

  const close = () => {
    queryScheduler.cancel();
    clearReclaimTimer();
    cancelReclaimFrame();
    awaitingReport.current = false;
    stopFind(target, bridge);
    dispatch({ type: 'close' });
  };

  return {
    open: state.open,
    query: state.query,
    result: state.result,
    countLabel: formatMatchCount(state.result),
    inputRef,
    setQuery: (text) => dispatch({ type: 'set-query', query: text }),
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
 * @param extra an optional third registration, called last, for a feature with its own per-guest
 *   registry — `use-zoom.hooks.ts`'s `registerGuest`, wrapped by its caller as
 *   `(node) => zoom.registerGuest(projectId, node)`. Not typed against `FindableGuest`: a second
 *   feature's own narrower `Pick<HTMLWebViewElement, ...>` is a different type from this file's,
 *   and the real DOM node this ref actually receives satisfies both, so the caller narrows it, not
 *   this function.
 * @complexity O(1).
 */
export function useComposedGuestRef(
  guestRef: (node: HTMLWebViewElement | null) => void,
  registerGuest: (projectId: string, element: FindableGuest | null) => void,
  projectId: string,
  extra?: (node: HTMLWebViewElement | null) => void,
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
