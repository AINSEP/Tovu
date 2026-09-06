import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PushToTalkMicButton } from "../PushToTalkMicButton";
import type { PushToTalkCapture } from "../hooks/mic-capture";
import type { VoiceInputPort } from "../voice-input-port";

/**
 * @file Renders `PushToTalkMicButton` against fake ports/captures injected through its own
 * `overrides` prop — the same "useX" DI seam `AssistantDockProps` already uses throughout this
 * app. No real Electron preload, microphone, or `AudioContext` is touched anywhere in this file;
 * the hook's own transition logic is covered separately in
 * `hooks/__tests__/use-push-to-talk.hooks.unit.test.ts`.
 */

function fakePort(overrides: Partial<VoiceInputPort> = {}): VoiceInputPort {
  return { isAvailable: vi.fn().mockResolvedValue({ available: true }), transcribe: vi.fn().mockResolvedValue({ text: "", elapsedMs: 0 }), ...overrides };
}

function fakeCapture(overrides: Partial<PushToTalkCapture> = {}): PushToTalkCapture {
  return { start: vi.fn().mockResolvedValue(undefined), stopAndTranscribe: vi.fn().mockResolvedValue(""), ...overrides };
}

describe("PushToTalkMicButton", () => {
  it("renders nothing while the availability probe is in flight", () => {
    const port = fakePort({ isAvailable: () => new Promise(() => {}) });
    const { container } = render(<PushToTalkMicButton onTranscript={vi.fn()} overrides={{ voicePort: port }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the port reports itself unavailable", async () => {
    const port = fakePort({ isAvailable: vi.fn().mockResolvedValue({ available: false }) });
    const { container } = render(<PushToTalkMicButton onTranscript={vi.fn()} overrides={{ voicePort: port }} />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("renders nothing at all outside the desktop shell (no voice port)", () => {
    const { container } = render(<PushToTalkMicButton onTranscript={vi.fn()} overrides={{ voicePort: null }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the mic button once availability is confirmed, not in the recording visual state", async () => {
    render(<PushToTalkMicButton onTranscript={vi.fn()} overrides={{ voicePort: fakePort() }} />);
    const button = await screen.findByRole("button", { name: "Hold to talk" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button.className).not.toContain("tovu-push-to-talk--recording");
  });

  it("shows the unmistakable recording state after pointerdown, and clears it after pointerup with the transcript delivered", async () => {
    const capture = fakeCapture({ stopAndTranscribe: vi.fn().mockResolvedValue("publish the homepage") });
    const onTranscript = vi.fn();
    render(<PushToTalkMicButton onTranscript={onTranscript} overrides={{ voicePort: fakePort(), createCapture: () => capture }} />);
    const button = await screen.findByRole("button", { name: "Hold to talk" });

    await act(async () => {
      button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    await waitFor(() => expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("button").className).toContain("tovu-push-to-talk--recording");
    expect(screen.getByRole("button", { name: "Recording — release to send" })).toBeInTheDocument();

    await act(async () => {
      screen.getByRole("button").dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    });
    await waitFor(() => expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false"));
    expect(onTranscript).toHaveBeenCalledWith("publish the homepage");
  });

  it("pointerleave stops a recording just like pointerup — a drag off the button never leaves the mic live", async () => {
    const capture = fakeCapture();
    render(<PushToTalkMicButton onTranscript={vi.fn()} overrides={{ voicePort: fakePort(), createCapture: () => capture }} />);
    const button = await screen.findByRole("button", { name: "Hold to talk" });

    await act(async () => {
      button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    await waitFor(() => expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true"));

    await act(async () => {
      // React synthesizes its non-bubbling `onPointerLeave` from the native, bubbling `pointerout`
      // event (the same "over/out pair" delegation it uses for `onMouseLeave`) — dispatching a raw
      // `pointerleave` here would never reach the delegated listener at all.
      screen.getByRole("button").dispatchEvent(new PointerEvent("pointerout", { bubbles: true }));
    });
    await waitFor(() => expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false"));
    expect(capture.stopAndTranscribe).toHaveBeenCalledTimes(1);
  });
});
