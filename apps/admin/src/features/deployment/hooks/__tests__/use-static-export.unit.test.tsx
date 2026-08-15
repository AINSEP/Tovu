import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "../../../../lib/fetch-query";
import { useStaticExport } from "../use-static-export.hooks";
import { createFakeStaticExportPort } from "../static-export-dependencies.hooks";
import type { AdminExportRunSnapshot } from "../../../../lib/api";

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
});
