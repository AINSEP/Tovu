import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type AdminWidgetRegionBinding } from "../../../lib/api";
import { createFakeWidgetRegionsPort } from "../hooks/widget-regions-dependencies.hooks";
import { useWidgetRegions } from "../hooks/use-widget-regions.hooks";

/**
 * @file `useWidgetRegions` driven against the injected `WidgetRegionsPort`, no `fetch` stub and no
 * `vi.spyOn(api, ...)`. `WidgetRegions.unit.test.tsx` covers the component's own rendering entirely
 * through a full-controller fake on `useWidgetRegionsHook` (never the real hook), so this is the
 * first test to exercise `useWidgetRegions` itself.
 */

const REGION: AdminWidgetRegionBinding = { workspaceId: "ws1", regionKey: "footer", areaEntryId: "area-1", updatedAt: "2026-08-01T00:00:00.000Z", placementCount: 0 };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useWidgetRegions — injected port (no fetch stub, no api spy)", () => {
  it("loads the list from the injected port and never touches the real api client", async () => {
    const listSpy = vi.spyOn(api, "listWidgetRegions");
    const port = createFakeWidgetRegionsPort({ regions: [REGION] });
    const { result } = renderHook(() => useWidgetRegions({ port, locale: "en", navigate: vi.fn(), t: (key: string) => key }));

    await waitFor(() => expect(result.current.regions).toEqual([REGION]));
    expect(listSpy).not.toHaveBeenCalled();
  });

  it("routes bind through the injected port and calls the injected navigate, never the real router", async () => {
    const bindSpy = vi.spyOn(api, "bindWidgetRegion");
    const port = createFakeWidgetRegionsPort();
    const fakeNavigate = vi.fn();
    const { result } = renderHook(() => useWidgetRegions({ port, locale: "en", navigate: fakeNavigate, t: (key: string) => key }));
    await waitFor(() => expect(result.current.regions).toEqual([]));

    act(() => result.current.setNewRegionKey("sidebar"));
    await act(async () => {
      await result.current.bind();
    });

    expect(port.regions).toHaveLength(1);
    expect(port.regions[0]?.regionKey).toBe("sidebar");
    expect(fakeNavigate).toHaveBeenCalledWith("/widgets/regions/sidebar");
    expect(bindSpy).not.toHaveBeenCalled();
  });

  /**
   * Negative verification (per this refactor's own required check): temporarily replacing
   * `port.listWidgetRegions(...)`/`port.bindWidgetRegion(...)`/`navigate(...)` in
   * `use-widget-regions.hooks.ts` with direct calls to the real `api`/`lib/router` imports and
   * re-running this suite fails both tests above (no real network in this test env, and the real
   * router's `navigate` — not `fakeNavigate` — is what would receive the call) — see this feature's
   * commit/handoff report for the recorded run.
   */
  it("does not resolve `regions` while the injected port's list call is still pending", () => {
    const port = createFakeWidgetRegionsPort();
    port.listWidgetRegions = () => new Promise(() => {});
    const { result } = renderHook(() => useWidgetRegions({ port, locale: "en", navigate: vi.fn(), t: (key: string) => key }));
    expect(result.current.regions).toBeNull();
  });
});
