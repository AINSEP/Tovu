import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { AgentPluginRow } from "../AgentPluginRow";

it.each([
  ["site-compliance", "Site Compliance", "M12 3.2 19 5.9v5.6c0 4.2-2.8 7.4-7 9.3-4.2-1.9-7-5.1-7-9.3V5.9z"],
  ["tovu-deploy-fly", "Tovu Deploy Fly", "M13.6 3.4c3.4-.6 6.4 2.4 5.8 5.8-.5 2.9-2.4 5.2-4.6 7l-3.4 2.7-4.9-4.9 2.7-3.4c1.8-2.2 4.1-4.1 7-4.6z"],
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
