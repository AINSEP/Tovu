import type { FindInPageResult } from '../contracts/find-in-page.js';

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
  // Typed cases are exhaustive; preserve undefined fallthrough for untyped callers.
  return undefined as never;
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
export function shouldCloseOnGuestChange({ previousGuestId, activeGuestId, open }: { previousGuestId: string | null; activeGuestId: string | null; open: boolean }, _options: Record<string, never> = {}): boolean {
  return open && previousGuestId !== activeGuestId;
}

/** The bar's own counter text: `"<ordinal> of <total>"`, or `"No results"` once a query has
 *  actually returned zero matches — never shown for an empty query, which has no `result` yet
 *  (see `findBarReducer`'s `set-query`). */
export function formatMatchCount({ result }: { result: FindInPageResult | null }, _options: Record<string, never> = {}): string {
  if (result === null) return '';
  if (result.matches === 0) return 'No results';
  return `${result.activeMatchOrdinal} of ${result.matches}`;
}
