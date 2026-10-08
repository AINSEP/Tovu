import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@jini-ai/ui/fetch-query";
import { useStaticPublish } from "../use-static-publish.hooks";
import { createFakeStaticPublishPort } from "../static-publish-dependencies.hooks";
import { PLAIN_TARGET, PUBLISH_TARGETS } from "../../__tests__/publish-targets.fixture";
import type { AdminPublishRunSnapshot, AdminStaticPublishConfig, AdminStaticPublishPreview } from "@/lib/api";

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
/** The fake port, listing the fixture's targets unless a test overrides that too. */
function portWith(overrides: Parameters<typeof createFakeStaticPublishPort>[0] = {}) {
  return createFakeStaticPublishPort({ listPublishTargets: () => Promise.resolve([...PUBLISH_TARGETS]), ...overrides });
}

const IDLE_RUN: AdminPublishRunSnapshot = { status: "idle", startedAtIso: null, finishedAtIso: null, target: null };

afterEach(() => {
  vi.useRealTimers();
});

describe("useStaticPublish — field state", () => {
  it("defaults to the first target the registry lists, with every field blank", async () => {
    const port = portWith();
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run !== undefined && result.current.targets !== undefined).toBe(true));

    expect(result.current.target).toBe("github-pages");
    expect((result.current.configValues.owner ?? "")).toBe("");
    expect((result.current.configValues.repo ?? "")).toBe("");
    expect((result.current.configValues.branch ?? "")).toBe("");
    expect((result.current.configValues.teamId ?? "")).toBe("");
    expect(result.current.projectName).toBe("");
  });

  it("setters update their own field independently", async () => {
    const port = portWith();
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run !== undefined && result.current.targets !== undefined).toBe(true));

    act(() => result.current.setConfigField("owner", "octo"));
    act(() => result.current.setConfigField("repo", "demo-repo"));
    act(() => result.current.setProjectName("demo"));
    expect((result.current.configValues.owner ?? "")).toBe("octo");
    expect((result.current.configValues.repo ?? "")).toBe("demo-repo");
    expect(result.current.projectName).toBe("demo");
  });

  it("switching target does not clear the other target's already-typed fields", async () => {
    const port = portWith();
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run !== undefined && result.current.targets !== undefined).toBe(true));

    act(() => result.current.setConfigField("owner", "octo"));
    act(() => result.current.setTarget("vercel"));
    act(() => result.current.setConfigField("teamId", "team_123"));
    expect(result.current.configValues).toEqual({ teamId: "team_123" });
    act(() => result.current.setTarget("github-pages"));

    expect(result.current.configValues).toEqual({ owner: "octo" });
  });

  it("exposes the registry's targets and the selected one's descriptor, and ignores an unlisted id", async () => {
    const port = portWith();
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.targets).not.toBeUndefined());

    expect(result.current.targets?.map((target) => target.id)).toEqual(["github-pages", "vercel", "netlify", "cloudflare-pages"]);
    expect(result.current.selectedTarget?.label).toBe("GitHub Pages");
    act(() => result.current.setTarget("not-listed"));
    expect(result.current.target).toBe("github-pages");
  });

  it("reports '' and nothing selected while the list loads, and a translated error when it fails", async () => {
    const port = portWith({ listPublishTargets: () => Promise.reject(new Error("boom")) });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    expect(result.current.target).toBe("");
    expect(result.current.selectedTarget).toBeUndefined();
    await waitFor(() => expect(result.current.targetsError).toContain("boom"));
    expect(result.current.canPreview).toBe(false);
  });

  it("derives canPreview/canPublish and the project-name copy from the selected host's descriptor", async () => {
    const port = portWith();
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.targets).not.toBeUndefined());

    expect(result.current.canPreview).toBe(false); // owner + repo required
    expect(result.current.projectNameCopy?.labelKey).toBe("Commit message");
    act(() => result.current.setConfigField("owner", "octo"));
    act(() => result.current.setConfigField("repo", "demo"));
    expect(result.current.canPreview).toBe(true);
    expect(result.current.canPublish).toBe(false);
    act(() => result.current.setProjectName("demo"));
    expect(result.current.canPublish).toBe(true);

    act(() => result.current.setTarget("netlify"));
    expect(result.current.canPreview).toBe(true); // no config fields at all
    expect(result.current.projectNameCopy?.labelKey).toBe("Site name");
  });
});

/** A representative valid preview result — shared by tests that only care that SOME result came
 *  back correctly, not its exact fields (the C5 duplicate-call test below, and the first test in
 *  this describe block which built the same shape inline before this helper existed). */
