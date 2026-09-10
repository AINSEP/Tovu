import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { AgentPlugins } from "../AgentPlugins";
import type { AgentPluginsController, InspectedAgentPlugin } from "../hooks/use-agent-plugins.hooks";
import type { AdminAgentPlugin } from "@/lib/api";

/**
 * @file `AgentPlugins` driven entirely through the `useAgentPluginsHook` DI seam — no `fetch` stub,
 * no real port. `use-agent-plugins.hooks.unit.test.ts` covers the hook's OWN load/error behavior
 * against an injected `AgentPluginsPort`; this file covers what the component renders for a given
 * controller state, the same split `use-plugins.hooks.unit.test.ts` / `Plugins.unit.test.tsx`
 * already establish for this feature's sibling screen.
 *
 * REWRITTEN 2026-09-09: this suite used to assert against the static `TOVU_BUNDLED_AGENT_PLUGINS`
 * catalog (a hardcoded "ui-ux-design" entry that is not a real installed Agent Plugin — see
 * `agent-plugin-source-catalog.ts`'s own header). It now asserts against real, injected
 * `AdminAgentPlugin` rows — the same shape `AGENT_PLUGINS_LIST` actually returns.
 */

const SITE_COMPLIANCE: AdminAgentPlugin = {
  pluginId: "site-compliance",
  version: "1.0.0",
  description: "Evidence-based compliance screening.",
  keywords: ["compliance", "gdpr"],
  enabled: true,
  skills: [{ name: "site-compliance", summary: "Screens a site for compliance risk." }],
  mcpServerIds: [],
};

const TOVU_DEPLOY_FLY: AdminAgentPlugin = {
  pluginId: "tovu-deploy-fly",
  version: null,
  description: null,
  keywords: [],
  enabled: false,
  skills: [{ name: "tovu-deploy-fly", summary: "Deploys to fly.io." }],
  mcpServerIds: ["fly-deploy"],
};

/**
 * A fixed-snapshot controller — `inspectPlugin`/`closeInspector` are no-ops, which is correct for
 * every test in the first `describe` block below: none of them click "Inspect package files".
 * Interaction tests that need the inspector to actually open/close use
 * `useStatefulFakeAgentPlugins` (a real `useState`-backed fake) in the second `describe` block
 * instead — same split `AgentPluginDetailsModal.unit.test.tsx`'s static vs. stateful `useDetails`
 * fakes already establish for this feature.
 */
function fakeController(overrides: Partial<AgentPluginsController> = {}): AgentPluginsController {
  return {
    agentPlugins: [SITE_COMPLIANCE, TOVU_DEPLOY_FLY],
    error: null,
    toggleError: null,
    togglingIds: new Set<string>(),
    onToggleEnabled: async () => {},
    inspectedPlugin: null,
    inspectPlugin: () => {},
    closeInspector: () => {},
    t: (key: string) => key,
    locale: "en",
    ...overrides,
  };
}

function renderAgentPlugins(overrides: Partial<AgentPluginsController> = {}) {
  function useFakeAgentPlugins(): AgentPluginsController {
    return fakeController(overrides);
  }
  return render(<AgentPlugins useAgentPluginsHook={useFakeAgentPlugins} />);
}

