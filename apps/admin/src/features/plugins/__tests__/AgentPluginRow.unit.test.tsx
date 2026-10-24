import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { AgentPluginRow } from "../AgentPluginRow";

it.each([
  ["site-compliance", "Site Compliance", "M12 3.2 19 5.9v5.6c0 4.2-2.8 7.4-7 9.3-4.2-1.9-7-5.1-7-9.3V5.9z"],
  ["tovu-deploy-example", "Tovu Deploy Example", "M13.6 3.4c3.4-.6 6.4 2.4 5.8 5.8-.5 2.9-2.4 5.2-4.6 7l-3.4 2.7-4.9-4.9 2.7-3.4c1.8-2.2 4.1-4.1 7-4.6z"],
  ["ui-ux-design", "UI UX Design", "M12 3.5a8.5 8.5 0 0 0 0 17c1.3 0 2-.9 2-1.9s-.7-1.9-.7-2.7c0-.9.7-1.6 1.6-1.6h1.6a4 4 0 0 0 4-4c0-3.7-3.8-6.8-8.5-6.8z"],
  ["unknown-package", "Unknown Package", "M3.5 8.2 12 3.6l8.5 4.6v7.6L12 20.4l-8.5-4.6z"],
] as const)("renders %s with its own category glyph", (pluginId, displayName, expectedOutline) => {
  // F2.4/F4.1: hardcoding PackageIcon in the real row must fail even when the lookup/helper tests pass.
  // These literal SVG outlines characterize emitted markup, not browser geometry (F1.5).
  render(<ul><AgentPluginRow
    plugin={{ pluginId, version: "2.7.1", description: null, enabled: true, keywords: [], skills: [], mcpServerIds: [] }}
    t={(key) => key}
    locale="en"
    expanded={false}
    busy={false}
    onToggleExpanded={vi.fn()}
    stateControl={{ kind: "toggle", onToggleEnabled: vi.fn() }}
    onInspect={vi.fn()}
    uninstallNoteId="uninstall-note"
    agentHandleBase={`row-${pluginId}`}
  /></ul>);

  const row = screen.getByRole("listitem", { name: displayName });
  const summary = within(row).getByRole("button", { name: `${displayName} v2.7.1` });
  const glyph = summary.querySelector(".agent-plugin-row-glyph svg");
  expect(glyph).toHaveAttribute("aria-hidden", "true");
  expect(glyph).toHaveAttribute("width", "18");
  expect(glyph?.querySelector("path")).toHaveAttribute("d", expectedOutline);
});

function renderExpandedRow(plugin: {
  maturity?: "untested" | "soon";
  summary?: string | null;
  description: string | null;
  keywords?: string[];
  skills?: { name: string; summary: string }[];
  mcpServerIds?: string[];
}) {
  render(<ul><AgentPluginRow
    plugin={{ pluginId: "tovu-theme", version: "1.0.0", enabled: true, keywords: [], skills: [], mcpServerIds: [], ...plugin }}
    t={(key) => key}
    locale="en"
    expanded
    busy={false}
    onToggleExpanded={vi.fn()}
    stateControl={{ kind: "toggle", onToggleEnabled: vi.fn() }}
    onInspect={vi.fn()}
    uninstallNoteId="uninstall-note"
    agentHandleBase="row-tovu-theme"
  /></ul>);
  return screen.getByRole("listitem", { name: "Tovu Theme" });
}

it.each([["untested", "Untested"], ["soon", "Soon"]] as const)("renders the %s pill with a warning that stays open after a tap", (maturity, label) => {
  const row = renderExpandedRow({ description: null, maturity });
  const trigger = within(row).getByRole("button", { name: label });
  expect(trigger.querySelector(".soon")).toHaveTextContent(label);
  expect(trigger.closest("button")).toBeNull();
  fireEvent.click(trigger);
  fireEvent.mouseLeave(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(document.querySelector(".info-tip-bubble")).toHaveTextContent("Not yet tested end to end. It may not work.");
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "false");
});

