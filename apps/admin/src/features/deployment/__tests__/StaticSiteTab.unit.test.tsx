import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { StaticSiteTab } from "../StaticSiteTab";
import type { StaticExportController } from "../hooks/use-static-export.hooks";
import type { StaticPublishController } from "../hooks/use-static-publish.hooks";
import type { DeploymentOverviewController } from "../hooks/use-deployment-overview.hooks";
import type { PublishCredentialsController } from "../hooks/use-publish-credentials.hooks";
import type { AdminPublishCredentialSummary } from "../../../lib/api";
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

const GH_CREDENTIAL: AdminPublishCredentialSummary = {
  id: "cred-1",
  providerId: "github-pages",
  label: "Production GitHub Pages",
  configured: true,
  isDefault: true,
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-15T09:30:00.000Z",
};

function credentialsControllerFixture(overrides: Partial<PublishCredentialsController> = {}): PublishCredentialsController {
  return {
    credentials: [],
    executionMode: "self-hosted-cli",
    loadError: null,
    isFormOpen: false,
    editingId: null,
    providerId: "github-pages",
    setProviderId: vi.fn(),
    label: "",
    setLabel: vi.fn(),
    token: "",
    setToken: vi.fn(),
    accountId: "",
    setAccountId: vi.fn(),
    isDefault: false,
    setIsDefault: vi.fn(),
    startAdd: vi.fn(),
    startEdit: vi.fn(),
    cancelForm: vi.fn(),
    submitting: false,
    formError: null,
    submit: vi.fn().mockResolvedValue(undefined),
    deletingId: null,
    deleteError: null,
    remove: vi.fn().mockResolvedValue(undefined),
    markingDefaultId: null,
    markDefaultError: null,
    markAsDefault: vi.fn().mockResolvedValue(undefined),
    t: fakeT,
    ...overrides,
  };
}

