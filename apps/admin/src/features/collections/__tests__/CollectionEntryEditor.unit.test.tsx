import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/lib/fetch-query";
import { CollectionEntryEditor } from "../CollectionEntryEditor";
import type { CollectionEntryEditorController } from "../hooks/use-collection-entry-editor.hooks";

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
 * `CollectionEntryEditor` composes the real `useWiredCollectionEntryEditor` by default, so every
 * render exercising that real path needs a `FetchQueryProvider` ancestor (2026-08-12,
 * `lib/fetch-query` migration). The "injected hook seam" describe block below drives the screen
 * through a fake controller instead — see `CollectionEntryEditorProps.useCollectionEntryEditorHook`.
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

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

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

describe("injected hook seam (useCollectionEntryEditorHook)", () => {
  it("renders from a fake controller, proving the real hook is not hardcoded — no fetch involved", () => {
    // `contentType: null` short-circuits before the TipTap `EditorContent` mount below it, so this
    // fake controller doesn't need a real `Editor` instance to exercise the seam.
    const controller: CollectionEntryEditorController = {
      contentType: null,
      entry: null,
      title: "",
      setTitle: vi.fn(),
      slug: "",
      setSlug: vi.fn(),
      extFields: {},
      setExtFields: vi.fn(),
      taxonomies: [],
      message: null,
      error: null,
      loadError: null,
      loaded: true,
      saving: false,
      editor: null,
      save: vi.fn(async () => {}),
      toggleLifecycle: vi.fn(async () => {}),
      t: (key) => key,
    };
    render(
      <CollectionEntryEditor
        contentTypeKey="does-not-matter"
        entryId={null}
        useCollectionEntryEditorHook={() => controller}
      />
    );

    // The real hook can never resolve `loaded: true, contentType: null` synchronously on first
    // render (it starts `loaded: false` until the fetch settles) — reaching this branch with no
    // `act`/`waitFor` is only possible because the fake bypassed `useWiredCollectionEntryEditor`.
    expect(screen.getByText('Unknown content type "does-not-matter".')).toBeInTheDocument();
  });
});
