import { describe, expect, it, vi } from "vitest";

import type { AdminPost } from "@/lib/api";

/**
 * @file Coverage for `page-editor-dependencies.hooks.ts`'s remaining gaps:
 * - `defaultPageEditorPort.deletePage` — every existing suite (`PageEditor.unit.test.tsx`,
 *   `use-page-editor.unit.test.ts`) exercises the real port for load/save/preview but never
 *   deletes through it; delete-through-the-hook is only exercised via `createFakePageEditorPort`.
 * - `createFakePageEditorPort(...).current` — the getter test doubles use to inspect
 *   post-write state is never actually read by any existing test.
 * - the fake port's three "unknown page id" guard clauses (`updatePageHtml`, `updatePost`,
 *   `deletePage`) — unreachable through `usePageEditor` itself (it only ever calls these with the
 *   loaded page's own id), so they're exercised here by direct invocation with a mismatched id,
 *   the fake's own defensive contract.
 * - `getPresentation()`'s `activeThemeTemplates ?? []` default and `templatePreviewUrl`'s
 *   `templateChoice ?? ""` default — mutation-swept SURVIVED against the full existing suite:
 *   `use-page-editor.unit.test.ts`'s own `fakeDeps()` omits `activeThemeTemplates` in three tests
 *   (exercising the default) but never asserts `availableTemplates`, a gap that file's own header
 *   comment already names ("`availableTemplates` simply ends up `undefined` rather than `[]`,
 *   which nothing in these hook-level [tests] checks"); nothing calls the fake's
 *   `templatePreviewUrl` at all. Both closed here directly rather than by adding an assertion to
 *   that file's existing tests.
 */

const { deletePage } = vi.hoisted(() => ({ deletePage: vi.fn() }));

vi.mock("../../../../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/api")>();
  return { ...actual, api: { ...actual.api, deletePage } };
});

const { createFakePageEditorPort, defaultPageEditorPort } = await import("../page-editor-dependencies.hooks");

const PAGE: AdminPost = {
  id: "page-1",
  workspaceId: "w1",
  kind: "page",
  slug: "privacy-policy",
  title: "Privacy Policy",
  status: "published",
  bodyJson: {},
  bodyFormat: "html",
  bodyHtml: "<p>hello</p>",
  templateChoice: null,
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
};

describe("defaultPageEditorPort.deletePage", () => {
  it("forwards id to api.deletePage, returning the response unchanged", async () => {
    const response = { post: PAGE };
    deletePage.mockResolvedValue(response);
    await expect(defaultPageEditorPort.deletePage("page-1")).resolves.toEqual(response);
    expect(deletePage).toHaveBeenCalledWith("page-1");
  });
});

describe("createFakePageEditorPort — .current and id-mismatch guards", () => {
  it("current reflects the seeded page, then each write in turn", async () => {
    const port = createFakePageEditorPort({ page: PAGE });
    expect(port.current).toEqual(PAGE);

    await port.updatePageHtml("page-1", "<p>edited</p>");
    expect(port.current.bodyHtml).toBe("<p>edited</p>");

    await port.updatePost({ id: "page-1" }, { title: "Renamed" });
    expect(port.current.title).toBe("Renamed");
  });

  it("updatePageHtml rejects for an id that doesn't match the seeded page", async () => {
    const port = createFakePageEditorPort({ page: PAGE });
    await expect(port.updatePageHtml("wrong-id", "<p>x</p>")).rejects.toThrow(
      "fake page editor port: unknown page id wrong-id",
    );
  });

  it("updatePost rejects for an id that doesn't match the seeded page", async () => {
    const port = createFakePageEditorPort({ page: PAGE });
    await expect(port.updatePost({ id: "wrong-id" }, { title: "x" })).rejects.toThrow(
      "fake page editor port: unknown page id wrong-id",
    );
  });

  it("deletePage rejects for an id that doesn't match the seeded page", async () => {
    const port = createFakePageEditorPort({ page: PAGE });
    await expect(port.deletePage("wrong-id")).rejects.toThrow(
      "fake page editor port: unknown page id wrong-id",
    );
    expect(port.deleteCalled).toBe(false);
  });
});

describe("createFakePageEditorPort — getPresentation and templatePreviewUrl defaults", () => {
  it("getPresentation defaults activeThemeTemplates to [] when not seeded", async () => {
    const port = createFakePageEditorPort({ page: PAGE });
    await expect(port.getPresentation()).resolves.toMatchObject({ activeThemeTemplates: [] });
  });

  it("templatePreviewUrl defaults templateChoice to '' when null", () => {
    const port = createFakePageEditorPort({ page: PAGE });
    expect(port.templatePreviewUrl("page-1", null)).toBe("fake://template-preview/page-1?templateChoice=");
  });

  it("templatePreviewUrl includes an explicit templateChoice", () => {
    const port = createFakePageEditorPort({ page: PAGE });
    expect(port.templatePreviewUrl("page-1", "blog-post.html")).toBe(
      "fake://template-preview/page-1?templateChoice=blog-post.html",
    );
  });
});
