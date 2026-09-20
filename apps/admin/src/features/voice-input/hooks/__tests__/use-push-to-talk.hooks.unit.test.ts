import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { usePushToTalk } from "../use-push-to-talk.hooks";
import type { PushToTalkCapture } from "../mic-capture";
import type { VoiceInputPort } from "../../voice-input-port";

/**
 * @file Tests `usePushToTalk`'s orchestration — availability probing, pointer-down/up wiring, and
 * every capture outcome (mic granted, mic denied, transcript delivered, transcribe failed) — all
 * against a FAKE `VoiceInputPort` and a FAKE `PushToTalkCapture`. No real microphone, `AudioContext`,
 * or Electron IPC is touched anywhere in this file; `mic-capture.ts`'s real implementation is
 * documented as hand-verified only (see this feature's handoff notes).
 */

function fakePort(overrides: Partial<VoiceInputPort> = {}): VoiceInputPort {
  return {
    isAvailable: vi.fn().mockResolvedValue({ available: true }),
    transcribe: vi.fn().mockResolvedValue({ text: "", elapsedMs: 0 }),
    ...overrides,
  };
}

function fakeCapture(overrides: Partial<PushToTalkCapture> = {}): PushToTalkCapture {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    stopAndTranscribe: vi.fn().mockResolvedValue(""),
    ...overrides,
  };
}

describe("usePushToTalk — availability", () => {
  it("reports unavailable immediately when there is no voice port at all (plain browser tab)", async () => {
    const { result } = renderHook(() => usePushToTalk({ onTranscript: vi.fn() }, { voicePort: null }));
    await waitFor(() => expect(result.current.available).toBe(false));
    // The affordance now renders in this state, so the reason has to be real copy an operator can
    // act on — not an empty tooltip and not the raw code.
    expect(result.current.unavailableReason).toBe(
      "Voice input needs the Tovu desktop app — transcription runs on your Mac, never in the cloud.",
    );
  });

  it("starts null (probe in flight) then settles to the port's own isAvailable() result", async () => {
    const port = fakePort({ isAvailable: vi.fn().mockResolvedValue({ available: true }) });
    const { result } = renderHook(() => usePushToTalk({ onTranscript: vi.fn() }, { voicePort: port }));
    expect(result.current.available).toBeNull();
    expect(result.current.unavailableReason).toBeUndefined();
    await waitFor(() => expect(result.current.available).toBe(true));
    // Nothing to explain once it works — a stale reason here would render as a disabled button.
    expect(result.current.unavailableReason).toBeUndefined();
  });

  it("settles to false when the port reports itself unavailable (e.g. on-device assets missing)", async () => {
    const port = fakePort({ isAvailable: vi.fn().mockResolvedValue({ available: false, reason: "on-device-recognition-unavailable" }) });
    const { result } = renderHook(() => usePushToTalk({ onTranscript: vi.fn() }, { voicePort: port }));
    await waitFor(() => expect(result.current.available).toBe(false));
    // The port's machine-readable code, mapped to operator copy — proves the code reaches the UI
    // rather than being dropped on the floor as it was before.
    expect(result.current.unavailableReason).toBe(
      "macOS on-device dictation is not installed. Turn it on in System Settings › Keyboard › Dictation.",
    );
  });

  it("settles to false rather than throwing when isAvailable() itself rejects", async () => {
    const port = fakePort({ isAvailable: vi.fn().mockRejectedValue(new Error("IPC channel closed")) });
    const { result } = renderHook(() => usePushToTalk({ onTranscript: vi.fn() }, { voicePort: port }));
    await waitFor(() => expect(result.current.available).toBe(false));
    // An unrecognized code falls back rather than leaking an internal message into the tooltip.
    expect(result.current.unavailableReason).toBe("Voice input is not available on this machine.");
  });
});

