import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { usePlayground } from "../hooks/use-playground.hooks";

/**
 * @file `usePlayground` — the registry search, surface lifecycle, and A2UI interpreter wiring
 * extracted out of `Playground.tsx`. First test file for this tab (0% before this pass — no test
 * file existed). Pins the search filter, the open/add/reset surface lifecycle, and the "N of M"
 * counter contract.
 */
describe("usePlayground", () => {
  it("starts with the surface closed and matches equal to the full registry", () => {
    const { result } = renderHook(() => usePlayground());

    expect(result.current.surfaceOpen).toBe(false);
    expect(result.current.query).toBe("");
    expect(result.current.matches.length).toBe(result.current.total);
    expect(result.current.total).toBeGreaterThan(0);
  });

  it("filtering by a query neither id, provider, nor capability matches empties the results", () => {
    const { result } = renderHook(() => usePlayground());

    act(() => result.current.setQuery("no-such-component-xyz"));

    expect(result.current.matches).toEqual([]);
    expect(result.current.total).toBeGreaterThan(0);
  });

  it("filtering is case-insensitive and matches against the entry's id", () => {
    const { result } = renderHook(() => usePlayground());
    const firstId = result.current.registry.list()[0]!.id;

    act(() => result.current.setQuery(firstId.toUpperCase()));

    expect(result.current.matches.some((entry) => entry.id === firstId)).toBe(true);
  });

  it("addToSurface opens the surface", () => {
    const { result } = renderHook(() => usePlayground());
    const entry = result.current.registry.list()[0]!;

    act(() => result.current.addToSurface(entry));

    expect(result.current.surfaceOpen).toBe(true);
  });

  it("addToSurface appends multiple entries under the same root without clobbering earlier ones", () => {
    const { result } = renderHook(() => usePlayground());
    const [first, second] = result.current.registry.list();

    act(() => result.current.addToSurface(first!));
    act(() => result.current.addToSurface(second ?? first!));

    const root = result.current.interpreter.getSurface("tovu-admin-playground")?.components.get("root");
    expect(root?.props.children).toHaveLength(2);
  });

  it("reset closes the surface", () => {
    const { result } = renderHook(() => usePlayground());
    const entry = result.current.registry.list()[0]!;
    act(() => result.current.addToSurface(entry));
    expect(result.current.surfaceOpen).toBe(true);

    act(() => result.current.reset());

    expect(result.current.surfaceOpen).toBe(false);
  });

  it("reset is a no-op when the surface was never opened", () => {
    const { result } = renderHook(() => usePlayground());

    expect(() => act(() => result.current.reset())).not.toThrow();
    expect(result.current.surfaceOpen).toBe(false);
  });
});
