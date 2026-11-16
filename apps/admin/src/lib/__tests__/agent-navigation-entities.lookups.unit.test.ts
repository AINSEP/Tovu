import { afterEach, expect, it, vi } from "vitest";
import { api, type AdminPost } from "../api";
import { lookupAdminNavigationEntity } from "../agent-navigation-entities";

afterEach(() => vi.restoreAllMocks());

it("resolves a post to its id param through the post read", async () => {
  const getPost = vi.spyOn(api, "getPost").mockResolvedValue({ post: { id: "post-9" } as AdminPost } as never);
  expect(await lookupAdminNavigationEntity({ type: "post", id: "p" })).toEqual({ params: { postId: "post-9" } });
  expect(getPost).toHaveBeenCalledExactlyOnceWith({ id: "p" });
});

it("resolves a menu to its id param through the menu read", async () => {
  const getMenu = vi.spyOn(api, "getMenu").mockResolvedValue({ menu: { id: "menu-3" } } as never);
  expect(await lookupAdminNavigationEntity({ type: "menu", id: "m" })).toEqual({ params: { menuId: "menu-3" } });
  expect(getMenu).toHaveBeenCalledExactlyOnceWith({ id: "m" });
});

it("resolves a widget to its id param through the widget read", async () => {
  const getWidget = vi.spyOn(api, "getWidget").mockResolvedValue({ widget: { id: "w-1" } } as never);
  expect(await lookupAdminNavigationEntity({ type: "widget", id: "w" })).toEqual({ params: { widgetId: "w-1" } });
  expect(getWidget).toHaveBeenCalledExactlyOnceWith({ id: "w" });
});

it("refuses an entity type it has no lookup for, without reading anything", async () => {
  const getPost = vi.spyOn(api, "getPost");
  expect(await lookupAdminNavigationEntity({ type: "toString", id: "x" })).toBeNull();
  expect(await lookupAdminNavigationEntity({ type: "unknown-kind", id: "x" })).toBeNull();
  expect(getPost).not.toHaveBeenCalled();
});

it("lets a failed read propagate instead of guessing a destination", async () => {
  vi.spyOn(api, "getPost").mockRejectedValue(new Error("403 forbidden"));
  await expect(lookupAdminNavigationEntity({ type: "post", id: "p" })).rejects.toThrow("403 forbidden");
});
