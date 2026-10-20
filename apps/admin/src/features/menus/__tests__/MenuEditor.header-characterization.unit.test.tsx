import { fireEvent, render, screen } from "@/__tests__/fetch-query-render";
import { describe, expect, it, vi } from "vitest";

import type { AdminMenu } from "@/lib/api";
import { MenuEditor } from "../MenuEditor";
import type { MenuEditorController } from "../hooks/use-menu-editor.hooks";

const MENU: AdminMenu = {
  id: "m1", workspaceId: "ws", title: "Docs", slug: "docs", status: "published",
  items: [], locations: [], version: 1, updatedAt: "2026-10-20",
};

function controller({ overrides = {} }: { overrides?: Partial<MenuEditorController> }, _options = {}): MenuEditorController {
  return {
    copyHtmlEmbed: vi.fn(async () => {}), copyFeedback: null, isNew: false, menu: MENU,
    title: "Docs", setTitle: vi.fn(), slug: "docs", setSlug: vi.fn(), items: [],
    mode: "items", changeMode: vi.fn(), html: "", setHtml: vi.fn(), message: null,
    error: null, loading: false, confirmLeave: vi.fn(() => true), changeAt: vi.fn(),
    removeAt: vi.fn(), addChildAt: vi.fn(), moveAt: vi.fn(), addRootItem: vi.fn(),
    save: vi.fn(async () => {}), saving: false, t: (key) => key, ...overrides,
  };
}

// These tests target the original full editor's public hook seam, before header extraction.
describe("MenuEditor header characterization", () => {
  it.each([true, false])("uses the create/edit title when isNew=%s", (isNew) => {
    const editor = controller({ overrides: { isNew } });
    render(<MenuEditor menuId="m1" useMenuEditorHook={() => editor} />);
    const header = screen.getByRole("heading", { name: isNew ? "New menu" : "Edit menu" }).closest(".page-header");
    expect(header).toHaveClass("page-header-split");
    expect(header).toContainElement(screen.getByRole("link", { name: "Back: Menus" }));
    expect(header).toContainElement(screen.getByRole("button", { name: "Save" }));
  });

  it.each([true, false])("shows the copy action only for a saved menu: %s", (saved) => {
    const editor = controller({ overrides: { menu: saved ? MENU : null, isNew: !saved } });
    render(<MenuEditor menuId={saved ? "m1" : null} useMenuEditorHook={() => editor} />);
    if (!saved) {
      expect(screen.queryByRole("button", { name: "Copy HTML embed" })).not.toBeInTheDocument();
      return;
    }
    fireEvent.click(screen.getByRole("button", { name: "Copy HTML embed" }));
    expect(editor.copyHtmlEmbed).toHaveBeenCalledTimes(1);
  });

  it.each([
    { copyFeedback: null, message: null },
    { copyFeedback: "", message: "" },
    { copyFeedback: "Copied!", message: null },
    { copyFeedback: null, message: "Saved · version 2" },
    { copyFeedback: "Could not copy embed", message: "Saved · version 2" },
  ])("renders independent feedback and save status: %j", (overrides) => {
    const editor = controller({ overrides });
    const { container } = render(<MenuEditor menuId="m1" useMenuEditorHook={() => editor} />);
    const status = screen.queryByRole("status");
    if (overrides.copyFeedback) expect(status).toHaveTextContent(overrides.copyFeedback);
    else expect(status).toBeNull();
    const saved = container.querySelector(".save-ok");
    if (overrides.message) expect(saved).toHaveTextContent(overrides.message);
    else expect(saved).toBeNull();
    expect(container.querySelector(".page-header-actions")).toContainElement(screen.getByRole("button", { name: "Save" }));
  });

  it.each([true, false])("honors the saving state: %s", (saving) => {
    const editor = controller({ overrides: { saving } });
    render(<MenuEditor menuId="m1" useMenuEditorHook={() => editor} />);
    const save = screen.getByRole("button", { name: "Save" });
    if (saving) expect(save).toBeDisabled();
    else expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(editor.save).toHaveBeenCalledTimes(saving ? 0 : 1);
  });

  it.each([true, false])("honors the leave guard result: %s", (allowed) => {
    const editor = controller({ overrides: { confirmLeave: vi.fn(() => allowed) } });
    render(<MenuEditor menuId="m1" useMenuEditorHook={() => editor} />);
    const link = screen.getByRole("link", { name: "Back: Menus" });
    expect(link).toHaveAttribute("href", "/admin/menus");
    expect(link).toHaveTextContent("← Back");
    let prevented: boolean | undefined;
    const observe = (event: MouseEvent) => {
      prevented = event.defaultPrevented;
      event.preventDefault(); // jsdom cannot perform the browser's default navigation.
    };
    document.addEventListener("click", observe, { once: true });
    try {
      fireEvent.click(link);
      expect(editor.confirmLeave).toHaveBeenCalledTimes(1);
      expect(prevented).toBe(!allowed);
    } finally {
      document.removeEventListener("click", observe);
    }
  });
});
