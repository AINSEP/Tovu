import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RECENT_ACTIVITY_OPEN_KEY, useRecentActivityDisclosure } from "../hooks/use-recent-activity-disclosure.hooks";

/** @file The "Recently updated" accordion's open state: collapsed by default, toggles, persists in
 *  localStorage, and falls back to collapsed when storage throws. */

beforeEach(() => localStorage.removeItem(RECENT_ACTIVITY_OPEN_KEY));
afterEach(() => vi.restoreAllMocks());

describe("useRecentActivityDisclosure", () => {
  it("starts collapsed with nothing stored", () => {
    const { result } = renderHook(() => useRecentActivityDisclosure());
    expect(result.current.open).toBe(false);
    expect(result.current.panelId).not.toBe("");
  });

  it("toggles open and closed, persisting each state", () => {
    const { result } = renderHook(() => useRecentActivityDisclosure());
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    expect(localStorage.getItem(RECENT_ACTIVITY_OPEN_KEY)).toBe("1");
    act(() => result.current.toggle());
    expect(result.current.open).toBe(false);
    expect(localStorage.getItem(RECENT_ACTIVITY_OPEN_KEY)).toBe("0");
  });

  it("restores the persisted open state on a fresh mount", () => {
    localStorage.setItem(RECENT_ACTIVITY_OPEN_KEY, "1");
    const { result } = renderHook(() => useRecentActivityDisclosure());
    expect(result.current.open).toBe(true);
  });

  it("falls back to collapsed when reading storage throws, and still toggles when writing throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useRecentActivityDisclosure());
    expect(result.current.open).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
  });
});
