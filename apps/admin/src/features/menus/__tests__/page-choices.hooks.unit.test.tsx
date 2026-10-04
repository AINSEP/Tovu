import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { AdminMenu } from "@/lib/api";
import { useMenuEditor } from "../hooks/use-menu-editor.hooks";
import { createFakeMenusPort } from "../hooks/menus-dependencies.hooks";
import { targetForKind } from "../page-link-rules";

const menu: AdminMenu = { id: "footer", workspaceId: "ws", slug: "footer-nav", title: "Footer", status: "published", locations: [], version: 1, updatedAt: "2026-10-04",
  items: [{ id: "about", label: "About", target: { kind: "url", href: "/about" } }],
};

it("loads the page catalogue when a URL item is switched to Page, and saves a stable reference", async () => {
  const pages = [{ id: "about-page", title: "About us", status: "published" as const, publicPath: "/about" }];
  const listPages = vi.fn().mockResolvedValue({ pages });
  const fake = createFakeMenusPort({ menus: [menu] });
  const port = { ...fake, listPages };
  const { result } = renderHook(() => useMenuEditor("footer", { port, navigate: () => {}, t: (key) => key }));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(listPages).not.toHaveBeenCalled();
  act(() => result.current.changeAt([0], (item) => ({ ...item, target: targetForKind({ kind: "page", prev: { kind: "entryRef", entryId: "about-page" } }) })));
  await waitFor(() => expect(result.current.pageChoices).toEqual(pages));
  expect(listPages).toHaveBeenCalledTimes(1);
  await act(() => result.current.save());
  expect(fake.menus[0].items[0].target).toEqual({ kind: "entryRef", entryId: "about-page", entryType: "page", lastKnownHref: "/about" });
});

it("loads pages for legacy unhinted refs and saves nested page metadata while preserving generic entries", async () => {
  const legacy: AdminMenu = { ...menu, items: [{ id: "parent", target: { kind: "url", href: "/" }, children: [
    { id: "about", target: { kind: "entryRef", entryId: "about-page" } },
    { id: "post", target: { kind: "entryRef", entryId: "post-1" } },
  ] }] };
  const fake = createFakeMenusPort({ menus: [legacy] });
  const pages = [{ id: "about-page", title: "About", status: "published" as const, publicPath: "/our-story" }];
  const port = { ...fake, listPages: vi.fn().mockResolvedValue({ pages }) };
  const { result } = renderHook(() => useMenuEditor("footer", { port, navigate: () => {}, t: (key) => key }));
  await waitFor(() => expect(result.current.pageChoices).toEqual(pages));
  await act(() => result.current.save());
  expect(fake.menus[0].items[0].children?.map((item) => item.target)).toEqual([
    { kind: "entryRef", entryId: "about-page", entryType: "page", lastKnownHref: "/our-story" },
    { kind: "entryRef", entryId: "post-1" },
  ]);
});

it("drops an old page catalogue after the editor navigates to a URL-only menu", async () => {
  let resolvePages!: (value: { pages: Array<{ id: string; title: string; status: "published" }> }) => void;
  const pending = new Promise<{ pages: Array<{ id: string; title: string; status: "published" }> }>((resolve) => { resolvePages = resolve; });
  const referenced = { ...menu, items: [{ ...menu.items[0], target: targetForKind({ kind: "page", prev: { kind: "entryRef", entryId: "about-page" } }) }] };
  const other = { ...menu, id: "other", slug: "other", title: "Other" };
  const listPages = vi.fn().mockReturnValue(pending);
  const port = { ...createFakeMenusPort({ menus: [referenced, other] }), listPages };
  const { result, rerender } = renderHook(({ id }) => useMenuEditor(id, { port, navigate: () => {}, t: (key) => key }), { initialProps: { id: "footer" } });
  await waitFor(() => expect(listPages).toHaveBeenCalledTimes(1));
  rerender({ id: "other" });
  await waitFor(() => expect(result.current.title).toBe("Other"));
  await act(async () => { resolvePages({ pages: [{ id: "old", title: "Old catalogue", status: "published" }] }); await pending; });
  expect(result.current.pageChoices).toBeUndefined();
});
