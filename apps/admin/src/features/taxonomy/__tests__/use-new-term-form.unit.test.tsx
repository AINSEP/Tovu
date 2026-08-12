import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "../../../lib/fetch-query";
import { useNewTermForm, useWiredNewTermForm } from "../hooks/use-new-term-form.hooks";
import { createFakeNewTermFormPort } from "../hooks/new-term-form-dependencies.hooks";
import type { AdminTaxonomyWithTerms } from "../../../lib/api";

/**
 * @file `useNewTermForm` — pins the client-side validation guard (name required, trimmed) and the
 * hierarchical-vs-flat `parentId` decision: a flat taxonomy must send `parentId: null` even if
 * `parentId` state happens to hold a stale value, since `NewTermForm`'s markup only renders the
 * parent `<select>` when `taxonomy.taxonomy.hierarchical` is true.
 *
 * `wrapper` (2026-08-12, `lib/fetch-query` migration): `createTerm` now goes through
 * `useFetchMutation`, which throws without a `QueryClientProvider` ancestor.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function taxonomy(hierarchical: boolean): AdminTaxonomyWithTerms {
  return {
    taxonomy: { id: "tax1", name: "Category", hierarchical, status: "active", updatedAt: "2026-08-01T00:00:00.000Z", version: 1 },
    terms: [],
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  // `useNewTermForm` now also calls `useAdminLocale()` (real `fetch`, not this hook's own
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
    const { result } = renderHook(() => useWiredNewTermForm({ taxonomy: taxonomy(false), onCreated }), { wrapper });

    await act(async () => {
      await result.current.submit(formEvent());
    });

    expect(result.current.error).toBe("Name is required.");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only name", async () => {
    const { result } = renderHook(() => useWiredNewTermForm({ taxonomy: taxonomy(false), onCreated: vi.fn() }), { wrapper });
    act(() => result.current.setName("   "));

    await act(async () => {
      await result.current.submit(formEvent());
    });

    expect(result.current.error).toBe("Name is required.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("hierarchical parentId handling", () => {
  it("sends parentId: null for a flat (non-hierarchical) taxonomy even if parentId state is set", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ term: { id: "t1", taxonomyId: "tax1", parentId: null, name: "Child", status: "active", updatedAt: "x", version: 1 } })
    );
    const { result } = renderHook(() => useWiredNewTermForm({ taxonomy: taxonomy(false), onCreated: vi.fn() }), { wrapper });
    act(() => {
      result.current.setName("Child");
      result.current.setParentId("stale-parent-id");
    });

    await act(async () => {
      await result.current.submit(formEvent());
    });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.parentId).toBeNull();
  });

  it("sends the chosen parentId for a hierarchical taxonomy", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ term: { id: "t2", taxonomyId: "tax1", parentId: "p1", name: "Child", status: "active", updatedAt: "x", version: 1 } })
    );
    const { result } = renderHook(() => useWiredNewTermForm({ taxonomy: taxonomy(true), onCreated: vi.fn() }), { wrapper });
    act(() => {
      result.current.setName("Child");
      result.current.setParentId("p1");
    });

    await act(async () => {
      await result.current.submit(formEvent());
    });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.parentId).toBe("p1");
  });

  it("sends parentId: null for a hierarchical taxonomy when no parent was chosen (top level)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ term: { id: "t3", taxonomyId: "tax1", parentId: null, name: "Root", status: "active", updatedAt: "x", version: 1 } })
    );
    const { result } = renderHook(() => useWiredNewTermForm({ taxonomy: taxonomy(true), onCreated: vi.fn() }), { wrapper });
    act(() => result.current.setName("Root"));

    await act(async () => {
      await result.current.submit(formEvent());
    });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.parentId).toBeNull();
  });
});

describe("success and failure", () => {
  it("clears name/parentId, closes the form, and calls onCreated on success", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ term: { id: "t1", taxonomyId: "tax1", parentId: null, name: "Child", status: "active", updatedAt: "x", version: 1 } })
    );
    const onCreated = vi.fn();
    const { result } = renderHook(() => useWiredNewTermForm({ taxonomy: taxonomy(true), onCreated }), { wrapper });
    act(() => {
      result.current.setOpen(true);
      result.current.setName("Child");
      result.current.setParentId("p1");
    });

    await act(async () => {
      await result.current.submit(formEvent());
    });

    expect(result.current.name).toBe("");
    expect(result.current.parentId).toBe("");
    expect(result.current.open).toBe(false);
    expect(result.current.saving).toBe(false);
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it("sets error, stops saving, and leaves the form open without calling onCreated on failure", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "duplicate name" }, 409));
    const onCreated = vi.fn();
    const { result } = renderHook(() => useWiredNewTermForm({ taxonomy: taxonomy(false), onCreated }), { wrapper });
    act(() => {
      result.current.setOpen(true);
      result.current.setName("Dup");
    });

    await act(async () => {
      await result.current.submit(formEvent());
    });

    expect(result.current.error).toBe("duplicate name");
    expect(result.current.saving).toBe(false);
    expect(result.current.open).toBe(true);
    expect(onCreated).not.toHaveBeenCalled();
  });
});

describe("open", () => {
  // Web-design pass (2026-08-05): every group's "New term" form starts collapsed behind a small
  // trigger instead of permanently open — see this hook's own comment.
  it("starts closed", () => {
    const { result } = renderHook(() => useWiredNewTermForm({ taxonomy: taxonomy(false), onCreated: vi.fn() }), { wrapper });
    expect(result.current.open).toBe(false);
  });

  it("opens and closes via setOpen", () => {
    const { result } = renderHook(() => useWiredNewTermForm({ taxonomy: taxonomy(false), onCreated: vi.fn() }), { wrapper });
    act(() => result.current.setOpen(true));
    expect(result.current.open).toBe(true);
    act(() => result.current.setOpen(false));
    expect(result.current.open).toBe(false);
  });
});

describe("useNewTermForm — injected port", () => {
  it("creates through the fake port with the resolved parentId, with no fetch involved", async () => {
    const networkMock = vi.fn();
    vi.stubGlobal("fetch", networkMock);
    const port = createFakeNewTermFormPort();
    const onCreated = vi.fn();

    const { result } = renderHook(() => useNewTermForm({ taxonomy: taxonomy(true), onCreated }, port, "en"), { wrapper });
    act(() => {
      result.current.setName("Child");
      result.current.setParentId("p1");
    });
    await act(async () => {
      await result.current.submit(formEvent());
    });

    expect(result.current.name).toBe("");
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(networkMock).not.toHaveBeenCalled();
  });

  it("surfaces a rejected createTerm call's message on the error channel", async () => {
    const port = createFakeNewTermFormPort({ createError: "duplicate name" });
    const { result } = renderHook(() => useNewTermForm({ taxonomy: taxonomy(false), onCreated: vi.fn() }, port, "en"), { wrapper });
    act(() => result.current.setName("Dup"));

    await act(async () => {
      await result.current.submit(formEvent());
    });

    expect(result.current.error).toBe("duplicate name");
  });
});
