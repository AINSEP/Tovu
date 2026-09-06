import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/lib/fetch-query";
import { publishContentRefresh, resetContentRefreshBus } from "@/lib/content-refresh-bus";
import { useStaticExport } from "../use-static-export.hooks";
import { createFakeStaticExportPort } from "../static-export-dependencies.hooks";
import { DEPLOYMENT_EXPORT_RESOURCE } from "../../rules";
import type { AdminExportRunSnapshot } from "@/lib/api";

/**
 * @file `useStaticExport` — the Static Site tab's build action: an initial status read, a trigger,
 * and a poll loop while a run is `"running"`. Same injected-port shape as
 * `use-deployment-overview.unit.test.tsx`/`use-dockerfile-source.unit.test.tsx`.
 *
 * The poll loop uses real `setTimeout` internally (see `use-static-export.hooks.ts`'s own header),
 * so these tests use fake timers and `vi.advanceTimersByTimeAsync` to drive it deterministically
 * rather than waiting on wall-clock time.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

const fakeT = (key: string): string => key;
const fakeLocale = "en";

const IDLE_RUN: AdminExportRunSnapshot = { status: "idle", startedAtIso: null, finishedAtIso: null, outputDir: null };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useStaticExport — initial load", () => {
  it("seeds run from the fake port's status read, with no fetch involved", async () => {
    const networkMock = vi.fn();
    vi.stubGlobal("fetch", networkMock);
    const port = createFakeStaticExportPort(IDLE_RUN);

    const { result } = renderHook(() => useStaticExport(port, fakeT, fakeLocale), { wrapper });

    await waitFor(() => expect(result.current.run).not.toBeUndefined());
    expect(result.current.run).toEqual(IDLE_RUN);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.loadError).toBeNull();
    expect(networkMock).not.toHaveBeenCalled();
  });

  it("seeds an already-running run so a reload mid-export shows the real state", async () => {
    const runningRun: AdminExportRunSnapshot = { status: "running", startedAtIso: "t0", finishedAtIso: null, outputDir: "/infra/export" };
    const port = createFakeStaticExportPort(runningRun);
    const { result } = renderHook(() => useStaticExport(port, fakeT, fakeLocale), { wrapper });

    await waitFor(() => expect(result.current.isRunning).toBe(true));
  });

  it("surfaces a rejected initial read as a translated, formatted load error", async () => {
    const port = createFakeStaticExportPort(() => Promise.reject(new Error("disk error")));
    const { result } = renderHook(() => useStaticExport(port, fakeT, fakeLocale), { wrapper });

    await waitFor(() => expect(result.current.loadError).not.toBeNull());
    expect(result.current.loadError).toContain("Could not load the export status");
    expect(result.current.loadError).toContain("disk error");
  });
});

describe("useStaticExport — clean flag", () => {
  it("defaults clean to false and setClean updates it", async () => {
    const port = createFakeStaticExportPort(IDLE_RUN);
    const { result } = renderHook(() => useStaticExport(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run).not.toBeUndefined());

    expect(result.current.clean).toBe(false);
    act(() => result.current.setClean(true));
    expect(result.current.clean).toBe(true);
  });
});

describe("useStaticExport — trigger", () => {
  it("starts a run, passes the current clean value, and sets run directly from the response — no second GET", async () => {
    const getSiteExportStatus = vi.fn().mockResolvedValue(IDLE_RUN);
    const runningRun: AdminExportRunSnapshot = { status: "running", startedAtIso: "t0", finishedAtIso: null, outputDir: "/infra/export" };
    const triggerSiteExport = vi.fn().mockResolvedValue(runningRun);
    const port = createFakeStaticExportPort(IDLE_RUN, { getSiteExportStatus, triggerSiteExport });

    const { result } = renderHook(() => useStaticExport(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run).not.toBeUndefined());

    act(() => result.current.setClean(true));
    await act(async () => {
      await result.current.trigger();
    });

    expect(triggerSiteExport).toHaveBeenCalledWith({ clean: true });
    expect(result.current.run).toEqual(runningRun);
    expect(result.current.triggerError).toBeNull();
    expect(result.current.triggering).toBe(false);
    // The initial load called it once; the trigger itself must not cause a redundant extra GET.
    expect(getSiteExportStatus).toHaveBeenCalledTimes(1);
  });

  it("sets triggering true while the POST is in flight, then false once it settles", async () => {
    let resolveTrigger!: (value: AdminExportRunSnapshot) => void;
    const port = createFakeStaticExportPort(IDLE_RUN, {
      triggerSiteExport: () => new Promise((resolve) => (resolveTrigger = resolve)),
    });
    const { result } = renderHook(() => useStaticExport(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run).not.toBeUndefined());

    let triggerPromise!: Promise<void>;
    act(() => {
      triggerPromise = result.current.trigger();
    });
    await waitFor(() => expect(result.current.triggering).toBe(true));

    await act(async () => {
      resolveTrigger({ status: "running", startedAtIso: "t0", finishedAtIso: null, outputDir: "/infra/export" });
      await triggerPromise;
    });
    expect(result.current.triggering).toBe(false);
  });

  it("surfaces a rejected trigger (e.g. 409 already running) as a translated trigger error, leaving run untouched", async () => {
    const port = createFakeStaticExportPort(IDLE_RUN, {
      triggerSiteExport: () => Promise.reject(new Error("an export is already running")),
    });
    const { result } = renderHook(() => useStaticExport(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run).not.toBeUndefined());

    await act(async () => {
      await result.current.trigger();
    });

    expect(result.current.triggerError).toContain("Could not start the export");
    expect(result.current.triggerError).toContain("an export is already running");
    expect(result.current.run).toEqual(IDLE_RUN);
    expect(result.current.triggering).toBe(false);
  });

  it("REGRESSION (C1): a delayed initial status GET must not overwrite a run started locally by trigger() and kill polling", async () => {
    // The bootstrap GET (`useFetchQuery`'s own read) is left pending — `resolveInitialStatus` is
    // captured only on its FIRST call so a later poll call (irrelevant here, since we never advance
    // timers) doesn't clobber it.
    let resolveInitialStatus!: (value: AdminExportRunSnapshot) => void;
    let initialCalls = 0;
    const getSiteExportStatus = vi.fn().mockImplementation(() => {
      initialCalls += 1;
      if (initialCalls === 1) return new Promise<AdminExportRunSnapshot>((resolve) => (resolveInitialStatus = resolve));
      return Promise.resolve(IDLE_RUN);
    });
    const runningRun: AdminExportRunSnapshot = { status: "running", startedAtIso: "t0", finishedAtIso: null, outputDir: "/infra/export" };
    const triggerSiteExport = vi.fn().mockResolvedValue(runningRun);
    const port = createFakeStaticExportPort(IDLE_RUN, { getSiteExportStatus, triggerSiteExport });

    const { result } = renderHook(() => useStaticExport(port, fakeT, fakeLocale), { wrapper });

    // The bootstrap read is still in flight — nothing has seeded `run` yet.
    expect(result.current.run).toBeUndefined();

    // The operator clicks Build before that slow initial read ever comes back.
    await act(async () => {
      await result.current.trigger();
    });
    expect(result.current.run).toEqual(runningRun);
    expect(result.current.isRunning).toBe(true);

    // NOW the delayed bootstrap GET finally resolves, reporting stale "idle" state from before the
    // click. Flush the macrotask `useFetchQuery`'s underlying TanStack notification uses (setTimeout(0)
    // — `await Promise.resolve()` would NOT flush this, see this repo's own fetch-query migration
    // notes) so the seed effect gets its chance to run (or, with the fix, correctly decline to).
    await act(async () => {
      resolveInitialStatus(IDLE_RUN);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // The freshly-triggered running run must survive untouched, and polling must still be considered
    // active — pre-fix, the delayed bootstrap read overwrites `run` back to IDLE_RUN here and
    // `isRunning` flips false, even though the server-side export is still actually running.
    expect(result.current.run).toEqual(runningRun);
    expect(result.current.isRunning).toBe(true);
  });
});

describe("useStaticExport — poll loop", () => {
  it("polls the status route while running and stops once the run settles", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const runningRun: AdminExportRunSnapshot = { status: "running", startedAtIso: "t0", finishedAtIso: null, outputDir: "/infra/export" };
    const completedRun: AdminExportRunSnapshot = {
      status: "completed",
      startedAtIso: "t0",
      finishedAtIso: "t1",
      outputDir: "/infra/export",
      ok: true,
      counts: { routesSucceeded: 1, routesFailed: 0, assetsSucceeded: 0, assetsFailed: 0 },
    };
    let pollCount = 0;
    const getSiteExportStatus = vi.fn().mockImplementation(() => {
      pollCount += 1;
      return Promise.resolve(pollCount < 2 ? runningRun : completedRun);
    });
    const port = createFakeStaticExportPort(runningRun, { getSiteExportStatus });

    const { result } = renderHook(() => useStaticExport(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.isRunning).toBe(true));
    expect(getSiteExportStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(getSiteExportStatus).toHaveBeenCalledTimes(2);
    expect(result.current.run?.status).toBe("completed");

    // Settled — no further polling even after another full interval passes.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(getSiteExportStatus).toHaveBeenCalledTimes(2);
  });

  it("a transient poll failure retries on the same schedule rather than stranding the UI on 'running'", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const runningRun: AdminExportRunSnapshot = { status: "running", startedAtIso: "t0", finishedAtIso: null, outputDir: "/infra/export" };
    let call = 0;
    const getSiteExportStatus = vi.fn().mockImplementation(() => {
      call += 1;
      if (call === 2) return Promise.reject(new Error("network blip"));
      return Promise.resolve(runningRun);
    });
    const port = createFakeStaticExportPort(runningRun, { getSiteExportStatus });

    const { result } = renderHook(() => useStaticExport(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.isRunning).toBe(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500); // poll #2 — rejects
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500); // poll #3 — retried on the same schedule
    });
    expect(getSiteExportStatus.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(result.current.isRunning).toBe(true);
  });

  it("REGRESSION (C2): permanent poll failures are bounded, surfaced, and re-enable the Build button — not retried forever behind a stuck spinner", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const runningRun: AdminExportRunSnapshot = { status: "running", startedAtIso: "t0", finishedAtIso: null, outputDir: "/infra/export" };
    // The bootstrap read succeeds once (seeding `isRunning: true`, e.g. a reload mid-export); every
    // poll after that fails permanently — the local-dev `tsx watch` restart scenario the audit
    // finding names, made permanent so the bound has to actually fire rather than recover.
    const getSiteExportStatus = vi.fn().mockResolvedValueOnce(runningRun).mockRejectedValue(new Error("ECONNREFUSED"));
    const port = createFakeStaticExportPort(runningRun, { getSiteExportStatus });

    const { result } = renderHook(() => useStaticExport(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.isRunning).toBe(true));

    // Three consecutive failed polls — the bound this fix introduces.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    // The bound must have fired: an actionable error, the button un-disabled, and — proving `run`
    // itself was never touched or faked to force this, only a separate gate — the run's own status
    // is still exactly what the last successful read reported.
    expect(result.current.pollError).toContain("Lost track of this export's status");
    expect(result.current.pollError).toContain("ECONNREFUSED");
    expect(result.current.isRunning).toBe(false);
    expect(result.current.run?.status).toBe("running");

    // And the loop must have actually STOPPED, not just be reporting an error while still polling —
    // advancing well past several more intervals must not produce any further calls.
    const callsAtBound = getSiteExportStatus.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(getSiteExportStatus.mock.calls.length).toBe(callsAtBound);
  });

  // Both tests below target the loop's `cancelled` guard specifically: a poll request already
  // in-flight when the effect's cleanup runs (unmount here) has nothing that can abort the pending
  // promise itself — `clearTimeout` only cancels the NEXT scheduled poll. Without this guard, a
  // response arriving after unmount would still call setRun/setPollError and reschedule, resuming an
  // "invisible" poll loop against an unmounted hook.
  it("a successful poll response arriving after unmount does not reschedule another poll", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const runningRun: AdminExportRunSnapshot = { status: "running", startedAtIso: "t0", finishedAtIso: null, outputDir: "/infra/export" };
    let resolvePoll: (value: AdminExportRunSnapshot) => void = () => {};
    let call = 0;
    // Call 1 is the bootstrap read (must resolve immediately, seeding isRunning: true); call 2 is
    // the poll under test, held pending until unmount has already run.
    const getSiteExportStatus = vi.fn().mockImplementation(() => {
      call += 1;
      if (call === 1) return Promise.resolve(runningRun);
      return new Promise<AdminExportRunSnapshot>((resolve) => { resolvePoll = resolve; });
    });
    const port = createFakeStaticExportPort(runningRun, { getSiteExportStatus });

    const { result, unmount } = renderHook(() => useStaticExport(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.isRunning).toBe(true));

    // Arm the second poll, then unmount WHILE its request is still pending.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(getSiteExportStatus).toHaveBeenCalledTimes(2);
    unmount();

    // The pending request now resolves as still-running, which would normally call scheduleNext().
    resolvePoll(runningRun);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(getSiteExportStatus).toHaveBeenCalledTimes(2);
  });

  it("a poll rejection arriving after unmount does not count toward the failure bound or reschedule", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const runningRun: AdminExportRunSnapshot = { status: "running", startedAtIso: "t0", finishedAtIso: null, outputDir: "/infra/export" };
    let rejectPoll: (err: Error) => void = () => {};
    let call = 0;
    const getSiteExportStatus = vi.fn().mockImplementation(() => {
      call += 1;
      if (call === 1) return Promise.resolve(runningRun);
      return new Promise<AdminExportRunSnapshot>((_resolve, reject) => { rejectPoll = reject; });
    });
    const port = createFakeStaticExportPort(runningRun, { getSiteExportStatus });

    const { result, unmount } = renderHook(() => useStaticExport(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.isRunning).toBe(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(getSiteExportStatus).toHaveBeenCalledTimes(2);
    unmount();

    rejectPoll(new Error("network blip"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(getSiteExportStatus).toHaveBeenCalledTimes(2);
  });
});

/**
 * `useStaticExport`'s own bespoke reload — see that hook's file header for why this is NOT the
 * usual `useInvalidate()` one-liner: `run` seeds once from `useFetchQuery` and is never re-derived
 * from it again (`seededRef` blocks that), so the subscription instead re-fetches the status
 * directly through the port and calls `setRun` with the response.
 */
