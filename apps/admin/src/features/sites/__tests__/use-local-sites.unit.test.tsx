import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useFetchQuery } from "@jini-ai/ui/fetch-query";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { createFakeSitesPort } from "../hooks/sites-dependencies.hooks";
import { useSiteConfirm } from "../hooks/use-site-confirm.hooks";
import { useLocalSites } from "../hooks/use-local-sites.hooks";
import { resolveLocalSiteCard, resolveTrashDeleteDisabled } from "../Sites.hooks";
import { ApiError, type AdminSitesSnapshot } from "@/lib/api";
import type { IntervalTimers, VisibilitySource } from "@/lib/visible-interval";
import { KEYS } from "../rules";

function fixture(): AdminSitesSnapshot {
  return { sites: [], switchingEnabled: true, localManagementEnabled: true, canSwitchNow: true,
    currentSite: { name: "owner", dir: "/sites/owner", listed: true, dirOverridden: false }, persistedSiteName: null };
}
const t = (key: string) => key;
function wrapper({ children }: { children: React.ReactNode }) { return <FetchQueryProvider>{children}</FetchQueryProvider>; }

function pollingFakes() {
  const active = new Map<() => void, number>();
  const listeners = new Set<() => void>();
  let visibilityState: DocumentVisibilityState = "visible";
  const visibility: VisibilitySource = {
    get visibilityState() { return visibilityState; },
    addEventListener: (_type, listener) => { listeners.add(listener); },
    removeEventListener: (_type, listener) => { listeners.delete(listener); },
  };
  const timers: IntervalTimers = {
    setInterval: (callback, ms) => { active.set(callback, ms); return callback; },
    clearInterval: (handle) => { active.delete(handle as () => void); },
  };
  return { active, listeners, visibility, timers,
    tick: (ms: number) => { for (const [callback, period] of [...active]) if (period === ms) callback(); },
    setVisibility: (state: DocumentVisibilityState) => { visibilityState = state; for (const listener of [...listeners]) listener(); },
  };
}

