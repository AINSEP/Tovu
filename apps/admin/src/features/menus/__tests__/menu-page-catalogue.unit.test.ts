import { afterEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { defaultMenusPort } from "../hooks/menus-dependencies.hooks";

afterEach(() => vi.restoreAllMocks());

it("provides chosen pages' public paths, including the root page, for the stored URL snapshot", async () => {
  vi.spyOn(api, "listPages").mockResolvedValue({ posts: [
    { post: { id: "home", title: "Home", status: "published", slug: "/" } },
    { post: { id: "about", title: "About", status: "draft", slug: "about" } },
  ] } as Awaited<ReturnType<typeof api.listPages>>);
  expect(await defaultMenusPort.listPages!({})).toEqual({ pages: [
    { id: "home", title: "Home", status: "published", publicPath: "/" },
    { id: "about", title: "About", status: "draft", publicPath: "/about" },
  ] });
});
