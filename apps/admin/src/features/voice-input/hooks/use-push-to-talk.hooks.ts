import { useCallback, useEffect, useRef, useState } from "react";

import { getVoiceInputPort, type VoiceInputPort } from "../voice-input-port";
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
 * and drives {@link nextPushToTalkState} from the mic button's own pointer events. All decision
 * logic (which transitions are legal, what the indicator says) lives in
 * `push-to-talk-state.hooks.ts` and is tested there directly; this hook's own job is wiring that
 * pure machine to real pointer events and the injectable {@link PushToTalkCapture} side effect —
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
  /** `null` while the one-time availability probe is in flight; `false` once confirmed
   *  unavailable (no desktop shell, or on-device recognition not installed) — the mic affordance
   *  must render nothing in either the `null` or `false` case, never a disabled-looking button
   *  that implies voice input almost works. */
  available: boolean | null;
  indicator: PushToTalkIndicator;
  /** Wire to the mic button's `onPointerDown`. */
  handlePointerDown: () => void;
  /** Wire to BOTH `onPointerUp` and `onPointerLeave` — dragging off the button before releasing
   *  must still stop the recording; the microphone must never stay live with nothing pointing at
   *  it. */
  handlePointerUp: () => void;
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
  const [available, setAvailable] = useState<boolean | null>(null);
  const captureRef = useRef<PushToTalkCapture | null>(null);

  useEffect(() => {
    if (!voicePort) {
      setAvailable(false);
      return undefined;
    }
    let cancelled = false;
    voicePort
      .isAvailable()
      .then((result) => {
        if (!cancelled) setAvailable(result.available);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [voicePort]);

  const canStart = Boolean(voicePort) && available === true && (state.status === "idle" || state.status === "error");

  const handlePointerDown = useCallback(() => {
    if (!canStart || !voicePort) return;
    setState((previous) => nextPushToTalkState(previous, { type: "start" }));
    const capture = createCapture(voicePort);
    captureRef.current = capture;
    capture
      .start()
      .then(() => setState((previous) => nextPushToTalkState(previous, { type: "mic-granted" })))
      .catch((error) => setState((previous) => nextPushToTalkState(previous, { type: "mic-denied", reason: describeCaptureError(error) })));
    // `voicePort`/`createCapture` are resolved once per mount, not per render, so listing exactly
    // these three dependencies (not `state` itself) does not risk a stale closure — `canStart`
    // already reads the latest `state.status` on every render this callback is recreated for.
  }, [canStart, voicePort, createCapture]);

  const handlePointerUp = useCallback(() => {
    if (state.status !== "recording") return;
    setState((previous) => nextPushToTalkState(previous, { type: "stop" }));
    const capture = captureRef.current;
    if (!capture) return;
    capture
      .stopAndTranscribe()
      .then((text) => {
        setState((previous) => nextPushToTalkState(previous, { type: "transcript-ready" }));
        if (text.trim().length > 0) onTranscript(text);
      })
      .catch((error) => setState((previous) => nextPushToTalkState(previous, { type: "transcribe-failed", reason: describeCaptureError(error) })));
  }, [state.status, onTranscript]);

  return { available, indicator: describePushToTalkIndicator(state), handlePointerDown, handlePointerUp };
}
