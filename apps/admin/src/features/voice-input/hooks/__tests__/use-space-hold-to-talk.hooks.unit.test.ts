import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SPACE_HOLD_TO_TALK_MS } from "../space-hold-rules";
import { findComposerTextarea, useSpaceHoldToTalk } from "../use-space-hold-to-talk.hooks";

/**
 * @file The DOM-wiring half of the hold-space gesture, on a hand-built stand-in for
 * `@jini-ai/chat`'s composer markup. The happy path is proved against the REAL `ChatPane` in
 * `../../__tests__/voice-to-composer.integration.test.tsx`; this file covers the paths that one
 * cannot reach — the mic must never stay live after a blur or an unmount, and the gesture must
 * unbind cleanly when voice input is unavailable.
 */

/** Mirrors the two classes `Composer.tsx` puts on its root and its textarea. */
function mountComposerLikeDom(): { anchor: HTMLButtonElement; textarea: HTMLTextAreaElement } {
  const root = document.createElement("div");
  root.className = "jini-composer";
  const textarea = document.createElement("textarea");
  textarea.className = "jini-composer-input";
  const leading = document.createElement("div");
  leading.className = "jini-composer-leading";
  const anchor = document.createElement("button");
  leading.append(anchor);
  root.append(leading, textarea);
  document.body.append(root);
  return { anchor, textarea };
}

function pressSpace(textarea: HTMLTextAreaElement): boolean {
  return textarea.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
}

function releaseSpace(textarea: HTMLTextAreaElement) {
  textarea.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true, cancelable: true }));
}

interface HarnessOptions {
  enabled?: boolean;
  anchor: HTMLElement | null;
  onEngage: () => void;
  onRelease: () => void;
}

function renderGesture(options: HarnessOptions) {
  const anchorRef = { current: options.anchor };
  return renderHook(() =>
    useSpaceHoldToTalk({
      anchorRef,
      enabled: options.enabled ?? true,
      onEngage: options.onEngage,
      onRelease: options.onRelease,
    }),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("findComposerTextarea", () => {
  it("finds the composer's textarea from any element inside it", () => {
    const { anchor, textarea } = mountComposerLikeDom();
    expect(findComposerTextarea(anchor)).toBe(textarea);
  });

  it("returns null for a null anchor, and for one outside any composer", () => {
    expect(findComposerTextarea(null)).toBeNull();
    const orphan = document.createElement("button");
    document.body.append(orphan);
    expect(findComposerTextarea(orphan)).toBeNull();
  });
});

describe("useSpaceHoldToTalk", () => {
  it("binds nothing when voice input is unavailable — space stays an ordinary character", () => {
    const { anchor, textarea } = mountComposerLikeDom();
    const onEngage = vi.fn();
    renderGesture({ anchor, enabled: false, onEngage, onRelease: vi.fn() });

    const notPrevented = pressSpace(textarea);
    act(() => {
      vi.advanceTimersByTime(SPACE_HOLD_TO_TALK_MS * 2);
    });

    expect(notPrevented).toBe(true);
    expect(onEngage).not.toHaveBeenCalled();
  });

  it("does not throw when the anchor is not inside a composer at all", () => {
    const onEngage = vi.fn();
    expect(() => renderGesture({ anchor: null, onEngage, onRelease: vi.fn() })).not.toThrow();
    expect(onEngage).not.toHaveBeenCalled();
  });

  it("releases a live hold when the textarea loses focus — the mic never stays open unattended", () => {
    const { anchor, textarea } = mountComposerLikeDom();
    const onRelease = vi.fn();
    renderGesture({ anchor, onEngage: vi.fn(), onRelease });

    pressSpace(textarea);
    act(() => {
      vi.advanceTimersByTime(SPACE_HOLD_TO_TALK_MS);
    });
    textarea.dispatchEvent(new FocusEvent("blur"));

    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it("does not fire a phantom release when a merely armed hold loses focus", () => {
    const { anchor, textarea } = mountComposerLikeDom();
    const onEngage = vi.fn();
    const onRelease = vi.fn();
    renderGesture({ anchor, onEngage, onRelease });

    pressSpace(textarea);
    textarea.dispatchEvent(new FocusEvent("blur"));
    // The timer must be dead, not merely ignored: a late engage would open the mic with the
    // composer no longer focused.
    act(() => {
      vi.advanceTimersByTime(SPACE_HOLD_TO_TALK_MS * 2);
    });

    expect(onEngage).not.toHaveBeenCalled();
    expect(onRelease).not.toHaveBeenCalled();
  });

  it("releases a live hold on unmount", () => {
    const { anchor, textarea } = mountComposerLikeDom();
    const onRelease = vi.fn();
    const { unmount } = renderGesture({ anchor, onEngage: vi.fn(), onRelease });

    pressSpace(textarea);
    act(() => {
      vi.advanceTimersByTime(SPACE_HOLD_TO_TALK_MS);
    });
    unmount();

    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it("stops listening after unmount", () => {
    const { anchor, textarea } = mountComposerLikeDom();
    const onEngage = vi.fn();
    const { unmount } = renderGesture({ anchor, onEngage, onRelease: vi.fn() });
    unmount();

    pressSpace(textarea);
    act(() => {
      vi.advanceTimersByTime(SPACE_HOLD_TO_TALK_MS * 2);
    });

    expect(onEngage).not.toHaveBeenCalled();
  });

  it("engages once per hold, however many repeats arrive", () => {
    const { anchor, textarea } = mountComposerLikeDom();
    const onEngage = vi.fn();
    const onRelease = vi.fn();
    renderGesture({ anchor, onEngage, onRelease });

    pressSpace(textarea);
    pressSpace(textarea);
    pressSpace(textarea);
    act(() => {
      vi.advanceTimersByTime(SPACE_HOLD_TO_TALK_MS);
    });
    releaseSpace(textarea);

    expect(onEngage).toHaveBeenCalledTimes(1);
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it("uses the LIVE draft, not the value captured when the listener was bound", () => {
    const { anchor, textarea } = mountComposerLikeDom();
    const onEngage = vi.fn();
    renderGesture({ anchor, onEngage, onRelease: vi.fn() });

    // Bound while empty, then the operator types. The gesture must now stand down.
    textarea.value = "already writing something";
    const notPrevented = pressSpace(textarea);
    act(() => {
      vi.advanceTimersByTime(SPACE_HOLD_TO_TALK_MS * 2);
    });

    expect(notPrevented).toBe(true);
    expect(onEngage).not.toHaveBeenCalled();
  });
});
