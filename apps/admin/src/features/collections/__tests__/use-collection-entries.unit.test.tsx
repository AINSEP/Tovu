import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AdminContentType, AdminEntry } from "@/lib/api";
import { FetchQueryProvider } from "@/lib/fetch-query";
import { createFakeCollectionEntriesPort } from "../hooks/collection-entries-dependencies.hooks";
import { useCollectionEntries } from "../hooks/use-collection-entries.hooks";

/**
 * @file `useCollectionEntries` — new coverage added alongside the `useWiredX` conversion
 * (`collection-entries-port.hooks.ts` / `collection-entries-dependencies.hooks.ts`). There was no
 * hook-level test file for this before — `CollectionEntries.unit.test.tsx` already exercises it
 * end-to-end through real `fetch` (mounted via the `CollectionEntries` component); this file proves
 * the pure hook is independently testable against an injected port, no `fetch` stub required.
 *
 * `wrapper` (2026-08-12, `lib/fetch-query` migration): the combined read now goes through
 * `useFetchQuery`, which throws without a `QueryClientProvider` ancestor.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

const RECIPE_TYPE: AdminContentType = {
  workspaceId: "w1",
  key: "recipe",
  label: "Recipe",
  fields: [],
  status: "active",
  version: 1,
};

const RECIPE_ENTRY: AdminEntry = {
  id: "e1",
  workspaceId: "w1",
  type: "recipe",
  slug: "my-recipe",
  status: "draft",
  title: "My Recipe",
  bodyJson: null,
  fieldsJson: {},
  publishedAt: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
};

const ARTICLE_ENTRY: AdminEntry = { ...RECIPE_ENTRY, id: "e2", type: "article", title: "An Article" };

describe("useCollectionEntries", () => {
  it("resolves contentType and entries (filtered by type) through the injected port, without touching fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const port = createFakeCollectionEntriesPort({ types: [RECIPE_TYPE], entries: [RECIPE_ENTRY, ARTICLE_ENTRY] });
      const { result } = renderHook(() => useCollectionEntries({ contentTypeKey: "recipe" }, { port, locale: "en", t: (k) => k }), { wrapper });

      await waitFor(() => expect(result.current.entries).not.toBeNull());
      expect(result.current.contentType).toEqual(RECIPE_TYPE);
      expect(result.current.entries).toEqual([RECIPE_ENTRY]);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("resolves contentType to null when no content type matches the key", async () => {
    const port = createFakeCollectionEntriesPort({ types: [{ ...RECIPE_TYPE, key: "other" }], entries: [] });
    const { result } = renderHook(() => useCollectionEntries({ contentTypeKey: "recipe" }, { port, locale: "en", t: (k) => k }), { wrapper });

    await waitFor(() => expect(result.current.entries).not.toBeNull());
    expect(result.current.contentType).toBeNull();
  });

  it("starts contentType as undefined (the not-yet-resolved sentinel) before the load settles", () => {
    const port = createFakeCollectionEntriesPort({ types: [RECIPE_TYPE], entries: [] });
    const { result } = renderHook(() => useCollectionEntries({ contentTypeKey: "recipe" }, { port, locale: "en", t: (k) => k }), { wrapper });

    expect(result.current.contentType).toBeUndefined();
    expect(result.current.entries).toBeNull();
  });

  it("re-loads when contentTypeKey changes", async () => {
    const port = createFakeCollectionEntriesPort({
      types: [RECIPE_TYPE, { ...RECIPE_TYPE, key: "article", label: "Article" }],
      entries: [RECIPE_ENTRY, ARTICLE_ENTRY],
    });
    const { result, rerender } = renderHook(
      ({ contentTypeKey }) => useCollectionEntries({ contentTypeKey }, { port, locale: "en", t: (k) => k }),
      { initialProps: { contentTypeKey: "recipe" }, wrapper }
    );
    await waitFor(() => expect(result.current.entries).toEqual([RECIPE_ENTRY]));

    rerender({ contentTypeKey: "article" });
    await waitFor(() => expect(result.current.entries).toEqual([ARTICLE_ENTRY]));
    expect(result.current.contentType?.key).toBe("article");
  });

  it("sets the fallback error when the injected port rejects", async () => {
    const port = createFakeCollectionEntriesPort({ listContentTypesError: new Error("boom") });
    const { result } = renderHook(() => useCollectionEntries({ contentTypeKey: "recipe" }, { port, locale: "en", t: (k) => k }), { wrapper });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("boom");
  });
});
