import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../../../lib/api";
import { createFakeThemesPort } from "../hooks/themes-dependencies.hooks";
import { useThemes } from "../hooks/use-themes.hooks";

/**
 * @file `useThemes` driven against the injected `ThemesPort`, no `fetch` stub and no `api` spy.
 * `Themes.unit.test.tsx` covers the component's own rendering entirely through a full-controller
 * fake on `useThemesHook` (never the real hook), so this is the first test to exercise
 * `useThemes` itself.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useThemes — injected port (no fetch stub, no api spy)", () => {
  it("loads settings/themes/tiers from the injected port and never touches the real api client", async () => {
    const getPresentationSpy = vi.spyOn(api, "getPresentation");
    const port = createFakeThemesPort({
      availableThemeIds: ["basic", "quartz"],
      availableThemes: [{ id: "basic", tier: "declarative" }, { id: "quartz", tier: "static" }],
    });
    const { result } = renderHook(() => useThemes({ port }));

    await waitFor(() => expect(result.current.themes).toEqual(["basic", "quartz"]));
    expect(result.current.themeTiers).toEqual({ basic: "declarative", quartz: "static" });
    expect(getPresentationSpy).not.toHaveBeenCalled();
  });

  it("routes activate through the injected port and updates settings from its response", async () => {
    const setActiveSpy = vi.spyOn(api, "setActiveTheme");
    const port = createFakeThemesPort({ availableThemeIds: ["basic", "quartz"] });
    const { result } = renderHook(() => useThemes({ port }));
    await waitFor(() => expect(result.current.themes).toEqual(["basic", "quartz"]));

    await act(async () => {
      await result.current.activate("quartz");
    });

    expect(result.current.settings?.activeThemeId).toBe("quartz");
    expect(setActiveSpy).not.toHaveBeenCalled();
  });

  /**
   * Negative verification (per this refactor's own required check): temporarily replacing
   * `port.getPresentation()`/`port.setActiveTheme(...)` in `use-themes.hooks.ts` with direct calls
   * to the real `api` import and re-running this suite fails both assertions above (no real
   * network in this test env) — see this feature's commit/handoff report for the recorded run.
   */
  it("stays with themes empty while the injected port's presentation call is still pending", () => {
    const port = createFakeThemesPort();
    port.getPresentation = () => new Promise(() => {});
    const { result } = renderHook(() => useThemes({ port }));
    expect(result.current.themes).toEqual([]);
    expect(result.current.settings).toBeNull();
  });
});
