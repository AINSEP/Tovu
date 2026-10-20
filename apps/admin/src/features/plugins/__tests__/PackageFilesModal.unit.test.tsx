import { render, screen, within } from "@/__tests__/fetch-query-render";
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

  it("swaps the expand toggle for a visible collapse arrow once expanded", async () => {
    const file = { relativePath: "skills/site-import/SKILL.md", content: "# Site import" };
    renderModal({ files: [file], selectedFile: file });

    await userEvent.click(screen.getByRole("button", { name: "Fullscreen" }));

    const exit = screen.getByRole("button", { name: "Exit fullscreen" });
    expect(exit.querySelector(".ri-collapse-diagonal-line")).not.toBeNull();
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
    // `server/` doesn't hold the selected file, so it starts collapsed; clicking opens it.
    const folder = within(nav).getByRole("treeitem", { name: "server" });
    expect(folder).toHaveAttribute("aria-expanded", "false");
    expect(within(nav).queryByRole("treeitem", { name: "index.mjs" })).not.toBeInTheDocument();
    await userEvent.click(folder);
    expect(folder).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(within(nav).getByRole("treeitem", { name: "index.mjs" }));
    expect(props.onSelectFile).toHaveBeenCalledWith("server/index.mjs");
  });

  it("lists files before folders, marks the selected file, and names each row's full path in its tooltip", () => {
    const files = [
      { relativePath: "plugin.json", content: "{}" },
      { relativePath: "skills/deploy/SKILL.md", content: "# Deploy" },
      { relativePath: "a.md", content: "a" },
    ];
    renderModal({ files, selectedFile: files[1]! });

    const tree = screen.getByRole("tree", { name: "Package files" });
    const rows = within(tree).getAllByRole("treeitem");
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual(["a.md", "plugin.json", "skills", "deploy", "SKILL.md"]);
    expect(rows.map((row) => row.getAttribute("aria-level"))).toEqual(["1", "1", "1", "2", "3"]);
    expect(within(tree).getByRole("treeitem", { name: "SKILL.md" })).toHaveAttribute("aria-selected", "true");
    expect(within(tree).getByRole("treeitem", { name: "SKILL.md" })).toHaveAttribute("title", "skills/deploy/SKILL.md");
    expect(within(tree).getByRole("treeitem", { name: "a.md" })).toHaveAttribute("aria-selected", "false");
    // Roving tabindex: only the selected row is in the Tab order.
    expect(rows.filter((row) => row.tabIndex === 0)).toEqual([within(tree).getByRole("treeitem", { name: "SKILL.md" })]);
  });

  it("moves with the arrow keys, collapses and expands with Left and Right, and opens with Enter", async () => {
    const files = [
      { relativePath: "plugin.json", content: "{}" },
      { relativePath: "targets/vercel.mjs", content: "export {}" },
    ];
    const props = renderModal({ files, selectedFile: files[0]! });
    const tree = screen.getByRole("tree", { name: "Package files" });
    const row = (name: string) => within(tree).getByRole("treeitem", { name });

    row("plugin.json").focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(row("targets")).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(row("targets")).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard("{ArrowRight}");
    expect(row("vercel.mjs")).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(props.onSelectFile).toHaveBeenCalledWith("targets/vercel.mjs");
    await userEvent.keyboard("{ArrowLeft}");
    expect(row("targets")).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(row("targets")).toHaveAttribute("aria-expanded", "false");
    expect(within(tree).queryByRole("treeitem", { name: "vercel.mjs" })).not.toBeInTheDocument();
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

it("keeps folder icon pairs together and file rows free of expansion state", async () => {
  const file = { relativePath: "src/index.ts", content: "export {}" };
  const props = renderModal({ files: [file] });
  const folder = screen.getByRole("treeitem", { name: "src" });
  expect(folder).toHaveAttribute("aria-expanded", "false");
  expect(folder).not.toHaveAttribute("aria-selected");
  expect(folder.querySelector(".ri-arrow-right-s-line")).not.toBeNull();
  expect(folder.querySelector(".ri-folder-line")).not.toBeNull();
  await userEvent.click(folder);
  expect(folder).toHaveAttribute("aria-expanded", "true");
  expect(folder.querySelector(".ri-arrow-down-s-line")).not.toBeNull();
  expect(folder.querySelector(".ri-folder-open-line")).not.toBeNull();
  const row = screen.getByRole("treeitem", { name: "index.ts" });
  expect(row).not.toHaveAttribute("aria-expanded");
  expect(row).toHaveAttribute("aria-selected", "false");
  expect(row.querySelector(".agent-plugin-source-tree-twistie")).toHaveAttribute("aria-hidden", "true");
  expect(row.querySelector(".ri-code-s-slash-line.is-typescript")).not.toBeNull();
  await userEvent.click(row);
  expect(props.onSelectFile).toHaveBeenCalledWith("src/index.ts");
  await userEvent.click(folder);
  expect(folder).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("treeitem", { name: "index.ts" })).not.toBeInTheDocument();
});
