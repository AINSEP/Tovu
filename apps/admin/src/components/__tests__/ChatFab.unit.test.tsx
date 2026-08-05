import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatFab } from "../ChatFab";

/**
 * @file `ChatFab` (40% before this pass) — the floating assistant toggle. Uses the real
 * `useFabPosition` hook (already 95.8%-covered per the coverage audit's `hooks/` group; not this
 * dispatch's file to touch) rather than a stub, so the drag-guards-click integration this
 * component's own header documents is proven end to end, not just asserted about in isolation.
 *
 * jsdom has no `setPointerCapture`/`releasePointerCapture` at all — stubbed as no-ops in every
 * test (not only the drag-specific ones): `onPointerDown` is wired unconditionally, so even a
 * plain `userEvent.click()`'s synthesized pointerdown reaches `use-fab-position.hooks.ts`'s real
 * `e.currentTarget.setPointerCapture(...)` call and throws without this.
 */

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("ChatFab — closed state", () => {
  it("renders the open affordance: aria-expanded false, 'Open <label>' name/title, sparkle icon", () => {
    render(<ChatFab open={false} onToggle={vi.fn()} avoidBottomPx={0} avoidRightPx={0} />);
    const button = screen.getByRole("button", { name: "Open assistant" });

    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("title", "Open assistant");
    expect(button.className).not.toContain("chat-fab-dock-open");
  });

  it("threads a custom label through both the accessible name and the title", () => {
    render(<ChatFab open={false} onToggle={vi.fn()} avoidBottomPx={0} avoidRightPx={0} label="Jini" />);
    expect(screen.getByRole("button", { name: "Open Jini" })).toHaveAttribute("title", "Open Jini");
  });
});

describe("ChatFab — open state", () => {
  it("renders the close affordance: aria-expanded true, 'Close <label>' name/title, and the dock-open class", () => {
    render(<ChatFab open={true} onToggle={vi.fn()} avoidBottomPx={0} avoidRightPx={0} />);
    const button = screen.getByRole("button", { name: "Close assistant" });

    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button).toHaveAttribute("title", "Close assistant");
    expect(button.className).toContain("chat-fab-dock-open");
  });
});

describe("ChatFab — interaction", () => {
  it("a plain click (no drag) calls onToggle", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<ChatFab open={false} onToggle={onToggle} avoidBottomPx={0} avoidRightPx={0} />);

    await user.click(screen.getByRole("button", { name: "Open assistant" }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("forwards the ref to the underlying button element", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<ChatFab open={false} onToggle={vi.fn()} avoidBottomPx={0} avoidRightPx={0} ref={ref} />);

    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current).toBe(screen.getByRole("button", { name: "Open assistant" }));
  });

  it("a real drag past the threshold suppresses the trailing click's onToggle and applies chat-fab-dragging while in progress", () => {
    const onToggle = vi.fn();
    render(<ChatFab open={false} onToggle={onToggle} avoidBottomPx={0} avoidRightPx={0} />);
    const button = screen.getByRole("button", { name: "Open assistant" });
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
      top: 500, bottom: 556, left: 500, right: 556, width: 56, height: 56, x: 500, y: 500, toJSON() {},
    } as DOMRect);

    fireEvent.pointerDown(button, { button: 0, pointerId: 1, clientX: 520, clientY: 520 });
    // Past use-fab-position's own DRAG_THRESHOLD_PX (5) — this must register as a drag, not a tap.
    fireEvent.pointerMove(document, { pointerId: 1, clientX: 560, clientY: 560 });
    expect(button.className).toContain("chat-fab-dragging");

    fireEvent.pointerUp(document, { pointerId: 1, clientX: 560, clientY: 560 });
    expect(button.className).not.toContain("chat-fab-dragging"); // drag ended
    fireEvent.click(button); // the browser's own trailing click after a pointerup

    expect(onToggle).not.toHaveBeenCalled(); // swallowed by consumeDragFlag()
  });

  it("a pointerdown/pointerup with no meaningful movement (a tap) still calls onToggle on the trailing click", () => {
    const onToggle = vi.fn();
    render(<ChatFab open={false} onToggle={onToggle} avoidBottomPx={0} avoidRightPx={0} />);
    const button = screen.getByRole("button", { name: "Open assistant" });
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
      top: 500, bottom: 556, left: 500, right: 556, width: 56, height: 56, x: 500, y: 500, toJSON() {},
    } as DOMRect);

    fireEvent.pointerDown(button, { button: 0, pointerId: 1, clientX: 520, clientY: 520 });
    fireEvent.pointerUp(document, { pointerId: 1, clientX: 521, clientY: 520 }); // 1px — below DRAG_THRESHOLD_PX
    fireEvent.click(button);

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("a non-primary pointer button (e.g. right-click) does not start a drag capture", () => {
    const setPointerCapture = HTMLElement.prototype.setPointerCapture as unknown as ReturnType<typeof vi.fn>;
    render(<ChatFab open={false} onToggle={vi.fn()} avoidBottomPx={0} avoidRightPx={0} />);
    const button = screen.getByRole("button", { name: "Open assistant" });

    fireEvent.pointerDown(button, { button: 2, pointerId: 1, clientX: 520, clientY: 520 });

    expect(setPointerCapture).not.toHaveBeenCalled();
  });
});
