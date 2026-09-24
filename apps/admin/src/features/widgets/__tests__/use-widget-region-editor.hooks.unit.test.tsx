import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type AdminWidgetArea, type AdminWidgetPlacement } from "@/lib/api";
import { createFakeWidgetRegionsPort } from "../hooks/widget-regions-dependencies.hooks";
import { useWidgetRegionEditor } from "../hooks/use-widget-region-editor.hooks";

/**
 * @file `useWidgetRegionEditor` driven against the injected `WidgetRegionsPort`, no `fetch` stub
 * and no `vi.spyOn(api, ...)`. `WidgetRegionEditor.unit.test.tsx` covers the component's own
 * rendering entirely through a full-controller fake on `useWidgetRegionEditorHook` (never the real
 * hook), so this is the first test to exercise `useWidgetRegionEditor` itself.
 */

const AREA: AdminWidgetArea = { id: "area-1", workspaceId: "ws1", regionKey: "footer", updatedAt: "2026-08-01T00:00:00.000Z", version: 1 };
const PLACEMENT: AdminWidgetPlacement = { placementId: "p1", widgetEntryId: "w1", enabled: true, widgetTitle: "Hero", widgetType: "text", broken: false };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useWidgetRegionEditor — injected port (no fetch stub, no api spy)", () => {
  it("loads the region from the injected port and never touches the real api client", async () => {
    const getSpy = vi.spyOn(api, "getWidgetRegion");
    const port = createFakeWidgetRegionsPort({ areas: { footer: { area: AREA, placements: [PLACEMENT] } } });
    const { result } = renderHook(() => useWidgetRegionEditor("footer", { port, locale: "en", t: (key: string) => key }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.area).toEqual(AREA);
    expect(result.current.placements).toEqual([PLACEMENT]);
    expect(getSpy).not.toHaveBeenCalled();
  });

  it("routes save through the injected port and bumps the area version", async () => {
    const mutateSpy = vi.spyOn(api, "mutateWidgetRegionPlacements");
    const port = createFakeWidgetRegionsPort({ areas: { footer: { area: AREA, placements: [PLACEMENT] } } });
    const { result } = renderHook(() => useWidgetRegionEditor("footer", { port, locale: "en", t: (key: string) => key }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.save();
    });

    expect(result.current.area?.version).toBe(2);
    expect(result.current.message).toBe("Saved · version 2");
    expect(mutateSpy).not.toHaveBeenCalled();
  });

  it("fills a just-added placement's title and type from the widget itself, so the new row is not a nameless '()' until Save", async () => {
    const port = createFakeWidgetRegionsPort({
      areas: { footer: { area: AREA, placements: [PLACEMENT] } },
      widgets: { w9: { title: "Promo banner", widgetType: "text" } },
    });
    const { result } = renderHook(() => useWidgetRegionEditor("footer", { port, locale: "en", t: (key: string) => key }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.addPlacement("w9"));

    await waitFor(() => expect(result.current.placements[1]?.widgetTitle).toBe("Promo banner"));
    expect(result.current.placements[1]).toMatchObject({ widgetEntryId: "w9", widgetType: "text", broken: false });
  });

  it("translates the post-save 'Saved · version N' notice into the operator's locale", async () => {
    const port = createFakeWidgetRegionsPort({ areas: { footer: { area: AREA, placements: [PLACEMENT] } } });
    const { result } = renderHook(() => useWidgetRegionEditor("footer", { port, locale: "de", t: (key: string) => key }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.save();
    });

    expect(result.current.message).toBe("Gespeichert · Version 2");
  });

  /**
   * Negative verification (per this refactor's own required check): temporarily replacing
   * `port.getWidgetRegion(...)`/`port.mutateWidgetRegionPlacements(...)` in
   * `use-widget-region-editor.hooks.ts` with direct calls to the real `api` import and re-running
   * this suite fails both assertions above (no real network in this test env) — see this feature's
   * commit/handoff report for the recorded run.
   */
  it("stays loading while the injected port's get call is still pending", () => {
    const port = createFakeWidgetRegionsPort();
    port.getWidgetRegion = () => new Promise(() => {});
    const { result } = renderHook(() => useWidgetRegionEditor("footer", { port, locale: "en", t: (key: string) => key }));
    expect(result.current.loading).toBe(true);
    expect(result.current.area).toBeNull();
  });

  /**
   * Stale-response race, save() half (2026-08-12 audit finding): clicking Save on the "header"
   * region, then navigating to "footer" before `mutateWidgetRegionPlacements` resolves, must not let
   * header's (now-stale) response overwrite footer's state. This is the interaction the audit called
   * out specifically for THIS hook: an unguarded save used to call `load()` on completion regardless
   * of staleness, and that trailing `load()` would mint a newer `loadRequestIdRef` id than footer's
   * own in-flight load — discarding footer's correct response as "stale" by comparison. Negatively
   * verified per this fix's own commit: reverting the `stale` check in `save()` (restoring the
   * pre-fix body) makes this test fail — footer's area/placements/message end up overwritten by
   * header's save, or footer's own load gets discarded by header's trailing `load()` call.
   */
  it("does not let a stale save (or its trailing reload) for a region navigated away from overwrite the currently-viewed region", async () => {
    const HEADER_AREA: AdminWidgetArea = { id: "area-header", workspaceId: "ws1", regionKey: "header", updatedAt: "2026-08-01T00:00:00.000Z", version: 1 };
    const FOOTER_AREA: AdminWidgetArea = { id: "area-footer", workspaceId: "ws1", regionKey: "footer", updatedAt: "2026-08-01T00:00:00.000Z", version: 9 };
    const FOOTER_PLACEMENT: AdminWidgetPlacement = { placementId: "p-footer", widgetEntryId: "w-footer", enabled: true, widgetTitle: "Footer widget", widgetType: "text", broken: false };

    const port = createFakeWidgetRegionsPort({
      areas: {
        header: { area: HEADER_AREA, placements: [PLACEMENT] },
        footer: { area: FOOTER_AREA, placements: [FOOTER_PLACEMENT] },
      },
    });

    let resolveHeaderSave!: (value: { area: AdminWidgetArea }) => void;
    const pendingHeaderSave = new Promise<{ area: AdminWidgetArea }>((resolve) => {
      resolveHeaderSave = resolve;
    });
    const realMutate = port.mutateWidgetRegionPlacements.bind(port);
    port.mutateWidgetRegionPlacements = (target) => (target.regionKey === "header" ? pendingHeaderSave : realMutate(target));

    const { result, rerender } = renderHook(
      (props: { regionKey: string }) => useWidgetRegionEditor(props.regionKey, { port, locale: "en", t: (key: string) => key }),
      { initialProps: { regionKey: "header" } }
    );
    await waitFor(() => expect(result.current.area?.regionKey).toBe("header"));

    // Click Save on "header" — mutateWidgetRegionPlacements("header") is now in flight.
    act(() => {
      void result.current.save();
    });
    expect(result.current.saving).toBe(true);

    // Navigate to "footer" before header's save resolves — this fires the `regionKey`-change
    // effect, which reloads (and, via `loadRequestIdRef`, supersedes header's in-flight request).
    rerender({ regionKey: "footer" });
    await waitFor(() => expect(result.current.area?.regionKey).toBe("footer"));
    expect(result.current.placements).toEqual([FOOTER_PLACEMENT]);
    expect(result.current.saving).toBe(false);

    // Resolve header's save last — the exact out-of-order arrival a slow connection can produce.
    await act(async () => {
      resolveHeaderSave({ area: { ...HEADER_AREA, version: 2 } });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.area?.regionKey).toBe("footer");
    expect(result.current.area?.version).toBe(FOOTER_AREA.version);
    expect(result.current.placements).toEqual([FOOTER_PLACEMENT]);
    expect(result.current.message).toBeNull();
    expect(result.current.saving).toBe(false);
  });
});
