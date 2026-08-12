import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "../../../lib/fetch-query";
import { CollectionEntryEditor } from "../CollectionEntryEditor";

/**
 * @file `CollectionEntryEditor` — pins the accessibility fix for the audit's placeholder-only
 * title/slug fields (task: systemic form labelling across `PostEditor.tsx`/
 * `CollectionEntryEditor.tsx`/`WidgetInstanceEditor.tsx`/`MenuEditor.tsx`). Both fields now wrap in
 * a real `<label>` (`.a11y-label-wrap` + `.visually-hidden`, `styles/editor.css`) instead of relying
 * on `placeholder` alone, so `getByLabelText` must resolve them — the regression this test guards
 * against is a future edit that strips the wrapping `<label>` and quietly falls back to
 * placeholder-only again. Follows the RTL harness `WidgetInstanceEditor.unit.test.tsx` established
 * for this package.
 *
 * `CollectionEntryEditor` has no injectable hook seam — it always composes the real
 * `useWiredCollectionEntryEditor` — so every render below needs a `FetchQueryProvider` ancestor
 * (2026-08-12, `lib/fetch-query` migration).
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const ARTICLE_TYPE = {
  workspaceId: "w1",
  key: "articles",
  label: "Article",
  fields: [],
  status: "active" as const,
  version: 1,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  // `useCollectionEntryEditor` now also calls `useAdminLocale()` (real `fetch`, not this hook's
  // own concern), which would otherwise consume one of this file's strictly-ordered
  // `mockResolvedValueOnce` slots and shift every later assertion by one call. Routed to a fixed
  // default-locale response outside `fetchMock`'s own call queue — same interceptor pattern
  // `Members.unit.test.tsx` uses.
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    if (String(url).includes("/settings/effective") && String(url).includes("namespace=core.language")) {
      return Promise.resolve(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } }),
      );
    }
    return fetchMock(url, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("new entry — title and slug fields", () => {
  it("gives the title field a real accessible name, not just a placeholder", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [ARTICLE_TYPE] }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }));

    render(
      <FetchQueryProvider>
        <CollectionEntryEditor contentTypeKey="articles" entryId={null} />
      </FetchQueryProvider>
    );

    const titleInput = await screen.findByLabelText("Entry title");
    expect(titleInput).toHaveAttribute("placeholder", "Entry title");
  });

  it("gives the slug field a real accessible name, not just a placeholder", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [ARTICLE_TYPE] }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }));

    render(
      <FetchQueryProvider>
        <CollectionEntryEditor contentTypeKey="articles" entryId={null} />
      </FetchQueryProvider>
    );

    const slugInput = await screen.findByLabelText("Entry slug");
    expect(slugInput).toHaveAttribute("placeholder", "entry-slug");
  });
});