describe("useStaticExport — content refresh bus", () => {
  afterEach(() => resetContentRefreshBus());

  it("re-reads the status when a content refresh fires, so a run started from ANOTHER tab appears without a reload", async () => {
    let current: AdminExportRunSnapshot = IDLE_RUN;
    const port = createFakeStaticExportPort(() => Promise.resolve(current));
    const { result } = renderHook(() => useStaticExport(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run).toEqual(IDLE_RUN));

    // A DIFFERENT tab/session called `deployment_trigger_export` — this hook's own `seededRef` means
    // its `useFetchQuery` bootstrap read would never notice on its own.
    current = { status: "running", startedAtIso: "t0", finishedAtIso: null, outputDir: "/infra/export" };
    expect(result.current.run).toEqual(IDLE_RUN);

    await act(async () => {
      publishContentRefresh();
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.run?.status).toBe("running"));
  });

  it("refreshes on a notification that names deployment-export, and ignores one that names only other resources", async () => {
    let current: AdminExportRunSnapshot = IDLE_RUN;
    const port = createFakeStaticExportPort(() => Promise.resolve(current));
    const { result } = renderHook(() => useStaticExport(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run).toEqual(IDLE_RUN));

    current = { status: "running", startedAtIso: "t0", finishedAtIso: null, outputDir: "/infra/export" };

    await act(async () => {
      publishContentRefresh(["taxonomy"]);
      await Promise.resolve();
    });
    expect(result.current.run?.status).toBe("idle");

    await act(async () => {
      publishContentRefresh([DEPLOYMENT_EXPORT_RESOURCE]);
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.run?.status).toBe("running"));
  });

  it("stops re-reading once unmounted", async () => {
    const port = createFakeStaticExportPort(IDLE_RUN);
    const statusSpy = vi.spyOn(port, "getSiteExportStatus");
    const { result, unmount } = renderHook(() => useStaticExport(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run).toEqual(IDLE_RUN));

    const callsWhileMounted = statusSpy.mock.calls.length;
    unmount();
    await act(async () => {
      publishContentRefresh();
      await Promise.resolve();
    });

    expect(statusSpy).toHaveBeenCalledTimes(callsWhileMounted);
  });
});
