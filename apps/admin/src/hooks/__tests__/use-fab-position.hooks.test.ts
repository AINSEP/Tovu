// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FAB_EDGE_MARGIN, useFabPosition, type FabPositionResult } from "../use-fab-position.hooks";

/**
 * @file `useFabPosition` — pins the free-drag fix (MSG-09 follow-up): a drop anywhere on screen
 * rests exactly there, not snapped to the nearest edge, and the `{ side, bottomFraction }` shape
 * an existing browser may already have in `localStorage` is migrated rather than discarded or
 * left to throw/NaN. See the source file's header for the full before/after story.
 *
 * `.chat-fab`'s real size (56px) and edge margin (`FAB_EDGE_MARGIN`, imported rather than
 * re-declared) are the same constants the hook itself uses to derive on-screen clamp bounds —
 * duplicating the `56` here mirrors the hook's own comment on why that constant isn't read from a
 * live layout measurement.
 */

const STORAGE_KEY = "tovu-admin-fab-position";
const FAB_SIZE_PX = 56;

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true, writable: true });
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true, writable: true });
}

type PointerDownEvent = Parameters<FabPositionResult["onPointerDown"]>[0];

/** A fake React pointer event good enough for `onPointerDown`: it only reads `button`,
 *  `pointerId`, `clientX`/`clientY`, and `currentTarget.getBoundingClientRect()`/
 *  `setPointerCapture()` — nothing else about a real event is exercised. */
function pointerDown(clientX: number, clientY: number, rect: { left: number; top: number; right: number; bottom: number }): PointerDownEvent {
  return {
    button: 0,
    pointerId: 1,
    clientX,
    clientY,
    currentTarget: {
      getBoundingClientRect: () => rect as DOMRect,
      setPointerCapture: () => {},
    },
  } as unknown as PointerDownEvent;
}

/** `pointermove`/`pointerup` are bound with real `document.addEventListener`, not React's
 *  synthetic event system, so they need real DOM events dispatched on `document` — jsdom's
 *  `PointerEvent` constructor supports `clientX`/`clientY`, confirmed against this repo's
 *  installed jsdom version before relying on it here. */
function pointerMove(clientX: number, clientY: number) {
  document.dispatchEvent(new PointerEvent("pointermove", { clientX, clientY }));
}

function pointerUp(clientX: number, clientY: number) {
  document.dispatchEvent(new PointerEvent("pointerup", { clientX, clientY }));
}

beforeEach(() => {
  localStorage.clear();
  setViewport(1000, 800);
});

afterEach(() => {
  localStorage.clear();
});

describe("default position", () => {
  it("rests bottom-right, flush against the edge margin, before any drag", () => {
    const { result } = renderHook(() => useFabPosition({ dockOpen: false, avoidBottomPx: 0 }));
    expect(result.current.style).toEqual({ right: FAB_EDGE_MARGIN, bottom: FAB_EDGE_MARGIN });
  });
});

describe("click vs. drag threshold", () => {
  it("movement under the threshold is a tap: no position change, nothing persisted, drag flag stays clear", () => {
    const { result } = renderHook(() => useFabPosition({ dockOpen: false, avoidBottomPx: 0 }));
    const rect = { left: 924, top: 724, right: 980, bottom: 780 };

    act(() => result.current.onPointerDown(pointerDown(952, 752, rect)));
    act(() => pointerMove(954, 753)); // dx=2, dy=1 — hypot ~2.24px, under DRAG_THRESHOLD_PX (5)
    act(() => pointerUp(954, 753));

    expect(result.current.style).toEqual({ right: FAB_EDGE_MARGIN, bottom: FAB_EDGE_MARGIN });
    expect(result.current.consumeDragFlag()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe("free-form drag (no edge-snap)", () => {
  it("a drop in the middle of the screen stays in the middle of the screen", () => {
    const { result } = renderHook(() => useFabPosition({ dockOpen: false, avoidBottomPx: 0 }));
    // Starts at the default bottom-right resting spot (right=20, bottom=20 at this 1000x800
    // viewport) and drags 400px left, 350px up — well past the drag threshold, and nowhere near
    // either vertical edge on release.
    const rect = { left: 924, top: 724, right: 980, bottom: 780 };

    act(() => result.current.onPointerDown(pointerDown(952, 752, rect)));
    act(() => pointerMove(552, 402));
    act(() => pointerUp(552, 402));

    // Old behavior would have snapped this back to right:20 or left:20 — asserting the exact
    // mid-screen pixel value is what proves the snap is gone, not just "moved somewhere".
    expect(result.current.style).toEqual({ right: 420, bottom: 370 });
    expect(result.current.consumeDragFlag()).toBe(true);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(stored).toEqual({ rightFraction: 0.42, bottomFraction: 0.4625 });
  });
});

describe("legacy shape migration", () => {
  it("migrates a legacy right-side value to a rightFraction flush against the right edge", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ side: "right", bottomFraction: 0.3 }));
    const { result } = renderHook(() => useFabPosition({ dockOpen: false, avoidBottomPx: 0 }));

    // side: "right" always rested exactly FAB_EDGE_MARGIN from the right edge — the migration
    // should reproduce that same resting spot, not the default corner.
    expect(result.current.style).toEqual({ right: FAB_EDGE_MARGIN, bottom: 240 });
  });

  it("migrates a legacy left-side value to a rightFraction flush against the left edge", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ side: "left", bottomFraction: 0.75 }));
    const { result } = renderHook(() => useFabPosition({ dockOpen: false, avoidBottomPx: 0 }));

    // side: "left" rested FAB_EDGE_MARGIN from the LEFT edge, i.e. innerWidth - margin - size
    // from the right edge (1000 - 20 - 56 = 924) — same physical spot, expressed the new way.
    expect(result.current.style).toEqual({ right: 1000 - FAB_EDGE_MARGIN - FAB_SIZE_PX, bottom: 600 });
  });

  it("falls back to the default position for a malformed stored value, without throwing or producing NaN", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    const { result } = renderHook(() => useFabPosition({ dockOpen: false, avoidBottomPx: 0 }));

    expect(result.current.style).toEqual({ right: FAB_EDGE_MARGIN, bottom: FAB_EDGE_MARGIN });
    expect(Number.isNaN(result.current.style.right)).toBe(false);
    expect(Number.isNaN(result.current.style.bottom)).toBe(false);
  });

  it("falls back to the default position for a well-formed but unrecognized shape", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ foo: "bar" }));
    const { result } = renderHook(() => useFabPosition({ dockOpen: false, avoidBottomPx: 0 }));

    expect(result.current.style).toEqual({ right: FAB_EDGE_MARGIN, bottom: FAB_EDGE_MARGIN });
  });
});

