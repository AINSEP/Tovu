import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PackageFilesModal, type PackageFilesModalProps } from "../PackageFilesModal";
import { PluginPackageFilesModal } from "../PluginPackageFilesModal";
import type { PluginPackageFilesController } from "../hooks/use-plugin-package-files.hooks";

/**
 * @file The shared `PackageFilesModal` — the parts the Agent Plugins suites never reach because its
 * catalog always has content: a listed file with no content, a load failure, the caps notice, copy
 * through `t`. Wrap-toggle behavior stays covered through `AgentPluginDetailsModal.unit.test.tsx`,
 * which now renders this same component. Also `PluginPackageFilesModal`'s wiring of a controller
 * into it.
 */

const shout = (key: string) => key.toUpperCase();

function renderModal(overrides: Partial<PackageFilesModalProps> = {}) {
  const props: PackageFilesModalProps = {
    title: "Word Count package files",
    subtitle: "subtitle",
    files: [],
    selectedFile: null,
    onSelectFile: vi.fn(),
    status: null,
    handlePrefix: "plugin-file",
    t: (key) => key,
    onClose: vi.fn(),
    ...overrides,
  };
  render(<PackageFilesModal {...props} />);
  return props;
}

describe("PackageFilesModal", () => {
  it("shows a listed file's unavailable reason in place of its source, with no wrap toggle", () => {
    const file = { relativePath: "assets/logo.png", content: null, unavailableReason: "Binary file — not shown." };
    renderModal({ files: [file], selectedFile: file });

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "assets/logo.png" })).toBeInTheDocument();
    expect(within(dialog).getByRole("status")).toHaveTextContent("Binary file — not shown.");
    expect(within(dialog).queryByRole("button", { name: /^Wrap:/ })).not.toBeInTheDocument();
    expect(dialog.querySelector(".code-viewer")).toBeNull();
  });

  it("renders a load failure as an alert while no file is selected", () => {
    renderModal({ status: { text: "This plugin's id is invalid.", role: "alert" } });
    expect(screen.getByRole("alert")).toHaveTextContent("This plugin's id is invalid.");
  });

  it("shows the caps notice above the file list, and reports the clicked file's path", async () => {
    const files = [
      { relativePath: "tovu.plugin.json", content: "{}" },
      { relativePath: "server/index.mjs", content: "export default {};" },
    ];
    const props = renderModal({ files, selectedFile: files[0]!, listNotice: "Some files are not listed." });

    const nav = screen.getByRole("navigation", { name: "Package files" });
    expect(within(nav).getByRole("note")).toHaveTextContent("Some files are not listed.");
    await userEvent.click(within(nav).getByRole("button", { name: "server/index.mjs" }));
    expect(props.onSelectFile).toHaveBeenCalledWith("server/index.mjs");
  });

  it("takes every piece of its own copy through t", () => {
    const file = { relativePath: "a.md", content: "x" };
    renderModal({ files: [file], selectedFile: file, t: shout });

    expect(screen.getByRole("navigation", { name: "PACKAGE FILES" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "WRAP: ON" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("PluginPackageFilesModal", () => {
  it("titles the shared modal with the plugin's name and renders the injected controller's files", () => {
    const file = { relativePath: "index.ts", content: "export const WORD_COUNT_MANIFEST = {};" };
    const useFakeFiles = (): PluginPackageFilesController => ({
      files: [file],
      selectedFile: file,
      selectFile: vi.fn(),
      status: null,
      listNotice: null,
      t: (key) => key,
    });

    render(<PluginPackageFilesModal plugin={{ id: "word-count", name: "Word Count" }} onClose={vi.fn()} useFiles={useFakeFiles} />);

    const dialog = screen.getByRole("dialog", { name: /Word Count package files/ });
    expect(within(dialog).getByRole("heading", { name: "index.ts" })).toBeInTheDocument();
    expect(within(dialog).getByText("export const WORD_COUNT_MANIFEST = {};")).toBeInTheDocument();
  });
});
