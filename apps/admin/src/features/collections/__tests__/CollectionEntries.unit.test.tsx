import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/lib/fetch-query";
import { CollectionEntries } from "../CollectionEntries";
import type { CollectionEntriesController } from "../hooks/use-collection-entries.hooks";

/**
 * @file `CollectionEntries` — pins the fix for the audit's live-verified blocker (exec summary
 * #1): a bogus `contentTypeKey` (e.g. a stale bookmark) previously rendered as a real, empty,
 * *creatable* collection — a working "New entry" button and no error anywhere — because nothing
 * checked the `contentType === null` case the lookup already distinguished from "still loading".
 * Follows the RTL harness `Plugins.unit.test.tsx` established for this package.
 *
 * `CollectionEntries` composes the real `useWiredCollectionEntries` by default, so every render
 * exercising that real path needs a `FetchQueryProvider` ancestor (2026-08-12, `lib/fetch-query`
 * migration). The "injected hook seam" describe block below drives the screen through a fake
 * controller instead — see `CollectionEntriesProps.useCollectionEntriesHook`.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const CONTENT_TYPES_RESPONSE = {
  items: [{ key: "recipe", label: "Recipe", status: "active", version: 1, fields: [] }],
};

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

beforeEach(() => {
  fetchMock = vi.fn();
  // `useCollectionEntries` now also calls `useAdminLocale()` (real `fetch`, not this hook's own
  // concern), which would otherwise consume one of this file's strictly-ordered
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

describe("a content type key that matches nothing", () => {
  it("renders an Unknown content type error, never a creatable empty collection", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(CONTENT_TYPES_RESPONSE)) // listContentTypes — "does-not-exist" is absent
      .mockResolvedValueOnce(jsonResponse({ items: [] })); // listEntries

    render(
      <FetchQueryProvider>
        <CollectionEntries contentTypeKey="does-not-exist" />
      </FetchQueryProvider>
    );

    expect(await screen.findByText('Unknown content type "does-not-exist".')).toBeInTheDocument();
    // `link`, not `button` (2026-09-07): `a44148a1` replaced the nested `<button>`-inside-`<a>`
    // with a plain `<a class="btn-primary">` and did not update this file. Left as `button` this
    // assertion still PASSED — vacuously, since no button exists on any screen any more — so it
    // would have kept passing even if the unknown-content-type branch wrongly rendered the real
    // New entry link. Its positive twin below caught the same change as a hard failure.
    expect(screen.queryByRole("link", { name: /new entry/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/no entries yet/i)).not.toBeInTheDocument();
  });
});

describe("a real content type", () => {
  it("renders the entries list normally, with a working New entry control", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(CONTENT_TYPES_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({ items: [] }));

    render(
      <FetchQueryProvider>
        <CollectionEntries contentTypeKey="recipe" />
      </FetchQueryProvider>
    );

    expect(await screen.findByRole("heading", { name: "Recipe" })).toBeInTheDocument();
    // See the `link`-vs-`button` note above — this is the assertion `a44148a1` left failing.
    expect(screen.getByRole("link", { name: /new entry/i })).toBeInTheDocument();
    expect(screen.getByText("No entries yet in Recipe.")).toBeInTheDocument();
  });
});

describe("injected hook seam (useCollectionEntriesHook)", () => {
  it("renders from a fake controller, proving the real hook is not hardcoded — no fetch involved", () => {
    const controller: CollectionEntriesController = {
      contentType: null,
      entries: [],
      error: null,
      t: (key) => key,
    };
    render(<CollectionEntries contentTypeKey="does-not-matter" useCollectionEntriesHook={() => controller} />);

    // The real hook can never resolve `contentType: null` synchronously on first render (it starts
    // `undefined` until the fetch settles) — reaching this branch with no `act`/`waitFor` is only
    // possible because the fake bypassed `useWiredCollectionEntries` entirely.
    expect(screen.getByText('Unknown content type "does-not-matter".')).toBeInTheDocument();
  });

  // readable-slugs S6b (2026-09-23): the list row links by slug, not the raw id — same rule
  // Posts/Pages/Widgets/Menus rows already follow.
  it("links an entry row by its slug, not its id", () => {
    const controller: CollectionEntriesController = {
      contentType: { workspaceId: "w1", key: "recipe", label: "Recipe", status: "active", version: 1, fields: [] },
      entries: [
        {
          id: "e1",
          workspaceId: "w1",
          type: "recipe",
          slug: "my-recipe",
          status: "draft",
          title: "My Recipe",
          bodyJson: null,
          fieldsJson: null,
          publishedAt: null,
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
          version: 1,
        },
      ],
      error: null,
      t: (key) => key,
    };
    render(<CollectionEntries contentTypeKey="recipe" useCollectionEntriesHook={() => controller} />);

    const link = screen.getByRole("link", { name: "My Recipe" });
    expect(link).toHaveAttribute("href", "/admin/collections/recipe/my-recipe");
  });
});
