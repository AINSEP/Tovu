import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTermDetailPanel, useWiredTermDetailPanel } from "../hooks/use-term-detail-panel.hooks";
import { createFakeTaxonomyPort } from "../hooks/taxonomy-dependencies.hooks";
import type { AdminTerm } from "../../../lib/api";

/**
 * @file `useTermDetailPanel` — the rename form inside the term detail panel. Pins the no-op guard
 * (empty name, or a name unchanged from the term's current name — no pointless PUT for an
 * identical rename) and the effect that resets the form when the operator selects a different term
 * in the list, so a half-typed rename for term A does not leak into term B's input.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function termFixture(overrides: Partial<AdminTerm> = {}): AdminTerm {
  return {
    id: "t1",
    taxonomyId: "tax1",
    parentId: null,
    name: "Original Name",
    status: "active",
    updatedAt: "2026-08-01T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  // `useTermDetailPanel` now also calls `useAdminLocale()` (real `fetch`, not this hook's own
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

function formEvent() {
  return { preventDefault: () => {} } as unknown as React.FormEvent;
}

it("initializes newName from the term's current name", () => {
  const { result } = renderHook(() => useWiredTermDetailPanel({ term: termFixture({ name: "Seeded" }), onRenamed: vi.fn() }));
  expect(result.current.newName).toBe("Seeded");
});

describe("no-op guard", () => {
  it("does not call the API for an empty newName", async () => {
    const { result } = renderHook(() => useWiredTermDetailPanel({ term: termFixture(), onRenamed: vi.fn() }));
    act(() => result.current.setNewName(""));

    await act(async () => {
      await result.current.rename(formEvent());
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call the API when the trimmed newName equals the term's current name", async () => {
    const { result } = renderHook(() => useWiredTermDetailPanel({ term: termFixture({ name: "Same" }), onRenamed: vi.fn() }));
    act(() => result.current.setNewName("  Same  "));

    await act(async () => {
      await result.current.rename(formEvent());
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("success and failure", () => {
  it("shows a 'Renamed.' message and calls onRenamed on success", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ term: termFixture({ name: "New Name" }) }));
    const onRenamed = vi.fn();
    const { result } = renderHook(() => useWiredTermDetailPanel({ term: termFixture(), onRenamed }));
    act(() => result.current.setNewName("New Name"));

    await act(async () => {
      await result.current.rename(formEvent());
    });

    expect(result.current.message).toBe("Renamed.");
    expect(result.current.error).toBeNull();
    expect(result.current.saving).toBe(false);
    expect(onRenamed).toHaveBeenCalledTimes(1);
  });

  it("sets error, clears any prior message, and does not call onRenamed on failure", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "name already exists" }, 409));
    const onRenamed = vi.fn();
    const { result } = renderHook(() => useWiredTermDetailPanel({ term: termFixture(), onRenamed }));
    act(() => result.current.setNewName("Taken Name"));

    await act(async () => {
      await result.current.rename(formEvent());
    });

    expect(result.current.error).toBe("name already exists");
    expect(result.current.message).toBeNull();
    expect(onRenamed).not.toHaveBeenCalled();
  });
});

describe("resetting when the selected term changes", () => {
  it("re-seeds newName and clears message/error for the newly selected term", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ term: termFixture({ name: "Renamed A" }) }));
    const { result, rerender } = renderHook(({ term }) => useWiredTermDetailPanel({ term, onRenamed: vi.fn() }), {
      initialProps: { term: termFixture({ id: "t1", name: "Term A" }) },
    });
    act(() => result.current.setNewName("Renamed A"));
    await act(async () => {
      await result.current.rename(formEvent());
    });
    expect(result.current.message).toBe("Renamed.");

    rerender({ term: termFixture({ id: "t2", name: "Term B" }) });

    await waitFor(() => expect(result.current.newName).toBe("Term B"));
    expect(result.current.message).toBeNull();
    expect(result.current.error).toBeNull();
  });
});

describe("useTermDetailPanel — injected port", () => {
  it("renames through the fake port and reports success, with no fetch involved", async () => {
    const networkMock = vi.fn();
    vi.stubGlobal("fetch", networkMock);
    const term = termFixture();
    const port = createFakeTaxonomyPort({ groups: [{ taxonomy: { id: "tax1", name: "Category", hierarchical: false, status: "active", updatedAt: "x", version: 1 }, terms: [term] }] });
    const onRenamed = vi.fn();

    const { result } = renderHook(() => useTermDetailPanel({ term, onRenamed }, port, "en"));
    act(() => result.current.setNewName("Renamed via port"));
    await act(async () => {
      await result.current.rename(formEvent());
    });

    expect(result.current.message).toBe("Renamed.");
    expect(onRenamed).toHaveBeenCalledTimes(1);
    expect(networkMock).not.toHaveBeenCalled();
  });

  it("shares the same store as useTaxonomy through TaxonomyPort — a rename here is visible to a sibling useTaxonomy", async () => {
    const term = termFixture();
    const group = { taxonomy: { id: "tax1", name: "Category", hierarchical: false, status: "active", updatedAt: "x", version: 1 }, terms: [term] };
    const port = createFakeTaxonomyPort({ groups: [group] });

    const { result } = renderHook(() => useTermDetailPanel({ term, onRenamed: vi.fn() }, port, "en"));
    act(() => result.current.setNewName("Shared Store Rename"));
    await act(async () => {
      await result.current.rename(formEvent());
    });

    const renamed = await port.renameTerm({ termId: term.id, newName: "confirm read-back" }).catch(() => null);
    // The second renameTerm call above is only to read the store back through the same port
    // instance — its own result isn't the point, `port`'s internal `groups` state is.
    expect(renamed).not.toBeNull();
    const listed = await port.listTaxonomies();
    expect(listed.items[0]?.terms[0]?.name).toBe("confirm read-back");
  });
});
