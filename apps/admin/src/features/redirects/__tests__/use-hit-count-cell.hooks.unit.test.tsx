import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "../../../lib/fetch-query";
import { useHitCountCell } from "../hooks/use-hit-count-cell.hooks";

/**
 * @file `useHitCountCell` (SPEC-037 REQ-03) — the lazy per-row hit-count read. The whole point of
 * this hook is that `api.getRedirectHits` does NOT fire until `request()` is called; that gate is
 * the one thing worth pinning here, plus the "0 hits still renders" contract `data` vs `hitCount`
 * truthiness exists for.
 *
 * Goes through `useFetchQuery`, so every render needs a `FetchQueryProvider` — a fresh one per
 * test, matching `fetch-query.test.tsx`'s own convention (cold cache per test).
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useHitCountCell", () => {
  it("does not fetch on mount — the query stays disabled until request() is called", () => {
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useHitCountCell({ redirectId: "r1" }), { wrapper });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches once request() is called, and resolves with the hit stats", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { redirectId: "r1", workspaceId: "ws1", hitCount: 7, lastHitAt: "2026-08-01T00:00:00.000Z" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useHitCountCell({ redirectId: "r1" }), { wrapper });
    act(() => result.current.request());

    await waitFor(() => expect(result.current.data?.data.hitCount).toBe(7));
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("resolves data even for a rule with zero recorded hits — the caller must branch on data being present, not on hitCount's truthiness", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { redirectId: "r1", workspaceId: "ws1", hitCount: 0, lastHitAt: null } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useHitCountCell({ redirectId: "r1" }), { wrapper });
    act(() => result.current.request());

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.data.hitCount).toBe(0);
  });

  it("is fetching while the request is in flight, and settles once it resolves", async () => {
    let resolveFetch!: (value: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (resolveFetch = resolve)));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useHitCountCell({ redirectId: "r1" }), { wrapper });
    act(() => result.current.request());

    await waitFor(() => expect(result.current.isFetching).toBe(true));

    await act(async () => {
      resolveFetch(jsonResponse({ data: { redirectId: "r1", workspaceId: "ws1", hitCount: 3, lastHitAt: null } }));
    });
    await waitFor(() => expect(result.current.isFetching).toBe(false));
  });

  it("surfaces a request failure as an error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "hits route down" }, 500));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useHitCountCell({ redirectId: "r1" }), { wrapper });
    act(() => result.current.request());

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toBe("hits route down");
  });
});
