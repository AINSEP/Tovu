import { useCallback, useEffect, useRef, useState } from "react";

import { getVoiceInputPort, type VoiceInputAvailability, type VoiceInputPort } from "../voice-input-port";
import { NO_DESKTOP_SHELL_REASON, describeVoiceUnavailability } from "../voice-unavailability";
import { createMicPushToTalkCapture, type PushToTalkCapture } from "./mic-capture";
import {
  INITIAL_PUSH_TO_TALK_STATE,
  describePushToTalkIndicator,
  nextPushToTalkState,
  type PushToTalkIndicator,
  type PushToTalkState,
} from "./push-to-talk-state.hooks";

/**
 * @file Orchestrates the push-to-talk gesture: resolves the voice port, probes availability once,
 * and drives {@link nextPushToTalkState} from whichever input started the hold — the mic button's
 * pointer events, or the hold-space gesture in `use-space-hold-to-talk.hooks.ts`. All decision
 * logic (which transitions are legal, what the indicator says) lives in
 * `push-to-talk-state.hooks.ts` and is tested there directly; this hook's own job is wiring that
 * pure machine to real input events and the injectable {@link PushToTalkCapture} side effect —
 * tested here against a FAKE capture (see `__tests__/use-push-to-talk.hooks.unit.test.ts`), not a
 * real microphone.
 */

/** A capture failure's `Error#message`, or a fixed fallback for a non-`Error` rejection (the DOM's
 *  own `getUserMedia` rejections are always real `Error`s, but a fake in a test might not be).
 *  @complexity Time/space: O(1). */
export function describeCaptureError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export interface UsePushToTalkOptions {
  /** Called with the transcribed text once a recording finishes with non-empty content. Wire this
   *  to the composer's own text setter. */
  onTranscript: (text: string) => void;
}

export interface UsePushToTalkOverrides {
  /** Defaults to `getVoiceInputPort(undefined)`. Pass `null` in a test to simulate a plain browser
   *  tab (no desktop shell). */
  voicePort?: VoiceInputPort | null;
  /** Defaults to {@link createMicPushToTalkCapture}. A test passes a fake that never touches
   *  `getUserMedia`/`AudioContext`. */
  createCapture?: (port: VoiceInputPort) => PushToTalkCapture;
}

export interface PushToTalkController {
  /** `null` while the one-time availability probe is in flight — the affordance renders nothing at
   *  all in that window rather than flashing an "unavailable" state that corrects itself a tick
   *  later. `false` once confirmed unavailable (no desktop shell, or on-device recognition not
   *  installed), with {@link PushToTalkController.unavailableReason} saying why. */
  available: boolean | null;
  /** Operator-facing copy for the `available === false` case; `undefined` in every other state.
   *  Already mapped out of the port's machine-readable code by `describeVoiceUnavailability`. */
  unavailableReason: string | undefined;
  indicator: PushToTalkIndicator;
  /** Opens the microphone. Driven by the mic button's `onPointerDown` AND by the hold-space
   *  gesture (`use-space-hold-to-talk.hooks.ts`) — hence the input-neutral name. */
  startHold: () => void;
  /** Stops recording and transcribes. The button wires this to BOTH `onPointerUp` and
   *  `onPointerLeave` — dragging off the button before releasing must still stop the recording;
   *  the microphone must never stay live with nothing pointing at it. */
  endHold: () => void;
}

/**
 * Splits the probe's raw availability record into the two values the UI actually consumes.
 *
 * Extracted rather than inlined so `usePushToTalk` itself stays inside this repo's complexity
 * ceiling, and so the "no reason while probing, no reason once available" invariant is assertable
 * on its own.
 *
 * @param availability - `null` while the probe is still in flight.
 * @complexity Time/space: O(1).
 */
export function describeAvailability(availability: VoiceInputAvailability | null): {
  available: boolean | null;
  unavailableReason: string | undefined;
} {
  if (availability === null) return { available: null, unavailableReason: undefined };
  if (availability.available) return { available: true, unavailableReason: undefined };
  return { available: false, unavailableReason: describeVoiceUnavailability(availability.reason) };
}

/**
 * Resolves the capture backend to use for a start attempt — the injected override if the caller
 * supplied one, else the real microphone-backed implementation.
 * @complexity Time/space: O(1).
 */
function resolveCreateCapture(overrideCreateCapture: ((port: VoiceInputPort) => PushToTalkCapture) | undefined) {
  return overrideCreateCapture ?? createMicPushToTalkCapture;
}

/**
 * Drives the push-to-talk gesture end to end for one composer mic button.
 *
 * @param options.onTranscript - See {@link UsePushToTalkOptions}.
 * @param overrides - Injectable seams for testing; a real caller omits this entirely.
 * @complexity Time/space: O(1) per call; recording length determines the real capture/transcribe
 *   cost, which this hook does not itself scale with.
 */
