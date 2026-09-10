import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { AgentPlugins } from "../AgentPlugins";
import type { AgentPluginsController, InspectedAgentPlugin } from "../hooks/use-agent-plugins.hooks";
import type { AdminAgentPlugin } from "@/lib/api";

/**
 * @file `AgentPlugins` driven entirely through the `useAgentPluginsHook` DI seam — no `fetch` stub,
 * no real port. `use-agent-plugins.hooks.unit.test.ts` covers the hook's OWN load/toggle behavior
 * against an injected `AgentPluginsPort`; this file covers what the component renders for a given
 * controller state, the same split `use-plugins.hooks.unit.test.ts` / `Plugins.unit.test.tsx`
 * already establish for this feature's sibling screen.
 *
 * REWRITTEN 2026-09-09 (a): this suite used to assert against the static
 * `TOVU_BUNDLED_AGENT_PLUGINS` catalog (a hardcoded "ui-ux-design" entry that is not a real
 * installed Agent Plugin). It now asserts against real, injected `AdminAgentPlugin` rows — the
 * same shape `AGENT_PLUGINS_LIST` actually returns.
 *
 * REWRITTEN 2026-09-09 (b), the visual redesign: cards became rows, and the screen gained a REAL
 * enable/disable switch. One prior assertion was deliberately INVERTED rather than deleted — this
 * suite used to prove the screen offered no enable-capable control at all, which was correct while
 * the screen was read-only and is now exactly wrong. It is replaced by assertions that the switch
 * exists, reports server state, and calls the controller. The other half of that old test — that
 * the screen still offers no Install and no Run — is kept verbatim, because that half is still true.
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
 * every test in the first `describe` block below: none of them open the inspector. Interaction
 * tests that need state to actually change across a user interaction use a real `useState`-backed
 * fake instead — same split `AgentPluginDetailsModal.unit.test.tsx`'s static vs. stateful
 * `useDetails` fakes already establish for this feature.
 */
