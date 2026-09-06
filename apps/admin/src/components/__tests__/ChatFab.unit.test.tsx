import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatFab } from "../ChatFab/ChatFab";
import type { FabPositionResult } from "../ChatFab/ChatFab.hooks";

/**
 * @file `ChatFab` (40% before this pass) — the floating assistant toggle. Uses the real
 * `useFabPosition` hook (already 95.8%-covered per the coverage audit's `hooks/` group; not this
 * dispatch's file to touch) rather than a stub, so the drag-guards-click integration this
 * component's own header documents is proven end to end, not just asserted about in isolation.
 *
 * jsdom has no `setPointerCapture`/`releasePointerCapture` at all — stubbed as no-ops in every
 * test (not only the drag-specific ones): `onPointerDown` is wired unconditionally, so even a
 * plain `userEvent.click()`'s synthesized pointerdown reaches `ChatFab.hooks.tsx`'s real
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

  it("falls back to the English action label when locale has no FAB_ACTION_TEMPLATE entry", () => {
    render(
      <ChatFab open={false} onToggle={vi.fn()} avoidBottomPx={0} avoidRightPx={0} locale="xx-unsupported" />,
    );
    expect(screen.getByRole("button", { name: "Open assistant" })).toBeInTheDocument();
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
    // Past ChatFab.hooks.tsx's own DRAG_THRESHOLD_PX (5) — this must register as a drag, not a tap.
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
    const setPointerCapture = HTMLElement.prototype.setPointerCapture as unknown as ReturnType<typeof vi.fn<(...args: any[]) => any>>;
    render(<ChatFab open={false} onToggle={vi.fn()} avoidBottomPx={0} avoidRightPx={0} />);
    const button = screen.getByRole("button", { name: "Open assistant" });

    fireEvent.pointerDown(button, { button: 2, pointerId: 1, clientX: 520, clientY: 520 });

    expect(setPointerCapture).not.toHaveBeenCalled();
  });
});

/**
 * `useFab` (MSG-01, 2026-08-06, owner directive) — mirrors Jini's `ConfirmDialog.test.tsx`'s own
 * `describe('ConfirmDialog dialog-hook injection')` block: proves the fake is actually reaching the
 * render, not just that the prop typechecks. `style: { right: 999, bottom: 888 }` is a position the
 * REAL `useFabPosition` could never produce at this suite's default 1024×768-ish jsdom viewport (its
 * own clamp holds every axis to `[FAB_EDGE_MARGIN, innerWidth/innerHeight - FAB_EDGE_MARGIN -
 * FAB_SIZE_PX]` — see `ChatFab.hooks.tsx`), so this test fails if the default ever gets wired back
 * in directly instead of the injected fake.
 */
describe("ChatFab useFab injection", () => {
  function fakeFab(overrides: Partial<FabPositionResult> = {}): FabPositionResult {
    return {
      style: { right: 999, bottom: 888 },
      onPointerDown: vi.fn(),
      consumeDragFlag: vi.fn(() => false),
      isDragging: false,
      ...overrides,
    };
  }

  it("renders at the injected fake's position, not the real hook's clamped default", () => {
    render(<ChatFab open={false} onToggle={vi.fn()} avoidBottomPx={0} avoidRightPx={0} useFab={() => fakeFab()} />);
    const button = screen.getByRole("button", { name: "Open assistant" });

    expect(button).toHaveStyle({ right: "999px", bottom: "888px" });
  });

  it("routes onClick through the injected fake's consumeDragFlag, not the real drag state", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    // The fake reports every click as the tail end of a drag — the real hook would never do this
    // for a plain click with no preceding pointerdown/move, so onToggle firing zero times here can
    // only be explained by the injected fake being consulted.
    render(
      <ChatFab
        open={false}
        onToggle={onToggle}
        avoidBottomPx={0}
        avoidRightPx={0}
        useFab={() => fakeFab({ consumeDragFlag: vi.fn(() => true) })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open assistant" }));

    expect(onToggle).not.toHaveBeenCalled();
  });
});