describe("local site card controller", () => {
  it.each([
    { failure: new ApiError("host refused", 409, "SITE_RUNNING"), message: "translated:Stop this site before moving it to Trash." },
    { failure: new Error("host offline"), message: "host offline" },
    { failure: "opaque failure", message: "Request failed" },
  ])("reports $message and releases busy state so an action can be retried", async ({ failure, message }) => {
    const snapshot = fixture();
    const polling = pollingFakes();
    const writes: unknown[] = [];
    let fail = true;
    const port = createFakeSitesPort(snapshot, { manageLocalSite: async (input) => {
      writes.push(input);
      if (fail) throw failure;
      return {};
    } });
    const { result, unmount } = renderHook(() => useLocalSites({ port, snapshot, t: (key) => `translated:${key}` }, polling), { wrapper });
    await act(async () => { await result.current.run("alpha", "start"); });
    expect(result.current.error).toBe(message);
    expect(result.current.busyName).toBeNull();
    fail = false;
    await act(async () => { await result.current.run("alpha", "start"); });
    expect(writes).toEqual([
      { name: "alpha", action: "start", confirmed: true, checked: false },
      { name: "alpha", action: "start", confirmed: true, checked: false },
    ]);
    expect(result.current.error).toBeNull();
    expect(result.current.busyName).toBeNull();
    unmount();
    expect(polling.active.size).toBe(0);
  });

  it("ignores actions before a snapshot exists and when the local-management port is absent", async () => {
    const polling = pollingFakes();
    const writes: unknown[] = [];
    const snapshot = fixture();
    const port = createFakeSitesPort(snapshot, { manageLocalSite: async (input) => { writes.push(input); return {}; } });
    const initialProps: { snapshot: AdminSitesSnapshot | undefined } = { snapshot: undefined };
    const { result, rerender, unmount } = renderHook(({ snapshot }: { snapshot: AdminSitesSnapshot | undefined }) =>
      useLocalSites({ port, snapshot, t }, polling), { wrapper, initialProps });
    await act(async () => {
      await result.current.run("alpha", "switch");
      await result.current.run("alpha", "start");
    });
    expect(writes).toEqual([]);
    expect(polling.active.size).toBe(0);
    delete port.manageLocalSite;
    rerender({ snapshot });
    await act(async () => { await result.current.run("alpha", "start"); });
    expect(writes).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.busyName).toBeNull();
    unmount();
  });

  it("uses the browser confirmation by default and warns when switching returns no restart result", async () => {
    const snapshot = fixture();
    const writes: unknown[] = [];
    const port = createFakeSitesPort(snapshot, { manageLocalSite: async (input) => { writes.push(input); return undefined; } });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { result, unmount } = renderHook(() => useLocalSites({ port, snapshot, t }), { wrapper });
    try {
      await act(async () => { await result.current.run("alpha", "switch"); });
      expect(confirm).toHaveBeenCalledExactlyOnceWith("Switch now? Unsaved changes will be lost.");
      expect(writes).toEqual([{ name: "alpha", action: "switch", confirmed: true, checked: false }]);
      expect(result.current.error).toBe("This host could not switch now. The default is saved for the next launch.");
      expect(result.current.busyName).toBeNull();
    } finally { unmount(); confirm.mockRestore(); }
  });

  it("polls an accepted switch on a host without local management until the live site changes", async () => {
    const snapshot = { ...fixture(), localManagementEnabled: false };
    const polling = pollingFakes();
    const writes: unknown[] = [];
    const port = createFakeSitesPort(snapshot, { manageLocalSite: async (input) => { writes.push(input); return { restarting: true }; } });
    const { result, rerender, unmount } = renderHook(() => useLocalSites({ port, snapshot, t }, { ...polling, confirm: () => true }), { wrapper });
    expect(polling.active.size).toBe(0);
    await act(async () => { await result.current.run("alpha", "switch"); });
    expect(writes).toEqual([{ name: "alpha", action: "switch", confirmed: true, checked: false }]);
    expect([...polling.active.values()]).toEqual([300]);
    snapshot.currentSite = { ...snapshot.currentSite, name: "alpha" };
    rerender();
    expect(result.current.error).toBeNull();
    expect(polling.active.size).toBe(0);
    expect(polling.listeners.size).toBe(0);
    unmount();
  });

  it("polls an unfinished start only while visible and releases timers and listeners", () => {
    const snapshot = fixture();
    snapshot.localSites = [{ name: "child", status: "starting", pid: null, port: null, daemonPort: null, adminUrl: null }];
    const listeners = new Set<() => void>();
    const active = new Set<unknown>();
    const periods: number[] = [];
    let visibilityState: DocumentVisibilityState = "hidden";
    const visibility: VisibilitySource = {
      get visibilityState() { return visibilityState; },
      addEventListener: (_type, listener) => { listeners.add(listener); },
      removeEventListener: (_type, listener) => { listeners.delete(listener); },
    };
    const timers: IntervalTimers = {
      setInterval: (callback, ms) => { periods.push(ms); active.add(callback); return callback; },
      clearInterval: (handle) => { active.delete(handle); },
    };
    const port = createFakeSitesPort(snapshot);
    const { rerender, unmount } = renderHook(() => useLocalSites({ port, snapshot, t }, { visibility, timers }), { wrapper });
    expect(active.size).toBe(0);
    expect(listeners.size).toBe(1);
    act(() => { visibilityState = "visible"; for (const listener of listeners) listener(); });
    expect(periods).toEqual([3000]);
    expect(active.size).toBe(1);
    act(() => { visibilityState = "hidden"; for (const listener of listeners) listener(); });
    expect(active.size).toBe(0);
    act(() => { visibilityState = "visible"; for (const listener of listeners) listener(); });
    expect(active.size).toBe(1);
    snapshot.localManagementEnabled = false; rerender();
    expect(active.size).toBe(0);
    expect(listeners.size).toBe(0);
    snapshot.localManagementEnabled = true; rerender();
    expect(active.size).toBe(1);
    snapshot.localSites![0]!.status = "running"; rerender();
    expect(active.size).toBe(0);
    expect(listeners.size).toBe(0);
    unmount();
    expect(active.size).toBe(0);
    expect(listeners.size).toBe(0);
  });
  it("confirms Trash, guards simultaneous clicks, honors cancellation and routes exact actions", async () => {
    const snapshot = fixture();
    const writes: unknown[] = [], confirmations: string[] = [];
    let consent = false;
    const port = createFakeSitesPort(snapshot, { manageLocalSite: async (input) => { writes.push(input); return {}; } });
    const confirm = (message: string) => { confirmations.push(message); return consent; };
    const { result } = renderHook(() => useLocalSites({ port, snapshot, t }, { confirm }), { wrapper });
    await act(async () => { await result.current.run("alpha", "trash"); });
    expect(confirmations).toEqual(["Move this site to Trash? You can restore it later."]);
    expect(writes).toEqual([]);
    consent = true;
    await act(async () => { await Promise.all([result.current.run("alpha", "trash"), result.current.run("beta", "trash")]); });
    expect(writes).toEqual([{ name: "alpha", action: "trash", confirmed: true, checked: false }]);
    expect(result.current.busyName).toBeNull();
  });
  it("requires a checkbox and confirm for permanent deletion; capability off never writes", async () => {
    const snapshot = fixture(); const writes: unknown[] = [];
    const port = createFakeSitesPort(snapshot, { manageLocalSite: async (input) => { writes.push(input); return {}; } });
    const confirms: string[] = [];
    const confirm = (message: string) => { confirms.push(message); return true; };
    const { result, rerender } = renderHook(() => useLocalSites({ port, snapshot, t }, { confirm }), { wrapper });
    await act(async () => { await result.current.run("trash-id", "delete"); });
    expect(writes).toEqual([]); expect(confirms).toEqual([]);
    act(() => result.current.toggleChecked("trash-id", true));
    await act(async () => { await result.current.run("trash-id", "delete"); });
    expect(writes).toEqual([{ name: "trash-id", action: "delete", checked: true, confirmed: true }]);
    expect(confirms).toEqual(["Permanently delete this site and all its data? This cannot be undone."]);
    snapshot.localManagementEnabled = false; snapshot.canSwitchNow = false; rerender();
    await act(async () => { await result.current.run("alpha", "start"); await result.current.run("alpha", "switch"); });
    expect(writes).toHaveLength(1);
  });
  it("warns before Switch now and reports a host that could only save the default", async () => {
    const snapshot = fixture(); const confirms: string[] = [];
    const polling = pollingFakes();
    const port = createFakeSitesPort(snapshot, { manageLocalSite: async () => ({ restarting: false }) });
    const { result } = renderHook(() => useLocalSites({ port, snapshot, t }, { ...polling, confirm: (message) => { confirms.push(message); return true; } }), { wrapper });
    await act(async () => { await result.current.run("alpha", "switch"); });
    expect(confirms).toEqual(["Switch now? Unsaved changes will be lost."]);
    expect(result.current.error).toBe("This host could not switch now. The default is saved for the next launch.");
    expect([...polling.active.values()]).toEqual([]);
  });

  it("invalidates the list every 300 ms after restart acceptance until the live site matches", async () => {
    const snapshot = fixture();
    const polling = pollingFakes();
    const list = vi.fn(async () => snapshot);
    const port = createFakeSitesPort(list, { manageLocalSite: async () => ({ restarting: true }) });
    const { result, rerender, unmount } = renderHook(() => {
      const query = useFetchQuery({ key: KEYS.list, fetch: port.listSites });
      const controller = useLocalSites({ port, snapshot, t }, { ...polling, confirm: () => true });
      return { controller, loaded: query.data !== undefined };
    }, { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(list).toHaveBeenCalledTimes(1);
    await act(async () => { await result.current.controller.run("alpha", "switch"); });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect([...polling.active.values()]).toEqual([300]);
    await act(async () => { polling.tick(300); });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(3));
    // A persisted next-launch choice is not evidence that the new server is serving it.
    snapshot.persistedSiteName = "alpha"; rerender();
    expect([...polling.active.values()]).toEqual([300]);
    snapshot.currentSite = { ...snapshot.currentSite, name: "alpha" }; rerender();
    expect([...polling.active.values()]).toEqual([]);
    await act(async () => { polling.tick(300); });
    expect(list).toHaveBeenCalledTimes(3);
    await act(async () => { polling.tick(3000); });
    expect(list).toHaveBeenCalledTimes(3);
    unmount();
    expect(polling.active.size).toBe(0);
    expect(polling.listeners.size).toBe(0);
  });

  it.each(["deadline", "hidden deadline", "unmount"])("cleans up restart polling on %s", async (stop) => {
    const snapshot = fixture();
    const polling = pollingFakes();
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    const port = createFakeSitesPort(snapshot, { manageLocalSite: async () => ({ restarting: true }) });
    const { result, unmount } = renderHook(() => useLocalSites({ port, snapshot, t }, { ...polling, confirm: () => true }), { wrapper });
    try {
      await act(async () => { await result.current.run("alpha", "switch"); });
      expect([...polling.active.values()]).toEqual([300]);
      if (stop !== "unmount") {
        clock.mockReturnValue(60_999);
        act(() => polling.tick(300));
        expect([...polling.active.values()]).toEqual([300]);
        if (stop === "hidden deadline") {
          act(() => polling.setVisibility("hidden"));
          expect(polling.active.size).toBe(0);
        }
        clock.mockReturnValue(61_000);
        act(() => { if (stop === "hidden deadline") polling.setVisibility("visible"); else polling.tick(300); });
        expect([...polling.active.values()]).toEqual([]);
      }
    } finally {
      unmount();
      clock.mockRestore();
    }
    expect(polling.active.size).toBe(0);
    expect(polling.listeners.size).toBe(0);
  });
});

