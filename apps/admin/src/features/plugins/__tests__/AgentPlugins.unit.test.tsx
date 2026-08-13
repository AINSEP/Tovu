import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentPlugins } from "../AgentPlugins";

afterEach(() => vi.unstubAllGlobals());

function renderAgentPlugins() {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return { ...render(<AgentPlugins />), fetchMock };
}

describe("AgentPlugins", () => {
  it("renders the first horizontal tab as Installed and lists the bundled source package", async () => {
    renderAgentPlugins();
    const installedTab = await screen.findByRole("button", { name: "Installed" });
    const marketplaceTab = screen.getByRole("button", { name: "Marketplace" });
    expect(installedTab).toHaveAttribute("aria-pressed", "true");
    expect(installedTab.compareDocumentPosition(marketplaceTab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tovu" })).not.toBeInTheDocument();

    const card = screen.getByRole("article", { name: "UI/UX Design" });
    // No Version row: the package this card describes carries no version field to show honestly
    // (see agent-plugin-catalog.ts), and a stale hand-set number would be worse than none.
    expect(within(card).queryByText("Version")).not.toBeInTheDocument();
    expect(within(card).getByText("Jini plugins package (@jini-ai/plugins)")).toBeInTheDocument();
    expect(within(card).getByText("ui-ux-design")).toBeInTheDocument();
    expect(within(card).getByText("Bundled with Tovu — catalogued, not executed")).toBeInTheDocument();
  });

  it("labels the catalog honestly and offers no install, enable, or run action", async () => {
    renderAgentPlugins();
    expect(await screen.findByRole("note")).toHaveTextContent(/catalogued as installed.*does not execute/i);
    for (const action of [/^Install$/i, /^Enable$/i, /^Run$/i]) {
      expect(screen.queryByRole("button", { name: action })).not.toBeInTheDocument();
    }
  });

  it("keeps the tab keyboard reachable", async () => {
    renderAgentPlugins();
    const tab = await screen.findByRole("button", { name: "Installed" });
    tab.focus();
    await userEvent.keyboard("{Enter}");
    expect(tab).toHaveFocus();
  });

  it("opens an accessible read-only package inspector and selects source-backed files", async () => {
    renderAgentPlugins();
    await userEvent.click(await screen.findByRole("button", { name: "Inspect package files" }));

    const dialog = screen.getByRole("dialog", { name: /UI\/UX Design package files preview/i });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByRole("navigation", { name: "Package files" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "plugin.json" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByText(/"name": "ui-ux-design"/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "skills/ui-ux-design/SKILL.md" }));
    expect(within(dialog).getByRole("heading", { name: "skills/ui-ux-design/SKILL.md" })).toBeInTheDocument();
    expect(within(dialog).getByText(/# Skill: UI\/UX Design/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", {
      name: "skills/ui-ux-design/references/brand-and-voice.md",
    }));
    expect(within(dialog).getByText(/Use this reference when the design work includes identity direction/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the package inspector with Escape", async () => {
    renderAgentPlugins();
    await userEvent.click(await screen.findByRole("button", { name: "Inspect package files" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on the true backdrop while interior clicks keep the package inspector open", async () => {
    renderAgentPlugins();
    await userEvent.click(await screen.findByRole("button", { name: "Inspect package files" }));
    const dialog = screen.getByRole("dialog");
    const modalSurface = dialog.querySelector("[data-preview-modal]");
    expect(modalSurface).not.toBeNull();

    fireEvent.click(modalSurface!);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(dialog);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps Marketplace explicitly future-only and performs no marketplace fetch", async () => {
    const { fetchMock } = renderAgentPlugins();
    const marketplaceTab = await screen.findByRole("button", { name: "Marketplace" });
    const callsBeforeSelection = fetchMock.mock.calls.length;

    await userEvent.click(marketplaceTab);

    expect(screen.getByRole("note")).toHaveTextContent(
      "Marketplace is planned for a future release. Tovu does not fetch, install, or list marketplace packages yet.",
    );
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    for (const action of [/^Install$/i, /^Enable$/i, /^Run$/i]) {
      expect(screen.queryByRole("button", { name: action })).not.toBeInTheDocument();
    }
    expect(fetchMock).toHaveBeenCalledTimes(callsBeforeSelection);
  });
});
