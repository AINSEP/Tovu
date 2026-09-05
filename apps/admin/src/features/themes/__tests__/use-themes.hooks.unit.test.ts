import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type PresentationSettings } from "@/lib/api";
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
    const { result } = renderHook(() => useThemes({ port, t: (k) => k }));

    await waitFor(() => expect(result.current.themes).toEqual(["basic", "quartz"]));
    expect(result.current.themeTiers).toEqual({ basic: "declarative", quartz: "static" });
    expect(getPresentationSpy).not.toHaveBeenCalled();
  });

  it("routes activate through the injected port and updates settings from its response", async () => {
    const setActiveSpy = vi.spyOn(api, "setActiveTheme");
    const port = createFakeThemesPort({ availableThemeIds: ["basic", "quartz"] });
    const { result } = renderHook(() => useThemes({ port, t: (k) => k }));
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
    const { result } = renderHook(() => useThemes({ port, t: (k) => k }));
    expect(result.current.themes).toEqual([]);
    expect(result.current.settings).toBeNull();
  });
});

function settingsFor(activeThemeId: string): PresentationSettings {
  return { workspaceId: "fake-ws", activeThemeId, updatedAt: new Date(0).toISOString() };
}

describe("useThemes — activate race safety", () => {
  it("the LAST-clicked activate wins even when an earlier click's response arrives after it", async () => {
    const deferred: Record<
      string,
      { promise: Promise<{ settings: PresentationSettings; availableThemeIds: string[] }>; resolve: (value: { settings: PresentationSettings; availableThemeIds: string[] }) => void }
    > = {};
    const port = createFakeThemesPort({ availableThemeIds: ["basic", "quartz", "slate"] });
    const setActiveTheme = vi.fn((activeThemeId: string) => {
      let resolve!: (value: { settings: PresentationSettings; availableThemeIds: string[] }) => void;
      const promise = new Promise<{ settings: PresentationSettings; availableThemeIds: string[] }>((r) => {
        resolve = r;
      });
      deferred[activeThemeId] = { promise, resolve };
      return promise;
    });
    port.setActiveTheme = setActiveTheme;

    const { result } = renderHook(() => useThemes({ port, t: (k) => k }));
    await waitFor(() => expect(result.current.themes).toEqual(["basic", "quartz", "slate"]));

    // Two rapid clicks on different themes: quartz first, slate second — slate is the operator's
    // actual, final choice.
    act(() => {
      void result.current.activate("quartz");
    });
    act(() => {
      void result.current.activate("slate");
    });
    // `activate` invokes the port on a microtask, not synchronously inside `act`'s callback — wait
    // for both to actually reach the port before either is resolved.
    await waitFor(() => expect(setActiveTheme).toHaveBeenCalledTimes(2));

    // Network settles OUT of click order: slate (clicked LAST) resolves first; quartz (clicked
    // first) resolves after it.
    await act(async () => {
      deferred.slate.resolve({ settings: settingsFor("slate"), availableThemeIds: ["basic", "quartz", "slate"] });
      await deferred.slate.promise;
    });
    await waitFor(() => expect(result.current.settings?.activeThemeId).toBe("slate"));

    await act(async () => {
      deferred.quartz.resolve({ settings: settingsFor("quartz"), availableThemeIds: ["basic", "quartz", "slate"] });
      await deferred.quartz.promise;
    });
    // Give quartz's now-stale settlement a chance to land before asserting nothing changed.
    await new Promise((resolve) => setTimeout(resolve, 20));

    // The operator's LAST click (slate) must still be what is shown — quartz's late-arriving
    // response must not overwrite it just because it settled second.
    expect(result.current.settings?.activeThemeId).toBe("slate");
    expect(result.current.busyTheme).toBeNull();
  });

  it("a stale FAILED activate settling after a newer, successful activate must not resurrect a stale error", async () => {
    const deferred: Record<string, { reject: (reason: unknown) => void; resolveOk: (value: { settings: PresentationSettings; availableThemeIds: string[] }) => void }> = {};
    const promises: Record<string, Promise<{ settings: PresentationSettings; availableThemeIds: string[] }>> = {};
    const port = createFakeThemesPort({ availableThemeIds: ["basic", "quartz", "slate"] });
    port.setActiveTheme = vi.fn((activeThemeId: string) => {
      const promise = new Promise<{ settings: PresentationSettings; availableThemeIds: string[] }>((resolve, reject) => {
        deferred[activeThemeId] = { reject, resolveOk: resolve };
      });
      promises[activeThemeId] = promise;
      return promise;
    });

    const { result } = renderHook(() => useThemes({ port, t: (k) => k }));
    await waitFor(() => expect(result.current.themes).toEqual(["basic", "quartz", "slate"]));

    act(() => {
      void result.current.activate("quartz");
    });
    act(() => {
      void result.current.activate("slate");
    });
    await waitFor(() => expect(port.setActiveTheme).toHaveBeenCalledTimes(2));

    // The LAST click (slate) succeeds first.
    await act(async () => {
      deferred.slate.resolveOk({ settings: settingsFor("slate"), availableThemeIds: ["basic", "quartz", "slate"] });
      await promises.slate.catch(() => {});
    });
    await waitFor(() => expect(result.current.settings?.activeThemeId).toBe("slate"));
    expect(result.current.error).toBeNull();

    // The stale, superseded quartz call now fails — its error must not resurrect over slate's
    // already-successful, already-displayed outcome.
    await act(async () => {
      deferred.quartz.reject(new Error("failed to switch theme"));
      await promises.quartz.catch(() => {});
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(result.current.error).toBeNull();
    expect(result.current.settings?.activeThemeId).toBe("slate");
  });
});

describe("useThemes — download race safety", () => {
  function presentationFor(id: string) {
    return {
      settings: settingsFor("basic"),
      availableThemeIds: ["basic", id],
      availableThemes: [{ id: "basic", tier: "declarative" as const }, { id, tier: "declarative" as const }],
    };
  }

  it("the LAST-clicked download wins even when an earlier click's response arrives after it", async () => {
    const deferred: Record<
      string,
      { promise: Promise<{ id: string; suffixed: boolean; tier: string; rescan: { added: string[]; removed: string[]; total: number } }>; resolve: (value: { id: string; suffixed: boolean; tier: string; rescan: { added: string[]; removed: string[]; total: number } }) => void }
    > = {};
    const port = createFakeThemesPort({ availableThemeIds: ["basic"] });
    port.downloadMarketplaceTheme = vi.fn((themeId: string) => {
      let resolve!: (value: { id: string; suffixed: boolean; tier: string; rescan: { added: string[]; removed: string[]; total: number } }) => void;
      const promise = new Promise<{ id: string; suffixed: boolean; tier: string; rescan: { added: string[]; removed: string[]; total: number } }>((r) => {
        resolve = r;
      });
      deferred[themeId] = { promise, resolve };
      return promise;
    });
    // `getPresentation` isn't deferred (only `downloadMarketplaceTheme` is, matching this bug's real
    // shape) — its result reflects whichever download's server-side install has actually landed by
    // the time it's called, controlled here by the test as each deferred call resolves. Starts as
    // the plain pre-download snapshot so the initial mount load is unaffected by the race below.
    let currentPresentation: { settings: PresentationSettings; availableThemeIds: string[]; availableThemes: Array<{ id: string; tier: "declarative" }> } = {
      settings: settingsFor("basic"),
      availableThemeIds: ["basic"],
      availableThemes: [{ id: "basic", tier: "declarative" }],
    };
    port.getPresentation = vi.fn(async () => currentPresentation);

    const { result } = renderHook(() => useThemes({ port, t: (k) => k }));
    await waitFor(() => expect(result.current.themes).toEqual(["basic"]));

    act(() => {
      void result.current.download!("alpha");
    });
    act(() => {
      void result.current.download!("beta");
    });
    await waitFor(() => expect(port.downloadMarketplaceTheme).toHaveBeenCalledTimes(2));

    // beta (clicked LAST) resolves first.
    currentPresentation = presentationFor("beta");
    await act(async () => {
      deferred.beta.resolve({ id: "beta", suffixed: false, tier: "declarative", rescan: { added: ["beta"], removed: [], total: 2 } });
      await deferred.beta.promise;
    });
    await waitFor(() => expect(result.current.themes).toEqual(["basic", "beta"]));

    // alpha (clicked first) resolves after it, with its own (now stale) presentation snapshot.
    currentPresentation = presentationFor("alpha");
    await act(async () => {
      deferred.alpha.resolve({ id: "alpha", suffixed: false, tier: "declarative", rescan: { added: ["alpha"], removed: [], total: 2 } });
      await deferred.alpha.promise;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    // The operator's LAST click (beta) must still be what is shown.
    expect(result.current.themes).toEqual(["basic", "beta"]);
    expect(result.current.downloading).toBeNull();
  });
});
