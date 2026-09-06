import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPane, type ChatPaneComposerHandle } from "@jini-ai/chat/react";
import type { ChatTransport, StartRunInput } from "@jini-ai/chat/core";

import { PushToTalkMicButton } from "../PushToTalkMicButton";
import { useComposerVoiceInput } from "../hooks/use-composer-voice-input.hooks";
import { SPACE_HOLD_TO_TALK_MS } from "../hooks/space-hold-rules";
import type { PushToTalkCapture } from "../hooks/mic-capture";
import type { VoiceInputPort } from "../voice-input-port";

/**
 * @file The load-bearing proof for this feature, against the REAL `@jini-ai/chat` `ChatPane` — no
 * mocked composer, no re-implementation of the draft-insertion rule:
 *
 * 1. A released hold puts the EXACT transcript into the composer's draft.
 * 2. It does not clobber text the operator had already typed.
 * 3. It does not send — `transport.startRun` is never called.
 *
 * The gesture is driven both ways (mic button pointer events, and holding space in an empty
 * composer), because the two share one controller and a test of only one proves nothing about the
 * other.
 *
 * Only the microphone/recognizer is faked (`FakeCapture`, `fakeVoicePort`): jsdom has no
 * `getUserMedia`, no `AudioContext`, and no macOS Speech framework. Everything between the fake's
 * resolved transcript and the rendered `<textarea value>` is production code.
 */

/** Records `startRun` so "did not send" is an asserted fact, not an assumption. */
function createRecordingTransport(): ChatTransport & { startRunCalls: StartRunInput[] } {
  const startRunCalls: StartRunInput[] = [];
  return {
    startRunCalls,
    async startRun(input) {
      startRunCalls.push(input);
      return { runId: "run-1" };
    },
    async reattachRun() {},
    async fetchRunStatus() {
      return null;
    },
    async stopRun() {},
  };
}

/** A capture whose transcript is fixed up front — the recognizer itself is out of scope here. */
function createFakeCapture(transcript: string): PushToTalkCapture {
  return {
    start: async () => {},
    stopAndTranscribe: async () => transcript,
  };
}

const fakeVoicePort: VoiceInputPort = {
  isAvailable: async () => ({ available: true }),
  transcribe: async () => ({ text: "", elapsedMs: 0 }),
};

function VoiceComposerHarness({ transport, transcript }: { transport: ChatTransport; transcript: string }) {
  const voiceInput = useComposerVoiceInput();
  return (
    <ChatPane
      transport={transport}
      agents={[{ id: "claude", label: "Claude" }]}
      composerHandle={voiceInput.composerHandle as React.RefObject<ChatPaneComposerHandle | null>}
      leadingAccessory={
        <PushToTalkMicButton
          onTranscript={voiceInput.insertTranscript}
          overrides={{ voicePort: fakeVoicePort, createCapture: () => createFakeCapture(transcript) }}
        />
      }
    />
  );
}

/**
 * The mic button only renders once the availability probe resolves. The trailing {@link flush} is
 * load-bearing, not defensive: `waitFor` can observe the newly rendered button one tick before
 * React flushes the passive effect that binds the hold-space listeners, and a `fireEvent` in that
 * window would silently reach no listener at all.
 */
async function findMicButton(): Promise<HTMLElement> {
  const button = await waitFor(() => screen.getByRole("button", { name: "Hold to talk" }));
  await flush();
  return button;
}

function composerTextarea(): HTMLTextAreaElement {
  return screen.getByRole("textbox") as HTMLTextAreaElement;
}

