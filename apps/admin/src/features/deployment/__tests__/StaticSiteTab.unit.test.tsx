import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { StaticSiteTab } from "../StaticSiteTab";
import type { StaticExportController } from "../hooks/use-static-export.hooks";
import type { StaticPublishController } from "../hooks/use-static-publish.hooks";
import type { DeploymentOverviewController } from "../hooks/use-deployment-overview.hooks";
import { PUBLISH_CLI_TOOLS, STATIC_HOSTS, STATIC_SITE_CAPABILITIES } from "../rules";

/**
 * @file `StaticSiteTab` — driven through its three `useStaticExportHook`/`useStaticPublishHook`/
 * `useDeploymentOverviewHook` DI seams, same convention `DockerfileTab.unit.test.tsx` established
 * for the first tab in this panel to gain injected hooks. Replaces this tab's old coverage in
 * `PureTabs.unit.test.tsx` (moved here 2026-08-15 once the tab stopped being a pure, hookless
 * component — see that file's own header).
 *
 * Pins: card 1's content is unchanged (still no hook, still the honest capability/host lists); the
 * build action now calls the injected `trigger()` and reflects `run`/`isRunning`/`triggerError`
 * rather than being permanently inert; the "Getting it online" card's provider picker shows ONE
 * provider's CLI row at a time (never both), the CLI row's detected pill is driven by the injected
 * `deployClis`, and the publish mini-form's fields/gating/results are driven by the injected
 * controller. The hooks' own load/poll/trigger mechanics are each hook's own unit test's job, not
 * this file's — this file only proves the component wires the controllers to the right markup.
 */

const fakeT = (key: string): string => key;

function exportControllerFixture(overrides: Partial<StaticExportController> = {}): StaticExportController {
  return {
    run: undefined,
    isRunning: false,
    loadError: null,
    triggerError: null,
    triggering: false,
    clean: false,
    setClean: vi.fn(),
    trigger: vi.fn().mockResolvedValue(undefined),
    t: fakeT,
    ...overrides,
  };
}

function publishControllerFixture(overrides: Partial<StaticPublishController> = {}): StaticPublishController {
  return {
    target: "github-pages",
    setTarget: vi.fn(),
    owner: "",
    setOwner: vi.fn(),
    repo: "",
    setRepo: vi.fn(),
    branch: "",
    setBranch: vi.fn(),
    teamId: "",
    setTeamId: vi.fn(),
    projectName: "",
    setProjectName: vi.fn(),
    preview: undefined,
    previewLoading: false,
    previewError: null,
    checkPreview: vi.fn().mockResolvedValue(undefined),
    run: undefined,
    isPublishing: false,
    loadError: null,
    publishError: null,
    publish: vi.fn().mockResolvedValue(undefined),
    t: fakeT,
    ...overrides,
  };
}

function overviewControllerFixture(overrides: Partial<DeploymentOverviewController> = {}): DeploymentOverviewController {
  return {
    snapshot: undefined,
    error: null,
    t: fakeT,
    ...overrides,
  };
}

function renderTab(overrides: {
  exportController?: Partial<StaticExportController>;
  publishController?: Partial<StaticPublishController>;
  overviewController?: Partial<DeploymentOverviewController>;
} = {}) {
  return render(
    <StaticSiteTab
      useStaticExportHook={() => exportControllerFixture(overrides.exportController)}
      useStaticPublishHook={() => publishControllerFixture(overrides.publishController)}
      useDeploymentOverviewHook={() => overviewControllerFixture(overrides.overviewController)}
    />,
  );
}

describe("StaticSiteTab — card 1, unchanged", () => {
  it("still states the export is a terminal command, lists what survives it, and the four hosts", () => {
    renderTab();
    expect(screen.getByText("Build it from a terminal")).toBeInTheDocument();
    expect(screen.getByText("tovu export <dir>")).toBeInTheDocument();
    for (const capability of STATIC_SITE_CAPABILITIES) expect(screen.getByText(capability.labelKey)).toBeInTheDocument();
    // `getAllByText` rather than `getByText`: "GitHub Pages" now also appears as the provider
    // picker's own tab label further down the same tab, which is expected (they're two different,
    // correct appearances of the same proper noun), not a collision to fix away.
    for (const host of STATIC_HOSTS) expect(screen.getAllByText(host).length).toBeGreaterThan(0);
  });
});