it("omits the maturity pill for a normal plugin", () => {
  const row = renderExpandedRow({ description: null });
  expect(row.querySelector(".agent-plugin-maturity")).toBeNull();
});

it("shows the human summary as paragraphs and never renders the agent-facing description or keywords", () => {
  const row = renderExpandedRow({
    summary: "Builds a theme for your site.\n\nOr turns an existing website into one.",
    description: "Encodes apiVersion 2's render/pages layout.\n\nNo new tools.",
    keywords: ["apiVersion", "sentinel"],
  });

  // The clamped one-liner identifies the row by the summary, not the jargon.
  const line = row.querySelector(".agent-plugin-row-desc");
  expect(line).toHaveTextContent("Builds a theme for your site.");
  expect(line).not.toHaveTextContent("apiVersion");

  const summaryParagraphs = row.querySelectorAll(".agent-plugin-detail-description p");
  expect([...summaryParagraphs].map((p) => p.textContent)).toEqual([
    "Builds a theme for your site.",
    "Or turns an existing website into one.",
  ]);

  // The description and keywords are the assistant's search data, not owner copy (owner,
  // 2026-10-17): no "Technical details" toggle, no keyword chips, no jargon anywhere in the row.
  expect(row.querySelector("details")).toBeNull();
  expect(within(row).queryByText("Technical details")).toBeNull();
  expect(within(row).queryByText("Keywords")).toBeNull();
  expect(row).not.toHaveTextContent("apiVersion");
  expect(row).not.toHaveTextContent("sentinel");
});

it("without a summary, renders the description itself as paragraphs and no Technical details toggle", () => {
  const row = renderExpandedRow({ summary: null, description: "First.\nStill first.\n\nSecond." });

  const paragraphs = [...row.querySelectorAll(".agent-plugin-detail-description p")];
  expect(paragraphs.map((p) => p.innerHTML)).toEqual(["First.<br>Still first.", "Second."]);
  expect(row.querySelector("details")).toBeNull();
  expect(row.querySelector(".agent-plugin-row-desc")).toHaveAttribute("title", "First.\nStill first.\n\nSecond.");
});

it("renders description text as text, never as markup", () => {
  const row = renderExpandedRow({ summary: null, description: "<img src=x onerror=alert(1)>" });

  expect(row.querySelector("img")).toBeNull();
  expect(row.querySelector(".agent-plugin-detail-description p")).toHaveTextContent("<img src=x onerror=alert(1)>");
});

it("hides the Skills and MCP servers chips when their only entry just repeats the plugin's own id", () => {
  // 20 of 21 bundled plugins carry exactly one skill named after the plugin (owner, 2026-10-17:
  // "the tag just repeats the name of the plugin"), so that chip row tells the reader nothing.
  const row = renderExpandedRow({
    description: null,
    skills: [{ name: "tovu-theme", summary: "Builds themes." }],
    mcpServerIds: ["tovu-theme"],
  });

  expect(within(row).queryByText("Skills")).toBeNull();
  expect(within(row).queryByText("Portable components")).toBeNull();
  expect(within(row).queryByText("MCP servers")).toBeNull();
  expect(row.querySelector(".agent-plugin-chips")).toBeNull();
});

it("keeps the Skills and MCP servers chips when they say something the plugin's name does not", () => {
  const row = renderExpandedRow({
    description: null,
    skills: [{ name: "tovu-theme", summary: "Builds themes." }, { name: "theme-import", summary: "Imports a site." }],
    mcpServerIds: ["theme-api"],
  });

  expect(within(row).getByText("Skills")).toBeVisible();
  expect(within(row).getByText("theme-import")).toBeVisible();
  expect(within(row).getByText("tovu-theme", { selector: "code" })).toBeVisible();
  expect(within(row).getByText("MCP servers")).toBeVisible();
  expect(within(row).getByText("theme-api")).toBeVisible();
  expect(within(row).queryByText("Portable components")).toBeNull();
});
