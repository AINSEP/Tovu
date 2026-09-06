/**
 * @file Pure decision logic for the hold-space-to-talk gesture — no DOM, no timers, no React — so
 * every branch is directly assertable. `use-space-hold-to-talk.hooks.ts` owns the listeners and the
 * timer; this file owns "what should happen".
 *
 * **Why the gesture is gated on an EMPTY draft.** Holding space inside a text field fires OS key
 * repeat, so a plain "hold space anywhere" binding types a run of spaces into whatever the operator
 * was already writing, which then has to be swallowed and undone. Requiring the draft to be empty
 * removes that class of bug outright: there is no text to corrupt, and the one space the initial
 * keydown does type is discarded for free by the composer's own insertion rule
 * (`appendComposerDiscovery` in `@jini-ai/chat`, which REPLACES a whitespace-only draft rather than
 * appending to it). Key repeat itself is still suppressed — see {@link resolveSpaceHoldKeyDown}'s
 * `"suppress"` action — so the caret never marches across the box during a hold.
 *
 * The mic button stays the always-available path once anything has been typed.
 */

/**
 * How long space must be held before the microphone opens.
 *
 * Tuned to the low end of ordinary push-to-talk engagement (a few hundred ms): long enough that a
 * normal space keystroke can never trip it, short enough that the operator is not waiting on the
 * gesture before every utterance. Named, and referenced from exactly one place, so it can be
 * retuned here alone.
 */
export const SPACE_HOLD_TO_TALK_MS = 450;

/** The composer key the gesture is bound to. */
export const SPACE_KEY = " ";

/** Where the gesture currently is. `"armed"` means the timer is running but the mic is not open. */
export type SpaceHoldPhase = "released" | "armed" | "engaged";

/**
 * - `"ignore"` — leave the event entirely alone; the browser types its normal character.
 * - `"arm"` — start the hold timer. Deliberately does NOT suppress this first keystroke (see the
 *   file header): a quick tap must still produce a real, browser-typed space.
 * - `"suppress"` — `preventDefault()` and change nothing. This is the key-repeat case.
 */
export type SpaceHoldKeyDownAction = "ignore" | "arm" | "suppress";

export interface SpaceHoldKeyDownInput {
  key: string;
  /** True mid-IME-composition, where space commits a candidate and is never a gesture. */
  isComposing: boolean;
  phase: SpaceHoldPhase;
  /** The composer's live text. Whitespace-only counts as empty — there is nothing to corrupt. */
  draft: string;
}

/**
 * Decides what a space keydown should do.
 *
 * Whether voice input is available at all is NOT an input here: the caller binds no listener when
 * it is unavailable (`use-space-hold-to-talk.hooks.ts`'s effect gate), so there is exactly one
 * source of truth for that and no second copy here to drift from it.
 *
 * @returns See {@link SpaceHoldKeyDownAction}.
 * @complexity Time/space: O(n) in draft length (one `trim`), O(1) otherwise.
 */
export function resolveSpaceHoldKeyDown(input: SpaceHoldKeyDownInput): SpaceHoldKeyDownAction {
  if (input.key !== SPACE_KEY || input.isComposing) return "ignore";
  // Already armed or recording: every further space keydown is OS key repeat. Swallow the
  // character so the caret does not march across the box while the operator holds.
  if (input.phase !== "released") return "suppress";
  return input.draft.trim() === "" ? "arm" : "ignore";
}

/**
 * - `"ignore"` — not a space, or no gesture was in flight.
 * - `"disarm"` — released before the threshold: a quick tap. The space the browser already typed on
 *   keydown stands; nothing is started and nothing is undone.
 * - `"release"` — released after the mic opened: stop recording and transcribe.
 */
export type SpaceHoldKeyUpAction = "ignore" | "disarm" | "release";

/**
 * Decides what a space keyup should do.
 *
 * @complexity Time/space: O(1).
 */
export function resolveSpaceHoldKeyUp(key: string, phase: SpaceHoldPhase): SpaceHoldKeyUpAction {
  if (key !== SPACE_KEY) return "ignore";
  if (phase === "armed") return "disarm";
  return phase === "engaged" ? "release" : "ignore";
}
