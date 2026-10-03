import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PackageFilesModal, type PackageFilesModalProps } from "../PackageFilesModal";

function props(): PackageFilesModalProps {
  const files = [
    { relativePath: "alpha.md", content: "# Alpha\nfirst file" },
    { relativePath: "docs/beta.md", content: "# Beta\nsecond file" },
    { relativePath: "other/gamma.md", content: "# Gamma" },
  ];
  return { files, selectedFile: files[0]!, title: "North Star files", subtitle: "Read only", status: null, listNotice: null,
    handlePrefix: "north-star", onSelectFile: vi.fn(), onClose: vi.fn(), t: (key) => key };
}

describe("package file controls with the real tree and wrap hooks", () => {
  it("toggles the wrap control both ways and resets the override when a different file opens", async () => {
    // F2.4/F6.2 regression target: omit the content pane's file key, or make toggleWrap always set false.
    const user = userEvent.setup();
    const p = props();
    const view = render(<PackageFilesModal {...p} />);
    expect(screen.getByRole("button", { name: "Wrap: on" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Wrap: on" }));
    expect(screen.getByRole("button", { name: "Wrap: off" })).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: "Wrap: off" }));
    expect(screen.getByRole("button", { name: "Wrap: on" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Wrap: on" }));
    view.rerender(<PackageFilesModal {...p} selectedFile={p.files[1]!} />);
    expect(screen.getByRole("heading", { name: "docs/beta.md" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Wrap: on" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("# Beta")).toBeInTheDocument();
    expect(screen.queryByText("# Alpha")).not.toBeInTheDocument();
  });

  it("opens newly selected ancestors without moving focus and preserves an explicit collapse", async () => {
    // F2.1/F6.2 regression target: ignore selectedAncestors, or let selection override a manual toggle.
    const user = userEvent.setup();
    const p = props();
    const modal = (selectedFile: PackageFilesModalProps["selectedFile"]) => <PackageFilesModal {...p} selectedFile={selectedFile} />;
    const view = render(modal(p.selectedFile));
    const tree = screen.getByRole("tree", { name: "Package files" });
    const row = (name: string) => within(tree).getByRole("treeitem", { name });
    const alpha = row("alpha.md");
    alpha.focus();
    view.rerender(modal(p.files[1]!));
    expect(alpha).toHaveFocus();
    expect(row("docs")).toHaveAttribute("aria-expanded", "true");
    expect(row("beta.md")).toHaveAttribute("aria-selected", "true");
    await user.click(row("docs"));
    expect(row("docs")).toHaveAttribute("aria-expanded", "false");
    expect(within(tree).queryByRole("treeitem", { name: "beta.md" })).not.toBeInTheDocument();

    view.rerender(modal(p.files[2]!));
    expect(row("other")).toHaveAttribute("aria-expanded", "true");
    expect(row("gamma.md")).toHaveAttribute("aria-selected", "true");
    expect(row("docs")).toHaveAttribute("aria-expanded", "false");
    row("gamma.md").focus();
    await user.keyboard(" ");
    expect(vi.mocked(p.onSelectFile).mock.calls).toEqual([["other/gamma.md"]]);
    await user.keyboard("{Home}");
    expect(row("alpha.md")).toHaveFocus();
    await user.keyboard("{End}");
    expect(row("gamma.md")).toHaveFocus();
  });

  it("falls back to a remaining row when the focused file disappears and handles an empty listing", async () => {
    // F6.2 regression target: return focusedPath without checking that it is still visible.
    const user = userEvent.setup();
    const p = props();
    const view = render(<PackageFilesModal {...p} />);
    screen.getByRole("treeitem", { name: "alpha.md" }).focus();
    view.rerender(<PackageFilesModal {...p} files={[p.files[1]!]} selectedFile={p.files[1]!} />);
    const beta = screen.getByRole("treeitem", { name: "beta.md" });
    expect(beta).toHaveAttribute("tabindex", "0");
    beta.focus();
    await user.keyboard("{Enter}");
    expect(vi.mocked(p.onSelectFile).mock.calls).toEqual([["docs/beta.md"]]);
    view.rerender(<PackageFilesModal {...p} files={[]} selectedFile={null} status={{ text: "No files available", role: "status" }} />);
    expect(screen.getByRole("status")).toHaveTextContent("No files available");
    expect(screen.queryByRole("treeitem")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tree", { name: "Package files" }));
    await user.keyboard("{ArrowDown}{Enter}");
    expect(vi.mocked(p.onSelectFile).mock.calls).toEqual([["docs/beta.md"]]);
  });
});