function previewResultFixture(): AdminStaticPublishPreview {
  return {
    target: "github-pages",
    valid: true,
    validationError: null,
    basePath: "/demo-repo",
    credentialsConfigured: true,
    credentialGuidance: null,
    willInjectNojekyll: true,
  };
}

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
    const port = portWith({
      getPublishPreview: (config) => {
        sentConfig = config;
        return Promise.resolve(previewResult);
      },
    });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run !== undefined && result.current.targets !== undefined).toBe(true));

    act(() => result.current.setConfigField("owner", "octo"));
    act(() => result.current.setConfigField("repo", "demo-repo"));
    await act(async () => {
      await result.current.checkPreview();
    });

    expect(sentConfig).toEqual({ target: "github-pages", fields: { owner: "octo", repo: "demo-repo" } });
    expect(result.current.preview).toEqual(previewResult);
    expect(result.current.previewLoading).toBe(false);
  });

  it("omits a blank branch/teamId entirely rather than sending an empty string", async () => {
    let sentConfig: AdminStaticPublishConfig | undefined;
    const port = portWith({
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
    await waitFor(() => expect(result.current.run !== undefined && result.current.targets !== undefined).toBe(true));

    act(() => result.current.setConfigField("owner", "octo"));
    act(() => result.current.setConfigField("repo", "demo-repo"));
    act(() => result.current.setConfigField("branch", "  "));
    await act(async () => {
      await result.current.checkPreview();
    });

    expect(sentConfig).toEqual({ target: "github-pages", fields: { owner: "octo", repo: "demo-repo" } });
    expect(sentConfig).not.toHaveProperty("branch");
  });

  it("includes a non-blank branch for github-pages, trimmed", async () => {
    let sentConfig: AdminStaticPublishConfig | undefined;
    const port = portWith({
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
    await waitFor(() => expect(result.current.run !== undefined && result.current.targets !== undefined).toBe(true));

    act(() => result.current.setConfigField("owner", "octo"));
    act(() => result.current.setConfigField("repo", "demo-repo"));
    act(() => result.current.setConfigField("branch", "  main  "));
    await act(async () => {
      await result.current.checkPreview();
    });

    expect(sentConfig).toEqual({ target: "github-pages", fields: { owner: "octo", repo: "demo-repo", branch: "main" } });
  });

  it("includes a non-blank teamId for vercel, trimmed", async () => {
    let sentConfig: AdminStaticPublishConfig | undefined;
    const port = portWith({
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
    await waitFor(() => expect(result.current.run !== undefined && result.current.targets !== undefined).toBe(true));

    act(() => result.current.setTarget("vercel"));
    act(() => result.current.setConfigField("teamId", "  team_123  "));
    await act(async () => {
      await result.current.checkPreview();
    });

    expect(sentConfig).toEqual({ target: "vercel", fields: { teamId: "team_123" } });
  });

  it("netlify and cloudflare-pages preview with a bare {target} config — no owner/repo/teamId carried over from a prior target", async () => {
    let sentConfig: AdminStaticPublishConfig | undefined;
    const port = portWith({
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
    await waitFor(() => expect(result.current.run !== undefined && result.current.targets !== undefined).toBe(true));

    act(() => result.current.setConfigField("owner", "octo")); // typed while on github-pages, then switched away
    act(() => result.current.setTarget("netlify"));
    await act(async () => {
      await result.current.checkPreview();
    });
    expect(sentConfig).toEqual({ target: "netlify", fields: {} });

    act(() => result.current.setTarget("cloudflare-pages"));
    await act(async () => {
      await result.current.checkPreview();
    });
    expect(sentConfig).toEqual({ target: "cloudflare-pages", fields: {} });
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
    const port = portWith({
      getPublishPreview: () => new Promise((resolve) => (resolvePreview = resolve)),
    });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run !== undefined && result.current.targets !== undefined).toBe(true));

    act(() => result.current.setConfigField("owner", "acme"));
    act(() => result.current.setConfigField("repo", "old"));

    let previewPromise!: Promise<void>;
    act(() => {
      previewPromise = result.current.checkPreview();
    });
    await waitFor(() => expect(result.current.previewLoading).toBe(true));

    // The operator edits the target BEFORE the slow preview request resolves.
    act(() => result.current.setConfigField("repo", "new"));
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
    expect((result.current.configValues.repo ?? "")).toBe("new");
    // The spinner must still have stopped even though the response itself was discarded — a stale
    // request being ignored must not be confused with a request that never returned.
    expect(result.current.previewLoading).toBe(false);
  });

  it("REGRESSION (C3), error path: a stale preview REJECTION after a field edit must not surface an error for fields the operator has since changed", async () => {
    let rejectPreview!: (err: Error) => void;
    const port = portWith({
      getPublishPreview: () => new Promise((_resolve, reject) => (rejectPreview = reject)),
    });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run !== undefined && result.current.targets !== undefined).toBe(true));

    act(() => result.current.setConfigField("owner", "acme"));
    act(() => result.current.setConfigField("repo", "old"));

    let previewPromise!: Promise<void>;
    act(() => {
      previewPromise = result.current.checkPreview();
    });
    await waitFor(() => expect(result.current.previewLoading).toBe(true));

    // The operator edits the target BEFORE the slow preview request rejects.
    act(() => result.current.setConfigField("repo", "new"));

    await act(async () => {
      rejectPreview(new Error("boom"));
      await previewPromise;
    });

    // The stale rejection must not overwrite previewError for a request the operator has already
    // moved on from — `invalidatePreview()`'s own reset (previewError: null) is what should stand.
    expect(result.current.previewError).toBeNull();
    expect((result.current.configValues.repo ?? "")).toBe("new");
    expect(result.current.previewLoading).toBe(false);
  });

  it("editing any field after a preview clears the now-stale preview", async () => {
    const port = portWith({
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
    await waitFor(() => expect(result.current.run !== undefined && result.current.targets !== undefined).toBe(true));

    act(() => result.current.setConfigField("owner", "octo"));
    act(() => result.current.setConfigField("repo", "demo-repo"));
    await act(async () => {
      await result.current.checkPreview();
    });
    expect(result.current.preview).not.toBeUndefined();

    act(() => result.current.setConfigField("repo", "renamed-repo"));
    expect(result.current.preview).toBeUndefined();
  });

  it("switching hosts clears a completed preview", async () => {
    const oldPreview = previewResultFixture();
    const port = portWith({ getPublishPreview: () => Promise.resolve(oldPreview) });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.targets).not.toBeUndefined());
    act(() => result.current.setConfigField("owner", "octo"));
    act(() => result.current.setConfigField("repo", "demo-repo"));
    await act(async () => { await result.current.checkPreview(); });
    expect(result.current.preview).toEqual(oldPreview);

    act(() => result.current.setTarget("vercel"));
    expect(result.current.target).toBe("vercel");
    expect(result.current.preview).toBeUndefined();
  });

  it("switching hosts discards a pending preview's late response", async () => {
    let resolvePreview!: (value: AdminStaticPublishPreview) => void;
    const port = portWith({ getPublishPreview: () => new Promise((resolve) => { resolvePreview = resolve; }) });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.targets).not.toBeUndefined());
    act(() => result.current.setConfigField("owner", "octo"));
    act(() => result.current.setConfigField("repo", "demo-repo"));
    let previewPromise!: Promise<void>;
    act(() => { previewPromise = result.current.checkPreview(); });
    expect(result.current.previewLoading).toBe(true);

    act(() => result.current.setTarget("vercel"));
    expect(result.current.preview).toBeUndefined();
    await act(async () => {
      resolvePreview(previewResultFixture());
      await previewPromise;
    });
    expect(result.current.target).toBe("vercel");
    expect(result.current.preview).toBeUndefined();
    expect(result.current.previewLoading).toBe(false);
  });

  it("REGRESSION (C5): a duplicate checkPreview() call while one is in flight must be ignored outright, not sent as a second request", async () => {
    let calls = 0;
    const port = portWith({
      getPublishPreview: () => {
        calls += 1;
        return new Promise((resolve) => setTimeout(() => resolve(previewResultFixture()), 5));
      },
    });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run !== undefined && result.current.targets !== undefined).toBe(true));

    act(() => result.current.setConfigField("owner", "octo"));
    act(() => result.current.setConfigField("repo", "demo-repo"));

    // Simulate a double-click: two checkPreview() calls fired synchronously, before either has any
    // chance to resolve (or even for React to re-render with the Preview button disabled) — same
    // shape the C4 `publish()` regression test above uses for its own duplicate-submit guard.
    let firstCall!: Promise<void>;
    let secondCall!: Promise<void>;
    act(() => {
      firstCall = result.current.checkPreview();
      secondCall = result.current.checkPreview();
    });
    await waitFor(() => expect(result.current.previewLoading).toBe(true));

    await act(async () => {
      await firstCall;
      await secondCall;
    });

    // Pre-fix, `checkPreview()` had no in-flight guard at all: both calls ran to completion, sending
    // two requests, and whichever one's own `finally` fired FIRST cleared `previewLoading` while the
    // other was still genuinely in flight.
    expect(calls).toBe(1);
    expect(result.current.preview).toEqual(previewResultFixture());
    expect(result.current.previewLoading).toBe(false);
  });

  it("surfaces a rejected preview as a translated preview error", async () => {
    const port = portWith({ getPublishPreview: () => Promise.reject(new Error("boom")) });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run !== undefined && result.current.targets !== undefined).toBe(true));

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
    const port = portWith({
      triggerPublish: (input) => {
        sentInput = input;
        return Promise.resolve(runningRun);
      },
    });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run !== undefined && result.current.targets !== undefined).toBe(true));

    act(() => result.current.setTarget("vercel"));
    act(() => result.current.setProjectName("demo"));
    await act(async () => {
      await result.current.publish();
    });

    expect(sentInput).toEqual({ config: { target: "vercel", fields: {} }, projectName: "demo" });
    expect(result.current.run).toEqual(runningRun);
    expect(result.current.isPublishing).toBe(true);
  });

  it("REGRESSION: netlify and cloudflare-pages each build their OWN config shape, never silently falling into vercel's — the pre-fix buildConfig sent {target:'vercel'} for any non-github-pages target", async () => {
    let sentInput: { config: AdminStaticPublishConfig; projectName: string } | undefined;
    const port = portWith({
      triggerPublish: (input) => {
        sentInput = input;
        return Promise.resolve({ status: "running", startedAtIso: "t0", finishedAtIso: null, target: input.config.target });
      },
    });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run !== undefined && result.current.targets !== undefined).toBe(true));

    act(() => result.current.setTarget("netlify"));
    act(() => result.current.setProjectName("my-site"));
    await act(async () => {
      await result.current.publish();
    });
    expect(sentInput).toEqual({ config: { target: "netlify", fields: {} }, projectName: "my-site" });

    act(() => result.current.setTarget("cloudflare-pages"));
    act(() => result.current.setProjectName("my-project"));
    await act(async () => {
      await result.current.publish();
    });
    expect(sentInput).toEqual({ config: { target: "cloudflare-pages", fields: {} }, projectName: "my-project" });
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
    const port = portWith({ getPublishStatus, triggerPublish });

    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });

    // The host list is its own query (publish() needs a registry target selected), so let it land;
    // the bootstrap status read is still in flight — nothing has seeded `run` yet.
    await waitFor(() => expect(result.current.targets).toBeDefined());
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
    // click. Yield through the pending read and React update so the seed effect gets its chance
    // to run; a single resolved promise does not prove that the whole chain has settled.
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
    const port = portWith({ triggerPublish: () => Promise.reject(new Error("a publish is already running")) });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run !== undefined && result.current.targets !== undefined).toBe(true));

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
    const port = portWith({ getPublishStatus });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run !== undefined && result.current.targets !== undefined).toBe(true));

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

  it("a poll that is STILL running reschedules another poll, rather than stopping after one read", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const runningRun: AdminPublishRunSnapshot = { status: "running", startedAtIso: "t0", finishedAtIso: null, target: "vercel" };
    const completedRun: AdminPublishRunSnapshot = { status: "completed", startedAtIso: "t0", finishedAtIso: "t1", target: "vercel" };
    let call = 0;
    // Call 1 is the bootstrap read (idle — publish() below is what starts the run, distinctly from
    // the bootstrap); calls 2 and 3 are the poll loop's own reads: still-running, then completed.
    const getPublishStatus = vi.fn().mockImplementation(() => {
      call += 1;
      if (call === 1) return Promise.resolve(IDLE_RUN);
      if (call === 2) return Promise.resolve(runningRun);
      return Promise.resolve(completedRun);
    });
    const port = portWith({ getPublishStatus });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run).toEqual(IDLE_RUN));

    act(() => result.current.setProjectName("demo"));
    await act(async () => {
      await result.current.publish();
    });
    expect(result.current.isPublishing).toBe(true);

    // Poll #1 (call 2): still running — must reschedule rather than stop.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(getPublishStatus).toHaveBeenCalledTimes(2);
    expect(result.current.isPublishing).toBe(true);

    // Poll #2 (call 3): completed — the loop stops here.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(getPublishStatus).toHaveBeenCalledTimes(3);
    expect(result.current.run?.status).toBe("completed");
    expect(result.current.isPublishing).toBe(false);
  });

  it("successful polls reset the consecutive-failure bound between scattered blips", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const runningRun: AdminPublishRunSnapshot = { status: "running", startedAtIso: "t0", finishedAtIso: null, target: "vercel" };
    const completedRun: AdminPublishRunSnapshot = { ...runningRun, status: "completed", finishedAtIso: "t1" };
    const getPublishStatus = vi.fn()
      .mockResolvedValueOnce(runningRun) // bootstrap
      .mockRejectedValueOnce(new Error("blip 1"))
      .mockResolvedValueOnce(runningRun)
      .mockRejectedValueOnce(new Error("blip 2"))
      .mockResolvedValueOnce(runningRun)
      .mockRejectedValueOnce(new Error("blip 3"))
      .mockResolvedValue(completedRun);
    const port = portWith({ getPublishStatus });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.isPublishing).toBe(true));

    for (let poll = 1; poll <= 5; poll += 1) {
      await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
      expect(getPublishStatus).toHaveBeenCalledTimes(poll + 1);
      expect(result.current.pollError).toBeNull();
      expect(result.current.isPublishing).toBe(true);
    }
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(getPublishStatus).toHaveBeenCalledTimes(7);
    expect(result.current.run?.status).toBe("completed");
    expect(result.current.pollError).toBeNull();
    expect(result.current.isPublishing).toBe(false);
  });

  it("REGRESSION (C2): permanent poll failures are bounded, surfaced, and re-enable the Publish button — not retried forever behind a stuck spinner", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const runningRun: AdminPublishRunSnapshot = { status: "running", startedAtIso: "t0", finishedAtIso: null, target: "vercel" };
    // The bootstrap read succeeds once (seeding `isPublishing: true`, e.g. a reload mid-publish);
    // every poll after that fails permanently.
    const getPublishStatus = vi.fn().mockResolvedValueOnce(runningRun).mockRejectedValue(new Error("ECONNREFUSED"));
    const port = portWith({ getPublishStatus });

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

    // A new Publish clears the stale error and starts a fresh consecutive-failure budget.
    getPublishStatus.mockResolvedValue(runningRun).mockRejectedValueOnce(new Error("retry blip"));
    act(() => result.current.setTarget("vercel"));
    act(() => result.current.setProjectName("demo"));
    await act(async () => { await result.current.publish(); });
    expect(result.current.pollError).toBeNull();
    expect(result.current.isPublishing).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(getPublishStatus).toHaveBeenCalledTimes(callsAtBound + 1);
    expect(result.current.pollError).toBeNull();
    expect(result.current.isPublishing).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(getPublishStatus).toHaveBeenCalledTimes(callsAtBound + 2);
    expect(result.current.pollError).toBeNull();
    expect(result.current.isPublishing).toBe(true);
  });

  // Both tests below target the loop's `cancelled` guard specifically — same reasoning as
  // `use-static-export.hooks.ts`'s identical guard: `clearTimeout` only cancels the NEXT scheduled
  // poll, not a request already in flight when the effect's cleanup (unmount here) runs.
  it("a successful poll response arriving after unmount does not reschedule another poll", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const runningRun: AdminPublishRunSnapshot = { status: "running", startedAtIso: "t0", finishedAtIso: null, target: "vercel" };
    let resolvePoll: (value: AdminPublishRunSnapshot) => void = () => {};
    let call = 0;
    // Call 1 is the bootstrap read (must resolve immediately, seeding isPublishing: true); call 2 is
    // the poll under test, held pending until unmount has already run.
    const getPublishStatus = vi.fn().mockImplementation(() => {
      call += 1;
      if (call === 1) return Promise.resolve(runningRun);
      return new Promise<AdminPublishRunSnapshot>((resolve) => { resolvePoll = resolve; });
    });
    const port = portWith({ getPublishStatus });

    const { result, unmount } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.isPublishing).toBe(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(getPublishStatus).toHaveBeenCalledTimes(2);
    unmount();

    resolvePoll(runningRun);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(getPublishStatus).toHaveBeenCalledTimes(2);
  });

  it("a poll rejection arriving after unmount does not count toward the failure bound or reschedule", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const runningRun: AdminPublishRunSnapshot = { status: "running", startedAtIso: "t0", finishedAtIso: null, target: "vercel" };
    let rejectPoll: (err: Error) => void = () => {};
    let call = 0;
    const getPublishStatus = vi.fn().mockImplementation(() => {
      call += 1;
      if (call === 1) return Promise.resolve(runningRun);
      return new Promise<AdminPublishRunSnapshot>((_resolve, reject) => { rejectPoll = reject; });
    });
    const port = portWith({ getPublishStatus });

    const { result, unmount } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.isPublishing).toBe(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(getPublishStatus).toHaveBeenCalledTimes(2);
    unmount();

    rejectPoll(new Error("network blip"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(getPublishStatus).toHaveBeenCalledTimes(2);
  });

  it("REGRESSION (C4): a second publish() call while the first is still in flight must not send a second POST or leave a false failure message", async () => {
    const runningRun: AdminPublishRunSnapshot = { status: "running", startedAtIso: "t0", finishedAtIso: null, target: "github-pages" };
    const triggerPublish = vi.fn().mockResolvedValue(runningRun);
    const port = portWith({ triggerPublish });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run !== undefined && result.current.targets !== undefined).toBe(true));

    act(() => result.current.setConfigField("owner", "acme"));
    act(() => result.current.setConfigField("repo", "site"));
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
    const port = portWith({ getPublishStatus: () => Promise.resolve(IDLE_RUN) });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run !== undefined && result.current.targets !== undefined).toBe(true));
    expect(result.current.run).toEqual(IDLE_RUN);
    expect(result.current.loadError).toBeNull();
  });

  it("surfaces a rejected initial read as a translated load error", async () => {
    const port = portWith({ getPublishStatus: () => Promise.reject(new Error("disk error")) });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.loadError).not.toBeNull());
    expect(result.current.loadError).toContain("Could not load the publish status");
    expect(result.current.loadError).toContain("disk error");
  });
});

