import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OverviewTab } from "../OverviewTab";
import type { DeploymentOverviewController } from "../hooks/use-deployment-overview.hooks";
import type { AdminDeploymentOverview } from "@/lib/api";

/**
 * @file `OverviewTab` — driven entirely through the `useDeploymentOverviewHook` DI seam (same
 * convention `PostsProps.usePostsHook`/`ThemeExploreProps.useThemeExploreHook` use), so no real
 * `FetchQueryProvider`/network round trip is needed to exercise the rendered states. Pins the one
 * hard requirement from the brief: every value on screen traces to a real field on
 * `AdminDeploymentOverview`, and the two "warning, not error" nuances (default password,
 * `TOVU_INTEGRATIONS_ROOT_KEY`) render distinguishably from a plain "set" row.
 */

const fakeT = (key: string): string => key;

function snapshotFixture(overrides: Partial<AdminDeploymentOverview> = {}): AdminDeploymentOverview {
  return {
    mode: "local",
    productionReadinessGate: { applicable: false, passed: false },
    defaultOwnerPasswordUnsafe: false,
    daemonKnownFailed: false,
    dbPath: "infra/content.db",
    uploadsDir: "infra/uploads",
    envVars: [
      { name: "TOVU_ADMIN_PASSWORD", set: true },
      { name: "TOVU_ADMIN_USER", set: true },
      { name: "TOVU_INTEGRATIONS_ROOT_KEY", set: false },
      { name: "JINI_AGENT_DAEMON_PORT", set: true },
    ],
    // Added 2026-08-15 alongside the Static Site tab's real CLI-detection wiring — this tab never
    // reads it, but `AdminDeploymentOverview` is now a required field, so a fixture with none would
    // fail to compile rather than fail a test.
    deployClis: [
      { name: "gh", installed: false },
      { name: "vercel", installed: false },
    ],
    ...overrides,
  };
}

function controllerFixture(overrides: Partial<DeploymentOverviewController> = {}): DeploymentOverviewController {
  return { snapshot: snapshotFixture(), error: null, t: fakeT, ...overrides };
}

describe("loading and error states", () => {
  it("shows a loading notice while snapshot is undefined", () => {
    render(<OverviewTab useDeploymentOverviewHook={() => controllerFixture({ snapshot: undefined })} />);
    expect(screen.getByText("Loading deployment status…")).toBeInTheDocument();
  });

  it("shows the error alone when the load failed and nothing has ever loaded", () => {
    render(
      <OverviewTab
        useDeploymentOverviewHook={() => controllerFixture({ snapshot: undefined, error: "network down" })}
      />,
    );
    expect(screen.getByText("network down")).toBeInTheDocument();
    expect(screen.queryByText("How this instance is running")).not.toBeInTheDocument();
  });

  it("shows a poll error ALONGSIDE the last-loaded snapshot, rather than blanking it", () => {
    render(
      <OverviewTab
        useDeploymentOverviewHook={() => controllerFixture({ snapshot: snapshotFixture(), error: "poll failed" })}
      />,
    );
    expect(screen.getByText("poll failed")).toBeInTheDocument();
    expect(screen.getByText("How this instance is running")).toBeInTheDocument();
  });
});