it("card facts protect serving/starting/crashed-with-live-pid and open only ready admin origins", () => {
  const snapshot = fixture();
  const site = { name: "alpha", dir: "/sites/alpha", displayName: "Alpha", active: false, createdAt: "" };
  snapshot.localSites = [{ name: "alpha", status: "starting", pid: 42, port: 3101, daemonPort: 3102, adminUrl: "https://localhost:3101/admin/" }];
  let view = resolveLocalSiteCard({ site, snapshot, busyName: null });
  expect(view.action).toBe("stop"); expect(view.openUrl).toBeNull();
  snapshot.localSites[0].status = "running";
  expect(resolveLocalSiteCard({ site, snapshot, busyName: null }).openUrl).toBe("https://localhost:3101/admin/");
  snapshot.localSites[0].status = "crashed";
  expect(resolveLocalSiteCard({ site, snapshot, busyName: null }).action).toBe("stop");
  snapshot.localSites[0].pid = null;
  expect(resolveLocalSiteCard({ site, snapshot, busyName: null }).action).toBe("start");
  view = resolveLocalSiteCard({ site: { ...site, dir: "/sites/owner" }, snapshot, busyName: null });
  expect(view.serving).toBe(true); expect(view.openUrl).toBe("/admin/"); expect(view.switchEnabled).toBe(false);
  expect(resolveTrashDeleteDisabled({ id: "x", checked: { x: true }, busyName: "y" })).toBe(true);
});