// terra review 2026-09-20, finding 1 (Critical). The trigger carries the connection the operator
// chose so the SERVER publishes with that row, instead of resolving whichever one is default when
// the POST lands (`static-publish/credentials.ts`).
describe("useStaticPublish — the publish names the chosen credential", () => {
  it("forwards publish({ credentialId }) to the port's triggerPublish", async () => {
    const runningRun: AdminPublishRunSnapshot = { status: "running", startedAtIso: "t0", finishedAtIso: null, target: "vercel" };
    const triggerPublish = vi.fn().mockResolvedValue(runningRun);
    const port = portWith({ triggerPublish });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run !== undefined && result.current.targets !== undefined).toBe(true));

    act(() => result.current.setTarget("vercel"));
    act(() => result.current.setProjectName("demo"));
    await act(async () => {
      await result.current.publish({ credentialId: "cred-2" });
    });

    expect(triggerPublish).toHaveBeenCalledWith({ config: { target: "vercel", fields: {} }, projectName: "demo", credentialId: "cred-2" });
  });

  it("sends no credentialId key at all when the caller has no chosen connection", async () => {
    const runningRun: AdminPublishRunSnapshot = { status: "running", startedAtIso: "t0", finishedAtIso: null, target: "vercel" };
    const triggerPublish = vi.fn().mockResolvedValue(runningRun);
    const port = portWith({ triggerPublish });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run !== undefined && result.current.targets !== undefined).toBe(true));

    act(() => result.current.setTarget("vercel"));
    act(() => result.current.setProjectName("demo"));
    await act(async () => {
      await result.current.publish();
    });

    expect(triggerPublish).toHaveBeenCalledWith({ config: { target: "vercel", fields: {} }, projectName: "demo" });
  });

  it("a host that declares no projectName can publish with the field empty and sends its own id as the projectName", async () => {
    const runningRun: AdminPublishRunSnapshot = { status: "running", startedAtIso: "t0", finishedAtIso: null, target: "plain-host" };
    const triggerPublish = vi.fn().mockResolvedValue(runningRun);
    const port = portWith({ triggerPublish, listPublishTargets: () => Promise.resolve([...PUBLISH_TARGETS, PLAIN_TARGET]) });
    const { result } = renderHook(() => useStaticPublish(port, fakeT, fakeLocale), { wrapper });
    await waitFor(() => expect(result.current.run !== undefined && result.current.targets !== undefined).toBe(true));

    act(() => result.current.setTarget("plain-host"));
    expect(result.current.projectNameCopy).toBeNull();
    expect(result.current.canPublish).toBe(true);
    await act(async () => {
      await result.current.publish();
    });

    expect(triggerPublish).toHaveBeenCalledWith({ config: { target: "plain-host", fields: {} }, projectName: "plain-host" });
  });
});
