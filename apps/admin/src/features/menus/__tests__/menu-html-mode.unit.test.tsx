import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminMenu, AdminMenuItem } from "@/lib/api";
import { MenuEditor } from "../MenuEditor";
import { createFakeMenusPort } from "../hooks/menus-dependencies.hooks";
import { useMenuEditor } from "../hooks/use-menu-editor.hooks";
import { menuAuthoringForSave, menuHtmlStarter } from "../html-rules";

/**
 * @file The Edit menu screen's "Options" | "HTML" tabs (HTML-mode menus, backend in Jini 5c11404b +
 * Tovu 368b50e22). Mirrors forms' HTML mode: switching to HTML seeds a starter from the items when
 * the HTML is empty, Save sends the active mode, and the other mode's data survives a switch.
 */

const ITEMS: AdminMenuItem[] = [
  { id: "home", label: "Home", target: { kind: "url", href: "/" } },
  { id: "about", label: "About & us", target: { kind: "url", href: "/about?a=1&b=2" } },
];

const MENU: AdminMenu = {
  id: "m1",
  workspaceId: "ws",
  slug: "header-main",
  title: "Header",
  status: "published",
  items: ITEMS,
  locations: [],
  updatedAt: "2026-10-08T00:00:00.000Z",
  version: 3,
};

function deps(port = createFakeMenusPort({ menus: [MENU] })) {
  return { port, navigate: vi.fn(), t: (key: string) => key };
}

afterEach(() => vi.restoreAllMocks());

describe("menuHtmlStarter", () => {
  it("emits the theme's flat link shape for a flat menu, escaped", () => {
    expect(menuHtmlStarter({ items: ITEMS })).toBe(
      `<a href="/">Home</a>\n<a href="/about?a=1&amp;b=2">About &amp; us</a>`
    );
  });

  it("emits the tree renderer's ul/li classes when any item has children", () => {
    const items: AdminMenuItem[] = [
      { id: "docs", label: "Docs", target: { kind: "url", href: "/docs" }, children: [
        { id: "page", label: "Guide", target: { kind: "entryRef", entryId: "p1", lastKnownHref: "/guide" } as AdminMenuItem["target"] },
        { id: "route", label: "Search", target: { kind: "route", route: "search" } },
      ] },
    ];
    expect(menuHtmlStarter({ items })).toBe([
      `<ul class="menu-list depth-0">`,
      `  <li class="menu-item depth-0 has-children"><a href="/docs">Docs</a>`,
      `    <ul class="menu-list depth-1">`,
      `      <li class="menu-item depth-1"><a href="/guide">Guide</a></li>`,
      `      <li class="menu-item depth-1"><a href="#">Search</a></li>`,
      `    </ul>`,
      `  </li>`,
      `</ul>`,
    ].join("\n"));
  });

  it("gives an empty menu one example link to edit", () => {
    expect(menuHtmlStarter({ items: [] })).toBe(`<a href="/">Home</a>`);
  });
});

describe("menuAuthoringForSave", () => {
  it("sends mode+html in HTML mode, an explicit items switch only when the stored mode was html", () => {
    expect(menuAuthoringForSave({ mode: "html", html: "<a>x</a>", storedMode: undefined })).toEqual({ mode: "html", html: "<a>x</a>" });
    expect(menuAuthoringForSave({ mode: "items", html: "<a>x</a>", storedMode: "html" })).toEqual({ mode: "items" });
    expect(menuAuthoringForSave({ mode: "items", html: "", storedMode: "items" })).toEqual({});
    expect(menuAuthoringForSave({ mode: "items", html: "", storedMode: undefined })).toEqual({});
  });
});

