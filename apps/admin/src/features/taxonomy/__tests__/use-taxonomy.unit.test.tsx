import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "../../../lib/fetch-query";
import { useTaxonomy, useWiredTaxonomy } from "../hooks/use-taxonomy.hooks";
import { createFakeTaxonomyPort } from "../hooks/taxonomy-dependencies.hooks";

/**
 * @file `useTaxonomy` — the top-level "Categories & Tags" screen state, extracted so it is
 * reachable from `renderHook` with no table and no detail panel. Follows the fetch-mocking harness
 * `PostEditor.unit.test.tsx` established for this package.
 *
 * `wrapper` (2026-08-12, `lib/fetch-query` migration): `useTaxonomy` now goes through
 * `useFetchQuery`/`useFetchMutation`, which throw without a `QueryClientProvider` ancestor — see
 * `redirects/__tests__/use-redirects.hooks.unit.test.tsx`'s identical `wrapper`.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const TERM_A = { id: "a", taxonomyId: "tax1", parentId: null, name: "A", status: "active", updatedAt: "2026-08-01T00:00:00.000Z", version: 1 };
const GROUP = { taxonomy: { id: "tax1", name: "Category", hierarchical: false, status: "active", updatedAt: "2026-08-01T00:00:00.000Z", version: 1 }, terms: [TERM_A] };

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

beforeEach(() => {
  fetchMock = vi.fn();
  // `useTaxonomy` now also calls `useAdminLocale()` (real `fetch`, not this hook's own concern),
  // which would otherwise consume one of this file's strictly-ordered `mockResolvedValueOnce`
  // slots and shift every later assertion by one call. Routed to a fixed default-locale response
  // outside `fetchMock`'s own call queue — same interceptor pattern `Members.unit.test.tsx` uses.
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

it("loads taxonomies on mount and exposes them", async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse({ items: [GROUP] }));
  const { result } = renderHook(() => useWiredTaxonomy(), { wrapper });
  await waitFor(() => expect(result.current.taxonomies).not.toBeNull());
  expect(result.current.taxonomies).toEqual([GROUP]);
  expect(result.current.error).toBeNull();
});

it("sets a translated error and leaves taxonomies null when the load fails", async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500));
  const { result } = renderHook(() => useWiredTaxonomy(), { wrapper });
  await waitFor(() => expect(result.current.error).not.toBeNull());
  expect(result.current.error).toBe("boom");
  expect(result.current.taxonomies).toBeNull();
});

it("load() re-fetches and replaces taxonomies (used as onCreated/onRenamed/onMerged callback)", async () => {
  fetchMock
    .mockResolvedValueOnce(jsonResponse({ items: [GROUP] }))
    .mockResolvedValueOnce(jsonResponse({ items: [] }));
  const { result } = renderHook(() => useWiredTaxonomy(), { wrapper });
  await waitFor(() => expect(result.current.taxonomies).toEqual([GROUP]));

  act(() => result.current.load());
  await waitFor(() => expect(result.current.taxonomies).toEqual([]));
});

describe("selected", () => {
  it("stays null until a term id is selected", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [GROUP] }));
    const { result } = renderHook(() => useWiredTaxonomy(), { wrapper });
    await waitFor(() => expect(result.current.taxonomies).not.toBeNull());
    expect(result.current.selected).toBeNull();
  });

  it("resolves to the matching taxonomy+term once setSelectedTermId is called — wires findSelectedTerm", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [GROUP] }));
    const { result } = renderHook(() => useWiredTaxonomy(), { wrapper });
    await waitFor(() => expect(result.current.taxonomies).not.toBeNull());

    act(() => result.current.setSelectedTermId("a"));

    expect(result.current.selected).toEqual({ taxonomy: GROUP, term: TERM_A });
  });

  it("clears back to null when setSelectedTermId(null) is called", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [GROUP] }));
    const { result } = renderHook(() => useWiredTaxonomy(), { wrapper });
    await waitFor(() => expect(result.current.taxonomies).not.toBeNull());

    act(() => result.current.setSelectedTermId("a"));
    expect(result.current.selected).not.toBeNull();
    act(() => result.current.setSelectedTermId(null));
    expect(result.current.selected).toBeNull();
  });
});

describe("formOpen", () => {
  // Web-design pass (2026-08-05): "New taxonomy" now starts collapsed, matching
  // `Integrations.tsx`'s `formOpen` idiom — see this hook's own comment.
  it("starts closed", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [GROUP] }));
    const { result } = renderHook(() => useWiredTaxonomy(), { wrapper });
    await waitFor(() => expect(result.current.taxonomies).not.toBeNull());
    expect(result.current.formOpen).toBe(false);
  });

  it("toggles via the functional setter, same signature as useIntegrations' formOpen", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [GROUP] }));
    const { result } = renderHook(() => useWiredTaxonomy(), { wrapper });
    await waitFor(() => expect(result.current.taxonomies).not.toBeNull());

    act(() => result.current.setFormOpen((v) => !v));
    expect(result.current.formOpen).toBe(true);
    act(() => result.current.setFormOpen(false));
    expect(result.current.formOpen).toBe(false);
  });
});

// Delete term/taxonomy (web-design pass, 2026-08-05) — the `taxonomy-delete-api` contract's three
// outcomes (success, 409 blocked, hard failure) each have their own assertion below because they
// take genuinely different branches in `confirmDeleteTerm`/`confirmDeleteTaxonomy`: a mutation
// survivor on any one of these branches would mean that outcome is silently untested, not that the
// branch is dead code (per this dispatch's mutation-sweep pass).
describe("delete term", () => {
  it("requestDeleteTerm sets pendingDeleteTerm and clears a previous deleteTermBlocked", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [GROUP] }))
      .mockResolvedValueOnce(jsonResponse({ error: "still assigned", code: "TERM_HAS_ASSIGNMENTS", assignedCount: 2 }, 409));
    const { result } = renderHook(() => useWiredTaxonomy(), { wrapper });
    await waitFor(() => expect(result.current.taxonomies).not.toBeNull());

    act(() => result.current.requestDeleteTerm(TERM_A));
    await act(() => result.current.confirmDeleteTerm());
    await waitFor(() => expect(result.current.deleteTermBlocked).not.toBeNull());

    act(() => result.current.requestDeleteTerm(TERM_A));
    expect(result.current.pendingDeleteTerm).toEqual(TERM_A);
    expect(result.current.deleteTermBlocked).toBeNull();
  });

  it("confirmDeleteTerm is a no-op when nothing is pending", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [GROUP] }));
    const { result } = renderHook(() => useWiredTaxonomy(), { wrapper });
    await waitFor(() => expect(result.current.taxonomies).not.toBeNull());

    await act(() => result.current.confirmDeleteTerm());
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the initial load — no DELETE fired
    // A mutant that drops the `!pendingDeleteTerm` guard doesn't necessarily call `fetch` either
    // (accessing `.id` on the still-null `pendingDeleteTerm` throws before `api.deleteTerm` is
    // reached) — caught live: that mutant survived the `fetchMock` count assertion alone. `error`
    // staying `null` is what actually distinguishes a real no-op from "guard removed, crashed into
    // the catch block, and silently set a generic failure message" — a true no-op sets no state.
    expect(result.current.error).toBeNull();
  });

  it("on success: calls DELETE, closes the dialog, reloads, and clears selection if the deleted term was selected", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [GROUP] }))
      .mockResolvedValueOnce(jsonResponse({ deletedTermId: "a" }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }));
    const { result } = renderHook(() => useWiredTaxonomy(), { wrapper });
    await waitFor(() => expect(result.current.taxonomies).not.toBeNull());
    act(() => result.current.setSelectedTermId("a"));

    act(() => result.current.requestDeleteTerm(TERM_A));
    await act(() => result.current.confirmDeleteTerm());

    expect(fetchMock.mock.calls[1][0]).toContain("/taxonomy/terms/a");
    expect(fetchMock.mock.calls[1][1]?.method).toBe("DELETE");
    expect(result.current.pendingDeleteTerm).toBeNull();
    expect(result.current.selectedTermId).toBeNull();
    await waitFor(() => expect(result.current.taxonomies).toEqual([]));
  });

  it("on success for a term that was NOT selected, leaves the current selection alone", async () => {
    const otherTerm = { ...TERM_A, id: "b", name: "B" };
    const groupWithTwo = { ...GROUP, terms: [TERM_A, otherTerm] };
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [groupWithTwo] }))
      .mockResolvedValueOnce(jsonResponse({ deletedTermId: "b" }))
      .mockResolvedValueOnce(jsonResponse({ items: [groupWithTwo] }));
    const { result } = renderHook(() => useWiredTaxonomy(), { wrapper });
    await waitFor(() => expect(result.current.taxonomies).not.toBeNull());
    act(() => result.current.setSelectedTermId("a"));

    act(() => result.current.requestDeleteTerm(otherTerm));
    await act(() => result.current.confirmDeleteTerm());

    expect(result.current.selectedTermId).toBe("a");
  });

  it("on a 409 TERM_HAS_ASSIGNMENTS: closes the dialog, sets deleteTermBlocked scoped to that term, and does not touch the page error banner", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [GROUP] }))
      .mockResolvedValueOnce(jsonResponse({ error: "still assigned", code: "TERM_HAS_ASSIGNMENTS", assignedCount: 3 }, 409));
    const { result } = renderHook(() => useWiredTaxonomy(), { wrapper });
    await waitFor(() => expect(result.current.taxonomies).not.toBeNull());

    act(() => result.current.requestDeleteTerm(TERM_A));
    await act(() => result.current.confirmDeleteTerm());

    expect(result.current.pendingDeleteTerm).toBeNull();
    expect(result.current.deleteTermBlocked).toEqual({
      termId: "a",
      state: {
        code: "TERM_HAS_ASSIGNMENTS",
        count: 3,
        message: "Still assigned to 3 content items. Unassign it, or merge it into another term, before deleting.",
      },
    });
    expect(result.current.error).toBeNull();
  });

  it("on a hard failure (not one of the three blocked codes): sets the page error banner, not deleteTermBlocked", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [GROUP] }))
      .mockResolvedValueOnce(jsonResponse({ error: "server exploded" }, 500));
    const { result } = renderHook(() => useWiredTaxonomy(), { wrapper });
    await waitFor(() => expect(result.current.taxonomies).not.toBeNull());

    act(() => result.current.requestDeleteTerm(TERM_A));
    await act(() => result.current.confirmDeleteTerm());

    expect(result.current.deleteTermBlocked).toBeNull();
    expect(result.current.error).toBe("server exploded");
  });
});

describe("delete taxonomy", () => {
  it("on success: calls DELETE, closes the dialog, reloads, and clears selection only if it belonged to the deleted taxonomy", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [GROUP] }))
      .mockResolvedValueOnce(jsonResponse({ deletedTaxonomyId: "tax1", deletedTermIds: ["a"] }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }));
    const { result } = renderHook(() => useWiredTaxonomy(), { wrapper });
    await waitFor(() => expect(result.current.taxonomies).not.toBeNull());
    act(() => result.current.setSelectedTermId("a"));

    act(() => result.current.requestDeleteTaxonomy(GROUP.taxonomy));
    await act(() => result.current.confirmDeleteTaxonomy());

    expect(fetchMock.mock.calls[1][0]).toContain("/taxonomy/tax1");
    expect(fetchMock.mock.calls[1][1]?.method).toBe("DELETE");
    expect(result.current.pendingDeleteTaxonomy).toBeNull();
    expect(result.current.selectedTermId).toBeNull();
  });

  it("on a 409 TAXONOMY_HAS_ASSIGNMENTS: closes the dialog and sets deleteTaxonomyBlocked scoped to that taxonomy", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [GROUP] }))
      .mockResolvedValueOnce(jsonResponse({ error: "blocked", code: "TAXONOMY_HAS_ASSIGNMENTS", assignedCount: 1 }, 409));
    const { result } = renderHook(() => useWiredTaxonomy(), { wrapper });
    await waitFor(() => expect(result.current.taxonomies).not.toBeNull());

    act(() => result.current.requestDeleteTaxonomy(GROUP.taxonomy));
    await act(() => result.current.confirmDeleteTaxonomy());

    expect(result.current.deleteTaxonomyBlocked?.taxonomyId).toBe("tax1");
    expect(result.current.deleteTaxonomyBlocked?.state.code).toBe("TAXONOMY_HAS_ASSIGNMENTS");
  });

  it("confirmDeleteTaxonomy is a no-op when nothing is pending", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [GROUP] }));
    const { result } = renderHook(() => useWiredTaxonomy(), { wrapper });
    await waitFor(() => expect(result.current.taxonomies).not.toBeNull());

    await act(() => result.current.confirmDeleteTaxonomy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("useTaxonomy — injected port", () => {
  it("loads taxonomies on mount from the fake port's seed, with no fetch involved", async () => {
    const networkMock = vi.fn();
    vi.stubGlobal("fetch", networkMock);
    const port = createFakeTaxonomyPort({ groups: [GROUP] });

    const { result } = renderHook(() => useTaxonomy(port, "en", (k) => k), { wrapper });

    await waitFor(() => expect(result.current.taxonomies).not.toBeNull());
    expect(result.current.taxonomies).toEqual([GROUP]);
    expect(networkMock).not.toHaveBeenCalled();
  });

  it("a 409 from the fake port sets deleteTermBlocked, not the page error banner", async () => {
    const port = createFakeTaxonomyPort({
      groups: [GROUP],
      onDeleteTermBlocked: () => ({ code: "TERM_HAS_ASSIGNMENTS", assignedCount: 2 }),
    });
    const { result } = renderHook(() => useTaxonomy(port, "en", (k) => k), { wrapper });
    await waitFor(() => expect(result.current.taxonomies).not.toBeNull());

    act(() => result.current.requestDeleteTerm(TERM_A));
    await act(() => result.current.confirmDeleteTerm());

    expect(result.current.deleteTermBlocked?.state.code).toBe("TERM_HAS_ASSIGNMENTS");
    expect(result.current.error).toBeNull();
  });
});
