import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTermDetailPanel } from "../hooks/use-term-detail-panel.hooks";
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
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function formEvent() {
  return { preventDefault: () => {} } as unknown as React.FormEvent;
}

it("initializes newName from the term's current name", () => {
  const { result } = renderHook(() => useTermDetailPanel({ term: termFixture({ name: "Seeded" }), onRenamed: vi.fn() }));
  expect(result.current.newName).toBe("Seeded");
});

describe("no-op guard", () => {
  it("does not call the API for an empty newName", async () => {
    const { result } = renderHook(() => useTermDetailPanel({ term: termFixture(), onRenamed: vi.fn() }));
    act(() => result.current.setNewName(""));

    await act(async () => {
      await result.current.rename(formEvent());
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call the API when the trimmed newName equals the term's current name", async () => {
    const { result } = renderHook(() => useTermDetailPanel({ term: termFixture({ name: "Same" }), onRenamed: vi.fn() }));
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
    const { result } = renderHook(() => useTermDetailPanel({ term: termFixture(), onRenamed }));
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
    const { result } = renderHook(() => useTermDetailPanel({ term: termFixture(), onRenamed }));
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
    const { result, rerender } = renderHook(({ term }) => useTermDetailPanel({ term, onRenamed: vi.fn() }), {
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
