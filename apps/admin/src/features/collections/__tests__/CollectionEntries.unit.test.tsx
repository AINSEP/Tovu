import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CollectionEntries } from "../CollectionEntries";

/**
 * @file `CollectionEntries` — pins the fix for the audit's live-verified blocker (exec summary
 * #1): a bogus `contentTypeKey` (e.g. a stale bookmark) previously rendered as a real, empty,
 * *creatable* collection — a working "New entry" button and no error anywhere — because nothing
 * checked the `contentType === null` case the lookup already distinguished from "still loading".
 * Follows the RTL harness `Plugins.unit.test.tsx` established for this package.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const CONTENT_TYPES_RESPONSE = {
  items: [{ key: "recipe", label: "Recipe", status: "active", version: 1, fields: [] }],
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a content type key that matches nothing", () => {
  it("renders an Unknown content type error, never a creatable empty collection", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(CONTENT_TYPES_RESPONSE)) // listContentTypes — "does-not-exist" is absent
      .mockResolvedValueOnce(jsonResponse({ items: [] })); // listEntries

    render(<CollectionEntries contentTypeKey="does-not-exist" />);

    expect(await screen.findByText('Unknown content type "does-not-exist".')).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /new entry/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/no entries yet/i)).not.toBeInTheDocument();
  });
});

describe("a real content type", () => {
  it("renders the entries list normally, with a working New entry control", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(CONTENT_TYPES_RESPONSE))
      .mockResolvedValueOnce(jsonResponse({ items: [] }));

    render(<CollectionEntries contentTypeKey="recipe" />);

    expect(await screen.findByRole("heading", { name: "Recipe" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new entry/i })).toBeInTheDocument();
    expect(screen.getByText("No entries yet in Recipe.")).toBeInTheDocument();
  });
});
