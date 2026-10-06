import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AgentPlugins } from "../AgentPlugins";
import { createFakeAgentPluginInstallPort } from "../hooks/agent-plugin-install-dependencies.hooks";
import { createFakeAgentPluginsPort } from "../hooks/agent-plugins-dependencies.hooks";
import { useAgentPlugins, type AgentPluginsController } from "../hooks/use-agent-plugins.hooks";
import { ApiError, type AdminAgentPlugin } from "@/lib/api";

/**
 * @file The Agent Plugins "Add a plugin" tab: one `.zip` chosen or dropped, validated before upload,
 * installed switched off, refusals in plain words, and "From a URL" shown disabled as Coming soon.
 * Driven through the screen's two DI seams (`useAgentPluginsHook`, `agentPluginInstallPort`).
 */

const NOTE_TAKER: AdminAgentPlugin = {
  pluginId: "note-taker",
  displayName: "Note Taker",
  version: "1.0.0",
  description: null,
  keywords: [],
  enabled: false,
  skills: [],
  mcpServerIds: [],
};

function zip(name = "note-taker.zip", bytes = "PK\u0003\u0004"): File {
  return new File([bytes], name, { type: "application/zip" });
}

function renderAddTab(port = createFakeAgentPluginInstallPort({ row: NOTE_TAKER }), onInstalled = vi.fn()) {
  const controller: AgentPluginsController = {
    agentPlugins: [],
    error: null,
    toggleError: null,
    togglingIds: new Set<string>(),
    onToggleEnabled: async () => {},
    onInstalled,
    expandedIds: new Set<string>(),
    onToggleExpanded: () => {},
    inspectedPlugin: null,
    inspectPlugin: () => {},
    closeInspector: () => {},
    t: (key: string) => key,
    locale: "en",
  };
  render(<AgentPlugins useAgentPluginsHook={() => controller} agentPluginInstallPort={port} />);
  return { port, onInstalled };
}

async function openAddTab() {
  await userEvent.click(screen.getByRole("button", { name: "Add a plugin" }));
}

const installButton = () => screen.getByRole("button", { name: "Install (stays off)" });

describe("AgentPlugins — Add a plugin", () => {
  it("offers a .zip upload with Install off until a file is chosen, and a disabled Coming soon URL option", async () => {
    renderAddTab();
    await openAddTab();

    expect(screen.getByText("Drop a .zip here")).toBeInTheDocument();
    expect(installButton()).toBeDisabled();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Plugin URL" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add from URL" })).toBeDisabled();
  });

  it("installs a chosen .zip with its SHA-256, adds the row, and says it stays off", async () => {
    const { port, onInstalled } = renderAddTab();
    await openAddTab();

    await userEvent.upload(screen.getByLabelText("Upload a .zip"), zip());
    expect(screen.getByText("note-taker.zip")).toBeInTheDocument();
    await userEvent.click(installButton());

    await waitFor(() => expect(onInstalled).toHaveBeenCalledWith(NOTE_TAKER));
    expect(port.uploads).toEqual([{ name: "note-taker.zip", sha256: "sha-of-note-taker.zip" }]);
    expect(screen.getByRole("status")).toHaveTextContent("Note Taker is installed and switched off. Turn it on in Installed.");
    expect(installButton()).toBeDisabled();
  });

  it("accepts one dropped .zip and refuses a drop of several files", async () => {
    renderAddTab();
    await openAddTab();
    const zone = screen.getByText("Drop a .zip here").closest(".agent-plugin-dropzone")!;

    fireEvent.drop(zone, { dataTransfer: { files: [zip("a.zip"), zip("b.zip")] } });
    expect(screen.getByRole("alert")).toHaveTextContent("Choose one .zip file.");

    fireEvent.drop(zone, { dataTransfer: { files: [zip("dropped.zip")] } });
    expect(screen.getByText("dropped.zip")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(installButton()).toBeEnabled();
  });

  it("refuses a non-.zip or empty file before uploading anything", async () => {
    const { port } = renderAddTab();
    await openAddTab();
    const input = screen.getByLabelText("Upload a .zip");

    fireEvent.change(input, { target: { files: [new File(["x"], "plugin.json")] } });
    expect(screen.getByRole("alert")).toHaveTextContent("Choose one .zip file.");
    fireEvent.change(input, { target: { files: [new File([], "empty.zip")] } });
    expect(screen.getByRole("alert")).toHaveTextContent("This file is not a readable .zip.");
    expect(installButton()).toBeDisabled();
    expect(port.uploads).toEqual([]);
  });

  it("shows a server refusal in plain words and keeps the file for another try", async () => {
    const port = createFakeAgentPluginInstallPort({ row: NOTE_TAKER }, { failWith: new ApiError("taken", 409, "AGENT_PLUGIN_PLUGIN_ID_TAKEN") });
    const { onInstalled } = renderAddTab(port);
    await openAddTab();

    await userEvent.upload(screen.getByLabelText("Upload a .zip"), zip());
    await userEvent.click(installButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("A different plugin with this name is already installed.");
    expect(onInstalled).not.toHaveBeenCalled();
    expect(installButton()).toBeEnabled();
  });

  it("says so when the same package was already installed", async () => {
    renderAddTab(createFakeAgentPluginInstallPort({ row: NOTE_TAKER }, { alreadyInstalled: true }));
    await openAddTab();

    await userEvent.upload(screen.getByLabelText("Upload a .zip"), zip());
    await userEvent.click(installButton());

    expect(await screen.findByRole("status")).toHaveTextContent("Note Taker is already installed.");
  });
});

describe("useAgentPlugins — onInstalled", () => {
  it("adds a new row, and replaces one with the same id instead of duplicating it", async () => {
    const existing: AdminAgentPlugin = { ...NOTE_TAKER, pluginId: "deploy", displayName: "Deploy" };
    const { result } = renderHook(() =>
      useAgentPlugins({ port: createFakeAgentPluginsPort({ agentPlugins: [existing] }), locale: "en", t: (key) => key }),
    );
    await waitFor(() => expect(result.current.agentPlugins).toHaveLength(1));

    act(() => result.current.onInstalled(NOTE_TAKER));
    act(() => result.current.onInstalled({ ...NOTE_TAKER, version: "1.0.1" }));

    expect(result.current.agentPlugins?.map((plugin) => [plugin.pluginId, plugin.version])).toEqual([
      ["deploy", "1.0.0"],
      ["note-taker", "1.0.1"],
    ]);
  });
});