describe("useMenuEditor — HTML mode", () => {
  it("opens an html-mode menu on the HTML tab with its stored markup", async () => {
    const { result } = renderHook(() => useMenuEditor("m1", deps(createFakeMenusPort({ menus: [{ ...MENU, mode: "html", html: "<b>hi</b>" }] }))));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.mode).toBe("html");
    expect(result.current.html).toBe("<b>hi</b>");
  });

  it("seeds the starter on first switch to HTML and keeps both modes' data across switches", async () => {
    const { result } = renderHook(() => useMenuEditor("m1", deps()));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.mode).toBe("items");
    act(() => result.current.changeMode("html"));
    expect(result.current.html).toBe(menuHtmlStarter({ items: ITEMS }));
    act(() => result.current.setHtml("<nav>mine</nav>"));
    act(() => result.current.changeMode("items"));
    expect(result.current.items).toEqual(ITEMS);
    act(() => result.current.changeMode("html"));
    expect(result.current.html).toBe("<nav>mine</nav>");
  });

  it("seeds page links with their public path from the page catalogue", async () => {
    const pageItem: AdminMenuItem = { id: "svc", label: "Services", target: { kind: "entryRef", entryId: "p9" } };
    const port = createFakeMenusPort({ menus: [{ ...MENU, items: [pageItem] }] });
    port.listPages = vi.fn().mockResolvedValue({ pages: [{ id: "p9", title: "Services", status: "published", publicPath: "/services" }] });
    const { result } = renderHook(() => useMenuEditor("m1", deps(port)));
    await waitFor(() => expect(result.current.pageChoices).toBeDefined());
    act(() => result.current.changeMode("html"));
    expect(result.current.html).toBe(`<a href="/services">Services</a>`);
  });

  it("seeds page links with their public path from the page catalogue", async () => {
    const pageItem: AdminMenuItem = { id: "svc", label: "Services", target: { kind: "entryRef", entryId: "p9" } };
    const port = createFakeMenusPort({ menus: [{ ...MENU, items: [pageItem] }] });
    port.listPages = vi.fn().mockResolvedValue({ pages: [{ id: "p9", title: "Services", status: "published", publicPath: "/services" }] });
    const { result } = renderHook(() => useMenuEditor("m1", deps(port)));
    await waitFor(() => expect(result.current.pageChoices).toBeDefined());
    act(() => result.current.changeMode("html"));
    expect(result.current.html).toBe(`<a href="/services">Services</a>`);
  });

  it("saves the HTML mode and re-baselines on the server's normalized markup", async () => {
    const port = createFakeMenusPort({ menus: [MENU] });
    const update = vi.spyOn(port, "updateMenuTree");
    const { result } = renderHook(() => useMenuEditor("m1", deps(port)));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.changeMode("html"));
    act(() => result.current.setHtml("<a href=\"/x\">X</a>"));
    await act(async () => { await result.current.save(); });
    expect(update).toHaveBeenCalledWith(
      { id: "m1", expectedVersion: 3, items: ITEMS },
      { title: "Header", slug: "header-main", mode: "html", html: "<a href=\"/x\">X</a>" }
    );
    expect(port.menus[0]).toMatchObject({ mode: "html", html: "<a href=\"/x\">X</a>" });
    expect(result.current.message).toBe("Saved · version 4");
  });

  it("switching an html menu back to Options saves an explicit items mode", async () => {
    const port = createFakeMenusPort({ menus: [{ ...MENU, mode: "html", html: "<b>hi</b>" }] });
    const update = vi.spyOn(port, "updateMenuTree");
    const { result } = renderHook(() => useMenuEditor("m1", deps(port)));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.changeMode("items"));
    await act(async () => { await result.current.save(); });
    expect(update.mock.calls[0]?.[1]).toEqual({ title: "Header", slug: "header-main", mode: "items" });
    expect(port.menus[0]).toMatchObject({ mode: "items", html: "<b>hi</b>" });
  });

  it("creates a new menu in HTML mode", async () => {
    const port = createFakeMenusPort();
    const create = vi.spyOn(port, "createMenu");
    const { result } = renderHook(() => useMenuEditor(null, deps(port)));
    act(() => { result.current.setTitle("Footer"); result.current.setSlug("footer"); });
    act(() => result.current.changeMode("html"));
    await act(async () => { await result.current.save(); });
    expect(create).toHaveBeenCalledWith({ title: "Footer", slug: "footer" }, { items: [], mode: "html", html: menuHtmlStarter({ items: [] }) });
  });

  it("treats an HTML edit as unsaved work", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { result } = renderHook(() => useMenuEditor("m1", deps()));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.confirmLeave()).toBe(true);
    act(() => result.current.changeMode("html"));
    expect(result.current.confirmLeave()).toBe(false);
    expect(confirm).toHaveBeenCalled();
  });

  it("shows the server's refusal (permission, size, unbalanced HTML) and keeps the edit", async () => {
    const port = createFakeMenusPort({ menus: [MENU] });
    port.updateMenuTree = vi.fn().mockRejectedValue(new Error("pages.edit_html permission required"));
    const { result } = renderHook(() => useMenuEditor("m1", deps(port)));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.changeMode("html"));
    act(() => result.current.setHtml("<b>"));
    await act(async () => { await result.current.save(); });
    expect(result.current.error).toBe("pages.edit_html permission required");
    expect(result.current.html).toBe("<b>");
  });
});

describe("MenuEditor — tabs and title row", () => {
  it("puts the slug on the title's row and switches Options/HTML tabs by click and arrow key", async () => {
    const user = userEvent.setup();
    const d = deps();
    const { container } = render(<MenuEditor menuId="m1" useMenuEditorHook={(id) => useMenuEditor(id, d)} />);
    const title = await screen.findByRole("textbox", { name: "Menu title" });
    const row = title.closest(".editor-title-row");
    expect(row).not.toBeNull();
    expect(row).toContainElement(screen.getByRole("textbox", { name: "Menu slug" }));

    const options = screen.getByRole("tab", { name: "Options" });
    expect(options).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "+ Add item" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "HTML" }));
    const source = screen.getByRole("textbox", { name: "Menu HTML" });
    expect(source).toHaveClass("page-html-source");
    expect(source).toHaveValue(menuHtmlStarter({ items: ITEMS }));
    expect(screen.queryByRole("button", { name: "+ Add item" })).not.toBeInTheDocument();
    expect(container.querySelector(".segmented[role=tablist]")).not.toBeNull();

    fireEvent.keyDown(screen.getByRole("tab", { name: "HTML" }), { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "Options" })).toHaveAttribute("aria-selected", "true");
  });

  it("shows a save refusal next to the HTML editor", async () => {
    const user = userEvent.setup();
    const port = createFakeMenusPort({ menus: [{ ...MENU, mode: "html", html: "<b>hi</b>" }] });
    port.updateMenuTree = vi.fn().mockRejectedValue(new Error("Menu HTML is too large"));
    const d = deps(port);
    render(<MenuEditor menuId="m1" useMenuEditorHook={(id) => useMenuEditor(id, d)} />);
    expect(await screen.findByRole("tab", { name: "HTML" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Menu HTML is too large");
  });
});
