import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AdminMenu } from "@/lib/api";
import { MenuEditor } from "../MenuEditor";
import { useMenuEditor } from "../hooks/use-menu-editor.hooks";
import { createFakeMenusPort } from "../hooks/menus-dependencies.hooks";
import { menuHtmlEmbed } from "../html-rules";
import { MENUS_DICT } from "../menus-i18n";
import { FORMS_DICT } from "../../forms/forms-i18n";

const menu: AdminMenu = { id: "m1", workspaceId: "ws", title: "Docs", slug: "docs", status: "published", items: [], locations: [], version: 1, updatedAt: "2026-10-04" };

describe("menu Copy HTML embed", () => {
  it("copies the saved slug through the editor button, including after a slug edit", async () => {
    const user = userEvent.setup();
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
    const port = createFakeMenusPort({ menus: [menu] });
    const dependencies = { port, clipboard, navigate: vi.fn(), t: (key: string) => key };
    render(<MenuEditor menuId="docs" useMenuEditorHook={(id) => useMenuEditor(id, dependencies)} />);
    await user.click(await screen.findByRole("button", { name: "Copy HTML embed" }));
    expect(clipboard.writeText).toHaveBeenCalledWith(`<div data-embed-config='{"type":"menu","id":"docs","mode":"html"}'></div>`);
    expect(await screen.findByRole("status")).toHaveTextContent("Copied!");
    const slug = screen.getByRole("textbox", { name: "Menu slug" });
    await user.clear(slug);
    await user.type(slug, "unsaved-slug");
    await user.click(screen.getByRole("button", { name: "Copy HTML embed" }));
    expect(clipboard.writeText).toHaveBeenLastCalledWith(menuHtmlEmbed({ slug: menu.slug }));
  });

  it("reports clipboard failure and exposes no embed on an unsaved menu", async () => {
    const port = createFakeMenusPort({ menus: [menu] });
    const clipboard = { writeText: vi.fn().mockRejectedValue(new Error("denied")) };
    const dependencies = { port, clipboard, navigate: vi.fn(), t: (key: string) => key };
    const { result } = renderHook(() => useMenuEditor("docs", dependencies));
    await waitFor(() => expect(result.current.menu?.id).toBe(menu.id));
    await act(async () => { await result.current.copyHtmlEmbed(); });
    expect(result.current.copyFeedback).toBe("Could not copy embed");
    render(<MenuEditor menuId={null} useMenuEditorHook={(id) => useMenuEditor(id, dependencies)} />);
    expect(screen.queryByRole("button", { name: "Copy HTML embed" })).not.toBeInTheDocument();
  });

  it("escapes attribute delimiters and translates the controls in every forms-supported locale", () => {
    expect(menuHtmlEmbed({ slug: "O'Reilly" })).toContain('"id":"O&#39;Reilly"');
    for (const locale of Object.keys(FORMS_DICT)) {
      for (const key of ["Copy HTML embed", "Copied!", "Could not copy embed"]) expect(MENUS_DICT[locale]?.[key], `${locale}:${key}`).toBeTruthy();
    }
  });
});
