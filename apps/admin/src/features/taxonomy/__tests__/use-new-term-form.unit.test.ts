import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useNewTermForm } from "../hooks/use-new-term-form.hooks";
import type { AdminTaxonomyWithTerms } from "../../../lib/api";

/**
 * @file `useNewTermForm` — pins the client-side validation guard (name required, trimmed) and the
 * hierarchical-vs-flat `parentId` decision: a flat taxonomy must send `parentId: null` even if
 * `parentId` state happens to hold a stale value, since `NewTermForm`'s markup only renders the
 * parent `<select>` when `taxonomy.taxonomy.hierarchical` is true.
 */

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
  vi.stubGlobal("fetch", fetchMock);
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
    const { result } = renderHook(() => useNewTermForm({ taxonomy: taxonomy(false), onCreated }));

    await act(async () => {
      await result.current.submit(formEvent());
    });

    expect(result.current.error).toBe("Name is required.");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only name", async () => {
    const { result } = renderHook(() => useNewTermForm({ taxonomy: taxonomy(false), onCreated: vi.fn() }));
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
    const { result } = renderHook(() => useNewTermForm({ taxonomy: taxonomy(false), onCreated: vi.fn() }));
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
    const { result } = renderHook(() => useNewTermForm({ taxonomy: taxonomy(true), onCreated: vi.fn() }));
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
    const { result } = renderHook(() => useNewTermForm({ taxonomy: taxonomy(true), onCreated: vi.fn() }));
    act(() => result.current.setName("Root"));

    await act(async () => {
      await result.current.submit(formEvent());
    });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.parentId).toBeNull();
  });
});

describe("success and failure", () => {
  it("clears name/parentId and calls onCreated on success", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ term: { id: "t1", taxonomyId: "tax1", parentId: null, name: "Child", status: "active", updatedAt: "x", version: 1 } })
    );
    const onCreated = vi.fn();
    const { result } = renderHook(() => useNewTermForm({ taxonomy: taxonomy(true), onCreated }));
    act(() => {
      result.current.setName("Child");
      result.current.setParentId("p1");
    });

    await act(async () => {
      await result.current.submit(formEvent());
    });

    expect(result.current.name).toBe("");
    expect(result.current.parentId).toBe("");
    expect(result.current.saving).toBe(false);
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it("sets error and stops saving without calling onCreated on failure", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "duplicate name" }, 409));
    const onCreated = vi.fn();
    const { result } = renderHook(() => useNewTermForm({ taxonomy: taxonomy(false), onCreated }));
    act(() => result.current.setName("Dup"));

    await act(async () => {
      await result.current.submit(formEvent());
    });

    expect(result.current.error).toBe("duplicate name");
    expect(result.current.saving).toBe(false);
    expect(onCreated).not.toHaveBeenCalled();
  });
});
