import userEvent from "@testing-library/user-event";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPane } from "@jini-ai/chat/react";
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
      // A usable agent is required, not decoration: with an empty inventory `ChatPane` treats
      // itself as unavailable and disables the textarea, so nothing below could be typed or held.
      agents={[{ id: "claude", name: "Claude", available: true }]}
      composerHandle={voiceInput.composerHandle}
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

  it.each(["summarise the release notes", "summarise the release notes ", "summarise the release notes\n"])("appends onto the draft %j without destroying it or doubling whitespace", async (draft) => {
    const transport = createRecordingTransport();
    render(<VoiceComposerHarness transport={transport} transcript="and check the deploy log" />);
    const mic = await findMicButton();

    fireEvent.change(composerTextarea(), { target: { value: draft } });

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

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(textarea);
    await user.keyboard("[Space>]");
    expect(textarea).toHaveValue(" ");
    act(() => {
      vi.advanceTimersByTime(SPACE_HOLD_TO_TALK_MS);
    });
    await flush();
    // Recording is genuinely open — the shared indicator, not a log line, says so.
    expect(screen.getByRole("button", { name: "Recording — release to send" })).toBeInTheDocument();

    await user.keyboard("[/Space]");
    await flush();

    expect(textarea).toHaveValue("ship it on friday");
    expect(transport.startRunCalls).toHaveLength(0);
  });

  it.each(["ControlLeft", "MetaLeft", "AltLeft", "ShiftLeft"])("does not record %s + Space in the real composer", async (modifier) => {
    const transport = createRecordingTransport();
    render(<VoiceComposerHarness transport={transport} transcript="must not record" />);
    await findMicButton();
    const textarea = composerTextarea();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(textarea);
    await user.keyboard(`[${modifier}>][Space>]`);
    act(() => vi.advanceTimersByTime(SPACE_HOLD_TO_TALK_MS * 2));
    await flush();
    expect(screen.getByRole("button", { name: "Hold to talk" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Recording — release to send" })).not.toBeInTheDocument();
    await user.keyboard(`[/Space][/${modifier}]`);
    await flush();
    expect(textarea.value).not.toBe("must not record");
    expect(transport.startRunCalls).toHaveLength(0);
  });

  it("leaves composing Space events unprevented without opening the microphone", async () => {
    const transport = createRecordingTransport();
    render(<VoiceComposerHarness transport={transport} transcript="must not record" />);
    await findMicButton();
    const textarea = composerTextarea();
    textarea.focus();
    expect(fireEvent.keyDown(textarea, { key: " ", isComposing: true })).toBe(true);
    act(() => vi.advanceTimersByTime(SPACE_HOLD_TO_TALK_MS * 2));
    await flush();
    expect(screen.getByRole("button", { name: "Hold to talk" })).toBeInTheDocument();
    fireEvent.keyUp(textarea, { key: " " });
    await flush();
    expect(textarea).toHaveValue("");
    expect(transport.startRunCalls).toHaveLength(0);
  });

  it("releases an engaged hold on blur and delivers its transcript to the real composer", async () => {
    const transport = createRecordingTransport();
    render(<VoiceComposerHarness transport={transport} transcript="released on blur" />);
    await findMicButton();
    const textarea = composerTextarea();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(textarea);
    await user.keyboard("[Space>]");
    act(() => vi.advanceTimersByTime(SPACE_HOLD_TO_TALK_MS));
    await flush();
    expect(screen.getByRole("button", { name: "Recording — release to send" })).toBeInTheDocument();
    await act(async () => textarea.blur());
    await flush();
    expect(screen.getByRole("button", { name: "Hold to talk" })).toBeInTheDocument();
    expect(textarea).toHaveValue("released on blur");
    expect(transport.startRunCalls).toHaveLength(0);
  });

  it("leaves a quick tap alone: no recording, and the browser still types the space", async () => {
    const transport = createRecordingTransport();
    render(<VoiceComposerHarness transport={transport} transcript="never spoken" />);
    await findMicButton();
    const textarea = composerTextarea();

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(textarea);
    await user.keyboard("[Space>]");
    act(() => {
      vi.advanceTimersByTime(SPACE_HOLD_TO_TALK_MS - 50);
    });
    await user.keyboard("[/Space]");
    // Well past the threshold: a disarmed timer must not fire late and open the mic behind the
    // operator's back.
    act(() => {
      vi.advanceTimersByTime(SPACE_HOLD_TO_TALK_MS * 3);
    });
    await flush();

    expect(screen.getByRole("button", { name: "Hold to talk" })).toBeInTheDocument();
    expect(textarea).toHaveValue(" ");
  });

  it("suppresses OS key repeat during a hold so no run of spaces is typed", async () => {
    const transport = createRecordingTransport();
    render(<VoiceComposerHarness transport={transport} transcript="one utterance" />);
    await findMicButton();
    const textarea = composerTextarea();

    const user = userEvent.setup({ delay: SPACE_HOLD_TO_TALK_MS + 1, advanceTimers: vi.advanceTimersByTime });
    await user.click(textarea);
    // One held gesture: repeats arrive after the engagement threshold, with insertion defaults.
    await user.keyboard("[Space>3]");
    expect(textarea).toHaveValue(" ");
    // Every repeat after the first is swallowed — this is the run-of-spaces failure mode the
    // gesture would otherwise have.
    const repeats = [
      fireEvent.keyDown(textarea, { key: " ", repeat: true }),
      fireEvent.keyDown(textarea, { key: " ", repeat: true }),
    ];

    expect(repeats).toEqual([false, false]);

    act(() => {
      vi.advanceTimersByTime(SPACE_HOLD_TO_TALK_MS);
    });
    await flush();
    // Repeats never restarted the gesture: exactly one recording is open.
    expect(screen.getByRole("button", { name: "Recording — release to send" })).toBeInTheDocument();

    // And a repeat DURING recording is swallowed too.
    expect(fireEvent.keyDown(textarea, { key: " ", repeat: true })).toBe(false);
    expect(textarea).toHaveValue(" ");

    await user.keyboard("[/Space]");
    await flush();
    expect(textarea).toHaveValue("one utterance");
  });

  it("does not engage while the draft has text — the space types normally instead", async () => {
    const transport = createRecordingTransport();
    render(<VoiceComposerHarness transport={transport} transcript="never spoken" />);
    await findMicButton();
    const textarea = composerTextarea();
    fireEvent.change(textarea, { target: { value: "half a sentence" } });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(textarea);
    const event = fireEvent.keyDown(textarea, { key: " " });
    await user.keyboard(" ");
    act(() => {
      vi.advanceTimersByTime(SPACE_HOLD_TO_TALK_MS * 4);
    });
    await flush();

    // `fireEvent` returns false when a handler called preventDefault: the browser must be left to
    // type this space, since there IS text here the gesture would otherwise be typing over.
    expect(event).toBe(true);
    expect(screen.getByRole("button", { name: "Hold to talk" })).toBeInTheDocument();
    expect(textarea).toHaveValue("half a sentence ");
  });
});