describe("StaticSiteTab — build export action", () => {
  it("is enabled and idle by default, wired to the injected trigger()", async () => {
    const user = userEvent.setup();
    const trigger = vi.fn().mockResolvedValue(undefined);
    renderTab({ exportController: { trigger } });

    const button = screen.getByRole("button", { name: "Build static export" });
    expect(button).toBeEnabled();
    await user.click(button);
    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it("disables the button and shows the running label while a run is in flight", () => {
    renderTab({
      exportController: { isRunning: true, run: { status: "running", startedAtIso: "t0", finishedAtIso: null, outputDir: null } },
    });
    expect(screen.getByRole("button", { name: "Exporting…" })).toBeDisabled();
  });

  it("the clean checkbox is unchecked by default and calls the injected setClean on toggle", async () => {
    const user = userEvent.setup();
    const setClean = vi.fn();
    renderTab({ exportController: { setClean } });

    const checkbox = screen.getByRole("checkbox", { name: /overwrite existing files/i });
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(setClean).toHaveBeenCalledWith(true);
  });

  it("surfaces a trigger error without crashing, distinct from a completed run's result", () => {
    renderTab({ exportController: { triggerError: "an export is already running" } });
    expect(screen.getByRole("alert")).toHaveTextContent("an export is already running");
  });

  it("shows a completed run's counts and output dir", () => {
    renderTab({
      exportController: {
        run: {
          status: "completed",
          startedAtIso: "t0",
          finishedAtIso: "t1",
          outputDir: "/infra/export",
          ok: true,
          counts: { routesSucceeded: 27, routesFailed: 0, assetsSucceeded: 8, assetsFailed: 0 },
        },
      },
    });
    expect(screen.getByText("/infra/export")).toBeInTheDocument();
    expect(screen.getByText(/27/)).toBeInTheDocument();
    expect(screen.getByText(/8/)).toBeInTheDocument();
  });

  it("shows an errored run's message as an alert", () => {
    renderTab({
      exportController: {
        run: { status: "errored", startedAtIso: "t0", finishedAtIso: "t1", outputDir: null, error: "output directory is not empty" },
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("output directory is not empty");
  });
});

describe("StaticSiteTab — provider picker splits GitHub Pages and Vercel", () => {
  it("defaults to GitHub Pages: shows owner/repo/branch fields, the gh CLI row, and no Vercel row or teamId field anywhere", () => {
    renderTab();
    expect(screen.getByRole("tab", { name: "GitHub Pages" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("gh")).toBeInTheDocument();
    expect(screen.queryByText("vercel")).not.toBeInTheDocument();
    expect(screen.getByLabelText("GitHub owner or org")).toBeInTheDocument();
    expect(screen.getByLabelText("Repository")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Vercel team/)).not.toBeInTheDocument();
  });

  it("switching to Vercel shows only the Vercel CLI row and the teamId field — no GitHub fields, no gh row", async () => {
    const user = userEvent.setup();
    const setTarget = vi.fn();
    const { rerender } = renderTab({ publishController: { setTarget } });

    await user.click(screen.getByRole("tab", { name: "Vercel" }));
    expect(setTarget).toHaveBeenCalledWith("vercel");

    rerender(
      <StaticSiteTab
        useStaticExportHook={() => exportControllerFixture()}
        useStaticPublishHook={() => publishControllerFixture({ target: "vercel" })}
        useDeploymentOverviewHook={() => overviewControllerFixture()}
      />,
    );
    expect(screen.getByText("vercel")).toBeInTheDocument();
    expect(screen.queryByText("gh")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Vercel team (optional)")).toBeInTheDocument();
    expect(screen.queryByLabelText("GitHub owner or org")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Repository")).not.toBeInTheDocument();
  });

  it("names each tool from rules.ts once — the split is real, not two labels for the same row", () => {
    renderTab();
    for (const tool of PUBLISH_CLI_TOOLS.filter((t) => t.id === "gh")) {
      expect(screen.getByText(tool.name)).toBeInTheDocument();
    }
  });
});

describe("StaticSiteTab — real CLI detection, no more 'can't tell' placeholder", () => {
  it("shows 'Checking…' while the Overview snapshot has not loaded yet", () => {
    renderTab({ overviewController: { snapshot: undefined } });
    expect(screen.getByText("Checking…")).toBeInTheDocument();
  });

  it("shows a real Detected pill when deployClis reports the selected provider's CLI installed", () => {
    renderTab({
      overviewController: {
        snapshot: {
          mode: "local",
          productionReadinessGate: { applicable: false, passed: false },
          defaultOwnerPasswordUnsafe: false,
          daemonKnownFailed: false,
          dbPath: "infra/content.db",
          uploadsDir: "infra/uploads",
          envVars: [],
          deployClis: [
            { name: "gh", installed: true },
            { name: "vercel", installed: false },
          ],
        },
      },
    });
    expect(screen.getByText("Detected on this server")).toBeInTheDocument();
  });

  it("shows a real Not-detected pill when the selected provider's CLI is absent — never a false positive", () => {
    renderTab({
      overviewController: {
        snapshot: {
          mode: "local",
          productionReadinessGate: { applicable: false, passed: false },
          defaultOwnerPasswordUnsafe: false,
          daemonKnownFailed: false,
          dbPath: "infra/content.db",
          uploadsDir: "infra/uploads",
          envVars: [],
          deployClis: [
            { name: "gh", installed: false },
            { name: "vercel", installed: true },
          ],
        },
      },
    });
    expect(screen.getByText("Not detected on this server")).toBeInTheDocument();
  });
});

describe("StaticSiteTab — preview and publish gating", () => {
  it("Preview and Publish stay disabled for GitHub Pages until owner and repo are both filled", () => {
    renderTab({ publishController: { owner: "octo", repo: "" } });
    expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  });

  it("Preview enables once owner+repo are filled; Publish still needs a projectName too", async () => {
    const user = userEvent.setup();
    renderTab({ publishController: { owner: "octo", repo: "demo-repo", projectName: "" } });
    expect(screen.getByRole("button", { name: "Preview" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();

    const checkPreview = vi.fn().mockResolvedValue(undefined);
    renderTab({ publishController: { owner: "octo", repo: "demo-repo", checkPreview } });
    await user.click(screen.getAllByRole("button", { name: "Preview" })[1]!);
    expect(checkPreview).toHaveBeenCalledTimes(1);
  });

  it("Vercel needs only a projectName — Publish enables with no owner/repo at all", () => {
    renderTab({ publishController: { target: "vercel", owner: "", repo: "", projectName: "my-site" } });
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
  });

  it("clicking Publish calls the injected publish() and disables the button while isPublishing", async () => {
    const user = userEvent.setup();
    const publish = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderTab({ publishController: { target: "vercel", projectName: "my-site", publish } });

    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(publish).toHaveBeenCalledTimes(1);

    rerender(
      <StaticSiteTab
        useStaticExportHook={() => exportControllerFixture()}
        useStaticPublishHook={() => publishControllerFixture({ target: "vercel", projectName: "my-site", isPublishing: true })}
        useDeploymentOverviewHook={() => overviewControllerFixture()}
      />,
    );
    expect(screen.getByRole("button", { name: "Publishing…" })).toBeDisabled();
  });

  it("shows the preview's base path and credential status once loaded", () => {
    renderTab({
      publishController: {
        owner: "octo",
        repo: "demo-repo",
        preview: {
          target: "github-pages",
          valid: true,
          validationError: null,
          basePath: "/demo-repo",
          credentialsConfigured: false,
          credentialGuidance: "GITHUB_TOKEN is not set",
          willInjectNojekyll: true,
        },
      },
    });
    expect(screen.getByText("/demo-repo")).toBeInTheDocument();
    expect(screen.getByText("Not configured")).toBeInTheDocument();
    expect(screen.getByText("GITHUB_TOKEN is not set")).toBeInTheDocument();
  });

  it("shows an invalid preview's validation error instead of base-path facts", () => {
    renderTab({
      publishController: {
        preview: {
          target: "github-pages",
          valid: false,
          validationError: "invalid GitHub owner 'not valid!!'",
          basePath: null,
          credentialsConfigured: false,
          credentialGuidance: null,
          willInjectNojekyll: false,
        },
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("invalid GitHub owner");
    expect(screen.queryByText("Base path")).not.toBeInTheDocument();
  });

  it("shows a completed successful publish as a live link — never as raw JSON", () => {
    renderTab({
      publishController: {
        target: "vercel",
        run: {
          status: "completed",
          startedAtIso: "t0",
          finishedAtIso: "t1",
          target: "vercel",
          result: { ok: true, targetId: "vercel", url: "https://demo.vercel.app", status: "READY" },
        },
      },
    });
    const link = screen.getByRole("link", { name: "https://demo.vercel.app" });
    expect(link).toHaveAttribute("href", "https://demo.vercel.app");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("shows a completed but failed publish's message as an alert, not a live link", () => {
    renderTab({
      publishController: {
        target: "vercel",
        run: {
          status: "completed",
          startedAtIso: "t0",
          finishedAtIso: "t1",
          target: "vercel",
          result: { ok: false, code: "NO_CREDENTIALS_CONFIGURED", message: "VERCEL_TOKEN is not set" },
        },
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("VERCEL_TOKEN is not set");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("REGRESSION: a real trigger's own status: 'errored' + a populated result.message (not run.error) still shows the real message — verified live against publish-site.ts, which maps ANY result.ok:false outcome to status 'errored', not 'completed'", () => {
    // Caught by an e2e run against the real route, not by an earlier version of this suite: a first
    // draft of `PublishRunResult` branched on `status === 'errored'` FIRST and rendered `run.error`
    // unconditionally there, which is empty for this shape — `publish-site.ts`'s own `.then` handler
    // sets `status: result.ok ? 'completed' : 'errored'` while STILL attaching the full `result`, so
    // `result.message` (not `run.error`) is where the real text lives even at `status: 'errored'`.
    renderTab({
      publishController: {
        target: "vercel",
        run: {
          status: "errored",
          startedAtIso: "t0",
          finishedAtIso: "t1",
          target: "vercel",
          result: { ok: false, code: "NO_CREDENTIALS_CONFIGURED", message: "VERCEL_TOKEN is not set" },
        },
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("VERCEL_TOKEN is not set");
  });

  it("an errored run with no result at all (a true route-level exception) falls back to run.error", () => {
    renderTab({
      publishController: {
        target: "vercel",
        run: { status: "errored", startedAtIso: "t0", finishedAtIso: "t1", target: "vercel", error: "unexpected route failure" },
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("unexpected route failure");
  });

  it("never lets the operator publish without a real, human-driven click — Publish has an explicit onClick, never fires on render", () => {
    const publish = vi.fn();
    renderTab({ publishController: { target: "vercel", projectName: "my-site", publish } });
    expect(publish).not.toHaveBeenCalled();
  });
});

describe("StaticSiteTab — AI agent tagging", () => {
  it("tags the export card, build button, and clean checkbox for the AI agent", () => {
    renderTab();
    expect(document.querySelector('[data-agent-element="deployment-static-site-export-card"]')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-static-site-export-build"]')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-static-site-export-clean"]')).toBeInTheDocument();
  });

  it("tags the online card and the publish form's fields/actions for the AI agent", () => {
    renderTab();
    expect(document.querySelector('[data-agent-element="deployment-static-site-online-card"]')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-static-site-publish-owner"]')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-static-site-publish-repo"]')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-static-site-publish-project-name"]')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-static-site-publish-preview"]')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-static-site-publish-trigger"]')).toBeInTheDocument();
  });
});