function fakeController(overrides: Partial<AgentPluginsController> = {}): AgentPluginsController {
  return {
    agentPlugins: [SITE_COMPLIANCE, TOVU_DEPLOY_FLY],
    error: null,
    toggleError: null,
    togglingIds: new Set<string>(),
    onToggleEnabled: async () => {},
    expandedIds: new Set<string>(),
    onToggleExpanded: () => {},
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

/** The row `<li>`, addressed by the plugin's humanized display name. */
function row(name: string): HTMLElement {
  return screen.getByRole("listitem", { name });
}

describe("AgentPlugins", () => {
  it("renders the first horizontal tab as Installed and lists every real installed plugin as a row", () => {
    renderAgentPlugins();
    const installedTab = screen.getByRole("button", { name: "Installed" });
    const marketplaceTab = screen.getByRole("button", { name: "Marketplace" });
    expect(installedTab).toHaveAttribute("aria-pressed", "true");
    expect(installedTab.compareDocumentPosition(marketplaceTab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    const compliance = row("Site Compliance");
    expect(within(compliance).getByText("v1.0.0")).toBeInTheDocument();
    expect(within(compliance).getByText("Evidence-based compliance screening.")).toBeInTheDocument();

    // No version chip for a plugin whose installed package carries none — honest omission, not a
    // stale placeholder (same "no invented value" rule the old card's own comment stated).
    expect(within(row("Tovu Deploy Fly")).queryByText(/^v\d/)).not.toBeInTheDocument();
  });

  it("reports each row's applied state with a switch AND a word, never colour alone", () => {
    renderAgentPlugins();

    const enabledSwitch = within(row("Site Compliance")).getByRole("switch");
    expect(enabledSwitch).toHaveAttribute("aria-checked", "true");
    expect(enabledSwitch).toHaveAccessibleName("Disable Site Compliance");
    expect(within(row("Site Compliance")).getByText("Enabled")).toBeInTheDocument();

    const disabledSwitch = within(row("Tovu Deploy Fly")).getByRole("switch");
    expect(disabledSwitch).toHaveAttribute("aria-checked", "false");
    expect(disabledSwitch).toHaveAccessibleName("Enable Tovu Deploy Fly");
    expect(within(row("Tovu Deploy Fly")).getByText("Disabled")).toBeInTheDocument();
  });

  it("calls the controller with the row's own plugin when its switch is activated", async () => {
    const onToggleEnabled = vi.fn(async () => {});
    renderAgentPlugins({ onToggleEnabled });

    await userEvent.click(within(row("Tovu Deploy Fly")).getByRole("switch"));

    expect(onToggleEnabled).toHaveBeenCalledTimes(1);
    expect(onToggleEnabled).toHaveBeenCalledWith(TOVU_DEPLOY_FLY);
  });

  it("disables only the in-flight row's switch, and marks it busy", () => {
    renderAgentPlugins({ togglingIds: new Set(["tovu-deploy-fly"]) });

    const busy = within(row("Tovu Deploy Fly")).getByRole("switch");
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(within(row("Site Compliance")).getByRole("switch")).toBeEnabled();
  });

  it("keeps the switch on the server-confirmed position when a toggle failed, and says so", () => {
    // The failure message must not be mistaken for the row's state: the row still reads Enabled,
    // because that is what the server still holds.
    renderAgentPlugins({ toggleError: "failed to update agent plugin" });

    expect(screen.getByRole("alert")).toHaveTextContent("failed to update agent plugin");
    expect(within(row("Site Compliance")).getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("offers an uninstall affordance that is honestly disabled, with the reason in the accessibility tree", () => {
    renderAgentPlugins();

    const uninstall = within(row("Site Compliance")).getByRole("button", { name: /Uninstall Site Compliance/ });
    expect(uninstall).toBeDisabled();
    expect(uninstall).toHaveAccessibleName("Uninstall Site Compliance — unavailable");
    // A disabled control is not focusable, so the WHY has to reach the accessibility tree some
    // other way — a described-by pointing at the section's own visible note.
    expect(uninstall).toHaveAccessibleDescription(/ship with Tovu and are restored on the next restart/);
  });

  it("keeps every per-plugin fact, moving keywords and components behind the row's own expander", () => {
    const { rerender } = renderAgentPlugins();

    const summary = within(row("Site Compliance")).getByRole("button", { name: "Site Compliance v1.0.0" });
    expect(summary).toHaveAttribute("aria-expanded", "false");
    expect(within(row("Site Compliance")).getByText("compliance")).not.toBeVisible();

    function useExpanded(): AgentPluginsController {
      return fakeController({ expandedIds: new Set(["site-compliance"]) });
    }
    rerender(<AgentPlugins useAgentPluginsHook={useExpanded} />);

    const expandedRow = row("Site Compliance");
    expect(within(expandedRow).getByRole("button", { name: "Site Compliance v1.0.0" })).toHaveAttribute("aria-expanded", "true");
    expect(within(expandedRow).getByText("Keywords")).toBeVisible();
    expect(within(expandedRow).getByText("compliance")).toBeVisible();
    expect(within(expandedRow).getByText("gdpr")).toBeVisible();
    expect(within(expandedRow).getByText("Portable components")).toBeVisible();
    expect(within(expandedRow).getByText("site-compliance")).toBeVisible();

    // An MCP server id is shown only by the package that declares one — an empty "MCP servers"
    // heading would assert the question was asked and answered "none".
    expect(within(row("Tovu Deploy Fly")).getByText("fly-deploy")).toBeInTheDocument();
    expect(within(expandedRow).queryByText("MCP servers")).not.toBeInTheDocument();
  });

  it("calls the controller with the row's own id when the expander is activated", async () => {
    const onToggleExpanded = vi.fn();
    renderAgentPlugins({ onToggleExpanded });

    await userEvent.click(within(row("Tovu Deploy Fly")).getByRole("button", { name: "Tovu Deploy Fly" }));

    expect(onToggleExpanded).toHaveBeenCalledWith("tovu-deploy-fly");
  });

  it("shows a loading note while agentPlugins has not yet loaded, and no rows", () => {
    renderAgentPlugins({ agentPlugins: null });
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("shows the load error instead of any row when the port rejects", () => {
    renderAgentPlugins({ agentPlugins: null, error: "failed to load agent plugins" });
    expect(screen.getByRole("status")).toHaveTextContent("failed to load agent plugins");
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("says what enabling actually does, and still offers no install or run action", () => {
    renderAgentPlugins();
    expect(screen.getByText(/Enabling one puts its skills in the assistant's prompt/i)).toBeInTheDocument();
    // Kept from this suite's pre-redesign version. Enable is no longer in this list — the screen
    // now has a real one — but Install and Run remain things Tovu genuinely cannot do from here.
    for (const action of [/^Install$/i, /^Run$/i]) {
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

  it("keeps Marketplace explicitly future-only, with no listing and no install control", async () => {
    renderAgentPlugins();

    await userEvent.click(screen.getByRole("button", { name: "Marketplace" }));

    expect(screen.getByRole("note")).toHaveTextContent(
      "Marketplace is planned for a future release. Tovu does not fetch, install, or list marketplace packages yet.",
    );
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    for (const action of [/^Install$/i, /^Enable$/i, /^Run$/i]) {
      expect(screen.queryByRole("button", { name: action })).not.toBeInTheDocument();
    }
    // The designed empty state must not have smuggled a live-looking control in with the artwork.
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
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
      expandedIds: new Set<string>(),
      onToggleExpanded: () => {},
      inspectedPlugin,
      inspectPlugin: setInspectedPlugin,
      closeInspector: () => setInspectedPlugin(null),
      t: (key: string) => key,
      locale: "en",
    };
  }

  it("opens the read-only package inspector for the clicked plugin and closes it", async () => {
    render(<AgentPlugins useAgentPluginsHook={useStatefulFakeAgentPlugins} />);

    // The eye control REPLACED a text button and kept its accessible name verbatim — so this
    // assertion is unchanged across the redesign, which is exactly the point of preserving it.
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
