import type { Clock } from "@jini-ai/core/primitives";

/**
 * @file The one shared test clock. `@jini-ai/core`'s `Clock` is `{ nowMs() }` only; a few website
 * deps slices still declare their own `clock: { nowIso(): string }`, and composed deps bags carry the
 * intersection. A {@link FakeClock} satisfies both shapes, so a test passes one instance wherever
 * either is required, instead of hand-rolling a `{ nowIso }` literal that no longer type-checks
 * against `Clock`.
 */

/** A settable clock: both `Clock` readers, plus test-only controls. */
export interface FakeClock extends Clock {
  /**
   * The current time as an ISO string, for deps that still read `nowIso()`. Returns the string last
   * given to `createFakeClock`/`set` verbatim (so `"…T00:00:00Z"` stays without milliseconds and a
   * test can assert equality with its own constant); after `advanceMs` it is `toISOString()` form.
   */
  nowIso(): string;
  /** Moves the clock to `iso`. Throws on an unparseable timestamp. */
  set(iso: string): void;
  /** Moves the clock forward (or back, for a negative `ms`) by `ms` milliseconds. */
  advanceMs(ms: number): void;
}

/**
 * Builds a {@link FakeClock} that reads `startIso` until a test moves it.
 *
 * @param required.startIso the initial time; must parse with `Date.parse`.
 * @returns a fresh clock; instances share no state.
 * @throws {RangeError} when `startIso` (or a later `set`) is not a parseable timestamp, so a typo
 *   fails at construction instead of surfacing as `NaN` mid-assertion.
 * @complexity O(1) per call.
 */
export function createFakeClock({ startIso }: { startIso: string }): FakeClock {
  let nowMs = parseIso(startIso);
  let nowIso = startIso;
  return {
    nowMs: () => nowMs,
    nowIso: () => nowIso,
    set: (iso) => {
      nowMs = parseIso(iso);
      nowIso = iso;
    },
    advanceMs: (ms) => {
      nowMs += ms;
      nowIso = new Date(nowMs).toISOString();
    },
  };
}

function parseIso(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new RangeError(`fake-clock: '${iso}' is not a parseable timestamp`);
  return ms;
}