describe("usePushToTalk — recording lifecycle", () => {
  it("pointerdown -> mic granted -> recording indicator; pointerup -> transcript delivered to onTranscript", async () => {
    const capture = fakeCapture({ stopAndTranscribe: vi.fn().mockResolvedValue("publish the homepage") });
    const port = fakePort();
    const onTranscript = vi.fn();
    const { result } = renderHook(() =>
      usePushToTalk({ onTranscript }, { voicePort: port, createCapture: () => capture }),
    );
    await waitFor(() => expect(result.current.available).toBe(true));

    act(() => result.current.startHold());
    await waitFor(() => expect(result.current.indicator.isRecording).toBe(true));

    act(() => result.current.endHold());
    await waitFor(() => expect(result.current.indicator.isRecording).toBe(false));

    expect(onTranscript).toHaveBeenCalledWith("publish the homepage");
    expect(capture.start).toHaveBeenCalledTimes(1);
    expect(capture.stopAndTranscribe).toHaveBeenCalledTimes(1);
  });

  it("does not call onTranscript when the recognizer returns only whitespace/empty text", async () => {
    const capture = fakeCapture({ stopAndTranscribe: vi.fn().mockResolvedValue("   ") });
    const onTranscript = vi.fn();
    const { result } = renderHook(() =>
      usePushToTalk({ onTranscript }, { voicePort: fakePort(), createCapture: () => capture }),
    );
    await waitFor(() => expect(result.current.available).toBe(true));

    act(() => result.current.startHold());
    await waitFor(() => expect(result.current.indicator.isRecording).toBe(true));
    act(() => result.current.endHold());
    await waitFor(() => expect(result.current.indicator.isRecording).toBe(false));

    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("mic permission denial surfaces as the error indicator, not a silent no-op", async () => {
    const capture = fakeCapture({ start: vi.fn().mockRejectedValue(new Error("Permission denied")) });
    const { result } = renderHook(() =>
      usePushToTalk({ onTranscript: vi.fn() }, { voicePort: fakePort(), createCapture: () => capture }),
    );
    await waitFor(() => expect(result.current.available).toBe(true));

    act(() => result.current.startHold());
    await waitFor(() => expect(result.current.indicator.label).toBe("Permission denied"));
    expect(result.current.indicator.isRecording).toBe(false);
  });

  it("a transcribe failure surfaces as the error indicator and never calls onTranscript", async () => {
    const capture = fakeCapture({ stopAndTranscribe: vi.fn().mockRejectedValue(new Error("on-device-recognition-unavailable")) });
    const onTranscript = vi.fn();
    const { result } = renderHook(() =>
      usePushToTalk({ onTranscript }, { voicePort: fakePort(), createCapture: () => capture }),
    );
    await waitFor(() => expect(result.current.available).toBe(true));

    act(() => result.current.startHold());
    await waitFor(() => expect(result.current.indicator.isRecording).toBe(true));
    act(() => result.current.endHold());
    await waitFor(() => expect(result.current.indicator.label).toBe("on-device-recognition-unavailable"));

    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("ignores a hold start while unavailable — never starts a capture with no confirmed port", async () => {
    const capture = fakeCapture();
    const { result } = renderHook(() =>
      usePushToTalk({ onTranscript: vi.fn() }, { voicePort: null, createCapture: () => capture }),
    );
    await waitFor(() => expect(result.current.available).toBe(false));

    act(() => result.current.startHold());

    expect(capture.start).not.toHaveBeenCalled();
  });

  it("ignores a pointerup with no prior pointerdown (no matching in-flight capture)", async () => {
    const capture = fakeCapture();
    const { result } = renderHook(() =>
      usePushToTalk({ onTranscript: vi.fn() }, { voicePort: fakePort(), createCapture: () => capture }),
    );
    await waitFor(() => expect(result.current.available).toBe(true));

    act(() => result.current.endHold());

    expect(capture.stopAndTranscribe).not.toHaveBeenCalled();
    expect(result.current.indicator.isRecording).toBe(false);
  });

  // REGRESSION (2026-09-06, section C item 4 of the tovu-8f handoff): releasing the key while the
  // browser permission prompt is still open used to no-op (`endHold` only acted on `"recording"`),
  // so once permission resolved the machine sailed into `recording` anyway with nothing holding
  // the button down — the microphone stayed live with no way to stop it. `capture.start()` is left
  // unresolved here to hold the hook in `requesting-mic` deliberately, so `endHold` fires into
  // that exact window.
  it("REGRESSION: releasing during requesting-mic still releases the microphone once permission resolves, and never enters recording", async () => {
    let resolveStart: () => void = () => {};
    const startPromise = new Promise<void>((resolve) => {
      resolveStart = resolve;
    });
    const capture = fakeCapture({ start: vi.fn().mockReturnValue(startPromise) });
    const onTranscript = vi.fn();
    const { result } = renderHook(() =>
      usePushToTalk({ onTranscript }, { voicePort: fakePort(), createCapture: () => capture }),
    );
    await waitFor(() => expect(result.current.available).toBe(true));

    act(() => result.current.startHold());
    await waitFor(() => expect(result.current.indicator.label).toBe("Requesting microphone…"));

    // The user let go before the permission prompt resolved.
    act(() => result.current.endHold());

    // Permission now resolves — nothing is holding the button anymore, so the mic must be
    // released immediately rather than entering `recording`. Resolving bare (not wrapped in a
    // manual `act()`) and letting `waitFor` drive the aftermath matches this file's other
    // deferred-capture tests below (e.g. the retry test's `callCount`-gated capture).
    resolveStart();
    await waitFor(() => expect(capture.stopAndTranscribe).toHaveBeenCalledTimes(1));

    expect(result.current.indicator.isRecording).toBe(false);
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("a retry after an error works: pointerdown from the error state starts a fresh capture", async () => {
    const deniedCapture = fakeCapture({ start: vi.fn().mockRejectedValue(new Error("Permission denied")) });
    const grantedCapture = fakeCapture({ stopAndTranscribe: vi.fn().mockResolvedValue("retry worked") });
    let callCount = 0;
    const onTranscript = vi.fn();
    const { result } = renderHook(() =>
      usePushToTalk(
        { onTranscript },
        { voicePort: fakePort(), createCapture: () => (callCount++ === 0 ? deniedCapture : grantedCapture) },
      ),
    );
    await waitFor(() => expect(result.current.available).toBe(true));

    act(() => result.current.startHold());
    await waitFor(() => expect(result.current.indicator.label).toBe("Permission denied"));

    act(() => result.current.startHold());
    await waitFor(() => expect(result.current.indicator.isRecording).toBe(true));
    act(() => result.current.endHold());
    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith("retry worked"));
  });
});

/**
 * Unmounting the composer (closing the assistant, navigating away) runs no pointer handler, so the
 * hook itself has to let go of the microphone — whether the hold is already recording or still
 * waiting on the permission prompt.
 */
describe("usePushToTalk — unmount releases the microphone", () => {
  it("unmount while recording stops the capture", async () => {
    const capture = fakeCapture();
    const onTranscript = vi.fn();
    const { result, unmount } = renderHook(() =>
      usePushToTalk({ onTranscript }, { voicePort: fakePort(), createCapture: () => capture }),
    );
    await waitFor(() => expect(result.current.available).toBe(true));
    act(() => result.current.startHold());
    await waitFor(() => expect(result.current.indicator.isRecording).toBe(true));

    unmount();

    expect(capture.stopAndTranscribe).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("unmount while the permission prompt is still open releases the capture once it resolves", async () => {
    let grantMic!: () => void;
    const capture = fakeCapture({
      start: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            grantMic = resolve;
          }),
      ),
    });
    const { result, unmount } = renderHook(() =>
      usePushToTalk({ onTranscript: vi.fn() }, { voicePort: fakePort(), createCapture: () => capture }),
    );
    await waitFor(() => expect(result.current.available).toBe(true));
    act(() => result.current.startHold());
    expect(capture.start).toHaveBeenCalledTimes(1);

    unmount();
    // Nothing is live yet, so nothing is stopped yet — stopping a capture that never started would
    // only transcribe an empty recording.
    expect(capture.stopAndTranscribe).not.toHaveBeenCalled();

    await act(async () => {
      grantMic();
      await Promise.resolve();
    });

    expect(capture.stopAndTranscribe).toHaveBeenCalledTimes(1);
  });
});
