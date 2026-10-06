// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMediaCardDetails } from "../hooks/use-media-card-details.hooks";
import type { AdminMedia } from "@/lib/api";

describe("phone media card details", () => {
  it("tracks phone width, cleans up the viewport subscription, and uses the existing edit action", () => {
    const query = Object.assign(new EventTarget(), {
      matches: false, media: "(max-width: 640px)", onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(),
    });
    const removeListener = vi.spyOn(query, "removeEventListener");
    const addListener = vi.spyOn(query, "addEventListener");
    const onToggleEdit = vi.fn();
    const matchMedia = vi.fn(() => query as MediaQueryList);
    const { result, unmount } = renderHook(() => useMediaCardDetails({ onToggleEdit }, { matchMedia }));
    expect(result.current.isPhone).toBe(false);
    expect(matchMedia.mock.calls).toEqual([["(max-width: 640px)"], ["(max-width: 640px)"]]);
    act(() => {
      query.matches = true;
      query.dispatchEvent(new Event("change"));
    });
    expect(result.current.isPhone).toBe(true);
    const item = { id: "media-1", title: "Sunset" } as AdminMedia;
    act(() => result.current.openDetails(item));
    expect(onToggleEdit.mock.calls).toEqual([[item]]);
    act(() => {
      query.matches = false;
      query.dispatchEvent(new Event("change"));
    });
    expect(result.current.isPhone).toBe(false);
    unmount();
    expect(removeListener.mock.calls).toEqual(addListener.mock.calls);
    expect(removeListener).toHaveBeenCalledTimes(1);
  });
});
