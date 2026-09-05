import { describe, expect, it } from "vitest";

import type { AdminPost } from "@/lib/api";

/**
 * @file Coverage for `pages-dependencies.hooks.ts`'s `createFakePagesPort` gaps. Every existing
 * caller in `use-pages.unit.test.ts` supplies `pages` explicitly and never sets `updateError` /
 * `deleteError`, so the port's `options.pages ?? []` default and its four error/not-found guard
 * branches were never reached.
 *
 * `fakePage()`'s own `overrides.id ?? "fake-page-1"` default (private, unexported) is NOT covered
 * here — see the structural finding in the coverage report: its one caller (`createPage`) always
 * supplies `id` explicitly, so that default branch has no reachable path through this module's
 * public surface at all.
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
