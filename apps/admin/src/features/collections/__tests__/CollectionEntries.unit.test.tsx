import { render, screen } from "@/__tests__/fetch-query-render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { CollectionEntries } from "../CollectionEntriesScreen";
import type { CollectionEntriesController } from "@jini-ai/admin/screens/collections/hooks/use-collection-entries.hooks";

/**
 * @file `CollectionEntries` — pins the fix for the audit's live-verified blocker (exec summary
 * #1): a bogus `contentTypeKey` (e.g. a stale bookmark) previously rendered as a real, empty,
 * *creatable* collection — a working "New entry" button and no error anywhere — because nothing
 * checked the `contentType === null` case the lookup already distinguished from "still loading".
 * Follows the RTL harness `Plugins.unit.test.tsx` established for this package.
 *
 * `CollectionEntries` composes the real `useWiredCollectionEntries` by default, so every render
 * exercising that real path needs a `FetchQueryProvider` ancestor (2026-08-12, `@jini-ai/ui/fetch-query`
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
    expect(screen.getByRole("link", { name: /new entry/i })).toHaveAttribute("href", "/admin/collections/recipe/new");
    expect(screen.getByText("No entries yet in Recipe.")).toBeInTheDocument();
  });
});

describe("loaded entries and errors", () => {
  const entry = {
    id: "e1", workspaceId: "w1", type: "recipe", slug: "my-recipe", status: "draft" as const,
    title: "My Recipe", bodyJson: null, fieldsJson: null, publishedAt: null,
    createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", version: 1,
  };
  it("renders entries returned through the real hook", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("/content-types")) return jsonResponse(CONTENT_TYPES_RESPONSE);
      if (String(url).includes("/entries")) return jsonResponse({ items: [entry] });
      throw new Error(`Unexpected request: ${url}`);
    });
    render(<FetchQueryProvider><CollectionEntries contentTypeKey="recipe" /></FetchQueryProvider>);
    expect(await screen.findByRole("link", { name: "My Recipe" })).toHaveAttribute("href", "/admin/collections/recipe/my-recipe");
    expect(screen.queryByText("No entries yet in Recipe.")).not.toBeInTheDocument();
    // The host collaborator the Jini screen takes as a required prop: this admin's `ServerLabel`
    // fills the status pill (`draft` has no localized copy, so the protocol value shows through).
    // Jini emits its own `jini-status-<value>` pill classes (Jini 476b568dd, Codex rv1124b FIX 4).
    expect(screen.getByText("draft", { selector: ".jini-status-draft" })).toBeInTheDocument();
  });
});