export function usePushToTalk(options: UsePushToTalkOptions, overrides: UsePushToTalkOverrides | undefined): PushToTalkController {
  const { onTranscript } = options;
  const voicePort = overrides && "voicePort" in overrides ? overrides.voicePort ?? null : getVoiceInputPort(undefined);
  const createCapture = resolveCreateCapture(overrides?.createCapture);

  const [state, setState] = useState<PushToTalkState>(INITIAL_PUSH_TO_TALK_STATE);
  /** `null` until the probe settles. The whole availability record is held (not just its boolean)
   *  so the port's `reason` reaches the UI: an affordance that says WHY voice input is off is very
   *  different from one that silently vanishes, which just reads as a missing feature. */
  const [availability, setAvailability] = useState<VoiceInputAvailability | null>(null);
  const captureRef = useRef<PushToTalkCapture | null>(null);
  /** The capture whose microphone is open right now — set once permission is granted into a
   *  recording, cleared when a hold stops it. What unmount has to release. */
  const liveCaptureRef = useRef<PushToTalkCapture | null>(null);
  const unmountedRef = useRef(false);

  // Unmounting (closing the assistant, navigating away) runs no pointer handler, so the microphone
  // is released here: a recording capture is stopped now, and a capture still waiting on the
  // permission prompt is stopped by `startHold`'s own `.then` once it resolves (its `setState`
  // updater never runs after unmount, so the release inside it never would).
  useEffect(
    () => () => {
      unmountedRef.current = true;
      const live = liveCaptureRef.current;
      liveCaptureRef.current = null;
      if (live) void live.stopAndTranscribe().catch(() => {});
    },
    [],
  );

  useEffect(() => {
    if (!voicePort) {
      setAvailability({ available: false, reason: NO_DESKTOP_SHELL_REASON });
      return undefined;
    }
    let cancelled = false;
    voicePort
      .isAvailable()
      .then((result) => {
        if (!cancelled) setAvailability(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) setAvailability({ available: false, reason: describeCaptureError(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [voicePort]);

  const { available, unavailableReason } = describeAvailability(availability);
  const canStart = Boolean(voicePort) && available === true && (state.status === "idle" || state.status === "error");

  const startHold = useCallback(() => {
    if (!canStart || !voicePort) return;
    setState((previous) => nextPushToTalkState(previous, { type: "start" }));
    const capture = createCapture(voicePort);
    captureRef.current = capture;
    capture
      .start()
      .then(() => {
        if (unmountedRef.current) {
          void capture.stopAndTranscribe().catch(() => {});
          return;
        }
        liveCaptureRef.current = capture;
        setState((previous) => {
          const next = nextPushToTalkState(previous, { type: "mic-granted" });
          // The hold already ended while this was in flight (`endHold` moved `previous` to
          // `"cancelling"` — see that function and `PushToTalkStatus`'s own doc), so `next` comes
          // back `"idle"`, not `"recording"`. Release the microphone right now instead of leaving
          // it live with nothing pointing at it; the result is discarded; there is no hold to
          // transcribe.
          if (next.status !== "recording") {
            liveCaptureRef.current = null;
            void capture.stopAndTranscribe().catch(() => {});
          }
          return next;
        });
      })
      .catch((error) => setState((previous) => nextPushToTalkState(previous, { type: "mic-denied", reason: describeCaptureError(error) })));
    // `voicePort`/`createCapture` are resolved once per mount, not per render, so listing exactly
    // these three dependencies (not `state` itself) does not risk a stale closure — `canStart`
    // already reads the latest `state.status` on every render this callback is recreated for.
  }, [canStart, voicePort, createCapture]);

  const endHold = useCallback(() => {
    if (state.status === "recording") {
      setState((previous) => nextPushToTalkState(previous, { type: "stop" }));
      const capture = captureRef.current;
      liveCaptureRef.current = null;
      if (!capture) return;
      capture
        .stopAndTranscribe()
        .then((text) => {
          setState((previous) => nextPushToTalkState(previous, { type: "transcript-ready" }));
          if (text.trim().length > 0) onTranscript(text);
        })
        .catch((error) => setState((previous) => nextPushToTalkState(previous, { type: "transcribe-failed", reason: describeCaptureError(error) })));
      return;
    }
    // Released while still `"requesting-mic"` (the permission prompt has not resolved yet): there
    // is no capture to stop here — `startHold`'s own `.then()` above holds the only live reference
    // to it, and is what actually releases the microphone once permission settles. Moving to
    // `"cancelling"` is what tells it to do that instead of entering `"recording"`. Every other
    // status (`"idle"`, `"transcribing"`, `"error"`, `"cancelling"` itself) has nothing live to
    // stop, so a stray release there is a no-op, same as before this fix.
    if (state.status === "requesting-mic") {
      setState((previous) => nextPushToTalkState(previous, { type: "stop" }));
    }
  }, [state.status, onTranscript]);

  return { available, unavailableReason, indicator: describePushToTalkIndicator(state), startHold, endHold };
}