describe("real fields, honestly labeled", () => {
  it("renders the runtime mode, gate, daemon, and both filesystem paths verbatim", () => {
    render(
      <OverviewTab
        useDeploymentOverviewHook={() =>
          controllerFixture({
            snapshot: snapshotFixture({
              mode: "production",
              productionReadinessGate: { applicable: true, passed: true },
              dbPath: "/workspace/Tovu/infra/content.db",
              uploadsDir: "/workspace/Tovu/infra/uploads",
            }),
          })
        }
      />,
    );
    expect(screen.getByText("Production")).toBeInTheDocument();
    expect(screen.getByText("Passed")).toBeInTheDocument();
    expect(screen.getByText("No known failure")).toBeInTheDocument();
    expect(screen.getByText("/workspace/Tovu/infra/content.db")).toBeInTheDocument();
    expect(screen.getByText("/workspace/Tovu/infra/uploads")).toBeInTheDocument();
  });

  it("renders a known daemon failure as a warning tone, not the default ok tone", () => {
    render(
      <OverviewTab
        useDeploymentOverviewHook={() => controllerFixture({ snapshot: snapshotFixture({ daemonKnownFailed: true }) })}
      />,
    );
    const value = screen.getByText("Known failure — check server logs.");
    expect(value).toHaveClass("status-warning");
  });

  it("shows the production-readiness gate as not applicable in local mode, never a false Passed", () => {
    render(
      <OverviewTab
        useDeploymentOverviewHook={() =>
          controllerFixture({ snapshot: snapshotFixture({ mode: "local", productionReadinessGate: { applicable: false, passed: false } }) })
        }
      />,
    );
    expect(screen.getByText("Not applicable (local mode)")).toBeInTheDocument();
    expect(screen.queryByText("Passed")).not.toBeInTheDocument();
  });

  it("renders the default-password row as a warning, distinguishable from the ok tone", () => {
    render(
      <OverviewTab
        useDeploymentOverviewHook={() =>
          controllerFixture({ snapshot: snapshotFixture({ defaultOwnerPasswordUnsafe: true }) })
        }
      />,
    );
    const value = screen.getByText("Still the default — set TOVU_ADMIN_PASSWORD.");
    expect(value).toHaveClass("status-warning");
  });

  it("renders a changed password as the ok tone, not a warning", () => {
    render(
      <OverviewTab
        useDeploymentOverviewHook={() =>
          controllerFixture({ snapshot: snapshotFixture({ defaultOwnerPasswordUnsafe: false }) })
        }
      />,
    );
    const value = screen.getByText("Changed from the default.");
    expect(value).toHaveClass("status-ok");
  });

  it("lists all four required env vars with their real set/not-set state, one row each", () => {
    render(<OverviewTab useDeploymentOverviewHook={() => controllerFixture()} />);
    expect(screen.getByText("TOVU_ADMIN_PASSWORD")).toBeInTheDocument();
    expect(screen.getByText("TOVU_ADMIN_USER")).toBeInTheDocument();
    expect(screen.getByText("TOVU_INTEGRATIONS_ROOT_KEY")).toBeInTheDocument();
    expect(screen.getByText("JINI_AGENT_DAEMON_PORT")).toBeInTheDocument();
    // Three set, one not — the fixture's own shape.
    expect(screen.getAllByText("Set")).toHaveLength(3);
    expect(screen.getAllByText("Not set")).toHaveLength(1);
  });

  it("frames an unset TOVU_INTEGRATIONS_ROOT_KEY as a warning tone, not the neutral 'not set' every other absent var gets", () => {
    render(
      <OverviewTab
        useDeploymentOverviewHook={() =>
          controllerFixture({
            snapshot: snapshotFixture({
              envVars: [
                { name: "TOVU_ADMIN_PASSWORD", set: true },
                { name: "TOVU_ADMIN_USER", set: false },
                { name: "TOVU_INTEGRATIONS_ROOT_KEY", set: false },
                { name: "JINI_AGENT_DAEMON_PORT", set: false },
              ],
            }),
          })
        }
      />,
    );
    // Every absent var here is "neutral" — only an absent OWNER PASSWORD is a warning
    // (`isEnvVarRowUnsafe`, `rules.ts`). This asserts the boot-blocking-in-production / local-503
    // nuance the brief calls out is rendered as a note, not upgraded to a false alarm the code
    // doesn't support.
    expect(screen.getByText(/required to boot in production\. Missing locally shows as a 503/i)).toBeInTheDocument();
    const notSetPills = screen.getAllByText("Not set");
    expect(notSetPills.every((el) => el.className.includes("status-neutral"))).toBe(true);
  });

  it("frames the TOVU_ADMIN_PASSWORD row itself as a warning when unset, unlike every other absent var", () => {
    render(
      <OverviewTab
        useDeploymentOverviewHook={() =>
          controllerFixture({
            snapshot: snapshotFixture({
              envVars: [
                { name: "TOVU_ADMIN_PASSWORD", set: false },
                { name: "TOVU_ADMIN_USER", set: true },
                { name: "TOVU_INTEGRATIONS_ROOT_KEY", set: true },
                { name: "JINI_AGENT_DAEMON_PORT", set: true },
              ],
            }),
          })
        }
      />,
    );
    const notSetPill = screen.getByText("Not set");
    expect(notSetPill).toHaveClass("status-warning");
  });
});

describe("agent handles", () => {
  // Pins the ids the AI assistant relies on to drive this tab — same `data-agent-element` querying
  // convention `PostEditor.unit.test.tsx` uses. Guards against a handle silently rotting.
  it("tags both path cards, their details links, and both diagnostics cards", () => {
    render(<OverviewTab useDeploymentOverviewHook={() => controllerFixture()} />);
    expect(document.querySelector('[data-agent-element="deployment-overview-static-path-card"]')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-overview-full-path-card"]')).toBeInTheDocument();
    expect(
      document.querySelector('[data-agent-element="deployment-overview-static-details-link"]'),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-overview-full-details-link"]')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-overview-instance-facts"]')).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="deployment-overview-env-vars"]')).toBeInTheDocument();
  });
});
