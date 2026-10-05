import type { MouseEvent, PointerEvent } from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_FAB_OFFSET,
  FAB_OFFSET_STORAGE_KEY,
  clampFabOffset,
  exceedsDragThreshold,
  fabPositionStyle,
  fabTipSide,
  readStoredFabOffset,
  useDraggablePreviewFab,
} from "../use-draggable-preview-fab.hooks";

/** In-memory stand-in for `sessionStorage`. */
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

/** A button inside an 800x600 stage, with a 36px fab. jsdom has no layout, so sizes are stubbed. */
function fakeButton() {
  const stage = { getBoundingClientRect: () => ({ width: 800, height: 600 }) };
  return {
    offsetParent: stage,
    parentElement: stage,
    getBoundingClientRect: () => ({ width: 36, height: 36 }),
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
  };
}

function pointer(button: ReturnType<typeof fakeButton>, x: number, y: number, extra: Partial<{ button: number; pointerId: number }> = {}) {
  return { currentTarget: button, clientX: x, clientY: y, button: 0, pointerId: 1, ...extra } as unknown as PointerEvent<HTMLElement>;
}

function click() {
  return { preventDefault: vi.fn() } as unknown as MouseEvent<HTMLElement> & { preventDefault: ReturnType<typeof vi.fn> };
}

describe("pure helpers", () => {
  it("treats travel under 4px as a click and 4px or more as a drag", () => {
    expect(exceedsDragThreshold(2, 3)).toBe(false);
    expect(exceedsDragThreshold(0, 4)).toBe(true);
    expect(exceedsDragThreshold(-3, -3)).toBe(true);
  });

  it("clamps the offset so the whole button stays inside the stage", () => {
    const boxes = { stage: { width: 800, height: 600 }, fab: { width: 36, height: 36 } };
    expect(clampFabOffset({ top: -20, right: -5 }, boxes)).toEqual({ top: 0, right: 0 });
    expect(clampFabOffset({ top: 900, right: 900 }, boxes)).toEqual({ top: 564, right: 764 });
    expect(clampFabOffset({ top: 50, right: 70 }, boxes)).toEqual({ top: 50, right: 70 });
  });

  it("pins to the corner when the stage is smaller than the button", () => {
    expect(clampFabOffset({ top: 10, right: 10 }, { stage: { width: 20, height: 20 }, fab: { width: 36, height: 36 } })).toEqual({ top: 0, right: 0 });
  });

  it("re-clamps in CSS against the stage size, so a shrinking stage never hides the button", () => {
    expect(fabPositionStyle({ top: 120, right: 40 })).toEqual({
      top: "min(120px, calc(100% - 2.25rem))",
      right: "min(40px, calc(100% - 2.25rem))",
    });
  });

  it("opens the hint rightwards only once the button is in the stage's left half", () => {
    expect(fabTipSide({ top: 0, right: 100 }, 800)).toBe("left");
    expect(fabTipSide({ top: 0, right: 500 }, 800)).toBe("right");
    expect(fabTipSide({ top: 0, right: 500 }, 0)).toBe("left");
  });

  it("reads a stored offset, and falls back to the corner for missing, malformed or throwing storage", () => {
    expect(readStoredFabOffset(fakeStorage({ [FAB_OFFSET_STORAGE_KEY]: '{"top":30,"right":60}' }))).toEqual({ top: 30, right: 60 });
    expect(readStoredFabOffset(fakeStorage())).toEqual(DEFAULT_FAB_OFFSET);
    expect(readStoredFabOffset(fakeStorage({ [FAB_OFFSET_STORAGE_KEY]: "not json" }))).toEqual(DEFAULT_FAB_OFFSET);
    expect(readStoredFabOffset(fakeStorage({ [FAB_OFFSET_STORAGE_KEY]: '{"top":"x","right":1}' }))).toEqual(DEFAULT_FAB_OFFSET);
    expect(readStoredFabOffset(null)).toEqual(DEFAULT_FAB_OFFSET);
    const throwing = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => {} };
    expect(readStoredFabOffset(throwing)).toEqual(DEFAULT_FAB_OFFSET);
  });
});

