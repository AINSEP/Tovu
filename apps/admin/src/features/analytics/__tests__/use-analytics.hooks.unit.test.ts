import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAnalytics } from "../hooks/use-analytics.hooks";

/**
 * @file `useAnalytics` — the Analytics screen's one fetch-on-mount effect, extracted verbatim from
 * `Analytics.tsx`. Pins the exact error strings (moved verbatim during extraction) and the
 * null-until-loaded contract `Analytics.tsx` branches its loading state on.
 *
 * `api.listRecentAnalyticsHits` goes through `lib/api.ts`'s `request()`, which calls the global
 * `fetch` — stubbed here the same way `Comments.unit.test.tsx`/`Media.unit.test.tsx` stub it,
 * rather than mocking the `api` module.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;

afterEach(() => {
  vi.unstubAllGlobals();
});

const HIT = {
  occurredAt: "2026-08-01T00:00:00.000Z",
  kind: "pageview" as const,
  path: "/",
  referrerHost: null,
  deviceClass: "desktop" as const,
  browserFamily: "Chrome",
  eventName: null,
};

describe("useAnalytics", () => {
  it("starts with hits=null, error=null before the fetch settles", () => {
    fetchMock = vi.fn(() => new Promise(() => {})); // never resolves
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAnalytics());
    expect(result.current.hits).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("resolves hits from the listRecentAnalyticsHits response", async () => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({ hits: [HIT] }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAnalytics());
    await waitFor(() => expect(result.current.hits).toEqual([HIT]));
    expect(result.current.error).toBeNull();
  });

  it("surfaces a server error's message on the error channel, verbatim", async () => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "hits table locked" }, 500));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAnalytics());
    await waitFor(() => expect(result.current.error).toBe("hits table locked"));
    expect(result.current.hits).toBeNull();
  });

  it("falls back to the exact string 'failed to load recent hits' when the rejection is not an Error", async () => {
    // Thrown directly by the fetch call itself (before `request()` can wrap it in an `ApiError`),
    // so `useAnalytics`'s `catch` sees a non-Error value and must hit its fallback branch.
    fetchMock = vi.fn(() => Promise.reject("network exploded"));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useAnalytics());
    await waitFor(() => expect(result.current.error).toBe("failed to load recent hits"));
  });
});
