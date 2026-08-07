import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useFetchedOptions } from "../WidgetConfigFields/WidgetConfigFields.hooks";

/**
 * @file `useFetchedOptions` — the hook `MenuConfigFields`/`ContactFormConfigFields` share
 * (`WidgetConfigFields.tsx`), extracted from what used to be two copy-pasted `useState`/`useEffect`
 * pairs when `WidgetConfigFields.tsx` split into `WidgetConfigFields.tsx`/
 * `WidgetConfigFields.hooks.tsx`. Exercised directly via `renderHook`, mirroring this repo's
 * `use-fab-position.hooks.test.ts` — `WidgetConfigFields.unit.test.tsx` already covers the same
 * fetch-then-render behavior through the rendered `MenuConfigFields`/`ContactFormConfigFields`
 * components, so this file's job is to pin the hook's own contract in isolation: starts `null`,
 * resolves to the fetched list, and falls back to the given message on a non-`Error` rejection.
 */

describe("useFetchedOptions", () => {
  it("starts with items/error both null, then resolves items to the fetch result", async () => {
    const fetchList = vi.fn().mockResolvedValue(["a", "b", "c"]);
    const { result } = renderHook(() => useFetchedOptions(fetchList, "fallback"));

    expect(result.current.items).toBeNull();
    expect(result.current.error).toBeNull();

    await waitFor(() => expect(result.current.items).toEqual(["a", "b", "c"]));
    expect(result.current.error).toBeNull();
    expect(fetchList).toHaveBeenCalledTimes(1);
  });

  it("surfaces the rejection's own message when it is an Error instance", async () => {
    const fetchList = vi.fn().mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useFetchedOptions(fetchList, "fallback"));

    await waitFor(() => expect(result.current.error).toBe("network down"));
    expect(result.current.items).toBeNull();
  });

  it("falls back to the given message when the rejection is not an Error instance", async () => {
    const fetchList = vi.fn().mockRejectedValue("string rejection");
    const { result } = renderHook(() => useFetchedOptions(fetchList, "failed to load menus"));

    await waitFor(() => expect(result.current.error).toBe("failed to load menus"));
  });

  it("fetches exactly once per mount, not once per render", async () => {
    const fetchList = vi.fn().mockResolvedValue([]);
    const { result, rerender } = renderHook(() => useFetchedOptions(fetchList, "fallback"));
    await waitFor(() => expect(result.current.items).toEqual([]));

    act(() => rerender());
    act(() => rerender());

    expect(fetchList).toHaveBeenCalledTimes(1);
  });
});
