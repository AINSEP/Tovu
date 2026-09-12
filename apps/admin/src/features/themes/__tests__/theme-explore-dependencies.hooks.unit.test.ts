import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
import { createFakeThemeExplorePort, defaultThemeExplorePort } from "../hooks/theme-explore-dependencies.hooks";

/**
 * @file `theme-explore-dependencies.hooks.ts` bundles `defaultThemeExplorePort` (the real wiring
 * to `lib/api`) and `createFakeThemeExplorePort` (the in-memory test double `use-theme-explore
 * .hooks.unit.test.ts` and `ThemeExplore.unit.test.tsx` use instead of it). `defaultThemeExplorePort`
 * is only reachable via `useWiredThemeExplore`, which no existing suite calls, so none of its eight
 * methods had ever executed. The fake's `resetThemeFile`/`renameThemeFile` are also never called by
 * any existing suite — rename/reset tests there override `port.renameThemeFile`/`port.resetThemeFile`
 * with a `vi.fn()` instead of driving the fake's own logic — and `copyThemeFile`/`setPagePublished`'s
 * not-found branches are untested. This suite covers both directly.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe("defaultThemeExplorePort — real api wiring", () => {
  it("getThemeDetail delegates to api.getThemeDetail with the theme id, narrowing the response", async () => {
    const spy = vi.spyOn(api, "getThemeDetail").mockResolvedValue({
      id: "basic",
      name: "Basic",
      tier: "declarative",
      status: "active",
      errors: [],
      pages: [],
      partials: [],
      lineage: null,
      hasOriginal: true,
      files: [],
    } as never);
    await expect(defaultThemeExplorePort.getThemeDetail("basic")).resolves.toMatchObject({ id: "basic" });
    expect(spy).toHaveBeenCalledWith("basic");
  });

  it("getThemeFile delegates to api.getThemeFile with the theme id and path", async () => {
    const spy = vi.spyOn(api, "getThemeFile").mockResolvedValue({ path: "pages/index.html", content: "<html></html>" });
    await expect(defaultThemeExplorePort.getThemeFile("basic", "pages/index.html")).resolves.toMatchObject({
      content: "<html></html>",
    });
    expect(spy).toHaveBeenCalledWith("basic", "pages/index.html");
  });

  it("putThemeFile delegates to api.putThemeFile with the theme id, path, and content", async () => {
    const spy = vi.spyOn(api, "putThemeFile").mockResolvedValue({ path: "pages/index.html", bytes: 42 });
    await expect(defaultThemeExplorePort.putThemeFile("basic", "pages/index.html", "<html/>")).resolves.toEqual({
      path: "pages/index.html",
      bytes: 42,
    });
    expect(spy).toHaveBeenCalledWith("basic", "pages/index.html", "<html/>");
  });

  it("resetThemeFile delegates to api.resetThemeFile with the theme id and path", async () => {
    const spy = vi
      .spyOn(api, "resetThemeFile")
      .mockResolvedValue({ path: "pages/index.html", wasModified: true, bytes: 10, content: "orig" });
    await expect(defaultThemeExplorePort.resetThemeFile("basic", "pages/index.html")).resolves.toMatchObject({
      content: "orig",
    });
    expect(spy).toHaveBeenCalledWith("basic", "pages/index.html");
  });

  it("renameThemeFile delegates to api.renameThemeFile with the theme id, path, and new name", async () => {
    const spy = vi.spyOn(api, "renameThemeFile").mockResolvedValue({
      path: "pages/about.html",
      group: "page",
      readable: true,
      editable: true,
      resettable: false,
      modified: null,
      renamedFrom: "pages/old.html",
    });
    await expect(defaultThemeExplorePort.renameThemeFile("basic", "pages/old.html", "about.html")).resolves.toMatchObject({
      path: "pages/about.html",
    });
    expect(spy).toHaveBeenCalledWith("basic", "pages/old.html", "about.html");
  });

  it("copyThemeFile delegates to api.copyThemeFile with the theme id and path", async () => {
    const spy = vi.spyOn(api, "copyThemeFile").mockResolvedValue({
      path: "pages/about-1.html",
      group: "page",
      readable: true,
      editable: true,
      resettable: false,
      modified: null,
      copiedFrom: "pages/about.html",
    });
    await expect(defaultThemeExplorePort.copyThemeFile("basic", "pages/about.html")).resolves.toMatchObject({
      path: "pages/about-1.html",
    });
    expect(spy).toHaveBeenCalledWith("basic", "pages/about.html");
  });

  it("deleteThemeFile delegates to api.deleteThemeFile with the theme id and path", async () => {
    const spy = vi.spyOn(api, "deleteThemeFile").mockResolvedValue({ path: "pages/about.html", deleted: true });
    await expect(defaultThemeExplorePort.deleteThemeFile("basic", "pages/about.html")).resolves.toMatchObject({
      path: "pages/about.html",
    });
    expect(spy).toHaveBeenCalledWith("basic", "pages/about.html");
  });

  it("setPagePublished delegates to api.setThemePagePublished with the theme id, page, and published flag", async () => {
    const spy = vi.spyOn(api, "setThemePagePublished").mockResolvedValue({
      page: "about",
      published: true,
      publishedPages: ["about"],
    });
    await expect(defaultThemeExplorePort.setPagePublished("basic", "about", true)).resolves.toMatchObject({
      page: "about",
      published: true,
    });
    expect(spy).toHaveBeenCalledWith("basic", "about", true);
  });
});

describe("createFakeThemeExplorePort — getThemeFile", () => {
  it("rejects when the path has no recorded content", async () => {
    const port = createFakeThemeExplorePort({ contents: {} });
    await expect(port.getThemeFile("basic", "pages/ghost.html")).rejects.toThrow(
      "fake theme file not found: pages/ghost.html"
    );
  });
});

describe("createFakeThemeExplorePort — resetThemeFile", () => {
  it("resolves the current in-memory content for the path", async () => {
    const port = createFakeThemeExplorePort({ contents: { "pages/index.html": "<h1>hi</h1>" } });
    await expect(port.resetThemeFile("basic", "pages/index.html")).resolves.toEqual({ content: "<h1>hi</h1>" });
  });

  it("resolves an empty string when the path has no recorded content", async () => {
    const port = createFakeThemeExplorePort({ contents: {} });
    await expect(port.resetThemeFile("basic", "pages/missing.html")).resolves.toEqual({ content: "" });
  });
});

describe("createFakeThemeExplorePort — renameThemeFile", () => {
  it("moves the file's content and file-list entry to the new name, leaving sibling files untouched", async () => {
    const port = createFakeThemeExplorePort({
      files: [
        { path: "pages/old.html", group: "page", readable: true, editable: true, resettable: true },
        { path: "pages/about.html", group: "page", readable: true, editable: true, resettable: true },
      ],
      contents: { "pages/old.html": "<h1>old</h1>" },
    });

    await expect(port.renameThemeFile("basic", "pages/old.html", "new.html")).resolves.toEqual({ path: "pages/new.html" });

    const detail = await port.getThemeDetail("basic");
    expect(detail.files).toEqual([
      { path: "pages/new.html", group: "page", readable: true, editable: true, resettable: true },
      { path: "pages/about.html", group: "page", readable: true, editable: true, resettable: true },
    ]);
    await expect(port.getThemeFile("basic", "pages/new.html")).resolves.toEqual({ content: "<h1>old</h1>" });
  });

  it("still relabels the file-list entry when the path has no recorded content", async () => {
    const port = createFakeThemeExplorePort({
      files: [{ path: "pages/old.html", group: "page", readable: true, editable: true, resettable: true }],
      contents: {},
    });

    await expect(port.renameThemeFile("basic", "pages/old.html", "new.html")).resolves.toEqual({ path: "pages/new.html" });
    const detail = await port.getThemeDetail("basic");
    expect(detail.files[0]?.path).toBe("pages/new.html");
  });
});

describe("createFakeThemeExplorePort — copyThemeFile", () => {
  it("appends the copy to the file list and copies its content when the source is a known file", async () => {
    const port = createFakeThemeExplorePort({
      files: [{ path: "pages/about.html", group: "page", readable: true, editable: true, resettable: true }],
      contents: { "pages/about.html": "<h1>about</h1>" },
    });

    await expect(port.copyThemeFile("basic", "pages/about.html")).resolves.toEqual({ path: "pages/about-1.html" });

    const detail = await port.getThemeDetail("basic");
    expect(detail.files.map((f) => f.path)).toEqual(["pages/about.html", "pages/about-1.html"]);
    await expect(port.getThemeFile("basic", "pages/about-1.html")).resolves.toEqual({ content: "<h1>about</h1>" });
  });

  it("still returns the computed destination path when the source is not in the file list", async () => {
    const port = createFakeThemeExplorePort({ files: [], contents: {} });
    await expect(port.copyThemeFile("basic", "pages/ghost.html")).resolves.toEqual({ path: "pages/ghost-1.html" });
    const detail = await port.getThemeDetail("basic");
    expect(detail.files).toEqual([]);
  });

  it("suffixes an extensionless base name directly", async () => {
    const port = createFakeThemeExplorePort({ files: [], contents: {} });
    await expect(port.copyThemeFile("basic", "scripts/README")).resolves.toEqual({ path: "scripts/README-1" });
  });
});

describe("createFakeThemeExplorePort — setPagePublished", () => {
  it("updates the matching page file's published flag", async () => {
    const port = createFakeThemeExplorePort({
      files: [{ path: "pages/about.html", group: "page", readable: true, editable: true, resettable: true }],
    });
    await expect(port.setPagePublished("basic", "about", false)).resolves.toEqual({ page: "about", published: false });
    const detail = await port.getThemeDetail("basic");
    expect(detail.files[0]).toMatchObject({ published: false });
  });

  it("rejects when no page file matches the given page id", async () => {
    const port = createFakeThemeExplorePort({ files: [] });
    await expect(port.setPagePublished("basic", "ghost", true)).rejects.toThrow("fake theme page not found: ghost");
  });
});
