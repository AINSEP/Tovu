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
 *
 * REWRITTEN 2026-09-09 (c): the single "Installed" tab split into Downloaded (every row
 * `agentPlugins` carries, unfiltered — this suite's OWN fixtures already mix one enabled and one
 * disabled plugin, so this was already what most tests below were driving) and Installed (only
 * `plugin.enabled === true`). At the time, Downloaded was the first/default tab, so tests that
 * exercise a row's controls (switch, expander, inspector, uninstall affordance) stayed there
 * unchanged in every assertion. Superseded by (d) below.
 *
 * REWRITTEN 2026-09-09 (d), owner correction to (c) the same day: Installed became the
 * first/default tab (it is the "what's active" view, so it leads), and Downloaded's row traded its
 * Enable/Disable switch for a single Remove ("Remove <name>", opens the same confirm dialog,
 * reworded — see `AgentPluginDisableConfirmDialog`'s own header for the two `variant`s that
 * follow)/Enable (a currently-disabled row, direct call, no confirm) action — showing the switch on
 * both tabs repeated the same on/off fact Installed already conveys by which rows it lists at all.
 * The switch's "off" state is consequently unreachable now: Installed excludes disabled rows by
 * construction, and Downloaded has no switch at all. Tests that need a disabled-plugin control now
 * navigate to Downloaded and use its Enable button; tests that need the switch stay on Installed
 * (the default tab, no navigation needed) and only ever see it in the "on" state.
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
  it("renders the first horizontal tab as Installed, ahead of Downloaded and Marketplace, scoped to enabled rows only", async () => {
    renderAgentPlugins();
    const installedTab = screen.getByRole("button", { name: "Installed" });
    const downloadedTab = screen.getByRole("button", { name: "Downloaded" });
    const marketplaceTab = screen.getByRole("button", { name: "Marketplace" });
    expect(installedTab).toHaveAttribute("aria-pressed", "true");
    expect(installedTab.compareDocumentPosition(downloadedTab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(downloadedTab.compareDocumentPosition(marketplaceTab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Installed is scoped to enabled rows only — TOVU_DEPLOY_FLY (`enabled: false`) belongs on
    // Downloaded, not here.
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(row("Site Compliance")).toBeInTheDocument();

    // Downloaded is unfiltered — both the enabled and the disabled fixture plugin show up.
    await userEvent.click(downloadedTab);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    const compliance = row("Site Compliance");
    expect(within(compliance).getByText("v1.0.0")).toBeInTheDocument();
    expect(within(compliance).getByText("Evidence-based compliance screening.")).toBeInTheDocument();

    // No version chip for a plugin whose installed package carries none — honest omission, not a
    // stale placeholder (same "no invented value" rule the old card's own comment stated).
    expect(within(row("Tovu Deploy Fly")).queryByText(/^v\d/)).not.toBeInTheDocument();
  });

  it("scopes the Installed tab to enabled rows only, and gives it its own empty state", async () => {
    renderAgentPlugins();
    await userEvent.click(screen.getByRole("button", { name: "Installed" }));

    // TOVU_DEPLOY_FLY is `enabled: false` in the fixture — it belongs on Downloaded, not here.
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(row("Site Compliance")).toBeInTheDocument();
    expect(screen.queryByRole("listitem", { name: "Tovu Deploy Fly" })).not.toBeInTheDocument();
  });

  it("shows Installed's own honest empty state when nothing in the workspace is enabled, while Downloaded still lists it", async () => {
    renderAgentPlugins({ agentPlugins: [{ ...TOVU_DEPLOY_FLY, enabled: false }] });
    await userEvent.click(screen.getByRole("button", { name: "Installed" }));

    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("No Agent Plugins are enabled for this workspace.");

    await userEvent.click(screen.getByRole("button", { name: "Downloaded" }));
    expect(screen.getByRole("listitem", { name: "Tovu Deploy Fly" })).toBeInTheDocument();
  });

  it("reports Installed's switch state with aria-checked AND a word, never colour alone", () => {
    // Installed only ever lists enabled rows (see the tab-scoping test above), so the switch's
    // "off" state is not reachable here, and Downloaded drops the switch entirely in favor of
    // Remove/Enable — see the Downloaded-tab tests below for that row's own state reporting.
    renderAgentPlugins();

    const enabledSwitch = within(row("Site Compliance")).getByRole("switch");
    expect(enabledSwitch).toHaveAttribute("aria-checked", "true");
    expect(enabledSwitch).toHaveAccessibleName("Disable Site Compliance");
    expect(within(row("Site Compliance")).getByText("Enabled")).toBeInTheDocument();
  });

  it("Downloaded's Enable button names the disabled plugin it would enable", async () => {
    renderAgentPlugins();
    await userEvent.click(screen.getByRole("button", { name: "Downloaded" }));

    expect(within(row("Tovu Deploy Fly")).getByRole("button", { name: "Enable Tovu Deploy Fly" })).toBeInTheDocument();
  });

  it("calls the controller with the row's own plugin when Downloaded's Enable button is activated", async () => {
    const onToggleEnabled = vi.fn(async () => {});
    renderAgentPlugins({ onToggleEnabled });
    await userEvent.click(screen.getByRole("button", { name: "Downloaded" }));

    await userEvent.click(within(row("Tovu Deploy Fly")).getByRole("button", { name: "Enable Tovu Deploy Fly" }));

    expect(onToggleEnabled).toHaveBeenCalledTimes(1);
    expect(onToggleEnabled).toHaveBeenCalledWith(TOVU_DEPLOY_FLY);
  });

  it("marks Installed's switch busy while its own toggle is in flight", () => {
    renderAgentPlugins({ togglingIds: new Set(["site-compliance"]) });

    const busy = within(row("Site Compliance")).getByRole("switch");
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
  });

  it("marks Downloaded's Remove/Enable button busy while its own toggle is in flight, leaving other rows untouched", async () => {
    renderAgentPlugins({ togglingIds: new Set(["tovu-deploy-fly"]) });
    await userEvent.click(screen.getByRole("button", { name: "Downloaded" }));

    const busy = within(row("Tovu Deploy Fly")).getByRole("button", { name: "Enable Tovu Deploy Fly" });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(within(row("Site Compliance")).getByRole("button", { name: "Remove Site Compliance" })).toBeEnabled();
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

  it("keeps every per-plugin fact, moving keywords and components behind the row's own expander", async () => {
    const { rerender } = renderAgentPlugins();
    await userEvent.click(screen.getByRole("button", { name: "Downloaded" }));

    const summary = within(row("Site Compliance")).getByRole("button", { name: "Site Compliance v1.0.0" });
    expect(summary).toHaveAttribute("aria-expanded", "false");
    expect(within(row("Site Compliance")).getByText("compliance")).not.toBeVisible();

    function useExpanded(): AgentPluginsController {
      return fakeController({ expandedIds: new Set(["site-compliance"]) });
    }
    rerender(<AgentPlugins useAgentPluginsHook={useExpanded} />);
    // Defensive re-click: the active tab is internal state in a child component that should
    // survive this rerender, but re-clicking an already-active tab is a harmless no-op either way.
    await userEvent.click(screen.getByRole("button", { name: "Downloaded" }));

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
    await userEvent.click(screen.getByRole("button", { name: "Downloaded" }));

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
    // Installed is the default tab now, so its own lede is what's on screen at load — not
    // Downloaded's "Enabling one puts its skills..." text, which now requires navigating there.
    expect(screen.getByText(/Their skills reach the assistant's prompt on every run/i)).toBeInTheDocument();
    // Kept from this suite's pre-redesign version. Enable is no longer in this list — the screen
    // now has a real one — but Install and Run remain things Tovu genuinely cannot do from here.
    for (const action of [/^Install$/i, /^Run$/i]) {
      expect(screen.queryByRole("button", { name: action })).not.toBeInTheDocument();
    }
  });

  it("keeps a tab button keyboard reachable", async () => {
    renderAgentPlugins();
    const tab = screen.getByRole("button", { name: "Downloaded" });
    tab.focus();
    await userEvent.keyboard("{Enter}");
    expect(tab).toHaveFocus();
  });

  it("Installed's row keeps the switch, with no Remove action", async () => {
    renderAgentPlugins();
    await userEvent.click(screen.getByRole("button", { name: "Installed" }));
    const complianceRow = row("Site Compliance");
    expect(within(complianceRow).getByRole("switch")).toBeInTheDocument();
    expect(within(complianceRow).queryByRole("button", { name: /^Remove /i })).not.toBeInTheDocument();
  });

  it("Downloaded's row shows Remove/Enable, not a switch", async () => {
    renderAgentPlugins();
    await userEvent.click(screen.getByRole("button", { name: "Downloaded" }));
    const complianceRow = row("Site Compliance");
    expect(within(complianceRow).queryByRole("switch")).not.toBeInTheDocument();
    expect(within(complianceRow).getByRole("button", { name: "Remove Site Compliance" })).toBeInTheDocument();
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

/**
 * Regression coverage for the disable-confirm dialog (2026-09-09): before this, a single click on
 * ANY row's switch called `controller.onToggleEnabled` immediately — turning off a bundled plugin
 * an assistant run might currently depend on had no interstitial at all. These tests were run and
 * confirmed RED against the pre-dialog `AgentPlugins.tsx` (the switch called the controller directly
 * with no dialog ever appearing) before `AgentPluginDisableConfirmDialog` was wired in.
 */
describe("AgentPlugins disable-confirm dialog", () => {
  it("opens a confirm dialog naming the plugin instead of calling the controller when disabling an enabled plugin", async () => {
    const onToggleEnabled = vi.fn(async () => {});
    renderAgentPlugins({ onToggleEnabled });

    await userEvent.click(within(row("Site Compliance")).getByRole("switch"));

    expect(onToggleEnabled).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Disable Site Compliance for this site?" });
    expect(within(dialog).getByText(/stays on disk and can be enabled again/)).toBeInTheDocument();
    expect(within(dialog).getByText(/ships with Tovu/)).toBeInTheDocument();
  });

  it("does not open a confirm dialog when enabling a disabled plugin — only disabling asks first", async () => {
    // No switch is reachable for a disabled plugin anywhere anymore (Installed excludes it,
    // Downloaded traded the switch for Remove/Enable) — this is now exercised through Downloaded's
    // Enable button instead.
    const onToggleEnabled = vi.fn(async () => {});
    renderAgentPlugins({ onToggleEnabled });
    await userEvent.click(screen.getByRole("button", { name: "Downloaded" }));

    await userEvent.click(within(row("Tovu Deploy Fly")).getByRole("button", { name: "Enable Tovu Deploy Fly" }));

    expect(onToggleEnabled).toHaveBeenCalledTimes(1);
    expect(onToggleEnabled).toHaveBeenCalledWith(TOVU_DEPLOY_FLY);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Downloaded's Remove opens a confirm dialog worded for Remove, and calls the controller once confirmed", async () => {
    const onToggleEnabled = vi.fn(async () => {});
    renderAgentPlugins({ onToggleEnabled });
    await userEvent.click(screen.getByRole("button", { name: "Downloaded" }));

    await userEvent.click(within(row("Site Compliance")).getByRole("button", { name: "Remove Site Compliance" }));

    expect(onToggleEnabled).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "Remove Site Compliance?" });
    expect(within(dialog).getByText(/stays right here on Downloaded and can be enabled again/)).toBeInTheDocument();
    expect(within(dialog).getByText(/ships with Tovu/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    expect(onToggleEnabled).toHaveBeenCalledTimes(1);
    expect(onToggleEnabled).toHaveBeenCalledWith(SITE_COMPLIANCE);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Cancel on Downloaded's Remove dialog closes it without ever calling the controller", async () => {
    const onToggleEnabled = vi.fn(async () => {});
    renderAgentPlugins({ onToggleEnabled });
    await userEvent.click(screen.getByRole("button", { name: "Downloaded" }));

    await userEvent.click(within(row("Site Compliance")).getByRole("button", { name: "Remove Site Compliance" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onToggleEnabled).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // The row itself is untouched — Remove is still there, unfired.
    expect(within(row("Site Compliance")).getByRole("button", { name: "Remove Site Compliance" })).toBeInTheDocument();
  });

  it("calls the controller only once Confirm is pressed, then closes the dialog", async () => {
    const onToggleEnabled = vi.fn(async () => {});
    renderAgentPlugins({ onToggleEnabled });

    await userEvent.click(within(row("Site Compliance")).getByRole("switch"));
    await userEvent.click(screen.getByRole("button", { name: "Disable" }));

    expect(onToggleEnabled).toHaveBeenCalledTimes(1);
    expect(onToggleEnabled).toHaveBeenCalledWith(SITE_COMPLIANCE);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Cancel closes the dialog without ever calling the controller", async () => {
    const onToggleEnabled = vi.fn(async () => {});
    renderAgentPlugins({ onToggleEnabled });

    await userEvent.click(within(row("Site Compliance")).getByRole("switch"));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onToggleEnabled).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // The row itself is untouched — still reporting the server-confirmed Enabled state.
    expect(within(row("Site Compliance")).getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("Escape closes the dialog without calling the controller", async () => {
    const onToggleEnabled = vi.fn(async () => {});
    renderAgentPlugins({ onToggleEnabled });

    await userEvent.click(within(row("Site Compliance")).getByRole("switch"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    expect(onToggleEnabled).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
    // `site-compliance` now has its own catalog entry in `agent-plugin-source-catalog.ts` (it is a
    // real, installed, enabled plugin — see that file's own header), so the inspector shows its
    // real manifest instead of the empty-catalog message. That empty-catalog rendering itself is
    // still covered directly, via its own `useDetails` seam, by `AgentPluginDetailsModal.unit.test.tsx`.
    expect(within(dialog).queryByRole("status")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "plugin.json" })).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "plugin.json" })).toBeInTheDocument();

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