it("switching uses confirmation, cancellation and the existing busy/error lifecycle", async () => {
  const snapshot = fixture(), writes: unknown[] = [], questions: string[] = [];
  let consent = false;
  const port = createFakeSitesPort(snapshot, { manageLocalSite: async (input) => { writes.push(input); return { restarting: true }; } });
  const { result, unmount } = renderHook(() => useLocalSites({ port, snapshot, t }, { confirm: (message) => { questions.push(message); return consent; } }), { wrapper });
  await act(async () => { await result.current.run("alpha", "switch"); });
  expect(writes).toEqual([]); expect(questions[0]).toContain("Switch now? Unsaved changes will be lost.");
  consent = true;
  await act(async () => { await result.current.run("alpha", "switch"); });
  expect(writes).toEqual([{ name: "alpha", action: "switch", confirmed: true, checked: false }]);
  expect(result.current.busyName).toBeNull(); expect(result.current.error).toBeNull(); unmount();
});

it("shows the Desktop refusal URL without starting restart polling or changing the served site", async () => {
  const snapshot = fixture();
  const polling = pollingFakes();
  const message = "Site 'alpha' is open in Desktop at https://localhost:53775/admin/. Switch refused; the current site is still running.";
  const port = createFakeSitesPort(snapshot, {
    manageLocalSite: async () => { throw new ApiError(message, 409, "SITE_ALREADY_RUNNING"); },
  });
  const { result, unmount } = renderHook(() => useLocalSites({ port, snapshot, t }, { ...polling, confirm: () => true }), { wrapper });
  await act(async () => { await result.current.run("alpha", "switch"); });
  expect(result.current.error).toBe(message);
  expect(result.current.busyName).toBeNull();
  expect(snapshot.currentSite.name).toBe("owner");
  expect(polling.active.size).toBe(0);
  unmount();
});


it("the shared confirmation modal presents and settles a site switch", async () => {
  const { result, unmount } = renderHook(() => useSiteConfirm({ t }));
  let answer!: Promise<boolean>;
  act(() => { answer = result.current.confirm("Switch now? Unsaved changes will be lost.", { action: "switch" }); });
  expect(result.current.open).toBe(true); expect(result.current.title).toBe("Switch to this site now?");
  expect(result.current.confirmLabel).toBe("Switch now"); expect(result.current.tone).toBe("warning");
  act(() => result.current.onConfirm()); expect(await answer).toBe(true); expect(result.current.open).toBe(false); unmount();
});
