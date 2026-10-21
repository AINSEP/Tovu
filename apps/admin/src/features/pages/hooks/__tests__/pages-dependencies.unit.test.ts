import { describe, expect, it } from "vitest";

import type { AdminPost } from "@/lib/api";

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
    await expect(port.updatePost({ id: "page-1" }, { title: "x" })).rejects.toThrow("disk full");
  });

  it("throws 'fake page not found' for an id not in the store", async () => {
    const port = createFakePagesPort({ pages: [PAGE] });
    await expect(port.updatePost({ id: "missing" }, { title: "x" })).rejects.toThrow(
      "fake page not found: missing",
    );
  });
});

describe("createFakePagesPort — deletePage guards", () => {
  it("throws the configured deleteError when set", async () => {
    const port = createFakePagesPort({ pages: [PAGE], deleteError: new Error("locked") });
    await expect(port.deletePage("page-1")).rejects.toThrow("locked");
  });

  it("throws 'fake page not found' for an id not in the store", async () => {
    const port = createFakePagesPort({ pages: [PAGE] });
    await expect(port.deletePage("missing")).rejects.toThrow("fake page not found: missing");
  });
});

describe("createFakePagesPort — simulateConcurrentSave", () => {
  it("bumps the stored page's version and title, as another session's save would", async () => {
    const port = createFakePagesPort({ pages: [PAGE] });
    port.simulateConcurrentSave("page-1");
    expect(port.pages[0]).toMatchObject({ title: "Saved by someone else", version: 2 });
    port.simulateConcurrentSave("page-1", "Renamed elsewhere");
    expect(port.pages[0]).toMatchObject({ title: "Renamed elsewhere", version: 3 });
  });

  it("throws 'fake page not found' for an id not in the store", () => {
    const port = createFakePagesPort({ pages: [PAGE] });
    expect(() => port.simulateConcurrentSave("missing")).toThrow("fake page not found: missing");
  });
});
