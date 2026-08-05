import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useEscapeToCancel } from "../hooks/use-escape-to-cancel.hooks";

/**
 * @file The shared Escape-to-cancel keydown listener all three Collections dialogs use.
 */

describe("useEscapeToCancel", () => {
  it("calls onCancel when Escape is pressed", () => {
    const onCancel = vi.fn();
    renderHook(() => useEscapeToCancel(onCancel));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not call onCancel for any other key", () => {
    const onCancel = vi.fn();
    renderHook(() => useEscapeToCancel(onCancel));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("removes the listener on unmount — Escape after unmount does not call onCancel", () => {
    const onCancel = vi.fn();
    const { unmount } = renderHook(() => useEscapeToCancel(onCancel));
    unmount();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onCancel).not.toHaveBeenCalled();
  });
});
