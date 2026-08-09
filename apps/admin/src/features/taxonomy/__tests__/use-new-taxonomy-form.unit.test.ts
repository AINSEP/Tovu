import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useNewTaxonomyForm } from "../hooks/use-new-taxonomy-form.hooks";

/**
 * @file `useNewTaxonomyForm` (SPEC-037 REQ-02) — mirrors `use-new-term-form.hooks.ts`'s shape;
 * pins the same trimmed-name validation guard plus the `hierarchical` toggle's own reset to
 * `false` after a successful create (a stale "on" checkbox surviving a submit would silently
 * make the next unrelated taxonomy hierarchical).
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  // `useNewTaxonomyForm` now also calls `useAdminLocale()` (real `fetch`, not this hook's own
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

describe("validation guard", () => {
  it("rejects an empty name without calling the API", async () => {
    const onCreated = vi.fn();
    const { result } = renderHook(() => useNewTaxonomyForm({ onCreated }));

    await act(async () => {
      await result.current.submit(formEvent());
    });

    expect(result.current.error).toBe("Name is required.");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only name", async () => {
    const { result } = renderHook(() => useNewTaxonomyForm({ onCreated: vi.fn() }));
    act(() => result.current.setName("   "));

    await act(async () => {
      await result.current.submit(formEvent());
    });

    expect(result.current.error).toBe("Name is required.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("success", () => {
  it("sends the trimmed name and the hierarchical flag, then resets both plus calls onCreated", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ taxonomy: { id: "tax1", name: "Category", hierarchical: true, status: "active", updatedAt: "x", version: 1 } })
    );
    const onCreated = vi.fn();
    const { result } = renderHook(() => useNewTaxonomyForm({ onCreated }));
    act(() => {
      result.current.setName("  Category  ");
      result.current.setHierarchical(true);
    });

    await act(async () => {
      await result.current.submit(formEvent());
    });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ name: "Category", hierarchical: true });
    expect(result.current.name).toBe("");
    expect(result.current.hierarchical).toBe(false);
    expect(result.current.saving).toBe(false);
    expect(onCreated).toHaveBeenCalledTimes(1);
  });
});

describe("failure", () => {
  it("sets error, stops saving, and keeps the typed name/hierarchical without calling onCreated", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "name already exists" }, 409));
    const onCreated = vi.fn();
    const { result } = renderHook(() => useNewTaxonomyForm({ onCreated }));
    act(() => {
      result.current.setName("Dup");
      result.current.setHierarchical(true);
    });

    await act(async () => {
      await result.current.submit(formEvent());
    });

    expect(result.current.error).toBe("name already exists");
    expect(result.current.saving).toBe(false);
    expect(result.current.name).toBe("Dup");
    expect(result.current.hierarchical).toBe(true);
    expect(onCreated).not.toHaveBeenCalled();
  });
});