describe("useDraggablePreviewFab", () => {
  it("a plain click toggles", () => {
    const onToggle = vi.fn();
    const { result } = renderHook(() => useDraggablePreviewFab({ onToggle }, { storage: fakeStorage() }));
    const button = fakeButton();

    act(() => result.current.onPointerDown(pointer(button, 100, 100)));
    act(() => result.current.onPointerMove(pointer(button, 102, 101)));
    act(() => result.current.onPointerUp(pointer(button, 102, 101)));
    act(() => result.current.onClick(click()));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(result.current.style).toEqual(fabPositionStyle(DEFAULT_FAB_OFFSET));
  });

  it("a drag moves the button, does NOT toggle, and remembers the spot for the session", () => {
    const onToggle = vi.fn();
    const storage = fakeStorage();
    const { result } = renderHook(() => useDraggablePreviewFab({ onToggle }, { storage }));
    const button = fakeButton();

    act(() => result.current.onPointerDown(pointer(button, 700, 20)));
    expect(button.setPointerCapture).toHaveBeenCalledWith(1);
    // 200px left and 150px down from the default 10/10 corner offset.
    act(() => result.current.onPointerMove(pointer(button, 500, 170)));
    expect(result.current.dragging).toBe(true);
    act(() => result.current.onPointerUp(pointer(button, 500, 170)));
    const swallowed = click();
    act(() => result.current.onClick(swallowed));

    expect(onToggle).not.toHaveBeenCalled();
    expect(swallowed.preventDefault).toHaveBeenCalled();
    expect(result.current.dragging).toBe(false);
    expect(result.current.style).toEqual(fabPositionStyle({ top: 160, right: 210 }));
    expect(JSON.parse(storage.data.get(FAB_OFFSET_STORAGE_KEY) ?? "null")).toEqual({ top: 160, right: 210 });
    expect(button.releasePointerCapture).toHaveBeenCalledWith(1);

    // Only the one click after the drag is swallowed; the next click toggles as usual.
    act(() => result.current.onClick(click()));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("clamps a drag past the stage edge and flips the hint once in the left half", () => {
    const { result } = renderHook(() => useDraggablePreviewFab({ onToggle: vi.fn() }, { storage: fakeStorage() }));
    const button = fakeButton();

    act(() => result.current.onPointerDown(pointer(button, 700, 20)));
    act(() => result.current.onPointerMove(pointer(button, -2000, 5000)));

    expect(result.current.style).toEqual(fabPositionStyle({ top: 564, right: 764 }));
    expect(result.current.tipSide).toBe("right");
  });

  it("starts from the session's remembered spot", () => {
    const storage = fakeStorage({ [FAB_OFFSET_STORAGE_KEY]: '{"top":42,"right":84}' });
    const { result } = renderHook(() => useDraggablePreviewFab({ onToggle: vi.fn() }, { storage }));
    expect(result.current.style).toEqual(fabPositionStyle({ top: 42, right: 84 }));
  });

  it("ignores non-primary buttons and moves from another pointer", () => {
    const { result } = renderHook(() => useDraggablePreviewFab({ onToggle: vi.fn() }, { storage: fakeStorage() }));
    const button = fakeButton();

    act(() => result.current.onPointerDown(pointer(button, 700, 20, { button: 2 })));
    act(() => result.current.onPointerMove(pointer(button, 500, 170)));
    expect(result.current.dragging).toBe(false);

    act(() => result.current.onPointerDown(pointer(button, 700, 20)));
    act(() => result.current.onPointerMove(pointer(button, 500, 170, { pointerId: 2 })));
    expect(result.current.dragging).toBe(false);
  });

  it("a cancelled drag keeps the moved position but neither persists it nor swallows the next click", () => {
    const onToggle = vi.fn();
    const storage = fakeStorage();
    const { result } = renderHook(() => useDraggablePreviewFab({ onToggle }, { storage }));
    const button = fakeButton();

    act(() => result.current.onPointerDown(pointer(button, 700, 20)));
    act(() => result.current.onPointerMove(pointer(button, 600, 20)));
    act(() => result.current.onPointerCancel(pointer(button, 600, 20)));
    act(() => result.current.onClick(click()));

    expect(storage.data.has(FAB_OFFSET_STORAGE_KEY)).toBe(false);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(result.current.dragging).toBe(false);
  });

  it("keyboard activation (a click with no pointer drag) always toggles", () => {
    const onToggle = vi.fn();
    const { result } = renderHook(() => useDraggablePreviewFab({ onToggle }, { storage: fakeStorage() }));
    act(() => result.current.onClick(click()));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("survives storage that throws on write", () => {
    const storage = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } };
    const { result } = renderHook(() => useDraggablePreviewFab({ onToggle: vi.fn() }, { storage }));
    const button = fakeButton();
    act(() => result.current.onPointerDown(pointer(button, 700, 20)));
    act(() => result.current.onPointerMove(pointer(button, 600, 20)));
    expect(() => act(() => result.current.onPointerUp(pointer(button, 600, 20)))).not.toThrow();
  });
});