describe("AgentPlugins", () => {
  it("renders the first horizontal tab as Installed and lists every real installed plugin", () => {
    renderAgentPlugins();
    const installedTab = screen.getByRole("button", { name: "Installed" });
    const marketplaceTab = screen.getByRole("button", { name: "Marketplace" });
    expect(installedTab).toHaveAttribute("aria-pressed", "true");
    expect(installedTab.compareDocumentPosition(marketplaceTab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const complianceCard = screen.getByRole("article", { name: "Site Compliance" });
    expect(within(complianceCard).getByText("Version")).toBeInTheDocument();
    expect(within(complianceCard).getByText("1.0.0")).toBeInTheDocument();
    expect(within(complianceCard).getByText("Enabled")).toBeInTheDocument();
    expect(within(complianceCard).getByText("compliance, gdpr")).toBeInTheDocument();
    expect(within(complianceCard).getByText("site-compliance")).toBeInTheDocument();

    // No version row for a plugin whose installed package carries none — honest omission, not a
    // stale placeholder (same "no invented value" rule the old catalog's own comment stated).
    const deployCard = screen.getByRole("article", { name: "Tovu Deploy Fly" });
    expect(within(deployCard).queryByText("Version")).not.toBeInTheDocument();
    expect(within(deployCard).getByText("Disabled")).toBeInTheDocument();
    expect(within(deployCard).getByText("fly-deploy")).toBeInTheDocument();
  });

  it("shows a loading note while agentPlugins has not yet loaded, and no cards", () => {
    renderAgentPlugins({ agentPlugins: null });
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("shows the load error instead of any card when the port rejects", () => {
    renderAgentPlugins({ agentPlugins: null, error: "failed to load agent plugins" });
    expect(screen.getByRole("status")).toHaveTextContent("failed to load agent plugins");
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("states plainly that an enabled plugin's skills reach the assistant, and offers no install/run action", () => {
    renderAgentPlugins();
    expect(screen.getByRole("note")).toHaveTextContent(/catalogued as installed.*reach the assistant.*enables it/i);
    for (const action of [/^Install$/i, /^Enable$/i, /^Run$/i]) {
      expect(screen.queryByRole("button", { name: action })).not.toBeInTheDocument();
    }
  });

  it("keeps the tab keyboard reachable", async () => {
    renderAgentPlugins();
    const tab = screen.getByRole("button", { name: "Installed" });
    tab.focus();
    await userEvent.keyboard("{Enter}");
    expect(tab).toHaveFocus();
  });

  it("keeps Marketplace explicitly future-only", async () => {
    renderAgentPlugins();
    const marketplaceTab = screen.getByRole("button", { name: "Marketplace" });

    await userEvent.click(marketplaceTab);

    expect(screen.getByRole("note")).toHaveTextContent(
      "Marketplace is planned for a future release. Tovu does not fetch, install, or list marketplace packages yet.",
    );
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    for (const action of [/^Install$/i, /^Enable$/i, /^Run$/i]) {
      expect(screen.queryByRole("button", { name: action })).not.toBeInTheDocument();
    }
  });
});

describe("AgentPlugins inspector (stateful)", () => {
  function useStatefulFakeAgentPlugins(): AgentPluginsController {
    // A minimal, real `useState`-backed fake — mirrors this suite's own precedent
    // (`AgentPluginDetailsModal.unit.test.tsx`'s `useFakeMultiFileDetails`) for a hook fake whose
    // state must actually change across a user interaction, not just describe one fixed snapshot.
    const [inspectedPlugin, setInspectedPlugin] = useState<InspectedAgentPlugin | null>(null);
    return {
      agentPlugins: [SITE_COMPLIANCE],
      error: null,
      toggleError: null,
      togglingIds: new Set<string>(),
      onToggleEnabled: async () => {},
      inspectedPlugin,
      inspectPlugin: setInspectedPlugin,
      closeInspector: () => setInspectedPlugin(null),
      t: (key: string) => key,
      locale: "en",
    };
  }

  it("opens the read-only package inspector for the clicked plugin and closes it", async () => {
    render(<AgentPlugins useAgentPluginsHook={useStatefulFakeAgentPlugins} />);

    await userEvent.click(screen.getByRole("button", { name: "Inspect package files — Site Compliance" }));

    const dialog = screen.getByRole("dialog", { name: /Site Compliance package files preview/i });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // `site-compliance` is not the vendored `ui-ux-design` bundle, so the compile-time source
    // catalog honestly reports nothing to browse — proving the inspector still opens (not that it
    // has files) is this test's job; `AgentPluginDetailsModal.unit.test.tsx` already covers the
    // empty-catalog message itself via its own `useDetails` seam.
    expect(within(dialog).getByRole("status")).toHaveTextContent("No source files are catalogued for this package.");

    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the package inspector with Escape", async () => {
    render(<AgentPlugins useAgentPluginsHook={useStatefulFakeAgentPlugins} />);
    await userEvent.click(screen.getByRole("button", { name: "Inspect package files — Site Compliance" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on the true backdrop while interior clicks keep the package inspector open", async () => {
    render(<AgentPlugins useAgentPluginsHook={useStatefulFakeAgentPlugins} />);
    await userEvent.click(screen.getByRole("button", { name: "Inspect package files — Site Compliance" }));
    const dialog = screen.getByRole("dialog");
    const modalSurface = dialog.querySelector("[data-preview-modal]");
    expect(modalSurface).not.toBeNull();

    fireEvent.click(modalSurface!);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(dialog);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
