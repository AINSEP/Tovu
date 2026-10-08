import { createElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Dialog } from "@jini-ai/ui-kit/react";

/**
 * @file Native cancellation now replaces the shared global listener all three Collections dialogs
 * used. Keep callback delivery and unmount cleanup observable through the owning Jini dialog.
 */

describe("native dialog dismissal", () => {
  it("calls onCancel when Escape is pressed", () => {
    const onCancel = vi.fn();
    render(createElement(Dialog, { open: true, title: "Collection", onClose: () => onCancel() }));
    const event = new Event("cancel", { cancelable: true });
    fireEvent(screen.getByRole("dialog"), event);
    expect(event.defaultPrevented).toBe(true);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not call onCancel for any other key", () => {
    const onCancel = vi.fn();
    render(createElement(Dialog, { open: true, title: "Collection", onClose: () => onCancel() }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("removes native cancellation on unmount — cancel after unmount does not call onCancel", () => {
    const onCancel = vi.fn();
    const { unmount } = render(createElement(Dialog, { open: true, title: "Collection", onClose: () => onCancel() }));
    const dialog = screen.getByRole("dialog");
    unmount();
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(onCancel).not.toHaveBeenCalled();
  });
});
