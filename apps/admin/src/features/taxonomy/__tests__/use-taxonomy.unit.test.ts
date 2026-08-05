import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTaxonomy } from "../hooks/use-taxonomy.hooks";

/**
 * @file `useTaxonomy` — the top-level "Categories & Tags" screen state, extracted so it is
 * reachable from `renderHook` with no table and no detail panel. Follows the fetch-mocking harness
 * `PostEditor.unit.test.tsx` established for this package.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const TERM_A = { id: "a", taxonomyId: "tax1", parentId: null, name: "A", status: "active", updatedAt: "2026-08-01T00:00:00.000Z", version: 1 };
const GROUP = { taxonomy: { id: "tax1", name: "Category", hierarchical: false, status: "active", updatedAt: "2026-08-01T00:00:00.000Z", version: 1 }, terms: [TERM_A] };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("loads taxonomies on mount and exposes them", async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse({ items: [GROUP] }));
  const { result } = renderHook(() => useTaxonomy());
  await waitFor(() => expect(result.current.taxonomies).not.toBeNull());
  expect(result.current.taxonomies).toEqual([GROUP]);
  expect(result.current.error).toBeNull();
});

it("sets a translated error and leaves taxonomies null when the load fails", async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500));
  const { result } = renderHook(() => useTaxonomy());
  await waitFor(() => expect(result.current.error).not.toBeNull());
  expect(result.current.error).toBe("boom");
  expect(result.current.taxonomies).toBeNull();
});

it("load() re-fetches and replaces taxonomies (used as onCreated/onRenamed/onMerged callback)", async () => {
  fetchMock
    .mockResolvedValueOnce(jsonResponse({ items: [GROUP] }))
    .mockResolvedValueOnce(jsonResponse({ items: [] }));
  const { result } = renderHook(() => useTaxonomy());
  await waitFor(() => expect(result.current.taxonomies).toEqual([GROUP]));

  act(() => result.current.load());
  await waitFor(() => expect(result.current.taxonomies).toEqual([]));
});

describe("selected", () => {
  it("stays null until a term id is selected", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [GROUP] }));
    const { result } = renderHook(() => useTaxonomy());
    await waitFor(() => expect(result.current.taxonomies).not.toBeNull());
    expect(result.current.selected).toBeNull();
  });

  it("resolves to the matching taxonomy+term once setSelectedTermId is called — wires findSelectedTerm", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [GROUP] }));
    const { result } = renderHook(() => useTaxonomy());
    await waitFor(() => expect(result.current.taxonomies).not.toBeNull());

    act(() => result.current.setSelectedTermId("a"));

    expect(result.current.selected).toEqual({ taxonomy: GROUP, term: TERM_A });
  });

  it("clears back to null when setSelectedTermId(null) is called", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [GROUP] }));
    const { result } = renderHook(() => useTaxonomy());
    await waitFor(() => expect(result.current.taxonomies).not.toBeNull());

    act(() => result.current.setSelectedTermId("a"));
    expect(result.current.selected).not.toBeNull();
    act(() => result.current.setSelectedTermId(null));
    expect(result.current.selected).toBeNull();
  });
});
