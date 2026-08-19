import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { latestSurfaceIdIn, surfaceIdOf, useRoutedA2uiSurfaceCard } from "../hooks/use-routed-a2ui-surface-card.hooks";
import { resetPlaygroundRenderTargetBus } from "../../../lib/playground-render-target-bus";

/**
 * @file Direct coverage of `surfaceIdOf`/`latestSurfaceIdIn`, the pure helpers
 * `useRoutedA2uiSurfaceCard` uses to figure out which surface is CURRENTLY showing (see that hook's
 * own doc for why "current", not "any", surface is what `hasError` has to track), plus direct
 * `renderHook` coverage of `useRoutedA2uiSurfaceCard.handleAgentAction`'s own branches — the same
 * `renderHook` approach `use-ai-assistant-locale-sync.unit.test.tsx` uses for its hook. Split out of
 * `RoutedA2uiSurfaceCard.unit.test.tsx` on the same line the component/hook split itself drew, the
 * same way `SeeMore.hooks.unit.test.tsx` was split out of `SeeMore.unit.test.tsx`.
 *
 * Stays in `AssistantDock/__tests__/` (not a nested `hooks/__tests__/`) even though the hook itself
 * moved into `hooks/` — matches how `features/ai-assistant/hooks/*.hooks.ts` are tested from the
 * feature's own top-level `__tests__/`, not from a `hooks/__tests__/` subfolder (see e.g.
 * `use-media-lightbox.unit.test.ts` living in `features/media/__tests__/`, alongside its hook in
 * `features/media/hooks/`).
 *
 * `RoutedA2uiSurfaceCard.unit.test.tsx` already proves the end-to-end behavior these helpers feed
 * (dismiss/portal/error routing), but every one of its fixtures uses `createSurface` — never
 * `updateComponents`/`updateDataModel`/`deleteSurface`, the other three keys `surfaceIdOf` checks.
 * A mutation in that key list, or in the "keep the LAST id, not the first" scan `latestSurfaceIdIn`
 * does, would pass every existing test in this repo. These tests close that gap directly.
 *
 * `RoutedA2uiSurfaceCard.unit.test.tsx`'s own fixtures only ever call `onAgentAction` with either a
 * `createSurface` success event or a `__simulateError` marker that always carries a `surfaceId` —
 * neither reaches `handleAgentAction`'s non-error path or its error-with-no-surfaceId path. Both are
 * covered directly here instead of growing the component mock further, since neither is a rendering
 * decision — they are purely `useRoutedA2uiSurfaceCard`'s own branch logic.
 */

afterEach(() => {
  resetPlaygroundRenderTargetBus();
});

describe("surfaceIdOf", () => {
  it("reads the surfaceId out of each of the four event shapes A2uiSurfaceCard itself tracks", () => {
    expect(surfaceIdOf({ createSurface: { surfaceId: "s1" } })).toBe("s1");
    expect(surfaceIdOf({ updateComponents: { surfaceId: "s2" } })).toBe("s2");
    expect(surfaceIdOf({ updateDataModel: { surfaceId: "s3" } })).toBe("s3");
    expect(surfaceIdOf({ deleteSurface: { surfaceId: "s4" } })).toBe("s4");
  });

  it("returns undefined for events with none of the four keys, or a non-string/missing surfaceId", () => {
    expect(surfaceIdOf({ someOtherKey: { surfaceId: "s1" } })).toBeUndefined();
    expect(surfaceIdOf({ createSurface: {} })).toBeUndefined();
    expect(surfaceIdOf({ createSurface: { surfaceId: 42 } })).toBeUndefined();
    expect(surfaceIdOf({ createSurface: null })).toBeUndefined();
  });

  it("returns undefined for non-object or null input, rather than throwing", () => {
    expect(surfaceIdOf(null)).toBeUndefined();
    expect(surfaceIdOf(undefined)).toBeUndefined();
    expect(surfaceIdOf("a string event")).toBeUndefined();
    expect(surfaceIdOf(42)).toBeUndefined();
  });
});

describe("latestSurfaceIdIn", () => {
  it("returns the LAST surfaceId named across the stream, not the first — matching A2uiSurfaceCard's own overwrite-on-every-event tracking", () => {
    const events = [
      { createSurface: { surfaceId: "s1" } },
      { updateComponents: { surfaceId: "s1" } },
      { createSurface: { surfaceId: "s2" } },
    ];
    expect(latestSurfaceIdIn(events)).toBe("s2");
  });

  it("skips events with no surfaceId of their own, keeping the most recent real one", () => {
    const events = [
      { createSurface: { surfaceId: "s1" } },
      { someUnrelatedEvent: true },
      { __simulateError: true },
    ];
    expect(latestSurfaceIdIn(events)).toBe("s1");
  });

  it("returns undefined for an empty stream or one with no recognizable surfaceId anywhere", () => {
    expect(latestSurfaceIdIn([])).toBeUndefined();
    expect(latestSurfaceIdIn([{ foo: "bar" }, { baz: 1 }])).toBeUndefined();
  });
});

describe("useRoutedA2uiSurfaceCard.handleAgentAction", () => {
  const baseProps = { name: "a2ui", events: [], runStreaming: false, runSucceeded: true, runId: "run-1" };

  it("relays a non-error message straight through to the host's onAgentAction without touching hasError", () => {
    const onAgentAction = vi.fn();
    const { result } = renderHook(() => useRoutedA2uiSurfaceCard({ ...baseProps, onAgentAction }));

    result.current.handleAgentAction("run-1", { ok: true });

    expect(onAgentAction).toHaveBeenCalledWith("run-1", { ok: true });
    expect(result.current.hasError).toBe(false);
  });

  it("does not flag hasError for an error message with no string surfaceId, but still relays it", () => {
    const onAgentAction = vi.fn();
    const { result } = renderHook(() => useRoutedA2uiSurfaceCard({ ...baseProps, onAgentAction }));

    result.current.handleAgentAction("run-1", { error: { code: "BOOM", message: "no surfaceId here" } });

    expect(onAgentAction).toHaveBeenCalledWith("run-1", { error: { code: "BOOM", message: "no surfaceId here" } });
    expect(result.current.hasError).toBe(false);
  });

  it("works with no onAgentAction prop at all, returning undefined rather than throwing", () => {
    const { result } = renderHook(() => useRoutedA2uiSurfaceCard({ ...baseProps }));

    expect(() => result.current.handleAgentAction("run-1", { ok: true })).not.toThrow();
  });
});
