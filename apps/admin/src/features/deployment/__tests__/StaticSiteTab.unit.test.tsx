import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StaticSiteTab } from "../StaticSiteTab";
import type { StaticExportController } from "../hooks/use-static-export.hooks";
import type { StaticPublishController } from "../hooks/use-static-publish.hooks";
import type { DeploymentOverviewController } from "../hooks/use-deployment-overview.hooks";
import type { PublishCredentialRowState, PublishCredentialsController } from "../hooks/use-publish-credentials.hooks";
import type { AdminPublishCredentialProviderId, AdminPublishCredentialSummary } from "@/lib/api";
import { PUBLISH_CLI_TOOLS, PUBLISH_CREDENTIAL_PROVIDERS, STATIC_HOSTS, STATIC_SITE_CAPABILITIES } from "../rules";

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
    pollError: null,
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
    pollError: null,
    publishError: null,
    publishing: false,
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
  label: "default",
  configured: true,
  isDefault: true,
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-15T09:30:00.000Z",
  accountLabel: null,
};

/** One provider row, blank/not-connected unless overridden — mirrors
 *  `use-publish-credentials.hooks.ts`'s own `PublishCredentialRowState` shape exactly, since the
 *  fixture below builds one row per {@link PUBLISH_CREDENTIAL_PROVIDERS} entry from a list of these. */
function credentialRowFixture(providerId: AdminPublishCredentialProviderId, overrides: Partial<PublishCredentialRowState> = {}): PublishCredentialRowState {
  return {
    providerId,
    saved: undefined,
    token: "",
    accountId: "",
    saving: false,
    error: null,
    verifying: false,
    verification: undefined,
    verifyError: null,
    ...overrides,
  };
}

/** `credentialsControllerFixture`'s own override shape — `rows` widened to a mutable array (the real
 *  controller's `rows` is `readonly`, which a fixture literal need not preserve) plus `rowOverrides`,
 *  the per-provider shorthand {@link credentialsControllerFixture}'s own doc explains. */
type CredentialsControllerFixtureOverrides = Partial<Omit<PublishCredentialsController, "rows">> & {
  rows?: PublishCredentialRowState[];
  rowOverrides?: Partial<Record<AdminPublishCredentialProviderId, Partial<PublishCredentialRowState>>>;
};

/** Builds the full four-row `rows` array a real hook load would produce, applying `rowOverrides` (by
 *  provider id) to just the rows a test cares about — every OTHER row stays a blank, not-connected
 *  default so a test asserting on one provider's row is never accidentally passing because a sibling
 *  row happened to satisfy the same assertion. */
function credentialsControllerFixture(overrides: CredentialsControllerFixtureOverrides = {}): PublishCredentialsController {
  const { rows, rowOverrides, ...rest } = overrides;
  const finalRows = rows ?? PUBLISH_CREDENTIAL_PROVIDERS.map((provider) => credentialRowFixture(provider.id, rowOverrides?.[provider.id]));
  return {
    rows: finalRows,
    executionMode: "self-hosted-cli",
    loadError: null,
    setToken: vi.fn(),
    setAccountId: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
    // Defaults to "this provider's own row's `saved` credential, if any" — enough for the picker's
    // "renders nothing below two options" default path; a test exercising the picker's multi-option
    // rendering overrides this directly rather than fighting `rows`/`rowOverrides` to imply a second
    // credential that `saved` (always the DEFAULT one) could never represent on its own.
    credentialsForProvider: (providerId) => {
      const row = finalRows.find((r) => r.providerId === providerId);
      return row?.saved ? [row.saved] : [];
    },
    selectCredential: vi.fn().mockResolvedValue(undefined),
    verify: vi.fn().mockResolvedValue(undefined),
    t: fakeT,
    ...rest,
  };
}