/** Lets the capture's own promises settle between state transitions. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a released voice hold, against the real ChatPane composer", () => {
  it("puts the exact transcript into the draft and does not send it", async () => {
    const transport = createRecordingTransport();
    render(<VoiceComposerHarness transport={transport} transcript="the future of local-first software" />);
    const mic = await findMicButton();

    fireEvent.pointerDown(mic);
    await flush();
    fireEvent.pointerUp(mic);
    await flush();

    expect(composerTextarea()).toHaveValue("the future of local-first software");
    // The whole reason auto-send was rejected: transcription is imperfect and must be editable
    // before it goes anywhere.
    expect(transport.startRunCalls).toHaveLength(0);
  });

  it("appends onto a half-written message instead of destroying it", async () => {
    const transport = createRecordingTransport();
    render(<VoiceComposerHarness transport={transport} transcript="and check the deploy log" />);
    const mic = await findMicButton();

    fireEvent.change(composerTextarea(), { target: { value: "summarise the release notes" } });

    fireEvent.pointerDown(mic);
    await flush();
    fireEvent.pointerUp(mic);
    await flush();

    expect(composerTextarea()).toHaveValue("summarise the release notes and check the deploy log");
    expect(transport.startRunCalls).toHaveLength(0);
  });
});

describe("holding space in the composer", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens the mic and delivers the transcript to the draft on release", async () => {
    const transport = createRecordingTransport();
    render(<VoiceComposerHarness transport={transport} transcript="ship it on friday" />);
    await findMicButton();
    const textarea = composerTextarea();

    fireEvent.keyDown(textarea, { key: " " });
    act(() => {
      vi.advanceTimersByTime(SPACE_HOLD_TO_TALK_MS);
    });
    await flush();
    // Recording is genuinely open — the shared indicator, not a log line, says so.
    expect(screen.getByRole("button", { name: "Recording — release to send" })).toBeInTheDocument();

    fireEvent.keyUp(textarea, { key: " " });
    await flush();

    expect(textarea).toHaveValue("ship it on friday");
    expect(transport.startRunCalls).toHaveLength(0);
  });

  it("leaves a quick tap alone: no recording, and the browser still types the space", async () => {
    const transport = createRecordingTransport();
    render(<VoiceComposerHarness transport={transport} transcript="never spoken" />);
    await findMicButton();
    const textarea = composerTextarea();

    // `fireEvent` returns false only when a handler called `preventDefault`. True here means the
    // keystroke is left entirely to the browser, which is what types the space. (jsdom does not
    // simulate that insertion itself, so this flag — not the textarea's value — is the real
    // observable for "the browser was allowed to do its normal thing".)
    const down = fireEvent.keyDown(textarea, { key: " " });
    act(() => {
      vi.advanceTimersByTime(SPACE_HOLD_TO_TALK_MS - 50);
    });
    fireEvent.keyUp(textarea, { key: " " });
    // Well past the threshold: a disarmed timer must not fire late and open the mic behind the
    // operator's back.
    act(() => {
      vi.advanceTimersByTime(SPACE_HOLD_TO_TALK_MS * 3);
    });
    await flush();

    expect(down).toBe(true);
    expect(screen.getByRole("button", { name: "Hold to talk" })).toBeInTheDocument();
    expect(textarea).toHaveValue("");
  });

  it("suppresses OS key repeat during a hold so no run of spaces is typed", async () => {
    const transport = createRecordingTransport();
    render(<VoiceComposerHarness transport={transport} transcript="one utterance" />);
    await findMicButton();
    const textarea = composerTextarea();

    const first = fireEvent.keyDown(textarea, { key: " " });
    // Every repeat after the first is swallowed — this is the run-of-spaces failure mode the
    // gesture would otherwise have.
    const repeats = [
      fireEvent.keyDown(textarea, { key: " ", repeat: true }),
      fireEvent.keyDown(textarea, { key: " ", repeat: true }),
    ];

    expect(first).toBe(true);
    expect(repeats).toEqual([false, false]);

    act(() => {
      vi.advanceTimersByTime(SPACE_HOLD_TO_TALK_MS);
    });
    await flush();
    // Repeats never restarted the gesture: exactly one recording is open.
    expect(screen.getByRole("button", { name: "Recording — release to send" })).toBeInTheDocument();

    // And a repeat DURING recording is swallowed too.
    expect(fireEvent.keyDown(textarea, { key: " ", repeat: true })).toBe(false);

    fireEvent.keyUp(textarea, { key: " " });
    await flush();
    expect(textarea).toHaveValue("one utterance");
  });

  it("does not engage while the draft has text — the space types normally instead", async () => {
    const transport = createRecordingTransport();
    render(<VoiceComposerHarness transport={transport} transcript="never spoken" />);
    await findMicButton();
    const textarea = composerTextarea();
    fireEvent.change(textarea, { target: { value: "half a sentence" } });

    const event = fireEvent.keyDown(textarea, { key: " " });
    act(() => {
      vi.advanceTimersByTime(SPACE_HOLD_TO_TALK_MS * 4);
    });
    await flush();

    // `fireEvent` returns false when a handler called preventDefault: the browser must be left to
    // type this space, since there IS text here the gesture would otherwise be typing over.
    expect(event).toBe(true);
    expect(screen.getByRole("button", { name: "Hold to talk" })).toBeInTheDocument();
    expect(textarea).toHaveValue("half a sentence");
  });
});
