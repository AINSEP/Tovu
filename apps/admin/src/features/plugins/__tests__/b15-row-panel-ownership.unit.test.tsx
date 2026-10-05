import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";

import type { AdminAgentPlugin, AdminPlugin } from "@/lib/api";
import { AgentPluginRow } from "../AgentPluginRow";
import { PluginRow } from "../PluginRow";

const unexpectedAction = () => { throw new Error("Unexpected action outside expansion"); };

function Rows({ kind }: { kind: "agent" | "plugin" }) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) => setExpanded((previous) => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  if (kind === "agent") {
    const plugins: AdminAgentPlugin[] = [
      {
        pluginId: "ledger-export", version: "7.4.2", description: "Exports ledger entries.", enabled: true,
        skills: [{ name: "ledger-csv", summary: "CSV export" }], keywords: ["accounting"], mcpServerIds: ["ledger-api"],
      },
      {
        pluginId: "image-tools", version: "2.8.6", description: "Resizes uploaded images.", enabled: false,
        skills: [{ name: "image-resize", summary: "Image resizing" }], keywords: ["photography"], mcpServerIds: ["image-api"],
      },
    ];
    return <><p id="uninstall-note">Bundled packages can be turned off.</p><ul>{plugins.map((plugin) => <AgentPluginRow key={plugin.pluginId} plugin={plugin}
      t={(key) => key} locale="en" expanded={expanded.has(plugin.pluginId)} busy={false}
      onToggleExpanded={() => toggle(plugin.pluginId)} stateControl={{ kind: "toggle", onToggleEnabled: unexpectedAction }}
      onInspect={unexpectedAction} uninstallNoteId="uninstall-note" agentHandleBase={`agent-${plugin.pluginId}`} />)}</ul></>;
  }

  const plugins: AdminPlugin[] = [
    {
      id: "ledger-export", name: "Ledger Export", version: "7.4.2", source: "site", tier: "tier-2", status: "invalid", enabled: false,
      quarantine: { at: "2026-10-01T09:00:00.000Z", consecutiveFailures: 7, reason: "Ledger export timed out." },
      errors: [
        { code: "LEDGER_SCHEMA", message: "Ledger schema is missing.", file: "server/export.mjs" },
        { code: "LEDGER_ENDPOINT", message: "Ledger endpoint is invalid.", file: "server/client.mjs" },
      ],
    },
    {
      id: "image-tools", name: "Image Tools", version: "2.8.6", source: "built-in", tier: "tier-3", status: "invalid", enabled: false,
      quarantine: null, errors: [{ code: "IMAGE_FORMAT", message: "Image format is unsupported.", file: "server/image.mjs" }],
    },
  ];
  return <ul>{plugins.map((plugin) => <PluginRow key={plugin.id} plugin={plugin} t={(key) => key}
    expanded={expanded.has(plugin.id)} onToggleExpanded={() => toggle(plugin.id)} agentHandleBase={`plugin-${plugin.id}`}
    action={<button onClick={unexpectedAction}>Action for {plugin.name}</button>} onInspect={unexpectedAction} />)}</ul>;
}

it.each(["agent", "plugin"] as const)("%s row expanders name and control their own persistent panels", async (kind) => {
  // F1.3/F2.1/F3.4: a constant aria-controls id or a controls id pointing to the heading must fail.
  // Real row components handle user clicks; caller state tracks every expanded row independently.
  const user = userEvent.setup();
  render(<Rows kind={kind} />);
  const ledger = screen.getByRole("listitem", { name: "Ledger Export" });
  const images = screen.getByRole("listitem", { name: "Image Tools" });
  const ledgerSummary = within(ledger).getByRole("button", { name: "Ledger Export v7.4.2" });
  const imageSummary = within(images).getByRole("button", { name: "Image Tools v2.8.6" });
  const panelFor = (summary: HTMLElement, row: HTMLElement) => {
    const id = summary.getAttribute("aria-controls");
    expect(id).toBeTruthy();
    const panel = document.getElementById(id!);
    expect(panel).not.toBeNull();
    expect(row.contains(panel)).toBe(true);
    expect(panel).toHaveAttribute("hidden");
    return panel!;
  };
  const ledgerPanel = panelFor(ledgerSummary, ledger);
  const imagePanel = panelFor(imageSummary, images);
  expect(ledgerPanel).not.toBe(imagePanel);
  expect(ledgerSummary).toHaveAttribute("aria-expanded", "false");
  expect(imageSummary).toHaveAttribute("aria-expanded", "false");
  const ledgerContent = kind === "agent" ? "ledger-csv" : "Ledger schema is missing.";
  const imageContent = kind === "agent" ? "image-resize" : "Image format is unsupported.";
  expect(within(ledgerPanel).getByText(ledgerContent)).not.toBeVisible();
  expect(within(imagePanel).getByText(imageContent)).not.toBeVisible();

  await user.click(ledgerSummary);
  expect(ledgerSummary).toHaveAttribute("aria-expanded", "true");
  expect(ledgerPanel).not.toHaveAttribute("hidden");
  expect(within(ledgerPanel).getByText(ledgerContent)).toBeVisible();
  expect(within(ledgerPanel).queryByText(imageContent)).not.toBeInTheDocument();
  expect(imageSummary).toHaveAttribute("aria-expanded", "false");
  expect(imagePanel).toHaveAttribute("hidden");

  await user.click(imageSummary);
  expect(imageSummary).toHaveAttribute("aria-expanded", "true");
  expect(within(imagePanel).getByText(imageContent)).toBeVisible();
  expect(within(imagePanel).queryByText(ledgerContent)).not.toBeInTheDocument();
  expect(within(ledgerPanel).getByText(ledgerContent)).toBeVisible();

  await user.click(ledgerSummary);
  expect(ledgerSummary).toHaveAttribute("aria-expanded", "false");
  expect(document.getElementById(ledgerSummary.getAttribute("aria-controls")!)).toBe(ledgerPanel);
  expect(within(ledgerPanel).getByText(ledgerContent)).not.toBeVisible();
  expect(within(imagePanel).getByText(imageContent)).toBeVisible();
});
