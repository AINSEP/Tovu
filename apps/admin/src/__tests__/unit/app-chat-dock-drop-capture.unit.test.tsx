// @vitest-environment jsdom
import { act, renderHook } from "@/__tests__/fetch-query-render";
import type { DragEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useChatDockLayout, useSidebarDrawer } from "../../App.hooks";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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

it("the sidebar closes on Escape and navigation, and removes its key listener on unmount", () => {
  const { result, rerender, unmount } = renderHook(({ routePath }) => useSidebarDrawer({ routePath }), {
    initialProps: { routePath: "/posts" },
  });
  act(() => result.current.setSidebarOpen(true));
  act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })); });
  expect(result.current.sidebarOpen).toBe(true);
  act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
  expect(result.current.sidebarOpen).toBe(false);
  act(() => result.current.setSidebarOpen(true));
  rerender({ routePath: "/pages" });
  expect(result.current.sidebarOpen).toBe(false);
  act(() => result.current.setSidebarOpen(true));
  const remove = vi.spyOn(document, "removeEventListener");
  unmount();
  expect(remove).toHaveBeenCalledWith("keydown", expect.any(Function));
});

it("opening the dock before its DOM refs mount leaves both measured clearances at zero", () => {
  const { result } = renderHook(() => useChatDockLayout());
  act(() => result.current.setChatOpen(true));
  expect(result.current.chatOpen).toBe(true);
  expect(result.current.sheetHeightPx).toBe(0);
  expect(result.current.dockWidthPx).toBe(0);
  act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })); });
  expect(result.current.chatOpen).toBe(true);
  act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
  expect(result.current.chatOpen).toBe(false);
});

it("the dock measures the active layout, switches observers on a breakpoint change and restores focus on close", () => {
  const mediaEvents = new EventTarget();
  const baseMedia = window.matchMedia("(max-width: 640px)");
  vi.spyOn(window, "matchMedia").mockReturnValue({ ...baseMedia, matches: false,
    addEventListener: mediaEvents.addEventListener.bind(mediaEvents), removeEventListener: mediaEvents.removeEventListener.bind(mediaEvents),
  });
  const observers: Array<{ callback: ResizeObserverCallback; target: Element | null; disconnected: boolean }> = [];
  class FakeResizeObserver {
    readonly state: (typeof observers)[number];
    constructor(callback: ResizeObserverCallback) { this.state = { callback, target: null, disconnected: false }; observers.push(this.state); }
    observe(target: Element) { this.state.target = target; }
    unobserve() { this.state.target = null; }
    disconnect() { this.state.disconnected = true; }
  }
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  const { result, unmount } = renderHook(() => useChatDockLayout());
  const dock = document.createElement("aside");
  dock.tabIndex = -1;
  const fab = document.createElement("button");
  document.body.append(dock, fab);
  try {
    result.current.chatDockRef.current = dock;
    result.current.chatFabRef.current = fab;
    act(() => result.current.setChatOpen(true));
    expect(document.activeElement).toBe(dock);
    expect(observers).toHaveLength(1);
    expect(observers[0]?.target).toBe(dock);
    const deliver = (index: number, width: number, height: number) => {
      const state = observers[index]!;
      state.callback([{
        target: dock,
        contentRect: new DOMRect(0, 0, width, height),
        borderBoxSize: [],
        contentBoxSize: [],
        devicePixelContentBoxSize: [],
      }], {} as ResizeObserver);
    };
    act(() => deliver(0, 390, 240));
    expect(result.current.dockWidthPx).toBe(390);
    expect(result.current.sheetHeightPx).toBe(0);
    act(() => observers[0]!.callback([], {} as ResizeObserver));
    expect(result.current.dockWidthPx).toBe(390);
    act(() => { mediaEvents.dispatchEvent(Object.assign(new Event("change"), { matches: true })); });
    expect(result.current.isSheetMode).toBe(true);
    expect(result.current.dockWidthPx).toBe(0);
    expect(observers[0]?.disconnected).toBe(true);
    expect(observers[1]?.target).toBe(dock);
    act(() => deliver(1, 390, 420));
    expect(result.current.sheetHeightPx).toBe(420);
    act(() => observers[1]!.callback([], {} as ResizeObserver));
    expect(result.current.sheetHeightPx).toBe(420);
    act(() => result.current.setChatOpen(false));
    expect(result.current.sheetHeightPx).toBe(0);
    expect(result.current.dockWidthPx).toBe(0);
    expect(observers[1]?.disconnected).toBe(true);
    expect(document.activeElement).toBe(fab);
  } finally {
    unmount();
    dock.remove();
    fab.remove();
  }
});

it("opening a sheet before its DOM ref mounts does not fabricate a measurement", () => {
  const media = window.matchMedia("(max-width: 640px)");
  vi.spyOn(window, "matchMedia").mockReturnValue({ ...media, matches: true });
  const { result } = renderHook(() => useChatDockLayout());
  act(() => result.current.setChatOpen(true));
  expect(result.current.isSheetMode).toBe(true);
  expect(result.current.sheetHeightPx).toBe(0);
  expect(result.current.dockWidthPx).toBe(0);
});
