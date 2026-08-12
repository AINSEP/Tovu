import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, type AdminContentType } from "../../../lib/api";
import { FetchQueryProvider } from "../../../lib/fetch-query";
import { createFakeCollectionsPort } from "../hooks/collections-dependencies.hooks";
import { useCollections, useWiredCollections } from "../hooks/use-collections.hooks";

/**
 * @file `useCollections` — the Collections list screen's content-type registry load + dialog
 * open/close state + the shared `runLifecycle` action. Follows the fetch-mocking harness
 * `use-restore-points-section.unit.test.ts` established for this package.
 *
 * `loaded()` below drives the wired hook (real `fetch`) — unchanged from before the `useWiredX`
 * conversion, just a call-site swap. The "injected port" describe block at the bottom is new
 * coverage added alongside that conversion, proving the pure hook is independently testable
 * against `createFakeCollectionsPort` with no `fetch` stub at all.
 *
 * `wrapper` (2026-08-12, `lib/fetch-query` migration): the list read and `runLifecycle` now go
 * through `useFetchQuery`/`useFetchMutation`, which throw without a `QueryClientProvider` ancestor.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const TYPE: AdminContentType = {
  workspaceId: "w1",
  key: "recipe",
  label: "Recipe",
  fields: [],
  status: "active",
  version: 1,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  // `useCollections` now also calls `useAdminLocale()` (real `fetch`, not this hook's own
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

async function loaded() {
  fetchMock.mockResolvedValueOnce(jsonResponse({ items: [TYPE] }));
  const view = renderHook(() => useWiredCollections(), { wrapper });
  await waitFor(() => expect(view.result.current.types).not.toBeNull());
  return view;
}

describe("initial load", () => {
  it("starts with types=null, resolves to the raw items", async () => {
    const { result } = await loaded();
    expect(result.current.types).toEqual([TYPE]);
    expect(result.current.error).toBeNull();
  });

  it("sets the Collections-specific fallback error on a failed load", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 500));
    const { result } = renderHook(() => useWiredCollections(), { wrapper });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("failed to load content types");
    expect(result.current.types).toBeNull();
  });
});

describe("dialog open/close state", () => {
  it("showNewDialog starts false and toggles via setShowNewDialog", async () => {
    const { result } = await loaded();
    expect(result.current.showNewDialog).toBe(false);
    act(() => result.current.setShowNewDialog(true));
    expect(result.current.showNewDialog).toBe(true);
  });

  it("pendingLifecycle starts null and can be set/cleared", async () => {
    const { result } = await loaded();
    expect(result.current.pendingLifecycle).toBeNull();
    act(() => result.current.setPendingLifecycle({ op: "tombstone", contentType: TYPE }));
    expect(result.current.pendingLifecycle).toEqual({ op: "tombstone", contentType: TYPE });
    act(() => result.current.setPendingLifecycle(null));
    expect(result.current.pendingLifecycle).toBeNull();
  });

  it("editingFieldsFor starts null and can be set/cleared", async () => {
    const { result } = await loaded();
    expect(result.current.editingFieldsFor).toBeNull();
    act(() => result.current.setEditingFieldsFor(TYPE));
    expect(result.current.editingFieldsFor).toEqual(TYPE);
  });
});

describe("load (re-fetch)", () => {
  it("re-fetches the list", async () => {
    const { result } = await loaded();
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [TYPE, { ...TYPE, key: "article" }] }));
    act(() => result.current.load());
    await waitFor(() => expect(result.current.types).toHaveLength(2));
  });
});

describe("runLifecycle", () => {
  it("POSTs { key, op, expectedVersion } to the lifecycle endpoint and reloads on success", async () => {
    const { result } = await loaded();
    fetchMock.mockResolvedValueOnce(jsonResponse({ contentType: { ...TYPE, status: "deprecated" } }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [{ ...TYPE, status: "deprecated" }] })); // reload

    await act(async () => {
      await result.current.runLifecycle(TYPE, "deprecate");
    });

    const call = fetchMock.mock.calls.at(-2)!;
    expect(String(call[0])).toContain("/content-types/recipe/lifecycle");
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({ op: "deprecate", expectedVersion: 1 });
    // `waitFor`, not a bare synchronous read (2026-08-12, `lib/fetch-query` migration):
    // `runLifecycle`'s own promise resolves once the WRITE settles, but the reload it now triggers
    // via `invalidates: [KEYS.list]` is a separate, un-awaited background refetch — see
    // `adapter.tanstack.tsx`'s own comment on why invalidation is fire-and-forget.
    await waitFor(() => expect(result.current.types).toEqual([{ ...TYPE, status: "deprecated" }]));
    expect(result.current.actionError).toBeNull();
  });

  it("sets an op- and label-specific fallback actionError on failure, without reloading", async () => {
    const { result } = await loaded();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 500));

    const callsBefore = fetchMock.mock.calls.length;
    await act(async () => {
      await result.current.runLifecycle(TYPE, "tombstone");
    });

    // `waitFor` (2026-08-12, `lib/fetch-query` migration): `actionError` is now derived from
    // `useFetchMutation`'s own `.error`, which can land one render after `runLifecycle()` itself
    // resolves — see `use-merge-term-section.unit.test.tsx`'s identical note in `taxonomy`.
    await waitFor(() => expect(result.current.actionError).toBe('Failed to tombstone "Recipe"'));
    expect(fetchMock.mock.calls.length).toBe(callsBefore + 1); // no follow-up reload GET
  });

  it("clears a prior actionError when re-invoked", async () => {
    const { result } = await loaded();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 500));
    await act(async () => {
      await result.current.runLifecycle(TYPE, "deprecate");
    });
    await waitFor(() => expect(result.current.actionError).not.toBeNull());

    fetchMock.mockResolvedValueOnce(jsonResponse({ contentType: TYPE }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [TYPE] }));
    await act(async () => {
      await result.current.runLifecycle(TYPE, "deprecate");
    });
    await waitFor(() => expect(result.current.actionError).toBeNull());
  });
});

describe("injected port (useWiredX conversion coverage)", () => {
  it("loads content types through the injected port, without touching fetch", async () => {
    vi.stubGlobal("fetch", fetchMock);
    try {
      const port = createFakeCollectionsPort({ types: [TYPE] });
      const { result } = renderHook(() => useCollections({ port, locale: "en", t: (k) => k }), { wrapper });
      await waitFor(() => expect(result.current.types).not.toBeNull());

      expect(result.current.types).toEqual([TYPE]);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("runLifecycle deprecates through the injected port and reloads the list, reflecting the update", async () => {
    const port = createFakeCollectionsPort({ types: [TYPE] });
    const { result } = renderHook(() => useCollections({ port, locale: "en", t: (k) => k }), { wrapper });
    await waitFor(() => expect(result.current.types).not.toBeNull());

    await act(async () => {
      await result.current.runLifecycle(TYPE, "deprecate");
    });

    // `waitFor`: the reload triggered by `invalidates: [KEYS.list]` is a separate, un-awaited
    // background refetch — see this file's identical note above.
    await waitFor(() => expect(result.current.types?.[0]?.status).toBe("deprecated"));
    expect(result.current.actionError).toBeNull();
  });

  it("sets the locale-aware fallback actionError when the injected port's lifecycle call rejects", async () => {
    // An empty-message ApiError, not a plain Error — describeApiError only substitutes the
    // fallback for ApiError.message === "" (matching what a real 500-with-no-body response
    // becomes via `request()`); a plain Error's own (even empty) `.message` always wins.
    const port = createFakeCollectionsPort({ types: [TYPE], lifecycleError: new ApiError("", 500) });
    const { result } = renderHook(() => useCollections({ port, locale: "en", t: (k) => k }), { wrapper });
    await waitFor(() => expect(result.current.types).not.toBeNull());

    await act(async () => {
      await result.current.runLifecycle(TYPE, "tombstone");
    });

    await waitFor(() => expect(result.current.actionError).toBe('Failed to tombstone "Recipe"'));
  });
});