function renderTab(overrides: {
  exportController?: Partial<StaticExportController>;
  publishController?: Partial<StaticPublishController>;
  overviewController?: Partial<DeploymentOverviewController>;
  credentialsController?: Partial<PublishCredentialsController>;
} = {}) {
  return render(
    <StaticSiteTab
      useStaticExportHook={() => exportControllerFixture(overrides.exportController)}
      useStaticPublishHook={() => publishControllerFixture(overrides.publishController)}
      useDeploymentOverviewHook={() => overviewControllerFixture(overrides.overviewController)}
      usePublishCredentialsHook={() => credentialsControllerFixture(overrides.credentialsController)}
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

  it("names each failed route and asset with its own reason, not just the aggregate count", () => {
    renderTab({
      exportController: {
        run: {
          status: "completed",
          startedAtIso: "t0",
          finishedAtIso: "t1",
          outputDir: "/infra/export",
          ok: false,
          counts: { routesSucceeded: 26, routesFailed: 1, assetsSucceeded: 7, assetsFailed: 1 },
          failedRoutes: [{ path: "/products/broken", kind: "product", reason: "template threw" }],
          failedAssets: [{ url: "/theme/missing.png", reason: "404 from origin" }],
        },
      },
    });
    expect(screen.getByText("/products/broken")).toBeInTheDocument();
    expect(screen.getByText(/template threw/)).toBeInTheDocument();
    expect(screen.getByText("/theme/missing.png")).toBeInTheDocument();
    expect(screen.getByText(/404 from origin/)).toBeInTheDocument();
  });

  it("shows no failure lists at all for a clean, fully-successful run", () => {
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
    expect(screen.queryByText("Failed routes")).not.toBeInTheDocument();
    expect(screen.queryByText("Failed assets")).not.toBeInTheDocument();
  });

  it("surfaces a failed initial status load distinctly from a trigger error", () => {
    renderTab({ exportController: { loadError: "could not reach the server" } });
    expect(screen.getByText("could not reach the server")).toBeInTheDocument();
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
        usePublishCredentialsHook={() => credentialsControllerFixture()}
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

  it("netlify: no CLI row at all (never falls back to the GitHub CLI row) — shows the 'no CLI-first path' note and no target-specific field", () => {
    renderTab({ publishController: { target: "netlify" } });
    expect(screen.getByRole("tab", { name: "Netlify" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("gh")).not.toBeInTheDocument();
    expect(screen.queryByText("vercel")).not.toBeInTheDocument();
    expect(screen.getByText("There's no CLI-first path for this provider yet — publish with a saved credential below.")).toBeInTheDocument();
    expect(screen.queryByLabelText("GitHub owner or org")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Vercel team/)).not.toBeInTheDocument();
  });

  it("cloudflare-pages: no CLI row at all, same 'no CLI-first path' note, no target-specific field", () => {
    renderTab({ publishController: { target: "cloudflare-pages" } });
    expect(screen.getByRole("tab", { name: "Cloudflare Pages" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("gh")).not.toBeInTheDocument();
    expect(screen.queryByText("vercel")).not.toBeInTheDocument();
    expect(screen.getByText("There's no CLI-first path for this provider yet — publish with a saved credential below.")).toBeInTheDocument();
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

  it("only-gh installed: GitHub Pages (the default target) reads Detected, with no vercel row anywhere to contradict it", () => {
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
    expect(screen.getByText("gh")).toBeInTheDocument();
    expect(screen.getByText("Detected on this server")).toBeInTheDocument();
    expect(screen.queryByText("vercel")).not.toBeInTheDocument();
  });

  it("only-vercel installed: switching the picker to Vercel reads Detected, with no gh row left over from the default GitHub Pages selection", () => {
    renderTab({
      publishController: { target: "vercel" },
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
    expect(screen.getByText("vercel")).toBeInTheDocument();
    expect(screen.getByText("Detected on this server")).toBeInTheDocument();
    expect(screen.queryByText("gh")).not.toBeInTheDocument();
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

  it("Netlify and Cloudflare Pages each need only a projectName too — no target-specific field to fill first", () => {
    renderTab({ publishController: { target: "netlify", owner: "", repo: "", projectName: "my-site" } });
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();

    renderTab({ publishController: { target: "cloudflare-pages", owner: "", repo: "", projectName: "my-project" } });
    expect(screen.getAllByRole("button", { name: "Publish" }).at(-1)).toBeEnabled();
  });

  it("the 'Project name' field's label and help text change per target — github-pages calls it a commit message, netlify a site name, never one shared label for all four", () => {
    renderTab({ publishController: { target: "github-pages" } });
    expect(screen.getByLabelText("Commit message")).toBeInTheDocument();
    expect(screen.queryByLabelText("Project name")).not.toBeInTheDocument();

    renderTab({ publishController: { target: "vercel" } });
    expect(screen.getByLabelText("Vercel project name")).toBeInTheDocument();

    renderTab({ publishController: { target: "netlify" } });
    expect(screen.getByLabelText("Site name")).toBeInTheDocument();

    renderTab({ publishController: { target: "cloudflare-pages" } });
    expect(screen.getByLabelText("Project name")).toBeInTheDocument();
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
        usePublishCredentialsHook={() => credentialsControllerFixture()}
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

  it("surfaces a failed initial publish-status load distinctly from a preview/publish error", () => {
    renderTab({ publishController: { loadError: "could not reach the server" } });
    expect(screen.getByText("could not reach the server")).toBeInTheDocument();
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

  it("tags both cards' load-error notices for the AI agent", () => {
    renderTab({ exportController: { loadError: "x" }, publishController: { loadError: "y" } });
    expect(document.querySelector('[data-agent-element="deployment-static-site-export-load-error"]')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-static-site-publish-load-error"]')).toBeInTheDocument();
  });
});

describe("StaticSiteTab — credential section: loading and load-error states", () => {
  it("shows a brief loading line, not either disclosure, while credentials/executionMode are unresolved", () => {
    renderTab({ credentialsController: { credentials: undefined, executionMode: undefined } });
    expect(screen.getByText("Loading credentials…")).toBeInTheDocument();
    expect(screen.queryByText(/Advanced: publish with server-side provider credentials/)).not.toBeInTheDocument();
    expect(screen.queryByText(/This workspace cannot use your computer's terminal/)).not.toBeInTheDocument();
  });

  it("surfaces a load error instead of either disclosure", () => {
    renderTab({ credentialsController: { credentials: undefined, executionMode: undefined, loadError: "could not reach the server" } });
    expect(screen.getByText("could not reach the server")).toBeInTheDocument();
    expect(screen.queryByText("Loading credentials…")).not.toBeInTheDocument();
  });
});

describe("StaticSiteTab — credential section: executionMode disclosure", () => {
  it("self-hosted-cli: sits behind a native <details> 'Advanced' summary, OPEN by default, never a prominent notice", () => {
    // Open-by-default reverses this component's original collapsed-by-default choice (owner's own
    // call, 2026-08-15) — Netlify and Cloudflare Pages have no CLI-first row at all, so a reader who
    // picks either target must not find the credential form hidden behind an unopened disclosure.
    renderTab({ credentialsController: { executionMode: "self-hosted-cli" } });
    const summary = screen.getByText("Advanced: publish with server-side provider credentials");
    expect(summary.closest("details")).not.toBeNull();
    expect(summary.closest("details")).toHaveAttribute("open");
    expect(screen.queryByText(/This workspace cannot use your computer's terminal/)).not.toBeInTheDocument();
  });

  it("hosted-api-only: shows the plain-language notice OPEN, no collapsed <details> at all", () => {
    renderTab({ credentialsController: { executionMode: "hosted-api-only" } });
    expect(
      screen.getByText("This workspace cannot use your computer's terminal or CLI sign-in. To publish here, connect a provider and save its credentials below.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Advanced: publish with server-side provider credentials")).not.toBeInTheDocument();
  });

  it("the credential list/form itself renders in BOTH modes — disclosure changes prominence, never hides the actual controls", () => {
    renderTab({ credentialsController: { executionMode: "self-hosted-cli" } });
    expect(screen.getByRole("button", { name: "Add credential" })).toBeInTheDocument();

    renderTab({ credentialsController: { executionMode: "hosted-api-only" } });
    expect(screen.getAllByRole("button", { name: "Add credential" }).length).toBeGreaterThan(0);
  });
});

describe("StaticSiteTab — credential section: list", () => {
  it("the empty state also states what a credential is for and which providers are supported — not just 'No credentials saved yet'", () => {
    renderTab({ credentialsController: { credentials: [] } });
    expect(screen.getByText("No credentials saved yet.")).toBeInTheDocument();
    expect(
      screen.getByText("A credential is a saved access token Tovu publishes with, for GitHub Pages, Vercel, Netlify, or Cloudflare Pages.")
    ).toBeInTheDocument();
  });

  it("shows 'No credentials saved yet' when the list is empty", () => {
    renderTab({ credentialsController: { credentials: [] } });
    expect(screen.getByText("No credentials saved yet.")).toBeInTheDocument();
  });

  it("lists a saved credential by label, provider, and formatted updatedAt — never any token material", () => {
    renderTab({ credentialsController: { credentials: [GH_CREDENTIAL] } });
    expect(screen.getByText("Production GitHub Pages")).toBeInTheDocument();
    expect(screen.getByText("GitHub Pages", { selector: ".status" })).toBeInTheDocument();
    expect(screen.getByText(/2026-08-15/)).toBeInTheDocument();
  });

  it("clicking Edit on a row calls startEdit with that exact credential", async () => {
    const user = userEvent.setup();
    const startEdit = vi.fn();
    renderTab({ credentialsController: { credentials: [GH_CREDENTIAL], startEdit } });
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(startEdit).toHaveBeenCalledWith(GH_CREDENTIAL);
  });

  it("clicking Delete on a row calls remove with that row's id", async () => {
    const user = userEvent.setup();
    const remove = vi.fn().mockResolvedValue(undefined);
    renderTab({ credentialsController: { credentials: [GH_CREDENTIAL], remove } });
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(remove).toHaveBeenCalledWith("cred-1");
  });

  it("disables and relabels only the row currently being deleted", () => {
    renderTab({ credentialsController: { credentials: [GH_CREDENTIAL], deletingId: "cred-1" } });
    expect(screen.getByRole("button", { name: "Deleting…" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("surfaces a delete error as an alert", () => {
    renderTab({ credentialsController: { credentials: [GH_CREDENTIAL], deleteError: "still referenced elsewhere" } });
    expect(screen.getByRole("alert")).toHaveTextContent("still referenced elsewhere");
  });

  it("a lone credential for its provider shows neither a Default badge nor a Make default button — nothing to choose", () => {
    renderTab({ credentialsController: { credentials: [GH_CREDENTIAL] } }); // GH_CREDENTIAL.isDefault is true
    expect(screen.queryByText("Default")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Make default" })).not.toBeInTheDocument();
  });

  it("with two connections for the same provider: the default row shows a Default badge, the other shows a Make default button", async () => {
    const other: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, id: "cred-2", label: "Backup GitHub Pages", isDefault: false };
    const markAsDefault = vi.fn().mockResolvedValue(undefined);
    renderTab({ credentialsController: { credentials: [GH_CREDENTIAL, other], markAsDefault } });

    expect(screen.getByText("Default")).toBeInTheDocument();
    const makeDefaultButton = screen.getByRole("button", { name: "Make default" });
    expect(makeDefaultButton).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(makeDefaultButton);
    expect(markAsDefault).toHaveBeenCalledWith("cred-2");
  });

  it("disables and relabels only the row currently being promoted to default", () => {
    const other: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, id: "cred-2", label: "Backup", isDefault: false };
    renderTab({ credentialsController: { credentials: [GH_CREDENTIAL, other], markingDefaultId: "cred-2" } });
    expect(screen.getByRole("button", { name: "Setting…" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Make default" })).not.toBeInTheDocument();
  });

  it("surfaces a markDefaultError as an alert", () => {
    renderTab({ credentialsController: { credentials: [GH_CREDENTIAL], markDefaultError: "could not reach the server" } });
    expect(screen.getByRole("alert")).toHaveTextContent("could not reach the server");
  });
});

describe("StaticSiteTab — credential section: add/edit form", () => {
  it("clicking 'Add credential' calls startAdd; the form itself is hidden until isFormOpen is true", async () => {
    const user = userEvent.setup();
    const startAdd = vi.fn();
    renderTab({ credentialsController: { startAdd } });
    expect(screen.queryByLabelText("Label")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add credential" }));
    expect(startAdd).toHaveBeenCalledTimes(1);
  });

  it("github-pages (default): shows no per-provider field beyond the shared token — owner/repo live on the publish target, not the credential", () => {
    renderTab({ credentialsController: { isFormOpen: true, providerId: "github-pages" } });
    expect(screen.queryByLabelText("Owner or org for this token")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Repository for this token")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Team ID/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Site ID/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Account ID")).not.toBeInTheDocument();
  });

  it("vercel: shows no per-provider field beyond the shared token — teamId lives on the publish target, not the credential", () => {
    renderTab({ credentialsController: { isFormOpen: true, providerId: "vercel" } });
    expect(screen.queryByLabelText(/Team ID/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Account ID")).not.toBeInTheDocument();
  });

  it("netlify: shows no per-provider field beyond the shared token", () => {
    renderTab({ credentialsController: { isFormOpen: true, providerId: "netlify" } });
    expect(screen.queryByLabelText(/Site ID/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Account ID")).not.toBeInTheDocument();
  });

  it("cloudflare-pages: shows ONLY the required accountId field — the one provider with a second connection field", () => {
    renderTab({ credentialsController: { isFormOpen: true, providerId: "cloudflare-pages" } });
    expect(screen.getByLabelText("Account ID")).toBeInTheDocument();
    expect(screen.queryByLabelText("Project name (optional)")).not.toBeInTheDocument();
  });

  it("the provider select is disabled in edit mode — a saved credential's provider cannot be changed", () => {
    renderTab({ credentialsController: { isFormOpen: true, editingId: "cred-1", providerId: "github-pages" } });
    expect(screen.getByLabelText("Provider")).toBeDisabled();
  });

  it("the provider select stays enabled in add mode", () => {
    renderTab({ credentialsController: { isFormOpen: true, editingId: null } });
    expect(screen.getByLabelText("Provider")).toBeEnabled();
  });

  it("edit mode's token field is empty with 'leave blank to keep it' copy — never pre-filled from a stored value", () => {
    renderTab({ credentialsController: { isFormOpen: true, editingId: "cred-1", token: "" } });
    expect(screen.getByLabelText("Access token")).toHaveValue("");
    expect(screen.getByText(/leave this blank to keep the token already saved/i)).toBeInTheDocument();
  });

  it("Cancel calls cancelForm", async () => {
    const user = userEvent.setup();
    const cancelForm = vi.fn();
    renderTab({ credentialsController: { isFormOpen: true, cancelForm } });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancelForm).toHaveBeenCalledTimes(1);
  });

  it("submitting the form calls the injected submit()", async () => {
    const user = userEvent.setup();
    const submit = vi.fn().mockResolvedValue(undefined);
    renderTab({
      credentialsController: {
        isFormOpen: true,
        providerId: "vercel",
        label: "My Vercel",
        token: "tok",
        submit,
      },
    });
    await user.click(screen.getByRole("button", { name: "Save credential" }));
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("the submit button is disabled until the provider's own required fields are filled — never bypassable by a raw click", () => {
    renderTab({ credentialsController: { isFormOpen: true, providerId: "cloudflare-pages", label: "x", token: "tok" } });
    // accountId still blank — cloudflare-pages is the one provider with a required field left
    expect(screen.getByRole("button", { name: "Save credential" })).toBeDisabled();
  });

  it("shows the busy label and disables submit while a save is in flight", () => {
    renderTab({ credentialsController: { isFormOpen: true, providerId: "vercel", label: "x", token: "tok", submitting: true } });
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("edit mode's submit label reads 'Save changes', not 'Save credential'", () => {
    renderTab({ credentialsController: { isFormOpen: true, editingId: "cred-1", providerId: "vercel", label: "x" } });
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("surfaces a formError as an alert", () => {
    renderTab({ credentialsController: { isFormOpen: true, formError: "A credential with this label already exists." } });
    expect(screen.getByRole("alert")).toHaveTextContent("A credential with this label already exists.");
  });

  it("each provider's scope-guidance copy links to that provider's own token page", () => {
    renderTab({ credentialsController: { isFormOpen: true, providerId: "cloudflare-pages" } });
    const link = screen.getByRole("link", { name: "Create a token" });
    expect(link).toHaveAttribute("href", "https://dash.cloudflare.com/profile/api-tokens");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("ADD mode: the 'set as default' checkbox is hidden when this would be the provider's only connection", () => {
    renderTab({ credentialsController: { isFormOpen: true, providerId: "github-pages", credentials: [] } });
    expect(screen.queryByRole("checkbox", { name: /Set as default for/ })).not.toBeInTheDocument();
  });

  it("ADD mode: the 'set as default' checkbox appears once another connection for the same provider already exists", () => {
    const setIsDefault = vi.fn();
    renderTab({
      credentialsController: { isFormOpen: true, providerId: "github-pages", credentials: [GH_CREDENTIAL], isDefault: false, setIsDefault },
    });
    const checkbox = screen.getByRole("checkbox", { name: /Set as default for/ });
    expect(checkbox).not.toBeChecked();
    expect(screen.getByText(/Set as default for/)).toBeInTheDocument();
  });

  it("EDIT mode: the checkbox is hidden while editing a provider's only connection, even though editingId matches a saved row", () => {
    renderTab({ credentialsController: { isFormOpen: true, editingId: "cred-1", providerId: "github-pages", credentials: [GH_CREDENTIAL] } });
    expect(screen.queryByRole("checkbox", { name: /Set as default for/ })).not.toBeInTheDocument();
  });

  it("EDIT mode: the checkbox appears when a sibling connection exists, pre-checked from the row's own isDefault", () => {
    const other: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, id: "cred-2", label: "Backup", isDefault: false };
    renderTab({
      credentialsController: {
        isFormOpen: true,
        editingId: "cred-1",
        providerId: "github-pages",
        credentials: [GH_CREDENTIAL, other],
        isDefault: true,
      },
    });
    expect(screen.getByRole("checkbox", { name: /Set as default for/ })).toBeChecked();
  });
});

describe("StaticSiteTab — credential section: AI agent tagging", () => {
  it("tags the section, add button, and per-row edit/delete controls", () => {
    renderTab({ credentialsController: { credentials: [GH_CREDENTIAL] } });
    expect(document.querySelector('[data-agent-element="deployment-static-site-credentials-add"]')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-static-site-credentials-edit-cred-1"]')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-static-site-credentials-delete-cred-1"]')).toBeInTheDocument();
  });

  it("tags the form's provider/label/token fields and submit/cancel actions", () => {
    renderTab({ credentialsController: { isFormOpen: true } });
    expect(document.querySelector('[data-agent-element="deployment-static-site-credentials-provider"]')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-static-site-credentials-label"]')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-static-site-credentials-token"]')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-static-site-credentials-submit"]')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-static-site-credentials-cancel"]')).toBeInTheDocument();
  });

  it("tags the load-error and hosted-mode notices", () => {
    renderTab({ credentialsController: { loadError: "x" } });
    expect(document.querySelector('[data-agent-element="deployment-static-site-credentials-load-error"]')).toBeInTheDocument();

    renderTab({ credentialsController: { executionMode: "hosted-api-only" } });
    expect(document.querySelector('[data-agent-element="deployment-static-site-credentials-hosted-notice"]')).toBeInTheDocument();
  });

  it("tags the per-row Make default button and the form's is-default checkbox", () => {
    const other: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, id: "cred-2", label: "Backup", isDefault: false };
    renderTab({ credentialsController: { credentials: [GH_CREDENTIAL, other] } });
    expect(document.querySelector('[data-agent-element="deployment-static-site-credentials-make-default-cred-2"]')).toBeInTheDocument();

    renderTab({ credentialsController: { isFormOpen: true, providerId: "github-pages", credentials: [GH_CREDENTIAL, other] } });
    expect(document.querySelector('[data-agent-element="deployment-static-site-credentials-is-default"]')).toBeInTheDocument();
  });
});