function renderTab(overrides: {
  exportController?: Partial<StaticExportController>;
  publishController?: Partial<StaticPublishController>;
  overviewController?: Partial<DeploymentOverviewController>;
  credentialsController?: CredentialsControllerFixtureOverrides;
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

describe("StaticSiteTab — CopyLine's copy button", () => {
  // `CopyLine`'s own `copy()` was never invoked by any existing test here — every existing test
  // renders the tab but none clicks a Copy button. jsdom has no real Clipboard implementation, so
  // `navigator.clipboard` is stubbed per test.
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("writes the export command to the clipboard and swaps the label to 'Copied!'", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    renderTab();

    const button = screen.getByRole("button", { name: "Copy the export command" });
    expect(button).toHaveTextContent("Copy");
    await user.click(button);

    expect(writeText).toHaveBeenCalledWith("tovu export <dir>");
    expect(button).toHaveTextContent("Copied!");
  });

  it("reverts the label back to 'Copy' 1500ms after a successful copy", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    renderTab();

    const button = screen.getByRole("button", { name: "Copy the export command" });
    // fireEvent + a flushed microtask, not userEvent — userEvent's own internal delay logic fights
    // fake timers here (the interaction hung for the full 5s test timeout rather than resolving).
    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(button).toHaveTextContent("Copied!");

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(button).toHaveTextContent("Copy");
  });

  it("swallows a denied clipboard permission without crashing or changing the label", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error("permission denied"));
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    renderTab();

    const button = screen.getByRole("button", { name: "Copy the export command" });
    await user.click(button);

    expect(writeText).toHaveBeenCalled();
    expect(button).toHaveTextContent("Copy");
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

  it("REGRESSION: surfaces a poll error instead of leaving a silent stuck spinner — pollError existed on the hook but was never rendered anywhere on this tab before this pass", () => {
    renderTab({ exportController: { pollError: "Lost track of this export's status and stopped checking." } });
    expect(screen.getByText("Lost track of this export's status and stopped checking.")).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-static-site-export-poll-error"]')).toBeInTheDocument();
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

  // REWRITTEN 2026-08-16 (step-flow redesign): a "no CLI-first path" note used to stand in for the
  // (hidden, "Advanced") credential form below it. Now that Step 1 renders open and immediately
  // visible, the note is redundant — there is nothing left to explain, since Step 1 already speaks
  // for itself as the one thing to do. Pinning instead that no CLI block/"or" divider render at all
  // for a provider with no CLI route, and Step 1 shows up directly.
  it("netlify: no CLI row, no 'Fastest' block, no 'or' divider — Step 1 renders directly, no target-specific field", () => {
    renderTab({ publishController: { target: "netlify" } });
    expect(screen.getByRole("tab", { name: "Netlify" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("gh")).not.toBeInTheDocument();
    expect(screen.queryByText("vercel")).not.toBeInTheDocument();
    expect(screen.queryByText("Fastest — ask the assistant")).not.toBeInTheDocument();
    expect(screen.queryByText("or")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Connect/, level: 3 })).toHaveTextContent("Netlify");
    expect(screen.queryByLabelText("GitHub owner or org")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Vercel team/)).not.toBeInTheDocument();
  });

  it("cloudflare-pages: no CLI row, no 'Fastest' block, no 'or' divider — Step 1 renders directly", () => {
    renderTab({ publishController: { target: "cloudflare-pages" } });
    expect(screen.getByRole("tab", { name: "Cloudflare Pages" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("gh")).not.toBeInTheDocument();
    expect(screen.queryByText("vercel")).not.toBeInTheDocument();
    expect(screen.queryByText("Fastest — ask the assistant")).not.toBeInTheDocument();
    expect(screen.queryByText("or")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Connect/, level: 3 })).toHaveTextContent("Cloudflare Pages");
  });
});

// NEW 2026-08-16 — the tab bar's own "connected" dot. Added alongside the credential-section
// collapse above: once only the SELECTED provider's row is ever on screen, "which providers have I
// already connected" is no longer visible by scrolling past the other three rows the way it used to
// be, so it has to live somewhere else that's visible from every tab. `TabBarTab.dot`/`dotLabel`
// (`TabBar.tsx`) is that somewhere else — driven here off `credentialsController.rows`, never off
// component state of its own, so it can never show a dot the credential rows themselves disagree
// with.
describe("StaticSiteTab — publish-target tab bar: connected indicator", () => {
  it("shows a dot on a tab whose provider has a saved credential, with 'Connected' in that tab's own accessible name", () => {
    renderTab({ credentialsController: { rowOverrides: { "github-pages": { saved: GH_CREDENTIAL } } } });
    const ghTab = screen.getByRole("tab", { name: /GitHub Pages/ });
    expect(ghTab).toHaveAccessibleName(/Connected/);
    expect(ghTab.querySelector(".tab-bar-dot")).toBeInTheDocument();
  });

  it("shows no dot, and no 'Connected' in the accessible name, for a tab with nothing saved", () => {
    renderTab();
    const vercelTab = screen.getByRole("tab", { name: "Vercel" });
    expect(vercelTab).not.toHaveAccessibleName(/Connected/);
    expect(vercelTab.querySelector(".tab-bar-dot")).not.toBeInTheDocument();
  });

  it("reflects more than one connected provider at once — dots are independent per tab, not a single global flag", () => {
    renderTab({
      credentialsController: {
        rowOverrides: {
          "github-pages": { saved: GH_CREDENTIAL },
          netlify: { saved: { ...GH_CREDENTIAL, providerId: "netlify" } },
        },
      },
    });
    expect(screen.getByRole("tab", { name: /GitHub Pages/ })).toHaveAccessibleName(/Connected/);
    expect(screen.getByRole("tab", { name: /Netlify/ })).toHaveAccessibleName(/Connected/);
    expect(screen.getByRole("tab", { name: "Vercel" })).not.toHaveAccessibleName(/Connected/);
    expect(screen.getByRole("tab", { name: "Cloudflare Pages" })).not.toHaveAccessibleName(/Connected/);
  });

  it("shows no dots anywhere while credentials are still loading — never a false 'connected' guess", () => {
    renderTab({ credentialsController: { rows: undefined, executionMode: undefined } });
    expect(document.querySelectorAll(".tab-bar-dot")).toHaveLength(0);
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

  // REGRESSION (U1, owner-reported 2026-08-15): the row read "GitHub CLI · gh · Detected on this
  // server" directly above a copy line that STILL said "Install the GitHub CLI, then confirm it's
  // on my PATH." — install instructions for a tool the row itself just said was already there. The
  // fix (`publishAssistantRequest` in rules.ts) is keyed on the same `installed` boolean the pill
  // above renders, and is deliberately not GitHub-specific — checked against BOTH CLI-backed
  // providers here, not only the one the owner happened to report.
  it("REGRESSION (U1): a DETECTED CLI's copy line asks to use the tool, never to install it — github-pages", () => {
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
    expect(screen.queryByText(/Install the GitHub CLI/)).not.toBeInTheDocument();
    expect(screen.getByText("Publish my static export to GitHub Pages with the GitHub CLI.")).toBeInTheDocument();
  });

  it("REGRESSION (U1): a DETECTED CLI's copy line asks to use the tool, never to install it — vercel", () => {
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
    expect(screen.getByText("Detected on this server")).toBeInTheDocument();
    expect(screen.queryByText(/Install the Vercel CLI/)).not.toBeInTheDocument();
    expect(screen.getByText("Publish my static export to Vercel with the Vercel CLI.")).toBeInTheDocument();
  });

  it("REGRESSION (U1): a NOT-detected CLI's copy line still asks to install it", () => {
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
    expect(screen.getByText("Install the GitHub CLI, then confirm it's on my PATH.")).toBeInTheDocument();
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

  it("REGRESSION (C4): the Publish button disables from `publishing` alone, before any run confirms isPublishing — the window a double-click could otherwise slip a second POST through", () => {
    // `publishing: true, isPublishing: false` is exactly the state between clicking Publish and the
    // POST's response arriving — pre-fix, `busy` only read `isPublishing`, so the button stayed
    // enabled for that whole window even though a publish was already in flight.
    renderTab({ publishController: { target: "vercel", projectName: "my-site", isPublishing: false, publishing: true } });
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
    // The alert itself must never render the failure message as a clickable link — it does not
    // matter that the credential section elsewhere on this tab has its own, unrelated "Create a
    // token" links (one per provider row, always rendered — see that section's own tests).
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("VERCEL_TOKEN is not set");
    expect(within(alert).queryByRole("link")).not.toBeInTheDocument();
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

  it("REGRESSION: surfaces a poll error instead of leaving a silent stuck spinner — pollError existed on the hook but was never rendered anywhere on this tab before this pass", () => {
    renderTab({ publishController: { pollError: "Lost track of this publish's status and stopped checking." } });
    expect(screen.getByText("Lost track of this publish's status and stopped checking.")).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-static-site-publish-poll-error"]')).toBeInTheDocument();
  });

  it("names the destination section distinctly from the credential section above it, with an explanation of the difference", () => {
    renderTab();
    expect(screen.getByText("Where this publish goes")).toBeInTheDocument();
    expect(
      screen.getByText("The account above only proves you're allowed to publish — this says exactly where this one goes.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Publish directly from here")).not.toBeInTheDocument();
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
  it("shows a brief loading line, not either disclosure, while rows/executionMode are unresolved", () => {
    renderTab({ credentialsController: { rows: undefined, executionMode: undefined } });
    expect(screen.getByText("Loading credentials…")).toBeInTheDocument();
    expect(screen.queryByText(/Advanced: publish with server-side provider credentials/)).not.toBeInTheDocument();
    expect(screen.queryByText(/This workspace cannot use your computer's terminal/)).not.toBeInTheDocument();
  });

  it("surfaces a load error instead of either disclosure", () => {
    renderTab({ credentialsController: { rows: undefined, executionMode: undefined, loadError: "could not reach the server" } });
    expect(screen.getByText("could not reach the server")).toBeInTheDocument();
    expect(screen.queryByText("Loading credentials…")).not.toBeInTheDocument();
  });
});

describe("StaticSiteTab — credential section: executionMode disclosure", () => {
  // REWRITTEN 2026-08-16 (numbered-step pass): disclosure no longer depends on `executionMode` at
  // all — there is no "Advanced" `<details>` left anywhere in this section. It now depends on
  // `row.saved`: not-yet-connected renders open and plain (`CredentialStepTodo`, no `<details>`),
  // connected renders collapsed behind a real `<details>` (`CredentialStepDone`). `executionMode`'s
  // only remaining job is which SUBTITLE the not-yet-connected step shows (`credentialStepSubtitleKey`
  // in `StaticSiteTab.tsx`) — see that function's own doc for why it keys off the workspace's terminal
  // reachability, not the selected provider's own CLI availability.
  it("self-hosted-cli: the not-yet-connected step is a plain, always-open block — no <details> anywhere, and the CLI-oriented subtitle, not the hosted-only notice", () => {
    renderTab({ credentialsController: { executionMode: "self-hosted-cli" } });
    expect(screen.getByText("Save a personal access token so Tovu can publish on your behalf.")).toBeInTheDocument();
    expect(
      screen.queryByText("This workspace can't use your computer's terminal — connecting here is the only way to publish.")
    ).not.toBeInTheDocument();
    expect(document.querySelector("details")).toBeNull();
  });

  it("hosted-api-only: the not-yet-connected step shows the 'only way to publish' subtitle instead — still no <details>, since the step is still not done", () => {
    renderTab({ credentialsController: { executionMode: "hosted-api-only" } });
    expect(
      screen.getByText("This workspace can't use your computer's terminal — connecting here is the only way to publish.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Save a personal access token so Tovu can publish on your behalf.")).not.toBeInTheDocument();
    expect(document.querySelector("details")).toBeNull();
  });

  // REWRITTEN 2026-08-16 (collapse pass): this used to prove the credential rows render in BOTH
  // modes by counting 4 Save buttons in each — that count was only ever a side effect of the OLD
  // "all four providers, always" contract. The collapse makes exactly one row visible regardless of
  // target, so the thing worth pinning now is that the ONE selected row still renders in both modes
  // (disclosure changes prominence, never hides the row itself) — never that a specific count of
  // rows survives, which the new contract makes false by design.
  it("the selected provider's credential row renders in BOTH executionModes — disclosure changes prominence, never hides the row", () => {
    renderTab({ credentialsController: { executionMode: "self-hosted-cli" } });
    expect(screen.getAllByRole("button", { name: "Save" })).toHaveLength(1);

    renderTab({ credentialsController: { executionMode: "hosted-api-only" } });
    expect(screen.getAllByRole("button", { name: "Save" }).length).toBeGreaterThanOrEqual(1);
  });
});

describe("StaticSiteTab — credential section: rows", () => {
  // REWRITTEN 2026-08-16 (collapse pass, owner-approved): the credential section used to render one
  // row per provider SIMULTANEOUSLY, regardless of the selected publish target — the "wall of four
  // ACCESS TOKEN boxes" that was a large part of the owner's "it looks just awful" verdict on this
  // tab. It now renders exactly ONE row: whichever provider is currently selected on the tab bar
  // above. This test pins the new contract directly — the selected provider's row is present, and
  // every OTHER provider's row (by name) is absent — plus the "no leftover add/edit chrome" half of
  // the original assertion, unchanged.
  // REWRITTEN 2026-08-16 (numbered-step pass): `.deployment-credential-row-name` and the "Not
  // connected" pill both belonged to the OLD per-row markup this pass replaced. The stable contract
  // to pin against now is the agent-element tag `PublishCredentialsSection` puts on whichever row is
  // selected (`deployment-static-site-credentials-row-<id>`, `agentHandle` in `StaticSiteTab.tsx`) —
  // it exists for exactly one provider at a time and nowhere else, same guarantee the old class
  // selector was standing in for.
  it("renders exactly one row — the selected provider's — never the other three; no 'Add credential' button, no provider picker, no label field anywhere", () => {
    renderTab();
    const ghRow = document.querySelector('[data-agent-element="deployment-static-site-credentials-row-github-pages"]');
    expect(ghRow).toBeInTheDocument();
    expect(within(ghRow as HTMLElement).getByText("GitHub Pages")).toBeInTheDocument();
    for (const provider of PUBLISH_CREDENTIAL_PROVIDERS.filter((p) => p.id !== "github-pages")) {
      expect(document.querySelector(`[data-agent-element="deployment-static-site-credentials-row-${provider.id}"]`)).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Add credential" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Provider")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Label")).not.toBeInTheDocument();
  });

  // REWRITTEN 2026-08-16: switching the publish-target tab is what decides which row shows now
  // (there is no longer a "credential picker" separate from the publish-target picker) — this pins
  // that the row swaps with the tab, by its agent-element tag, in both directions.
  it("switching the publish-target tab swaps which provider's credential row is shown", () => {
    const { rerender } = renderTab({ publishController: { target: "github-pages" } });
    expect(document.querySelector('[data-agent-element="deployment-static-site-credentials-row-github-pages"]')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-static-site-credentials-row-vercel"]')).not.toBeInTheDocument();

    rerender(
      <StaticSiteTab
        useStaticExportHook={() => exportControllerFixture()}
        useStaticPublishHook={() => publishControllerFixture({ target: "vercel" })}
        useDeploymentOverviewHook={() => overviewControllerFixture()}
        usePublishCredentialsHook={() => credentialsControllerFixture()}
      />,
    );
    expect(document.querySelector('[data-agent-element="deployment-static-site-credentials-row-vercel"]')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-static-site-credentials-row-github-pages"]')).not.toBeInTheDocument();
  });

  // REWRITTEN 2026-08-16: "Not connected" was the old pill copy; the not-yet-connected step no
  // longer carries a status pill at all — it's the "Connect <label>" step heading itself
  // (`CredentialStepTodo`) that says so. Exactly one row renders now regardless, so the old "was
  // this the only one" half of the assertion no longer needs a length check either.
  it("a not-connected row shows the 'Connect' step heading and a visibly EMPTY token box — no placeholder text standing in for a value", () => {
    renderTab();
    expect(screen.getByRole("heading", { name: /Connect/, level: 3 })).toHaveTextContent("GitHub Pages");
    const ghToken = screen.getByLabelText("Access token", { selector: "#deployment-static-site-credentials-token-github-pages" });
    expect(ghToken).toHaveValue("");
    expect(ghToken).not.toHaveAttribute("placeholder");
  });

  // REWRITTEN 2026-08-16 + U3 fix (2026-08-15 owner report): "Connected · updated <date>" was the
  // old pill copy. The connected step now reads "<label> connected · token stored, encrypted · saved
  // <date>" — "saved", never "updated": this is the moment the row was WRITTEN, not a liveness check
  // Tovu actually performed, and a revoked token would show the exact same timestamp. Scoped to the
  // row's own agent-element tag rather than a bare text search, since "connected" and dates can
  // otherwise collide with the tab bar's own visually-hidden dot label (`TabBarTab.dot`'s doc).
  it("a connected row's summary reads '<label> connected · token stored, encrypted · saved <date>' — never 'updated' — and the token input still starts blank, never read back", () => {
    renderTab({ credentialsController: { rowOverrides: { "github-pages": { saved: GH_CREDENTIAL } } } });
    const ghRow = document.querySelector('[data-agent-element="deployment-static-site-credentials-row-github-pages"]') as HTMLElement;
    expect(within(ghRow).getByText(/connected/)).toBeInTheDocument();
    expect(within(ghRow).getByText(/token stored, encrypted/)).toBeInTheDocument();
    expect(within(ghRow).getByText(/saved/)).toBeInTheDocument();
    expect(within(ghRow).getByText(/2026-08-15/)).toBeInTheDocument();
    expect(within(ghRow).queryByText(/updated/)).not.toBeInTheDocument();
    const ghToken = screen.getByLabelText("Access token", { selector: "#deployment-static-site-credentials-token-github-pages" });
    expect(ghToken).toHaveValue("");
    expect(ghToken).not.toHaveAttribute("placeholder");
  });

  it("a connected row's hint reads 'leave blank to keep the current token', below the field", () => {
    renderTab({
      publishController: { target: "vercel" },
      credentialsController: { rowOverrides: { vercel: { saved: { ...GH_CREDENTIAL, providerId: "vercel" } } } },
    });
    expect(screen.getByText(/Leave blank to keep the current token/)).toBeInTheDocument();
  });

  it("a not-connected row's hint never claims a token is already stored — the connected-only copy is absent", () => {
    renderTab(); // nothing connected anywhere on this render
    expect(screen.queryByText(/Leave blank to keep the current token/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Stored encrypted on the server/).length).toBeGreaterThan(0);
  });

  it("typing into the selected row's token input calls setToken with that provider's own id", async () => {
    const user = userEvent.setup();
    const setToken = vi.fn();
    renderTab({ publishController: { target: "vercel" }, credentialsController: { setToken } });
    await user.type(screen.getByLabelText("Access token", { selector: "#deployment-static-site-credentials-token-vercel" }), "x");
    expect(setToken).toHaveBeenCalledWith("vercel", "x");
  });

  it("github-pages (the default target) shows no Account ID field — only cloudflare-pages has that second connection field", () => {
    renderTab();
    expect(screen.queryByLabelText("Account ID")).not.toBeInTheDocument();
  });

  it("cloudflare-pages shows the required Account ID field, and typing into it calls setAccountId('cloudflare-pages', value)", async () => {
    const user = userEvent.setup();
    const setAccountId = vi.fn();
    renderTab({ publishController: { target: "cloudflare-pages" }, credentialsController: { setAccountId } });
    const accountField = screen.getByLabelText("Account ID");
    expect(accountField).toHaveValue("");
    expect(accountField).not.toHaveAttribute("placeholder");
    await user.type(accountField, "a");
    expect(setAccountId).toHaveBeenCalledWith("cloudflare-pages", "a");
  });

  // REWRITTEN 2026-08-16: `.closest("li")` scoped to the old markup's per-row `<li>` wrapper, which
  // no longer exists — `CredentialStepTodo`/`CredentialStepDone` render their `.deployment-step`
  // directly, no list wrapper. Scoping is no longer needed anyway: exactly one row is ever on
  // screen, so its one Save button is already unambiguous without a `.closest()` lookup.
  it("clicking Save on the selected provider's row calls save with that provider's own id", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(undefined);
    renderTab({ publishController: { target: "netlify" }, credentialsController: { rowOverrides: { netlify: { token: "tok" } }, save } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenCalledWith("netlify");
  });

  it("Save is disabled until the selected row's own required fields are filled — a blank token never enables it", () => {
    renderTab({ publishController: { target: "vercel" }, credentialsController: { rowOverrides: { vercel: { token: "" } } } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("cloudflare-pages' Save stays disabled with a token but no accountId yet", () => {
    renderTab({ publishController: { target: "cloudflare-pages" }, credentialsController: { rowOverrides: { "cloudflare-pages": { token: "tok", accountId: "" } } } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  // REWRITTEN 2026-08-16: the original point of this test was "saving one row does not disturb a
  // sibling row" — with the collapse, sibling rows no longer render at all, so that half of the
  // assertion has no equivalent to keep (there is nothing left to prove uninvolved, since there is
  // nothing else on screen). What still holds and is worth pinning: the SELECTED row shows its own
  // busy state correctly.
  it("shows the busy label and disables Save on the selected row while it is saving", () => {
    renderTab({ publishController: { target: "vercel" }, credentialsController: { rowOverrides: { vercel: { token: "tok", saving: true } } } });
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("surfaces a row's own error as an alert, scoped to that row", () => {
    renderTab({ publishController: { target: "netlify" }, credentialsController: { rowOverrides: { netlify: { error: "could not reach the server" } } } });
    expect(screen.getByRole("alert")).toHaveTextContent("could not reach the server");
  });

  it("the selected provider's scope-guidance copy links to that provider's own token page — github-pages by default", () => {
    renderTab();
    const link = screen.getByRole("link", { name: "Create a token" });
    expect(link).toHaveAttribute("href", "https://github.com/settings/tokens");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("switching to cloudflare-pages links its OWN token page, not github-pages' leftover from the default tab", () => {
    renderTab({ publishController: { target: "cloudflare-pages" } });
    expect(screen.getByRole("link", { name: "Create a token" })).toHaveAttribute("href", "https://dash.cloudflare.com/profile/api-tokens");
  });
});

describe("StaticSiteTab — credential section: AI agent tagging", () => {
  // REWRITTEN 2026-08-16: this used to render all four providers' rows at once and assert every
  // one of their agent-element tags in a single pass. The collapse means only the SELECTED
  // provider's tags exist at any one render — this now switches the target per provider and checks
  // that provider's own tags each time, which still proves every provider's row carries the right
  // tag, just one render per provider instead of one render for all four.
  it("tags the selected provider's own row/token/save elements, per provider", () => {
    for (const provider of PUBLISH_CREDENTIAL_PROVIDERS) {
      const { unmount } = renderTab({ publishController: { target: provider.id } });
      expect(document.querySelector(`[data-agent-element="deployment-static-site-credentials-row-${provider.id}"]`)).toBeInTheDocument();
      expect(document.querySelector(`[data-agent-element="deployment-static-site-credentials-token-${provider.id}"]`)).toBeInTheDocument();
      expect(document.querySelector(`[data-agent-element="deployment-static-site-credentials-save-${provider.id}"]`)).toBeInTheDocument();
      unmount();
    }
  });

  // RESTORED 2026-08-16 (owner-directed): briefly lost when the numbered-step redesign gave
  // `PublishCredentialsSection` four different top-level return shapes with no shared wrapper (a
  // loading `<p>`, an error `<p>`, `CredentialStepTodo`'s `<div>`, `CredentialStepDone`'s
  // `<details>`) — the old suite's single-state check on this tag quietly stopped matching anything
  // and nobody noticed until this pass. Restored as its own function
  // (`publishCredentialsSectionContent` inside `PublishCredentialsSection`, `StaticSiteTab.tsx`) so
  // the wrap can't drift out of sync with a state again — this test asserts the tag directly in ALL
  // FOUR states in one place, which the old suite never did (its own single-state check is exactly
  // what let the gap go unnoticed). Matters beyond this file: the coming repo picker is meant to
  // navigate this page via `data-agent-element` tagging, and a region tag missing in even one state
  // reads to an agent as "not on this page" rather than "not in this state right now".
  it("tags the whole credential section — present in all four states: loading, load-error, not-connected, connected", () => {
    const sectionSelector = '[data-agent-element="deployment-static-site-credentials-section"]';

    const loading = renderTab({ credentialsController: { rows: undefined, executionMode: undefined } });
    expect(document.querySelector(sectionSelector)).toBeInTheDocument();
    loading.unmount();

    const loadError = renderTab({ credentialsController: { rows: undefined, executionMode: undefined, loadError: "x" } });
    expect(document.querySelector(sectionSelector)).toBeInTheDocument();
    loadError.unmount();

    const notConnected = renderTab();
    expect(document.querySelector(sectionSelector)).toBeInTheDocument();
    notConnected.unmount();

    renderTab({ credentialsController: { rowOverrides: { "github-pages": { saved: GH_CREDENTIAL } } } });
    expect(document.querySelector(sectionSelector)).toBeInTheDocument();
  });

  it("tags cloudflare-pages' own Account ID field only, and only once cloudflare-pages is the selected tab", () => {
    const first = renderTab({ publishController: { target: "cloudflare-pages" } });
    expect(document.querySelector('[data-agent-element="deployment-static-site-credentials-account-cloudflare-pages"]')).toBeInTheDocument();
    first.unmount();

    renderTab({ publishController: { target: "github-pages" } });
    expect(document.querySelector('[data-agent-element="deployment-static-site-credentials-account-github-pages"]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-static-site-credentials-account-cloudflare-pages"]')).not.toBeInTheDocument();
  });

  // REWRITTEN 2026-08-16: the "hosted-mode notice" was its own tagged element under the old
  // "Advanced" disclosure design. It has no equivalent element anymore — the hosted-only wording is
  // now just `credentialStepSubtitleKey`'s text inside the SAME row region the triad above already
  // tags, not a second, separately-tagged notice. Pinning the text is `credential section:
  // executionMode disclosure`'s job (above); this keeps only the load-error half, which is still a
  // real, separately-tagged element.
  it("tags the load-error notice", () => {
    renderTab({ credentialsController: { loadError: "x" } });
    expect(document.querySelector('[data-agent-element="deployment-static-site-credentials-load-error"]')).toBeInTheDocument();
  });
});

// Three owner-reported bugs (2026-08-15) on the connected credential row's `<details>` summary.
// U1's own regression coverage lives in `real CLI detection` above, next to the fixtures it needs.
describe("StaticSiteTab — REGRESSION: connected summary affordance + copy (owner-reported 2026-08-15)", () => {
  it("REGRESSION (U2): the connected summary exposes a visible, discoverable expand affordance — a 'Replace token' label plus a chevron, not just an unlabeled clickable row", () => {
    renderTab({ credentialsController: { rowOverrides: { "github-pages": { saved: GH_CREDENTIAL } } } });
    const row = document.querySelector('[data-agent-element="deployment-static-site-credentials-row-github-pages"]') as HTMLElement;
    const summary = row.querySelector("summary") as HTMLElement;
    expect(summary).not.toBeNull();
    expect(within(summary).getByText("Replace token")).toBeInTheDocument();
    expect(summary.querySelector("svg")).toBeInTheDocument();
  });

  it("REGRESSION (U3): the connected summary says 'saved', not 'updated' — this is the moment the row was WRITTEN, not a liveness check, and a revoked token would show this exact same timestamp", () => {
    renderTab({ credentialsController: { rowOverrides: { "github-pages": { saved: GH_CREDENTIAL } } } });
    const row = document.querySelector('[data-agent-element="deployment-static-site-credentials-row-github-pages"]') as HTMLElement;
    expect(within(row).getByText(/saved/)).toBeInTheDocument();
    expect(within(row).queryByText(/updated/)).not.toBeInTheDocument();
  });
});

// The gap `development/e2e/deployment-static-site-verify-gap.spec.ts` reproduces live: the assistant's
// own guidance told a human to "hit verify on the token" here, and no such control existed. Closed by
// `CredentialVerifyAction` inside `CredentialStepDone`'s `<summary>` — see that component's own doc.
describe("StaticSiteTab — REGRESSION: Verify control on the connected credential row (2026-08-16 live gap)", () => {
  it("renders a Verify button on the connected row and calls controller.verify with that row's providerId — without toggling the details open", async () => {
    const verify = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderTab({ credentialsController: { rowOverrides: { "github-pages": { saved: GH_CREDENTIAL } }, verify } });

    const row = document.querySelector('[data-agent-element="deployment-static-site-credentials-row-github-pages"]') as HTMLElement;
    const details = row.closest("details") ?? row;
    expect(details.hasAttribute("open")).toBe(false);

    const verifyButton = within(row).getByRole("button", { name: /verify/i });
    await user.click(verifyButton);

    expect(verify).toHaveBeenCalledWith("github-pages");
    expect(details.hasAttribute("open")).toBe(false); // the click must not also expand "Replace token"
  });

  it("shows 'Verifying…' and disables the button while a verify is in flight", () => {
    renderTab({ credentialsController: { rowOverrides: { "github-pages": { saved: GH_CREDENTIAL, verifying: true } } } });
    const row = document.querySelector('[data-agent-element="deployment-static-site-credentials-row-github-pages"]') as HTMLElement;
    const verifyButton = within(row).getByRole("button", { name: /verifying/i });
    expect(verifyButton).toBeDisabled();
  });

  it("shows the provider's own verification message once a check resolves", () => {
    renderTab({
      credentialsController: {
        rowOverrides: {
          "github-pages": {
            saved: GH_CREDENTIAL,
            verification: { status: "invalid", message: "GitHub rejected this credential (HTTP 401).", checkedAt: "2026-08-16T00:00:00.000Z" },
          },
        },
      },
    });
    const row = document.querySelector('[data-agent-element="deployment-static-site-credentials-row-github-pages"]') as HTMLElement;
    expect(within(row).getByText("GitHub rejected this credential (HTTP 401).")).toBeInTheDocument();
  });

  it("shows a translated transport-failure message, distinct from a provider verification result", () => {
    renderTab({
      credentialsController: { rowOverrides: { "github-pages": { saved: GH_CREDENTIAL, verifyError: "Could not verify this token (network down)." } } },
    });
    const row = document.querySelector('[data-agent-element="deployment-static-site-credentials-row-github-pages"]') as HTMLElement;
    expect(within(row).getByText("Could not verify this token (network down).")).toBeInTheDocument();
  });

  it("surfaces the row's persisted accountLabel in the summary once it is set — durable across a restart, not tied to a fresh verify click", () => {
    renderTab({ credentialsController: { rowOverrides: { "github-pages": { saved: { ...GH_CREDENTIAL, accountLabel: "leonaburime-ucla" } } } } });
    const row = document.querySelector('[data-agent-element="deployment-static-site-credentials-row-github-pages"]') as HTMLElement;
    expect(within(row).getByText(/connected as/i)).toBeInTheDocument();
    expect(within(row).getByText("leonaburime-ucla")).toBeInTheDocument();
  });

  it("shows no 'connected as' text when the row has never been verified (accountLabel: null)", () => {
    renderTab({ credentialsController: { rowOverrides: { "github-pages": { saved: GH_CREDENTIAL } } } });
    const row = document.querySelector('[data-agent-element="deployment-static-site-credentials-row-github-pages"]') as HTMLElement;
    expect(within(row).queryByText(/connected as/i)).not.toBeInTheDocument();
  });
});

describe("StaticSiteTab — the 'which saved token publishes' picker (owner's original ask: 'GitHub pages... will have a dropdown where you can choose which GitHub access tokens')", () => {
  const PRIMARY: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, id: "cred-1", label: "primary" };
  const BACKUP: AdminPublishCredentialSummary = { ...GH_CREDENTIAL, id: "cred-2", label: "backup", isDefault: false };

  it("renders no picker when the provider has at most one saved credential — nothing to choose between", () => {
    renderTab({ credentialsController: { rowOverrides: { "github-pages": { saved: PRIMARY } } } });
    expect(screen.queryByLabelText(/which saved token publishes/i)).not.toBeInTheDocument();
  });

  it("renders one option per saved credential, and the current default's id is selected", () => {
    renderTab({
      credentialsController: {
        rowOverrides: { "github-pages": { saved: PRIMARY } },
        credentialsForProvider: () => [PRIMARY, BACKUP],
      },
    });
    const picker = screen.getByLabelText(/which saved token publishes/i) as HTMLSelectElement;
    expect(picker.querySelectorAll("option")).toHaveLength(2);
    expect(picker.value).toBe("cred-1");
  });

  it("choosing a different option calls controller.selectCredential with this provider and the chosen credential's id", async () => {
    const selectCredential = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderTab({
      credentialsController: {
        rowOverrides: { "github-pages": { saved: PRIMARY } },
        credentialsForProvider: () => [PRIMARY, BACKUP],
        selectCredential,
      },
    });
    const picker = screen.getByLabelText(/which saved token publishes/i);
    await user.selectOptions(picker, "cred-2");
    expect(selectCredential).toHaveBeenCalledWith("github-pages", "cred-2");
  });
});

// The owner's own words, verbatim: "a button 'create access token' that takes them back to the
// access token tab on the security page." `ManageAccessTokensLink` in `StaticSiteTab.tsx` — one
// real `navigate()` call (`lib/router.ts`), not a mock, matching how `Deployment.unit.test.tsx`
// already proves `handleTabChange`'s own navigate calls: jsdom supports `history.pushState` for
// real, so asserting the URL after a click is a stronger proof than asserting a spy was called.
describe("StaticSiteTab — 'Create access token' cross-link to the Security page (owner's ask)", () => {
  afterEach(() => {
    // Same convention `Deployment.unit.test.tsx` documents for the identical reason: `navigate()`
    // drives real `history.pushState`, so one test's click could otherwise leak into the next.
    window.history.replaceState(null, "", "/");
  });

  it("renders once per card, regardless of which publish target is selected", () => {
    renderTab();
    expect(screen.getByRole("button", { name: "Create access token" })).toBeInTheDocument();
  });

  it("navigates to the Access Tokens tab on the Security page when clicked", async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(screen.getByRole("button", { name: "Create access token" }));
    expect(window.location.pathname).toBe("/admin/access-tokens");
    expect(window.location.search).toBe("?tab=access-tokens");
  });

  it("navigates to the same destination no matter which provider tab is selected — vercel", async () => {
    const user = userEvent.setup();
    renderTab({ publishController: { target: "vercel" } });
    await user.click(screen.getByRole("button", { name: "Create access token" }));
    expect(window.location.pathname).toBe("/admin/access-tokens");
    expect(window.location.search).toBe("?tab=access-tokens");
  });
});
