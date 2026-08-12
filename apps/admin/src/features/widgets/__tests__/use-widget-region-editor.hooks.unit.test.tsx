import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type AdminWidgetArea, type AdminWidgetPlacement } from "../../../lib/api";
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
});
