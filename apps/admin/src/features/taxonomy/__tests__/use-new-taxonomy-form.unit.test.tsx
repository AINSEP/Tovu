import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/lib/fetch-query";
import { useNewTaxonomyForm, useWiredNewTaxonomyForm } from "../hooks/use-new-taxonomy-form.hooks";
import { createFakeNewTaxonomyFormPort } from "../hooks/new-taxonomy-form-dependencies.hooks";

/**
 * @file `useNewTaxonomyForm` (SPEC-037 REQ-02) — mirrors `use-new-term-form.hooks.ts`'s shape;
 * pins the same trimmed-name validation guard plus the `hierarchical` toggle's own reset to
 * `false` after a successful create (a stale "on" checkbox surviving a submit would silently
 * make the next unrelated taxonomy hierarchical).
 *
 * `wrapper` (2026-08-12, `lib/fetch-query` migration): `createTaxonomy` now goes through
 * `useFetchMutation`, which throws without a `QueryClientProvider` ancestor.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

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
    const { result } = renderHook(() => useWiredNewTaxonomyForm({ onCreated }), { wrapper });

    await act(async () => {
      await result.current.submit(formEvent());
    });

    expect(result.current.error).toBe("Name is required.");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only name", async () => {
    const { result } = renderHook(() => useWiredNewTaxonomyForm({ onCreated: vi.fn() }), { wrapper });
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
    const { result } = renderHook(() => useWiredNewTaxonomyForm({ onCreated }), { wrapper });
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
    const { result } = renderHook(() => useWiredNewTaxonomyForm({ onCreated }), { wrapper });
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

describe("useNewTaxonomyForm — injected port", () => {
  it("creates through the fake port and resets the form, with no fetch involved", async () => {
    const networkMock = vi.fn();
    vi.stubGlobal("fetch", networkMock);
    const port = createFakeNewTaxonomyFormPort();
    const onCreated = vi.fn();

    const { result } = renderHook(() => useNewTaxonomyForm({ onCreated }, port, "en"), { wrapper });
    act(() => {
      result.current.setName("Category");
      result.current.setHierarchical(true);
    });
    await act(async () => {
      await result.current.submit(formEvent());
    });

    expect(result.current.name).toBe("");
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(networkMock).not.toHaveBeenCalled();
  });

  it("surfaces a rejected createTaxonomy call's message on the error channel", async () => {
    const port = createFakeNewTaxonomyFormPort({ createError: "name already exists" });
    const { result } = renderHook(() => useNewTaxonomyForm({ onCreated: vi.fn() }, port, "en"), { wrapper });
    act(() => result.current.setName("Category"));

    await act(async () => {
      await result.current.submit(formEvent());
    });

    expect(result.current.error).toBe("name already exists");
  });
});
