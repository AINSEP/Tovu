import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import type { AdminMenu } from "@/lib/api";
import { MenuEditor } from "../MenuEditor";
import { useMenuEditor } from "../hooks/use-menu-editor.hooks";
import { createFakeMenusPort } from "../hooks/menus-dependencies.hooks";

it("shows the Page picker for a migrated unhinted UUID and retains both fields after Save/reload", async () => {
  const entryId = "fe955b36-717f-4824-8b27-f5c8d3acf854";
  const menu: AdminMenu = { id: "footer", workspaceId: "ws", slug: "footer-nav", title: "Footer", status: "published",
    locations: [], version: 1, updatedAt: "2026-10-04", items: [{ id: "about", label: "About", target: { kind: "entryRef", entryId } }] };
  const fake = createFakeMenusPort({ menus: [menu] });
  const port = { ...fake, listPages: async () => ({ pages: [{ id: entryId, title: "About us", status: "published" as const, publicPath: "/about" }] }) };
  const useEditor = (id: string | null) => useMenuEditor(id, { port, navigate: () => {}, t: (key) => key });
  const view = render(<MenuEditor menuId="footer" useMenuEditorHook={useEditor} />);
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Page" })).toHaveValue(entryId));
  expect(screen.queryByRole("textbox", { name: "Entry ID" })).toBeNull();
  expect(screen.getByRole("option", { name: "About us" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(fake.menus[0].version).toBe(2));
  expect(fake.menus[0].items[0].target).toEqual({ kind: "entryRef", entryId, entryType: "page", lastKnownHref: "/about" });
  view.unmount();
  render(<MenuEditor menuId="footer" useMenuEditorHook={useEditor} />);
  await waitFor(() => expect(screen.getByRole("combobox", { name: "Page" })).toHaveValue(entryId));
});
