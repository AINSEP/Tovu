import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { createFakeSitesPort } from "../hooks/sites-dependencies.hooks";
import { useLocalSites } from "../hooks/use-local-sites.hooks";
import { resolveLocalSiteCard, resolveTrashDeleteDisabled } from "../Sites.hooks";
import type { AdminSitesSnapshot } from "@/lib/api";
import type { IntervalTimers, VisibilitySource } from "@/lib/visible-interval";

function fixture(): AdminSitesSnapshot {
  return { sites: [], switchingEnabled: true, localManagementEnabled: true, canSwitchNow: true,
    currentSite: { name: "owner", dir: "/sites/owner", listed: true, dirOverridden: false }, persistedSiteName: null };
}
const t = (key: string) => key;
function wrapper({ children }: { children: React.ReactNode }) { return <FetchQueryProvider>{children}</FetchQueryProvider>; }

describe("local site card controller", () => {
  it("polls only while a local-management host is visible and releases timers and listeners", () => {
    const snapshot = fixture();
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
    const port = createFakeSitesPort(snapshot, { manageLocalSite: async () => ({ restarting: false }) });
    const { result } = renderHook(() => useLocalSites({ port, snapshot, t }, { confirm: (message) => { confirms.push(message); return true; } }), { wrapper });
    await act(async () => { await result.current.run("alpha", "switch"); });
    expect(confirms).toEqual(["Switch now? Unsaved changes will be lost."]);
    expect(result.current.error).toBe("This host could not switch now. The default is saved for the next launch.");
  });
});

it("card facts protect serving/starting/crashed-with-live-pid and open only ready admin origins", () => {
  const snapshot = fixture();
  const site = { name: "alpha", dir: "/sites/alpha", displayName: "Alpha", active: false, createdAt: "" };
  snapshot.localSites = [{ name: "alpha", status: "starting", pid: 42, port: 3101, daemonPort: 3102, adminUrl: "https://localhost:3101/admin/" }];
  let view = resolveLocalSiteCard({ site, snapshot, busyName: null });
  expect(view.action).toBe("stop"); expect(view.deleteDisabled).toBe(true); expect(view.openUrl).toBeNull();
  snapshot.localSites[0].status = "running";
  expect(resolveLocalSiteCard({ site, snapshot, busyName: null }).openUrl).toBe("https://localhost:3101/admin/");
  snapshot.localSites[0].status = "crashed";
  expect(resolveLocalSiteCard({ site, snapshot, busyName: null }).deleteDisabled).toBe(true);
  snapshot.localSites[0].pid = null;
  expect(resolveLocalSiteCard({ site, snapshot, busyName: null }).action).toBe("start");
  view = resolveLocalSiteCard({ site: { ...site, dir: "/sites/owner" }, snapshot, busyName: null });
  expect(view.serving).toBe(true); expect(view.deleteDisabled).toBe(true);
  expect(resolveTrashDeleteDisabled({ id: "x", checked: { x: true }, busyName: "y" })).toBe(true);
});
