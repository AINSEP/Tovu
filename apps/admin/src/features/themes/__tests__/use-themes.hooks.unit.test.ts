import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultAdminLocalePort } from "@/hooks/admin-locale-dependencies.hooks";
import { api, type PresentationSettings } from "@/lib/api";
import { createFakeThemesPort } from "../hooks/themes-dependencies.hooks";
import { useThemes, useWiredThemes } from "../hooks/use-themes.hooks";
import { t as translateThemes } from "../themes-i18n";

/**
 * @file `useThemes` driven against the injected `ThemesPort`, no `fetch` stub and no `api` spy.
 * `Themes.unit.test.tsx` covers the component's own rendering entirely through a full-controller
 * fake on `useThemesHook` (never the real hook), so this is the first test to exercise
 * `useThemes` itself.
 */

describe("useThemes — injected port (no fetch stub, no api spy)", () => {
  it("loads settings/themes/tiers from the injected port and never touches the real api client", async () => {
    const getPresentationSpy = vi.spyOn(api, "getPresentation");
    const port = createFakeThemesPort({
      availableThemeIds: ["basic", "quartz"],
      availableThemes: [{ id: "basic", name: "Basic", tier: "declarative" }, { id: "quartz", tier: "static" }],
    });
    const { result } = renderHook(() => useThemes({ port, t: (k) => k }));

    await waitFor(() => expect(result.current.themes).toEqual(["basic", "quartz"]));
    expect(result.current.themeTiers).toEqual({ basic: "declarative", quartz: "static" });
    expect(result.current.themeNames).toEqual({ basic: "Basic" });
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
  it("the LAST-clicked activate wins even when an earlier click's response arrives while the later one is still queued", async () => {
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
    // actual, final choice. Activations are serialized onto one lane, so only quartz's call
    // reaches the port; slate's stays queued behind it.
    act(() => {
      void result.current.activate("quartz");
    });
    act(() => {
      void result.current.activate("slate");
    });
    await waitFor(() => expect(setActiveTheme).toHaveBeenCalledTimes(1), { timeout: 5000 });
    expect(setActiveTheme).toHaveBeenCalledWith("quartz");

    // quartz (clicked first) resolves — but a newer activate (slate) already superseded it before
    // its result ever lands, so it must not paint, and slate's queued call now reaches the port.
    await act(async () => {
      deferred.quartz.resolve({ settings: settingsFor("quartz"), availableThemeIds: ["basic", "quartz", "slate"] });
      await deferred.quartz.promise;
    });
    await waitFor(() => expect(setActiveTheme).toHaveBeenCalledTimes(2), { timeout: 5000 });
    expect(result.current.settings?.activeThemeId).toBe("basic");
    expect(result.current.busyTheme).toBe("slate");

    await act(async () => {
      deferred.slate.resolve({ settings: settingsFor("slate"), availableThemeIds: ["basic", "quartz", "slate"] });
      await deferred.slate.promise;
    });
    await waitFor(() => expect(result.current.busyTheme).toBeNull(), { timeout: 5000 });

    // The operator's LAST click (slate) is what is shown, reached the server AFTER quartz's stale
    // response had already been dropped.
    expect(result.current.settings?.activeThemeId).toBe("slate");
  });

  /**
   * The `finally` block's own stale-settlement guard is a THIRD, independent check from the two
   * above (mutation-sweep flagged it separately: disabling only this one leaves the success/error
   * guards intact, so a test that merely lands on the correct FINAL `busyTheme` value doesn't prove
   * it — see this file's own handoff notes). It only diverges from "no-op" when the stale call
   * settles WHILE the newer one is still pending: clearing `busyTheme` here would hide the busy
   * indicator for a switch that hasn't actually finished yet.
   */
  it("a stale activate settling while a newer activate is still queued must not clear busyTheme early", async () => {
    const deferred: Record<string, { resolve: (value: { settings: PresentationSettings; availableThemeIds: string[] }) => void }> = {};
    const port = createFakeThemesPort({ availableThemeIds: ["basic", "quartz", "slate"] });
    port.setActiveTheme = vi.fn(
      (activeThemeId: string) =>
        new Promise<{ settings: PresentationSettings; availableThemeIds: string[] }>((resolve) => {
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
    await waitFor(() => expect(port.setActiveTheme).toHaveBeenCalledTimes(1), { timeout: 5000 });
    expect(result.current.busyTheme).toBe("slate");

    // quartz (stale) settles now, while slate's own call is still QUEUED behind it.
    await act(async () => {
      deferred.quartz!.resolve({ settings: settingsFor("quartz"), availableThemeIds: ["basic", "quartz", "slate"] });
    });
    await waitFor(() => expect(port.setActiveTheme).toHaveBeenCalledTimes(2), { timeout: 5000 });

    // slate's activate has not settled yet — busyTheme must still show it, not be cleared by
    // quartz's stale settlement.
    expect(result.current.busyTheme).toBe("slate");

    // Now let slate settle too, and confirm busyTheme finally clears.
    await act(async () => {
      deferred.slate!.resolve({ settings: settingsFor("slate"), availableThemeIds: ["basic", "quartz", "slate"] });
    });
    await waitFor(() => expect(result.current.busyTheme).toBeNull(), { timeout: 5000 });
  });

  it("a stale FAILED activate settling while a newer, successful activate is still queued must not resurrect a stale error", async () => {
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
    await waitFor(() => expect(port.setActiveTheme).toHaveBeenCalledTimes(1), { timeout: 5000 });

    // quartz — already superseded the instant slate was clicked — now fails, while slate's call is
    // still queued behind it. Its error must not surface.
    await act(async () => {
      deferred.quartz.reject(new Error("failed to switch theme"));
      await promises.quartz.catch(() => {});
    });
    expect(result.current.error).toBeNull();

    // slate's queued call now reaches the port and succeeds.
    await waitFor(() => expect(port.setActiveTheme).toHaveBeenCalledTimes(2), { timeout: 5000 });
    await act(async () => {
      deferred.slate.resolveOk({ settings: settingsFor("slate"), availableThemeIds: ["basic", "quartz", "slate"] });
      await promises.slate.catch(() => {});
    });
    await waitFor(() => expect(result.current.settings?.activeThemeId).toBe("slate"), { timeout: 5000 });

    expect(result.current.error).toBeNull();
  });
});

/**
 * The server persists whichever activation it processes LAST (mirrors `use-sites.hooks.ts`'s own
 * "two activations back to back" race, closed there by c2da0ddba), so two activations in flight at
 * once can leave the server on the earlier choice while this screen reports the later one.
 * `Themes.tsx` disables every Activate button (and "Turn the theme off") while `busyTheme !==
 * null`, so only a same-tick programmatic call reaches this — but the hook accepts one, and must
 * not let the screen and the server disagree when it does.
 */
describe("useThemes — two activations back to back persist the theme the screen reports", () => {
  it("sends the second activation only after the first settles, so the server ends on the theme the screen reports", async () => {
    let persisted: string | null = null;
    const pending: Array<() => void> = [];
    let maxInFlight = 0;
    let inFlight = 0;
    const calls: string[] = [];
    const port = createFakeThemesPort({ availableThemeIds: ["basic", "quartz", "slate"] });
    port.setActiveTheme = vi.fn((themeId: string) => {
      calls.push(themeId);
      return new Promise<{ settings: PresentationSettings; availableThemeIds: string[] }>((resolve) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        pending.push(() => {
          persisted = themeId;
          inFlight -= 1;
          resolve({ settings: settingsFor(themeId), availableThemeIds: ["basic", "quartz", "slate"] });
        });
      });
    });

    const { result } = renderHook(() => useThemes({ port, t: (k) => k }));
    await waitFor(() => expect(result.current.themes).toEqual(["basic", "quartz", "slate"]));

    act(() => {
      void result.current.activate("quartz");
    });
    act(() => {
      void result.current.activate("slate");
    });

    // Release the NEWEST pending request each round — the network order that loses the last click
    // if activations are not serialized. Exactly two releases: two clicks, so two requests reach
    // the port whether they arrive together (today, unserialized) or one at a time (after the fix).
    // Generous timeout: up to 3 agents run vitest on this machine at once (see WRITER-RULES), and a
    // microtask that is logically instant can still lag past the default 1000ms under contention.
    for (let round = 0; round < 2; round += 1) {
      await waitFor(() => expect(pending.length).toBeGreaterThan(0), { timeout: 5000 });
      act(() => {
        pending.pop()!();
      });
    }
    await waitFor(() => expect(result.current.busyTheme).toBeNull(), { timeout: 5000 });

    expect(persisted).toBe("slate");
    expect(result.current.settings?.activeThemeId).toBe("slate");
    expect(maxInFlight).toBe(1);
    expect(calls).toEqual(["quartz", "slate"]);
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

describe("useWiredThemes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("wires the real api-backed port and a themes-i18n-bound translator", async () => {
    vi.spyOn(defaultAdminLocalePort, "loadLanguage").mockResolvedValue("es");
    const getPresentationSpy = vi.spyOn(api, "getPresentation").mockResolvedValue({
      settings: { workspaceId: "ws", activeThemeId: "basic", updatedAt: new Date(0).toISOString() },
      availableThemeIds: ["basic"],
      availableThemes: [{ id: "basic", tier: "declarative" }],
      activeThemeTemplates: [],
      activeThemeStaticPageIds: [],
    });

    const { result } = renderHook(() => useWiredThemes());

    expect(result.current.t("Themes")).toBe("Themes");
    await waitFor(() => expect(result.current.t("Themes")).toBe("Temas"));

    await waitFor(() => expect(result.current.themes).toEqual(["basic"]));
    expect(getPresentationSpy).toHaveBeenCalledTimes(1);
  });
});
