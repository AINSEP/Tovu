import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "../../../../lib/fetch-query";
import { useStaticPublish } from "../use-static-publish.hooks";
import { createFakeStaticPublishPort } from "../static-publish-dependencies.hooks";
import type { AdminPublishRunSnapshot, AdminStaticPublishConfig, AdminStaticPublishPreview } from "../../../../lib/api";

/**
 * @file `useStaticPublish` — the Static Site tab's provider form, preview, and publish
 * trigger+poll. Same injected-port shape as `use-static-export.unit.test.tsx`; the field-state and
 * `buildConfig` behavior (which fields matter per target, blank optionals omitted) is this file's
 * own load-bearing coverage — `StaticSiteTab.unit.test.tsx` only proves the markup wiring, not that
 * the request shape sent to the server is correct.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

const fakeT = (key: string): string => key;
const fakeLocale = "en";
const IDLE_RUN: AdminPublishRunSnapshot = { status: "idle", startedAtIso: null, finishedAtIso: null, target: null };

afterEach(() => {
  vi.useRealTimers();
});

describe("useStaticPublish — field state", () => {
  it("defaults to github-pages with every field blank", async () => {
    const port = createFakeStaticPublishPort();
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run).not.toBeUndefined());

    expect(result.current.target).toBe("github-pages");
    expect(result.current.owner).toBe("");
    expect(result.current.repo).toBe("");
    expect(result.current.branch).toBe("");
    expect(result.current.teamId).toBe("");
    expect(result.current.projectName).toBe("");
  });

  it("setters update their own field independently", async () => {
    const port = createFakeStaticPublishPort();
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run).not.toBeUndefined());

    act(() => result.current.setOwner("octo"));
    act(() => result.current.setRepo("demo-repo"));
    act(() => result.current.setProjectName("demo"));
    expect(result.current.owner).toBe("octo");
    expect(result.current.repo).toBe("demo-repo");
    expect(result.current.projectName).toBe("demo");
  });

  it("switching target does not clear the other target's already-typed fields", async () => {
    const port = createFakeStaticPublishPort();
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run).not.toBeUndefined());

    act(() => result.current.setOwner("octo"));
    act(() => result.current.setTarget("vercel"));
    act(() => result.current.setTeamId("team_123"));
    act(() => result.current.setTarget("github-pages"));

    expect(result.current.owner).toBe("octo");
    expect(result.current.teamId).toBe("team_123");
  });
});

describe("useStaticPublish — preview", () => {
  it("checkPreview sends the current field values and stores the result", async () => {
    let sentConfig: AdminStaticPublishConfig | undefined;
    const previewResult: AdminStaticPublishPreview = {
      target: "github-pages",
      valid: true,
      validationError: null,
      basePath: "/demo-repo",
      credentialsConfigured: true,
      credentialGuidance: null,
      willInjectNojekyll: true,
    };
    const port = createFakeStaticPublishPort({
      getPublishPreview: (config) => {
        sentConfig = config;
        return Promise.resolve(previewResult);
      },
    });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run).not.toBeUndefined());

    act(() => result.current.setOwner("octo"));
    act(() => result.current.setRepo("demo-repo"));
    await act(async () => {
      await result.current.checkPreview();
    });

    expect(sentConfig).toEqual({ target: "github-pages", owner: "octo", repo: "demo-repo" });
    expect(result.current.preview).toEqual(previewResult);
    expect(result.current.previewLoading).toBe(false);
  });

  it("omits a blank branch/teamId entirely rather than sending an empty string", async () => {
    let sentConfig: AdminStaticPublishConfig | undefined;
    const port = createFakeStaticPublishPort({
      getPublishPreview: (config) => {
        sentConfig = config;
        return Promise.resolve({
          target: config.target,
          valid: true,
          validationError: null,
          basePath: null,
          credentialsConfigured: false,
          credentialGuidance: null,
          willInjectNojekyll: false,
        });
      },
    });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run).not.toBeUndefined());

    act(() => result.current.setOwner("octo"));
    act(() => result.current.setRepo("demo-repo"));
    act(() => result.current.setBranch("  "));
    await act(async () => {
      await result.current.checkPreview();
    });

    expect(sentConfig).toEqual({ target: "github-pages", owner: "octo", repo: "demo-repo" });
    expect(sentConfig).not.toHaveProperty("branch");
  });

  it("netlify and cloudflare-pages preview with a bare {target} config — no owner/repo/teamId carried over from a prior target", async () => {
    let sentConfig: AdminStaticPublishConfig | undefined;
    const port = createFakeStaticPublishPort({
      getPublishPreview: (config) => {
        sentConfig = config;
        return Promise.resolve({
          target: config.target,
          valid: true,
          validationError: null,
          basePath: null,
          credentialsConfigured: false,
          credentialGuidance: null,
          willInjectNojekyll: false,
        });
      },
    });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run).not.toBeUndefined());

    act(() => result.current.setOwner("octo")); // typed while on github-pages, then switched away
    act(() => result.current.setTarget("netlify"));
    await act(async () => {
      await result.current.checkPreview();
    });
    expect(sentConfig).toEqual({ target: "netlify" });

    act(() => result.current.setTarget("cloudflare-pages"));
    await act(async () => {
      await result.current.checkPreview();
    });
    expect(sentConfig).toEqual({ target: "cloudflare-pages" });
  });

  it("REGRESSION (C3): a stale preview response after a field edit must not repopulate the old target's value", async () => {
    let resolvePreview!: (value: AdminStaticPublishPreview) => void;
    const oldPreview: AdminStaticPublishPreview = {
      target: "github-pages",
      valid: true,
      validationError: null,
      basePath: "/old",
      credentialsConfigured: true,
      credentialGuidance: null,
      willInjectNojekyll: true,
    };
    const port = createFakeStaticPublishPort({
      getPublishPreview: () => new Promise((resolve) => (resolvePreview = resolve)),
    });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run).not.toBeUndefined());

    act(() => result.current.setOwner("acme"));
    act(() => result.current.setRepo("old"));

    let previewPromise!: Promise<void>;
    act(() => {
      previewPromise = result.current.checkPreview();
    });
    await waitFor(() => expect(result.current.previewLoading).toBe(true));

    // The operator edits the target BEFORE the slow preview request resolves.
    act(() => result.current.setRepo("new"));
    expect(result.current.preview).toBeUndefined();

    // The stale request now resolves, reporting the OLD repo's preview.
    await act(async () => {
      resolvePreview(oldPreview);
      await previewPromise;
    });

    // Pre-fix, `setPreview(oldPreview)` runs unconditionally here and repopulates `/old` even though
    // the operator is now looking at (and would publish to) `acme/new` — the exact "shown /old,
    // published /new" mismatch the audit finding describes for an irreversible, live action.
    expect(result.current.preview).toBeUndefined();
    expect(result.current.repo).toBe("new");
    // The spinner must still have stopped even though the response itself was discarded — a stale
    // request being ignored must not be confused with a request that never returned.
    expect(result.current.previewLoading).toBe(false);
  });

  it("editing any field after a preview clears the now-stale preview", async () => {
    const port = createFakeStaticPublishPort({
      getPublishPreview: () =>
        Promise.resolve({
          target: "github-pages",
          valid: true,
          validationError: null,
          basePath: "/demo-repo",
          credentialsConfigured: true,
          credentialGuidance: null,
          willInjectNojekyll: true,
        }),
    });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run).not.toBeUndefined());

    act(() => result.current.setOwner("octo"));
    act(() => result.current.setRepo("demo-repo"));
    await act(async () => {
      await result.current.checkPreview();
    });
    expect(result.current.preview).not.toBeUndefined();

    act(() => result.current.setRepo("renamed-repo"));
    expect(result.current.preview).toBeUndefined();
  });

  it("surfaces a rejected preview as a translated preview error", async () => {
    const port = createFakeStaticPublishPort({ getPublishPreview: () => Promise.reject(new Error("boom")) });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run).not.toBeUndefined());

    await act(async () => {
      await result.current.checkPreview();
    });
    expect(result.current.previewError).toContain("Could not check this target");
    expect(result.current.previewError).toContain("boom");
  });
});

describe("useStaticPublish — publish trigger and poll", () => {
  it("publish() sends the built config plus projectName and sets run from the response", async () => {
    let sentInput: { config: AdminStaticPublishConfig; projectName: string } | undefined;
    const runningRun: AdminPublishRunSnapshot = { status: "running", startedAtIso: "t0", finishedAtIso: null, target: "vercel" };
    const port = createFakeStaticPublishPort({
      triggerPublish: (input) => {
        sentInput = input;
        return Promise.resolve(runningRun);
      },
    });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run).not.toBeUndefined());

    act(() => result.current.setTarget("vercel"));
    act(() => result.current.setProjectName("demo"));
    await act(async () => {
      await result.current.publish();
    });

    expect(sentInput).toEqual({ config: { target: "vercel" }, projectName: "demo" });
    expect(result.current.run).toEqual(runningRun);
    expect(result.current.isPublishing).toBe(true);
  });

  it("REGRESSION: netlify and cloudflare-pages each build their OWN config shape, never silently falling into vercel's — the pre-fix buildConfig sent {target:'vercel'} for any non-github-pages target", async () => {
    let sentInput: { config: AdminStaticPublishConfig; projectName: string } | undefined;
    const port = createFakeStaticPublishPort({
      triggerPublish: (input) => {
        sentInput = input;
        return Promise.resolve({ status: "running", startedAtIso: "t0", finishedAtIso: null, target: input.config.target });
      },
    });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run).not.toBeUndefined());

    act(() => result.current.setTarget("netlify"));
    act(() => result.current.setProjectName("my-site"));
    await act(async () => {
      await result.current.publish();
    });
    expect(sentInput).toEqual({ config: { target: "netlify" }, projectName: "my-site" });

    act(() => result.current.setTarget("cloudflare-pages"));
    act(() => result.current.setProjectName("my-project"));
    await act(async () => {
      await result.current.publish();
    });
    expect(sentInput).toEqual({ config: { target: "cloudflare-pages" }, projectName: "my-project" });
  });

  it("REGRESSION (C1): a delayed initial status GET must not overwrite a run started locally by publish() and kill polling", async () => {
    let resolveInitialStatus!: (value: AdminPublishRunSnapshot) => void;
    let initialCalls = 0;
    const getPublishStatus = vi.fn().mockImplementation(() => {
      initialCalls += 1;
      if (initialCalls === 1) return new Promise<AdminPublishRunSnapshot>((resolve) => (resolveInitialStatus = resolve));
      return Promise.resolve(IDLE_RUN);
    });
    const runningRun: AdminPublishRunSnapshot = { status: "running", startedAtIso: "t0", finishedAtIso: null, target: "vercel" };
    const triggerPublish = vi.fn().mockResolvedValue(runningRun);
    const port = createFakeStaticPublishPort({ getPublishStatus, triggerPublish });

    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });

    // The bootstrap read is still in flight — nothing has seeded `run` yet.
    expect(result.current.run).toBeUndefined();

    // The operator clicks Publish before that slow initial read ever comes back.
    act(() => result.current.setTarget("vercel"));
    act(() => result.current.setProjectName("demo"));
    await act(async () => {
      await result.current.publish();
    });
    expect(result.current.run).toEqual(runningRun);
    expect(result.current.isPublishing).toBe(true);

    // NOW the delayed bootstrap GET finally resolves, reporting stale "idle" state from before the
    // click. Flush the setTimeout(0) macrotask `useFetchQuery`'s TanStack notification uses — plain
    // `await Promise.resolve()` would NOT flush this (this repo's own fetch-query migration notes).
    await act(async () => {
      resolveInitialStatus(IDLE_RUN);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // The freshly-triggered running run must survive untouched, and polling must still be
    // considered active — pre-fix, the delayed bootstrap read overwrites `run` back to IDLE_RUN
    // here and `isPublishing` flips false, even though the server-side publish is still running.
    expect(result.current.run).toEqual(runningRun);
    expect(result.current.isPublishing).toBe(true);
  });

  it("surfaces a rejected publish (e.g. 409 already running) as a translated publish error", async () => {
    const port = createFakeStaticPublishPort({ triggerPublish: () => Promise.reject(new Error("a publish is already running")) });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run).not.toBeUndefined());

    act(() => result.current.setProjectName("demo"));
    await act(async () => {
      await result.current.publish();
    });

    expect(result.current.publishError).toContain("Could not start the publish");
    expect(result.current.publishError).toContain("a publish is already running");
  });

  it("polls the publish status route while running and stops once the run settles", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const runningRun: AdminPublishRunSnapshot = { status: "running", startedAtIso: "t0", finishedAtIso: null, target: "vercel" };
    const completedRun: AdminPublishRunSnapshot = {
      status: "completed",
      startedAtIso: "t0",
      finishedAtIso: "t1",
      target: "vercel",
      result: { ok: true, targetId: "vercel", url: "https://demo.vercel.app", status: "READY" },
    };
    let pollCount = 0;
    const getPublishStatus = vi.fn().mockImplementation(() => {
      pollCount += 1;
      return Promise.resolve(pollCount < 2 ? runningRun : completedRun);
    });
    const port = createFakeStaticPublishPort({ getPublishStatus });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run).not.toBeUndefined());

    act(() => result.current.setProjectName("demo"));
    await act(async () => {
      await result.current.publish();
    });
    expect(result.current.isPublishing).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(result.current.run?.status).toBe("completed");
    expect(result.current.isPublishing).toBe(false);
  });

  it("REGRESSION (C2): permanent poll failures are bounded, surfaced, and re-enable the Publish button — not retried forever behind a stuck spinner", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const runningRun: AdminPublishRunSnapshot = { status: "running", startedAtIso: "t0", finishedAtIso: null, target: "vercel" };
    // The bootstrap read succeeds once (seeding `isPublishing: true`, e.g. a reload mid-publish);
    // every poll after that fails permanently.
    const getPublishStatus = vi.fn().mockResolvedValueOnce(runningRun).mockRejectedValue(new Error("ECONNREFUSED"));
    const port = createFakeStaticPublishPort({ getPublishStatus });

    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.isPublishing).toBe(true));

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
    expect(result.current.pollError).toContain("Lost track of this publish's status");
    expect(result.current.pollError).toContain("ECONNREFUSED");
    expect(result.current.isPublishing).toBe(false);
    expect(result.current.run?.status).toBe("running");

    // And the loop must have actually STOPPED — advancing well past several more intervals must not
    // produce any further calls.
    const callsAtBound = getPublishStatus.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(getPublishStatus.mock.calls.length).toBe(callsAtBound);
  });

  it("REGRESSION (C4): a second publish() call while the first is still in flight must not send a second POST or leave a false failure message", async () => {
    const runningRun: AdminPublishRunSnapshot = { status: "running", startedAtIso: "t0", finishedAtIso: null, target: "github-pages" };
    const triggerPublish = vi.fn().mockResolvedValue(runningRun);
    const port = createFakeStaticPublishPort({ triggerPublish });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run).not.toBeUndefined());

    act(() => result.current.setOwner("acme"));
    act(() => result.current.setRepo("site"));
    act(() => result.current.setProjectName("demo"));

    // Simulate a double-click: two publish() calls fired synchronously, before the first has any
    // chance to resolve (or even for React to re-render with the button disabled).
    let firstCall!: Promise<void>;
    let secondCall!: Promise<void>;
    act(() => {
      firstCall = result.current.publish();
      secondCall = result.current.publish();
    });

    await act(async () => {
      await firstCall;
      await secondCall;
    });

    // Pre-fix, `publish()` had no in-flight guard at all: both calls run to completion, sending two
    // POSTs — the second one would ordinarily hit the server's own 409, and (per the audit finding)
    // that rejection's error message stays on screen even though the first publish is running fine.
    expect(triggerPublish).toHaveBeenCalledTimes(1);
    expect(result.current.run).toEqual(runningRun);
    expect(result.current.publishError).toBeNull();
    expect(result.current.publishing).toBe(false);
  });
});

describe("useStaticPublish — initial load", () => {
  it("seeds run from the fake port's initial status read", async () => {
    const port = createFakeStaticPublishPort({ getPublishStatus: () => Promise.resolve(IDLE_RUN) });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run).not.toBeUndefined());
    expect(result.current.run).toEqual(IDLE_RUN);
    expect(result.current.loadError).toBeNull();
  });

  it("surfaces a rejected initial read as a translated load error", async () => {
    const port = createFakeStaticPublishPort({ getPublishStatus: () => Promise.reject(new Error("disk error")) });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.loadError).not.toBeNull());
    expect(result.current.loadError).toContain("Could not load the publish status");
    expect(result.current.loadError).toContain("disk error");
  });
});
