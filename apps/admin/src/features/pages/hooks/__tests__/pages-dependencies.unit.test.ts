import { describe, expect, it } from "vitest";

import type { AdminPost } from "@/features/posts/api/posts-api.types";

/**
 * @file Coverage for `pages-dependencies.hooks.ts`'s `createFakePagesPort` gaps. Every existing
 * caller in `use-pages.unit.test.ts` supplies `pages` explicitly and never sets `updateError` /
 * `deleteError`, so the port's `options.pages ?? []` default and its four error/not-found guard
 * branches were never reached.
 *
 * `fakePage()`'s old `overrides.id ?? "fake-page-1"` default (private, unexported) was never
 * covered here: its one caller (`createPage`) always supplies `id` explicitly, so that default
 * branch had no reachable path through this module's public surface at all. It was removed
 * (2026-10-21); `fakePage` now requires `id`.
 */

const { createFakePagesPort } = await import("../pages-dependencies.hooks");

const PAGE: AdminPost = {
  id: "page-1",
  workspaceId: "ws-1",
  kind: "page",
  title: "Privacy Policy",
  slug: "privacy-policy",
  bodyJson: {},
  bodyFormat: "html",
  bodyHtml: "<p>hello</p>",
  status: "published",
  templateChoice: null,
  overridesThemePage: false,
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
} as AdminPost;

describe("createFakePagesPort — pages default", () => {
  it("defaults to an empty store when pages is omitted", async () => {
    const port = createFakePagesPort();
    expect(port.pages).toEqual([]);
    await expect(port.listPages()).resolves.toEqual({ posts: [] });
  });
});

describe("createFakePagesPort — updatePost guards", () => {
  it("throws the configured updateError when set", async () => {
    const port = createFakePagesPort({ pages: [PAGE], updateError: new Error("disk full") });
    await expect(port.updatePost({ target: { id: "page-1" }, patch: { title: "x" } })).rejects.toThrow("disk full");
  });

  it("throws 'fake page not found' for an id not in the store", async () => {
    const port = createFakePagesPort({ pages: [PAGE] });
    await expect(port.updatePost({ target: { id: "missing" }, patch: { title: "x" } })).rejects.toThrow(
      "fake page not found: missing",
    );
  });
});

describe("createFakePagesPort — deletePage guards", () => {
  it("throws the configured deleteError when set", async () => {
    const port = createFakePagesPort({ pages: [PAGE], deleteError: new Error("locked") });
    await expect(port.deletePage({ id: "page-1" })).rejects.toThrow("locked");
  });

  it("throws 'fake page not found' for an id not in the store", async () => {
    const port = createFakePagesPort({ pages: [PAGE] });
    await expect(port.deletePage({ id: "missing" })).rejects.toThrow("fake page not found: missing");
  });
});

describe("createFakePagesPort — simulateConcurrentSave", () => {
  it("bumps the stored page's version and title, as another session's save would", async () => {
    const port = createFakePagesPort({ pages: [PAGE] });
    port.simulateConcurrentSave({ id: "page-1" });
    expect(port.pages[0]).toMatchObject({ title: "Saved by someone else", version: 2 });
    port.simulateConcurrentSave({ id: "page-1" }, { title: "Renamed elsewhere" });
    expect(port.pages[0]).toMatchObject({ title: "Renamed elsewhere", version: 3 });
  });

  it("throws 'fake page not found' for an id not in the store", () => {
    const port = createFakePagesPort({ pages: [PAGE] });
    expect(() => port.simulateConcurrentSave({ id: "missing" })).toThrow("fake page not found: missing");
  });
});

describe("defaultPagesPort.updatePost", () => {
  it("saves through the shared route as a page, so a failure reads page and not post", async () => {
    const { postsApi } = await import("@/features/posts/api/posts-api");
    const { vi } = await import("vitest");
    const spy = vi.spyOn(postsApi, "updatePost").mockResolvedValue({} as never);
    const { defaultPagesPort } = await import("../pages-dependencies.hooks");
    await defaultPagesPort.updatePost({ target: { id: "page-1" }, patch: { title: "x" } });
    expect(spy).toHaveBeenCalledWith({ id: "page-1" }, { options: { title: "x" }, entry: "page" });
    spy.mockRestore();
  });
});