describe("resize re-clamp", () => {
  it("recomputes pixels from the stored fraction on resize rather than holding a stale value", () => {
    setViewport(2000, 1500);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rightFraction: 0.5, bottomFraction: 0.5 }));
    const { result } = renderHook(() => useFabPosition({ dockOpen: false, avoidBottomPx: 0 }));

    expect(result.current.style).toEqual({ right: 1000, bottom: 750 });

    act(() => {
      setViewport(800, 600);
      window.dispatchEvent(new Event("resize"));
    });

    expect(result.current.style).toEqual({ right: 400, bottom: 300 });
  });

  it("keeps the FAB on-screen after a drastic shrink, even when fraction*width would land it off-screen", () => {
    setViewport(2000, 1500);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rightFraction: 0.9, bottomFraction: 0.9 }));
    const { result } = renderHook(() => useFabPosition({ dockOpen: false, avoidBottomPx: 0 }));

    act(() => {
      setViewport(300, 300);
      window.dispatchEvent(new Event("resize"));
    });

    // 0.9 * 300 = 270px from each edge would push the 56px box off a 300px viewport — clamped
    // back to the same margin-aware bound `style` always enforces.
    const maxOffset = 300 - FAB_EDGE_MARGIN - FAB_SIZE_PX;
    expect(result.current.style).toEqual({ right: maxOffset, bottom: maxOffset });
  });
});

describe("dock-open bottom clearance", () => {
  it("still holds above the mobile sheet while the dock is open, independent of the horizontal axis", () => {
    const { result } = renderHook(() => useFabPosition({ dockOpen: true, avoidBottomPx: 300 }));
    // Default resting bottom (20) is below the sheet's clearance requirement (300 + 20 = 320),
    // so the dock-open floor wins; the right offset is untouched by dockOpen.
    expect(result.current.style).toEqual({ right: FAB_EDGE_MARGIN, bottom: 320 });
  });

  it("never lets a tall sheet push the FAB off the top edge — reported as the FAB going missing", () => {
    // `avoidBottomPx` is the one input on this path that is NOT viewport-relative: it is a raw
    // pixel measurement of another element. A sheet nearly as tall as the window used to win the
    // Math.max outright and set `bottom` past the viewport, putting the FAB above the top edge
    // where it cannot be seen or clicked. Every other position here is clamped; this one was not.
    setViewport(1500, 800);
    const { result } = renderHook(() => useFabPosition({ dockOpen: true, avoidBottomPx: 900 }));

    const maxBottom = 800 - FAB_EDGE_MARGIN - FAB_SIZE_PX;
    expect(result.current.style.bottom).toBe(maxBottom);
    // The property that actually matters, stated as itself rather than as a number: the whole
    // 56px box sits inside the window.
    expect(result.current.style.bottom + FAB_SIZE_PX).toBeLessThanOrEqual(800);
  });

  it("keeps the margin as a floor when the sheet reports zero height", () => {
    setViewport(1500, 800);
    const { result } = renderHook(() => useFabPosition({ dockOpen: true, avoidBottomPx: 0 }));
    expect(result.current.style.bottom).toBe(FAB_EDGE_MARGIN);
  });
});
