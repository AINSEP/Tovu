import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useThemeExplorePreviewFrame } from "../hooks/use-theme-explore-preview-frame.hooks";

/**
 * @file `useThemeExplorePreviewFrame` — the preview pane's own width measurement (see the hook's
 * doc comment for why it isn't hoisted into `use-theme-explore.hooks.ts`). jsdom implements no
 * `ResizeObserver` at all, so every existing suite that mounts `ThemeExplorePreview` only ever
 * exercises the "no ResizeObserver" early return (the hook's `880` default never changes). This
 * suite fakes `ResizeObserver` the same way `useOverflowDetection.hooks.unit.test.ts` does — record
 * `observe`/`disconnect` calls, let a test drive a synthetic entry through the stored callback —
 * to exercise the measurement path and the cleanup path directly.
 */

type ResizeCallback = (entries: ResizeObserverEntry[]) => void;

function installFakeResizeObserver(): {
  trigger: (width: number) => void;
  triggerEmpty: () => void;
  observedElements: Element[];
  disconnectCalls: number;
} {
  const observedElements: Element[] = [];
  let callback: ResizeCallback = () => {};
  let disconnectCalls = 0;

  class FakeResizeObserver {
    constructor(cb: ResizeCallback) {
      callback = cb;
    }
    observe(el: Element) {
      observedElements.push(el);
    }
    disconnect() {
      disconnectCalls += 1;
    }
    unobserve() {}
  }

  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  return {
    trigger: (width: number) => callback([{ contentRect: { width } } as ResizeObserverEntry]),
    triggerEmpty: () => callback([]),
    observedElements,
    get disconnectCalls() {
      return disconnectCalls;
    },
  };
}

function useHookWithRef(el: HTMLDivElement) {
  const hook = useThemeExplorePreviewFrame();
  if (hook.frameRef.current !== el) hook.frameRef.current = el;
  return hook;
}

describe("useThemeExplorePreviewFrame", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts at the 880px default before any measurement lands", () => {
    installFakeResizeObserver();
    const el = document.createElement("div");
    const { result } = renderHook(() => useHookWithRef(el));
    expect(result.current.paneWidth).toBe(880);
  });

  it("does nothing (and does not throw) when ResizeObserver is unavailable", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const el = document.createElement("div");
    const { result } = renderHook(() => useHookWithRef(el));
    expect(result.current.paneWidth).toBe(880);
  });

  it("updates paneWidth from the observed element's measured contentRect width", () => {
    const { trigger, observedElements } = installFakeResizeObserver();
    const el = document.createElement("div");
    const { result } = renderHook(() => useHookWithRef(el));

    expect(observedElements).toEqual([el]);

    act(() => trigger(640));

    expect(result.current.paneWidth).toBe(640);
  });

  it("ignores a notification with no entries rather than writing an undefined width", () => {
    const { trigger, triggerEmpty } = installFakeResizeObserver();
    const el = document.createElement("div");
    const { result } = renderHook(() => useHookWithRef(el));

    act(() => trigger(500));
    expect(result.current.paneWidth).toBe(500);

    act(() => triggerEmpty());
    expect(result.current.paneWidth).toBe(500);
  });

  it("disconnects the observer on unmount", () => {
    const observer = installFakeResizeObserver();
    const el = document.createElement("div");
    const { unmount } = renderHook(() => useHookWithRef(el));

    expect(observer.disconnectCalls).toBe(0);
    unmount();
    expect(observer.disconnectCalls).toBe(1);
  });
});
