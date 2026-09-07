import { describe, expect, it } from "vitest";

import {
  INITIAL_PUSH_TO_TALK_STATE,
  describePushToTalkIndicator,
  nextPushToTalkState,
  type PushToTalkState,
} from "../push-to-talk-state.hooks";
import { describeCaptureError } from "../use-push-to-talk.hooks";

describe("nextPushToTalkState", () => {
  it("starts idle", () => {
    expect(INITIAL_PUSH_TO_TALK_STATE).toEqual({ status: "idle" });
  });

  it("idle -start-> requesting-mic -mic-granted-> recording -stop-> transcribing -transcript-ready-> idle", () => {
    let state: PushToTalkState = INITIAL_PUSH_TO_TALK_STATE;
    state = nextPushToTalkState(state, { type: "start" });
    expect(state.status).toBe("requesting-mic");
    state = nextPushToTalkState(state, { type: "mic-granted" });
    expect(state.status).toBe("recording");
    state = nextPushToTalkState(state, { type: "stop" });
    expect(state.status).toBe("transcribing");
    state = nextPushToTalkState(state, { type: "transcript-ready" });
    expect(state).toEqual({ status: "idle" });
  });

  it("requesting-mic -mic-denied-> error, carrying the reason", () => {
    const state = nextPushToTalkState({ status: "requesting-mic" }, { type: "mic-denied", reason: "Permission denied" });
    expect(state).toEqual({ status: "error", errorReason: "Permission denied" });
  });

  it("transcribing -transcribe-failed-> error, carrying the reason", () => {
    const state = nextPushToTalkState({ status: "transcribing" }, { type: "transcribe-failed", reason: "on-device-recognition-unavailable" });
    expect(state).toEqual({ status: "error", errorReason: "on-device-recognition-unavailable" });
  });

  it("error -dismiss-error-> idle", () => {
    const state = nextPushToTalkState({ status: "error", errorReason: "x" }, { type: "dismiss-error" });
    expect(state).toEqual({ status: "idle" });
  });

  it("error -start-> requesting-mic (retry without a separate dismiss step)", () => {
    const state = nextPushToTalkState({ status: "error", errorReason: "x" }, { type: "start" });
    expect(state).toEqual({ status: "requesting-mic" });
  });

  it("ignores an event that is not legal from the current state, returning the SAME state reference", () => {
    const state: PushToTalkState = { status: "idle" };
    // A stray "stop" while idle — e.g. a pointerup with no matching pointerdown (fast drag-through).
    const next = nextPushToTalkState(state, { type: "stop" });
    expect(next).toBe(state);
  });

  it("ignores a second start while already recording (no double-capture)", () => {
    const state: PushToTalkState = { status: "recording" };
    const next = nextPushToTalkState(state, { type: "start" });
    expect(next).toBe(state);
  });

  it("ignores mic-granted/mic-denied outside requesting-mic", () => {
    const idle: PushToTalkState = { status: "idle" };
    expect(nextPushToTalkState(idle, { type: "mic-granted" })).toBe(idle);
    expect(nextPushToTalkState(idle, { type: "mic-denied", reason: "x" })).toBe(idle);
  });

  // REGRESSION (2026-09-06, section C item 4 of the tovu-8f handoff): releasing the mic button
  // while the permission prompt is still open used to have no transition at all — `stop` was
  // simply ignored in `requesting-mic`, so the state machine sailed on into `recording` once
  // permission resolved even though nothing was holding the button down anymore, leaving the
  // microphone live with no way to stop it short of a page reload. `cancelling` is what lets
  // `usePushToTalk`'s own `startHold().then()` (the only place that can actually release the
  // capture, since it owns the one live reference to it) tell the difference between "still held"
  // and "already let go" once permission finally settles.
  it("requesting-mic -stop-> cancelling (released before permission resolved)", () => {
    const state = nextPushToTalkState({ status: "requesting-mic" }, { type: "stop" });
    expect(state).toEqual({ status: "cancelling" });
  });

  it("cancelling -mic-granted-> idle, never recording — the hold is already over", () => {
    const state = nextPushToTalkState({ status: "cancelling" }, { type: "mic-granted" });
    expect(state).toEqual({ status: "idle" });
  });

  it("cancelling -mic-denied-> idle, no error shown for a prompt nobody is watching anymore", () => {
    const state = nextPushToTalkState({ status: "cancelling" }, { type: "mic-denied", reason: "Permission denied" });
    expect(state).toEqual({ status: "idle" });
  });
});

describe("describePushToTalkIndicator", () => {
  it("is unmistakable: isRecording is true in exactly the recording state, false everywhere else", () => {
    const statuses: PushToTalkState[] = [
      { status: "idle" },
      { status: "requesting-mic" },
      { status: "recording" },
      { status: "transcribing" },
      { status: "error", errorReason: "boom" },
    ];
    const recordingFlags = statuses.map((state) => describePushToTalkIndicator(state).isRecording);
    expect(recordingFlags).toEqual([false, false, true, false, false]);
  });

  it("uses assertive aria-live only while recording or on error", () => {
    expect(describePushToTalkIndicator({ status: "recording" }).ariaLive).toBe("assertive");
    expect(describePushToTalkIndicator({ status: "error", errorReason: "x" }).ariaLive).toBe("assertive");
    expect(describePushToTalkIndicator({ status: "idle" }).ariaLive).toBe("polite");
    expect(describePushToTalkIndicator({ status: "requesting-mic" }).ariaLive).toBe("polite");
    expect(describePushToTalkIndicator({ status: "transcribing" }).ariaLive).toBe("polite");
  });

  it("shows the real error reason when present, and a fallback when it is not", () => {
    expect(describePushToTalkIndicator({ status: "error", errorReason: "Permission denied" }).label).toBe("Permission denied");
    expect(describePushToTalkIndicator({ status: "error" }).label).toBe("Voice input failed");
  });
});

describe("describeCaptureError", () => {
  it("uses the real Error message when given one", () => {
    expect(describeCaptureError(new Error("NotAllowedError"))).toBe("NotAllowedError");
  });

  it("falls back to a fixed string for a non-Error rejection", () => {
    expect(describeCaptureError("some string")).toBe("Unknown error");
    expect(describeCaptureError(undefined)).toBe("Unknown error");
  });
});
