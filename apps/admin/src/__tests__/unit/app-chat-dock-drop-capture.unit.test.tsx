// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { DragEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { useChatDockLayout } from "../../App.hooks";

/**
 * @file SPEC-053 AC-01, hook level: `useChatDockLayout`'s `handleDockDropCapture` (App's dock
 * `<aside onDropCapture>`) forwards to the folder-drop handler `AssistantDock` published through
 * `publishDropCapture`. Moved out of `App.tsx`, which used to read and write the ref inline in JSX.
 * The real hook runs here: `chatOpen` stays `false`, so its `ResizeObserver` effects never construct
 * one (see `__tests__/setup.ts`), and `window.matchMedia` is the setup file's stub.
 */

function fakeDropEvent(): DragEvent<HTMLElement> {
  return { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as DragEvent<HTMLElement>;
}

describe("useChatDockLayout — dock drop capture", () => {
  it("is a no-op before AssistantDock has published a handler (the drop falls through untouched)", () => {
    const { result } = renderHook(() => useChatDockLayout());
    const event = fakeDropEvent();

    expect(() => result.current.handleDockDropCapture(event)).not.toThrow();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  it("forwards the same event to the published handler", () => {
    const { result } = renderHook(() => useChatDockLayout());
    const handler = vi.fn();
    const event = fakeDropEvent();

    act(() => result.current.publishDropCapture(handler));
    result.current.handleDockDropCapture(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it("forwards only to the most recently published handler", () => {
    const { result } = renderHook(() => useChatDockLayout());
    const first = vi.fn();
    const second = vi.fn();

    act(() => result.current.publishDropCapture(first));
    act(() => result.current.publishDropCapture(second));
    result.current.handleDockDropCapture(fakeDropEvent());

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("keeps both callbacks' identity across re-renders, so AssistantDock's publish effect does not re-fire", () => {
    const { result, rerender } = renderHook(() => useChatDockLayout());
    const { handleDockDropCapture, publishDropCapture } = result.current;

    act(() => result.current.setChatOpen(false));
    rerender();

    expect(result.current.handleDockDropCapture).toBe(handleDockDropCapture);
    expect(result.current.publishDropCapture).toBe(publishDropCapture);
  });
});
