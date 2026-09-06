import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type PresentationSettings } from "@/lib/api";
import { createFakeThemesPort } from "../hooks/themes-dependencies.hooks";
import { useThemes, useWiredThemes } from "../hooks/use-themes.hooks";

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

  /**
   * The `finally` block's own stale-settlement guard is a THIRD, independent check from the two
   * above (mutation-sweep flagged it separately: disabling only this one leaves the success/error
   * guards intact, so a test that merely lands on the correct FINAL `busyTheme` value doesn't prove
   * it — see this file's own handoff notes). It only diverges from "no-op" when the stale call
   * settles WHILE the newer one is still pending: clearing `busyTheme` here would hide the busy
   * indicator for a switch that hasn't actually finished yet.
   */
  it("a stale activate settling while a newer activate is still pending must not clear busyTheme early", async () => {
    const deferred: Record<string, { resolve: (value: { settings: PresentationSettings; availableThemeIds: string[] }) => void }> = {};
    const port = createFakeThemesPort({ availableThemeIds: ["basic", "quartz", "slate"] });
    port.setActiveTheme = vi.fn(
      (activeThemeId: string) =>
        new Promise((resolve) => {
          deferred[activeThemeId] = { resolve };
        })
    );

    const { result } = renderHook(() => useThemes({ port, t: (k) => k }));
    await waitFor(() => expect(result.current.themes).toEqual(["basic", "quartz", "slate"]));

    act(() => {
      void result.current.activate("quartz");
    });
    act(() => {
      void result.current.activate("slate");
    });
    await waitFor(() => expect(port.setActiveTheme).toHaveBeenCalledTimes(2));
    expect(result.current.busyTheme).toBe("slate");

    // quartz (stale) settles now, while slate's own call is STILL pending.
    await act(async () => {
      deferred.quartz!.resolve({ settings: settingsFor("quartz"), availableThemeIds: ["basic", "quartz", "slate"] });
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    // slate's activate has not settled yet — busyTheme must still show it, not be cleared by
    // quartz's stale settlement.
    expect(result.current.busyTheme).toBe("slate");

    // Now let slate settle too, and confirm busyTheme finally clears.
    await act(async () => {
      deferred.slate!.resolve({ settings: settingsFor("slate"), availableThemeIds: ["basic", "quartz", "slate"] });
    });
    await waitFor(() => expect(result.current.busyTheme).toBeNull());
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

  /**
   * Same third, independent `finally`-guard as `activate`'s own (see that describe block's doc
   * comment) — only observable when the stale call settles while the newer one is still pending.
   */
  it("a stale download settling while a newer download is still pending must not clear downloading early", async () => {
    const deferred: Record<
      string,
      { resolve: (value: { id: string; suffixed: boolean; tier: string; rescan: { added: string[]; removed: string[]; total: number } }) => void }
    > = {};
    const port = createFakeThemesPort({ availableThemeIds: ["basic"] });
    port.downloadMarketplaceTheme = vi.fn(
      (themeId: string) =>
        new Promise((resolve) => {
          deferred[themeId] = { resolve };
        })
    );

    const { result } = renderHook(() => useThemes({ port, t: (k) => k }));
    await waitFor(() => expect(result.current.themes).toEqual(["basic"]));

    act(() => {
      void result.current.download!("alpha");
    });
    act(() => {
      void result.current.download!("beta");
    });
    await waitFor(() => expect(port.downloadMarketplaceTheme).toHaveBeenCalledTimes(2));
    expect(result.current.downloading).toBe("beta");

    // alpha (stale) settles now, while beta's own call is STILL pending.
    await act(async () => {
      deferred.alpha!.resolve({ id: "alpha", suffixed: false, tier: "declarative", rescan: { added: ["alpha"], removed: [], total: 2 } });
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    // beta's download has not settled yet — downloading must still show it, not be cleared by
    // alpha's stale settlement.
    expect(result.current.downloading).toBe("beta");

    await act(async () => {
      deferred.beta!.resolve({ id: "beta", suffixed: false, tier: "declarative", rescan: { added: ["beta"], removed: [], total: 2 } });
    });
    await waitFor(() => expect(result.current.downloading).toBeNull());
  });

  it("a stale FAILED download settling after a newer, successful download must not resurrect a stale error", async () => {
    const deferred: Record<
      string,
      { reject: (reason: unknown) => void; resolveOk: (value: { id: string; suffixed: boolean; tier: string; rescan: { added: string[]; removed: string[]; total: number } }) => void }
    > = {};
    const promises: Record<string, Promise<unknown>> = {};
    const port = createFakeThemesPort({ availableThemeIds: ["basic"] });
    port.downloadMarketplaceTheme = vi.fn((themeId: string) => {
      const promise = new Promise((resolve, reject) => {
        deferred[themeId] = { reject, resolveOk: resolve };
      });
      promises[themeId] = promise;
      return promise;
    });

    const { result } = renderHook(() => useThemes({ port, t: (k) => k }));
    await waitFor(() => expect(result.current.themes).toEqual(["basic"]));

    act(() => {
      void result.current.download!("alpha");
    });
    act(() => {
      void result.current.download!("beta");
    });
    await waitFor(() => expect(port.downloadMarketplaceTheme).toHaveBeenCalledTimes(2));

    // The LAST click (beta) succeeds first.
    await act(async () => {
      deferred.beta!.resolveOk({ id: "beta", suffixed: false, tier: "declarative", rescan: { added: ["beta"], removed: [], total: 2 } });
      await promises.beta!.catch(() => {});
    });
    await waitFor(() => expect(result.current.downloading).toBeNull());
    expect(result.current.error).toBeNull();

    // The stale, superseded alpha call now fails — its error must not resurrect over beta's
    // already-successful, already-displayed outcome.
    await act(async () => {
      deferred.alpha!.reject(new Error("download failed"));
      await promises.alpha!.catch(() => {});
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(result.current.error).toBeNull();
  });
});

describe("useThemes — initial load failure", () => {
  it("sets error and leaves themes empty when the initial getPresentation call rejects", async () => {
    const port = createFakeThemesPort();
    port.getPresentation = () => Promise.reject(new Error("network down"));
    const { result } = renderHook(() => useThemes({ port, t: (k) => k }));

    await waitFor(() => expect(result.current.error).toBe("network down"));
    expect(result.current.themes).toEqual([]);
  });

  it("falls back to a generic message when the rejection is not an Error instance", async () => {
    const port = createFakeThemesPort();
    port.getPresentation = () => Promise.reject("nope");
    const { result } = renderHook(() => useThemes({ port, t: (k) => k }));

    await waitFor(() => expect(result.current.error).toBe("failed to load themes"));
  });
});

describe("useThemes — activate failure (current, non-stale generation)", () => {
  it("sets error and clears busyTheme when the only activate call in flight fails", async () => {
    const port = createFakeThemesPort({ availableThemeIds: ["basic", "quartz"] });
    port.setActiveTheme = () => Promise.reject(new Error("failed to switch theme"));
    const { result } = renderHook(() => useThemes({ port, t: (k) => k }));
    await waitFor(() => expect(result.current.themes).toEqual(["basic", "quartz"]));

    await act(async () => {
      await result.current.activate("quartz");
    });

    expect(result.current.error).toBe("failed to switch theme");
    expect(result.current.busyTheme).toBeNull();
  });

  it("falls back to a generic message when the rejection is not an Error instance", async () => {
    const port = createFakeThemesPort({ availableThemeIds: ["basic", "quartz"] });
    port.setActiveTheme = () => Promise.reject("nope");
    const { result } = renderHook(() => useThemes({ port, t: (k) => k }));
    await waitFor(() => expect(result.current.themes).toEqual(["basic", "quartz"]));

    await act(async () => {
      await result.current.activate("quartz");
    });

    expect(result.current.error).toBe("failed to switch theme");
  });
});

describe("useThemes — rescan", () => {
  it("reloads settings/themes/tiers and reports what changed", async () => {
    const port = createFakeThemesPort({ availableThemeIds: ["basic"] });
    const { result } = renderHook(() => useThemes({ port, t: (k) => k }));
    await waitFor(() => expect(result.current.themes).toEqual(["basic"]));

    // Only reconfigure the port's post-rescan response AFTER the initial mount load already
    // settled to its own fixture above — swapping it before `renderHook` would make the INITIAL
    // load (not the rescan) resolve to the post-rescan fixture, since both go through the same
    // `getPresentation` binding.
    port.rescanThemes = () =>
      Promise.resolve({ added: ["quartz"], removed: [], total: 2, availableThemeIds: ["basic", "quartz"], duplicateIds: [] });
    port.getPresentation = () =>
      Promise.resolve({
        settings: settingsFor("basic"),
        availableThemeIds: ["basic", "quartz"],
        availableThemes: [{ id: "basic", tier: "declarative" as const }, { id: "quartz", tier: "static" as const }],
      });

    await act(async () => {
      await result.current.rescan!();
    });

    expect(result.current.themes).toEqual(["basic", "quartz"]);
    expect(result.current.themeTiers).toEqual({ basic: "declarative", quartz: "static" });
    expect(result.current.rescanNotice).toBe("added quartz");
    expect(result.current.rescanning).toBe(false);
  });

  it("reports no changes, with the current theme count, when nothing added or removed", async () => {
    const port = createFakeThemesPort({ availableThemeIds: ["basic"] });
    const { result } = renderHook(() => useThemes({ port, t: (k) => k }));
    await waitFor(() => expect(result.current.themes).toEqual(["basic"]));

    await act(async () => {
      await result.current.rescan!();
    });

    expect(result.current.rescanNotice).toBe("no changes — 1 themes");
  });

  it("reports duplicate theme ids appended to the summary", async () => {
    const port = createFakeThemesPort({ availableThemeIds: ["basic"] });
    port.rescanThemes = () =>
      Promise.resolve({ added: [], removed: ["quartz"], total: 1, availableThemeIds: ["basic"], duplicateIds: ["basic"] });
    const { result } = renderHook(() => useThemes({ port, t: (k) => k }));
    await waitFor(() => expect(result.current.themes).toEqual(["basic"]));

    await act(async () => {
      await result.current.rescan!();
    });

    expect(result.current.rescanNotice).toBe(
      "removed quartz. Duplicate theme ids: basic — only one of each will ever load."
    );
  });

  it("sets error and stops rescanning when rescanThemes rejects", async () => {
    const port = createFakeThemesPort({ availableThemeIds: ["basic"] });
    port.rescanThemes = () => Promise.reject(new Error("rescan failed"));
    const { result } = renderHook(() => useThemes({ port, t: (k) => k }));
    await waitFor(() => expect(result.current.themes).toEqual(["basic"]));

    await act(async () => {
      await result.current.rescan!();
    });

    expect(result.current.error).toBe("rescan failed");
    expect(result.current.rescanning).toBe(false);
  });

  it("falls back to a generic rescan error message when the rejection is not an Error instance", async () => {
    const port = createFakeThemesPort({ availableThemeIds: ["basic"] });
    port.rescanThemes = () => Promise.reject("nope");
    const { result } = renderHook(() => useThemes({ port, t: (k) => k }));
    await waitFor(() => expect(result.current.themes).toEqual(["basic"]));

    await act(async () => {
      await result.current.rescan!();
    });

    expect(result.current.error).toBe("failed to rescan themes");
  });

  it("dismissRescanNotice clears a standing notice", async () => {
    const port = createFakeThemesPort({ availableThemeIds: ["basic"] });
    const { result } = renderHook(() => useThemes({ port, t: (k) => k }));
    await waitFor(() => expect(result.current.themes).toEqual(["basic"]));

    await act(async () => {
      await result.current.rescan!();
    });
    expect(result.current.rescanNotice).not.toBeNull();

    act(() => result.current.dismissRescanNotice!());
    expect(result.current.rescanNotice).toBeNull();
  });
});

describe("useThemes — loadMarketplace", () => {
  it("loads the marketplace listing on request", async () => {
    const port = createFakeThemesPort({
      marketplace: [{ id: "alpha", name: "Alpha", tier: "declarative", idTaken: false }],
    });
    const { result } = renderHook(() => useThemes({ port, t: (k) => k }));
    await waitFor(() => expect(result.current.settings).not.toBeNull());
    expect(result.current.marketplace).toEqual([]);

    await act(async () => {
      await result.current.loadMarketplace!();
    });

    expect(result.current.marketplace).toEqual([{ id: "alpha", name: "Alpha", tier: "declarative", idTaken: false }]);
    expect(result.current.marketplaceLoading).toBe(false);
  });

  it("sets error and stops loading when listMarketplaceThemes rejects", async () => {
    const port = createFakeThemesPort();
    port.listMarketplaceThemes = () => Promise.reject(new Error("marketplace down"));
    const { result } = renderHook(() => useThemes({ port, t: (k) => k }));
    await waitFor(() => expect(result.current.settings).not.toBeNull());

    await act(async () => {
      await result.current.loadMarketplace!();
    });

    expect(result.current.error).toBe("marketplace down");
    expect(result.current.marketplaceLoading).toBe(false);
  });

  it("falls back to a generic marketplace error message when the rejection is not an Error instance", async () => {
    const port = createFakeThemesPort();
    port.listMarketplaceThemes = () => Promise.reject("nope");
    const { result } = renderHook(() => useThemes({ port, t: (k) => k }));
    await waitFor(() => expect(result.current.settings).not.toBeNull());

    await act(async () => {
      await result.current.loadMarketplace!();
    });

    expect(result.current.error).toBe("failed to load the marketplace");
  });
});

describe("useThemes — download (non-race paths)", () => {
  it("reports the renamed-on-collision message when the server suffixed the id", async () => {
    const port = createFakeThemesPort({ availableThemeIds: ["basic"] });
    port.downloadMarketplaceTheme = () =>
      Promise.resolve({ id: "basic-1", suffixed: true, tier: "declarative", rescan: { added: ["basic-1"], removed: [], total: 2 } });
    const { result } = renderHook(() => useThemes({ port, t: (k) => k }));
    await waitFor(() => expect(result.current.themes).toEqual(["basic"]));

    await act(async () => {
      await result.current.download!("basic");
    });

    expect(result.current.rescanNotice).toBe('Installed as “basic-1” — “basic” was already taken, so it was renamed.');
    expect(result.current.downloading).toBeNull();
  });

  it("sets error and clears downloading when downloadMarketplaceTheme rejects", async () => {
    const port = createFakeThemesPort({ availableThemeIds: ["basic"] });
    port.downloadMarketplaceTheme = () => Promise.reject(new Error("download failed"));
    const { result } = renderHook(() => useThemes({ port, t: (k) => k }));
    await waitFor(() => expect(result.current.themes).toEqual(["basic"]));

    await act(async () => {
      await result.current.download!("alpha");
    });

    expect(result.current.error).toBe("download failed");
    expect(result.current.downloading).toBeNull();
  });

  it("falls back to a generic download error message when the rejection is not an Error instance", async () => {
    const port = createFakeThemesPort({ availableThemeIds: ["basic"] });
    port.downloadMarketplaceTheme = () => Promise.reject("nope");
    const { result } = renderHook(() => useThemes({ port, t: (k) => k }));
    await waitFor(() => expect(result.current.themes).toEqual(["basic"]));

    await act(async () => {
      await result.current.download!("alpha");
    });

    expect(result.current.error).toBe("failed to download theme");
  });

  /**
   * The narrower of `download`'s two stale-settlement guards: a call can be current when it
   * passes the FIRST check (right after `getPresentation`, tested by the "download race safety"
   * describe block above) yet become stale while its own `await loadMarketplace()` is still in
   * flight, if a newer download starts in that window. Each call's own `loadMarketplace()` gets an
   * independently resolvable promise so the two can be settled in a controlled order.
   */
  it("drops a stale download's own rescan notice when a newer download supersedes it mid-loadMarketplace", async () => {
    const port = createFakeThemesPort({ availableThemeIds: ["basic"] });
    const marketplaceResolvers: Array<(value: { themes: [] }) => void> = [];
    port.listMarketplaceThemes = vi.fn(
      () =>
        new Promise<{ themes: [] }>((resolve) => {
          marketplaceResolvers.push(resolve);
        })
    );
    port.downloadMarketplaceTheme = vi.fn((themeId: string) =>
      Promise.resolve({
        id: themeId,
        suffixed: false,
        tier: "declarative" as const,
        rescan: { added: [themeId], removed: [], total: 2 },
      })
    );

    const { result } = renderHook(() => useThemes({ port, t: (k) => k }));
    await waitFor(() => expect(result.current.themes).toEqual(["basic"]));

    act(() => {
      void result.current.download!("alpha");
    });
    await waitFor(() => expect(marketplaceResolvers).toHaveLength(1));

    // A newer download starts while alpha is still awaiting its own loadMarketplace() — this bumps
    // downloadGenerationRef past alpha's captured generation.
    act(() => {
      void result.current.download!("beta");
    });
    await waitFor(() => expect(marketplaceResolvers).toHaveLength(2));

    // Settle beta's (current) loadMarketplace() first and confirm its own notice lands normally.
    await act(async () => {
      marketplaceResolvers[1]!({ themes: [] });
    });
    await waitFor(() => expect(result.current.rescanNotice).toBe("Installed “beta”."));

    // Now settle alpha's (stale) loadMarketplace(). If the guard were missing, this would overwrite
    // beta's already-displayed notice with alpha's.
    await act(async () => {
      marketplaceResolvers[0]!({ themes: [] });
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(result.current.rescanNotice).toBe("Installed “beta”.");
  });
});

describe("useWiredThemes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("wires the real api-backed port and a themes-i18n-bound translator", async () => {
    const getPresentationSpy = vi.spyOn(api, "getPresentation").mockResolvedValue({
      settings: { workspaceId: "ws", activeThemeId: "basic", updatedAt: new Date(0).toISOString() },
      availableThemeIds: ["basic"],
      availableThemes: [{ id: "basic", tier: "declarative" }],
      activeThemeTemplates: [],
      activeThemeStaticPageIds: [],
    });

    const { result } = renderHook(() => useWiredThemes());

    // Bound translator falls back to the English source string with no override in play — proves
    // `t` is `themes-i18n.ts`'s own dictionary translator, not the raw identity function every
    // `useThemes({ port, t })` unit test above passes.
    expect(result.current.t("Themes")).toBe("Themes");

    await waitFor(() => expect(result.current.themes).toEqual(["basic"]));
    expect(getPresentationSpy).toHaveBeenCalledTimes(1);
  });
});
