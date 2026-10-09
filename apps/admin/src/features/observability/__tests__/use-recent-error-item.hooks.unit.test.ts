import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createFakeRecentServerErrorsPort } from "../hooks/recent-server-errors-dependencies.hooks";
import { useRecentErrorItem } from "../hooks/use-recent-error-item.hooks";

/** @file One Recent errors row's state — disclosure and Copy feedback — against the fake port. */

afterEach(() => {
  vi.useRealTimers();
});

describe("useRecentErrorItem", () => {
  it("starts collapsed with a detail id, and toggle opens and closes it", () => {
    const { result } = renderHook(() => useRecentErrorItem({ copyText: "Time: x", clipboard: createFakeRecentServerErrorsPort() }));
    expect(result.current.expanded).toBe(false);
    expect(result.current.detailId).not.toBe("");
    act(() => result.current.toggle());
    expect(result.current.expanded).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.expanded).toBe(false);
  });

  it("copies the row's text, flips copied on, then back off", async () => {
    vi.useFakeTimers();
    const clipboard = createFakeRecentServerErrorsPort();
    const { result } = renderHook(() => useRecentErrorItem({ copyText: "Time: x\nMessage:\nboom", clipboard }));

    await act(async () => {
      await expect(result.current.copy()).resolves.toBe(true);
    });
    expect(clipboard.copied).toEqual(["Time: x\nMessage:\nboom"]);
    expect(result.current.copied).toBe(true);

    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.copied).toBe(false);
  });

  it("does not claim Copied when the browser refused the copy", async () => {
    const clipboard = createFakeRecentServerErrorsPort({ copyResult: false });
    const { result } = renderHook(() => useRecentErrorItem({ copyText: "x", clipboard }));
    await act(async () => {
      await expect(result.current.copy()).resolves.toBe(false);
    });
    expect(clipboard.copied).toEqual(["x"]);
    expect(result.current.copied).toBe(false);
  });
});
