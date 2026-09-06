/**
 * @file Binds the hold-space-to-talk gesture to the composer's own textarea. All of the "should
 * this fire" reasoning lives in `space-hold-rules.ts` and is tested there directly; this hook owns
 * only the listeners, the timer, and the mic-must-never-stay-live cleanup.
 *
 * **How it reaches the textarea.** `@jini-ai/chat`'s `Composer` renders host content into
 * `.jini-composer-leading` inside `.jini-composer`, and exposes no ref to its own textarea. This
 * hook therefore scopes by DOM lookup off the anchor element the caller already has —
 * `closest('.jini-composer')` then `querySelector('.jini-composer-input')` — which is the same
 * idiom `Composer.tsx` itself uses internally for its popovers ("Scoped by DOM lookup
 * (`closest`/`querySelector`) off `textareaRef`, not new refs threaded through"). No Jini change is
 * needed for this, and none was made.
 *
 * Reading `textarea.value` rather than a mirrored copy of the draft is deliberate: it is the live
 * rendered state, so the emptiness gate can never disagree with what the operator is actually
 * looking at.
 */

import { useEffect, useRef, type RefObject } from "react";

import {
  SPACE_HOLD_TO_TALK_MS,
  resolveSpaceHoldKeyDown,
  resolveSpaceHoldKeyUp,
  type SpaceHoldPhase,
} from "./space-hold-rules";

/** The class `@jini-ai/chat`'s `Composer` puts on its root element. */
const COMPOSER_ROOT_SELECTOR = ".jini-composer";
/** The class `@jini-ai/chat`'s `Composer` puts on its textarea. */
const COMPOSER_INPUT_SELECTOR = ".jini-composer-input";

/**
 * Finds the composer textarea that owns `anchor`.
 *
 * @param anchor - Any element rendered inside the composer — in practice the mic button itself.
 * @returns The textarea, or `null` when the anchor is detached or the composer chrome changed.
 * @complexity Time/space: O(d) in DOM depth for the ancestor walk.
 */
export function findComposerTextarea(anchor: HTMLElement | null): HTMLTextAreaElement | null {
  const root = anchor?.closest(COMPOSER_ROOT_SELECTOR) ?? null;
  return root?.querySelector<HTMLTextAreaElement>(COMPOSER_INPUT_SELECTOR) ?? null;
}

export interface UseSpaceHoldToTalkOptions {
  /** Any element inside the composer; the textarea is found from it. */
  anchorRef: RefObject<HTMLElement | null>;
  /** Voice input confirmed available. `false` unbinds the gesture entirely. */
  enabled: boolean;
  /** Opens the microphone. Same effect as pressing and holding the mic button. */
  onEngage: () => void;
  /** Stops recording and transcribes. Same effect as releasing the mic button. */
  onRelease: () => void;
}

/**
 * Wires hold-space-to-talk to the composer textarea for as long as `enabled` holds.
 *
 * A hold that is still open when the textarea loses focus, or when this component unmounts, is
 * released rather than abandoned — the microphone must never stay live with nothing driving it.
 *
 * @complexity Time/space: O(1) per event; one timer at a time.
 */
export function useSpaceHoldToTalk(options: UseSpaceHoldToTalkOptions): void {
  const { anchorRef, enabled, onEngage, onRelease } = options;
  const phaseRef = useRef<SpaceHoldPhase>("released");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Read at fire time, so a re-render with fresh callbacks never re-binds the listeners. */
  const callbacksRef = useRef({ onEngage, onRelease });
  callbacksRef.current = { onEngage, onRelease };

  useEffect(() => {
    const textarea = findComposerTextarea(anchorRef.current);
    if (!textarea || !enabled) return undefined;

    function clearHoldTimer() {
      if (timerRef.current === null) return;
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    /** Ends whatever is in flight; stops the microphone only if it was actually opened. */
    function abandonHold() {
      const wasEngaged = phaseRef.current === "engaged";
      clearHoldTimer();
      phaseRef.current = "released";
      if (wasEngaged) callbacksRef.current.onRelease();
    }

    function handleKeyDown(event: KeyboardEvent) {
      const action = resolveSpaceHoldKeyDown({
        key: event.key,
        isComposing: event.isComposing,
        phase: phaseRef.current,
        draft: textarea.value,
      });
      if (action === "ignore") return;
      if (action === "suppress") {
        event.preventDefault();
        return;
      }
      phaseRef.current = "armed";
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        phaseRef.current = "engaged";
        callbacksRef.current.onEngage();
      }, SPACE_HOLD_TO_TALK_MS);
    }

    function handleKeyUp(event: KeyboardEvent) {
      const action = resolveSpaceHoldKeyUp(event.key, phaseRef.current);
      if (action === "ignore") return;
      clearHoldTimer();
      phaseRef.current = "released";
      // `"disarm"` is a quick tap: the browser already typed its space on keydown and nothing was
      // started, so there is deliberately nothing to undo here.
      if (action === "release") callbacksRef.current.onRelease();
    }

    textarea.addEventListener("keydown", handleKeyDown);
    textarea.addEventListener("keyup", handleKeyUp);
    textarea.addEventListener("blur", abandonHold);
    return () => {
      textarea.removeEventListener("keydown", handleKeyDown);
      textarea.removeEventListener("keyup", handleKeyUp);
      textarea.removeEventListener("blur", abandonHold);
      abandonHold();
    };
  }, [anchorRef, enabled]);
}
