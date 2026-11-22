import type { RunnerInventoryBridge } from './runner-api.js';
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
 * @param input.options.findNext Electron's own meaning, not the button's: `true` begins a NEW session
 *   (pass it for a query CHANGE), `false` is a follow-up within the current one (pass it for
 *   Enter/Shift+Enter). See this file's own header.
 * @param options.selection this window's own selection; defaults to the live one, so no call site can
 *   forget it. Tests pass a fake to assert it is cleared BEFORE the search, which is the whole
 *   point — a selection still standing when Chromium reads it is the bug.
 * @complexity O(1) beyond Chromium's own search cost.
 */
export function runFind(
  { target, bridge, text, options }: {
    target: FindTarget; bridge: FindBridge | undefined; text: string;
    options: { forward: boolean; findNext: boolean };
  },
  { selection = liveAnchorSelection() }: { selection?: AnchorSelection | null } = {},
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
 * Stops any in-flight search on `target` and clears its highlights. Same not-attached-yet tolerance
 * as {@link runFind}.
 *
 * @complexity O(1).
 */
export function stopFind({ target, bridge }: { target: FindTarget; bridge: FindBridge | undefined }, _options: Record<string, never> = {}): void {
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

/**
 * Subscribes to every source that could report the search running against `target`, and hands back
 * one unsubscribe for all of them.
 *
 * The WINDOW's own results are subscribed for every target, not just `top`: Chromium serves a
 * guest's find from the window's find manager once that manager exists, and then the guest's own
 * `found-in-page` never fires (see this file's header). A guest target subscribes to BOTH, because
 * which one reports is Chromium's choice and not observable from here.
 *
 * @param input.handlers.onResult every reported result, whichever source carried it.
 * @param input.handlers.onReported called first, for EVERY reported result whichever source carried
 *   it — Chromium moves keyboard focus for a guest match exactly as it does for a top-level one
 *   (`ClearFocusedElement`/`SetFocusedFrame`), so both sources need the same restore. See
 *   {@link restoreFindInputFocus}.
 * @complexity O(1); at most two listeners, both removed by the returned cleanup.
 */
export function subscribeToFindResults(
  { target, bridge, handlers }: {
    target: FindTarget;
    bridge: FindBridge | undefined;
    handlers: { onResult: (input: { result: FindInPageResult }) => void; onReported: () => void };
  },
  _options: Record<string, never> = {},
): () => void {
  const unsubscribeWindow = bridge?.onFindResult({ listener: (result) => {
    handlers.onReported();
    handlers.onResult({ result });
  } });
  if (target.kind !== 'guest') return () => unsubscribeWindow?.();
  const onFound = (event: WebviewFoundInPageEvent) => {
    handlers.onReported();
    handlers.onResult({ result: event.result });
  };
  target.element.addEventListener('found-in-page', onFound);
  return () => {
    target.element.removeEventListener('found-in-page', onFound);
    unsubscribeWindow?.();
  };
}
