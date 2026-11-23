import { renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { afterEach, describe, expect, it, vi } from "vitest";

import { dropInFlightSettingsReads } from "@jini-ai/admin/shell/lib/settings-effective-reads";
import { useWiredAnalytics } from "../../../integrations/jini-admin/analytics-module.hooks";

/**
 * @file `useWiredAnalytics` — the host binding of the Jini Analytics screen's controller hook
 * (`integrations/jini-admin/analytics-module.hooks.ts`): this app's admin request client and its
 * `useAdminLocale()` bound into `@jini-ai/admin`'s `useAnalytics`. Pins the exact error strings
 * (moved verbatim during extraction) and the null-until-loaded contract the screen branches its
 * loading state on, through the real request path.
 *
 * `api.listRecentAnalyticsHits` goes through `lib/admin-http/request.ts`'s `request()`, which
 * calls the global `fetch` — stubbed here the same way `Comments.unit.test.tsx`/`Media.unit.test
 * .tsx` stub it, rather than mocking the `api` module. The injected-port suites (`useAnalytics`
 * against `createFakeAnalyticsPort`, no `fetch` at all) moved with the hook to
 * `@jini-ai/admin/screens/analytics`'s own `__tests__/use-analytics.hooks.unit.test.ts`.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

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

    const { result } = renderHook(() => useWiredAnalytics());
    expect(result.current.hits).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("resolves hits from the listRecentAnalyticsHits response", async () => {
    // `mockImplementation`, not `mockResolvedValue` — `useWiredAnalytics()` now also calls
    // `useAdminLocale()` internally (this file's own i18n conversion), which fires its OWN fetch
    // (`loadLanguage()`) against this same stub. `mockResolvedValue` would hand out the identical
    // `Response` object to both calls, and a `Response` body can only be read once — the second
    // reader (whichever call loses the race) would throw "body already read" and surface as a
    // generic `request()` failure instead of the real payload. A fresh `Response` per call, same
    // technique `Jini redirects/react/__tests__/use-redirects.hooks.unit.test.tsx`'s `routeFetch` helper uses, fixes that.
    fetchMock = vi.fn().mockImplementation(() => jsonResponse({ hits: [HIT] }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useWiredAnalytics());
    await waitFor(() => expect(result.current.hits).toEqual([HIT]));
    expect(result.current.error).toBeNull();
    const hitsCalls = fetchMock.mock.calls.filter(([url]) => !String(url).includes("/settings/effective"));
    expect(hitsCalls).toHaveLength(1);
    const [url, init] = hitsCalls[0];
    expect(new URL(String(url), window.location.origin).pathname).toBe(
      "/api/admin/v1/workspaces/workspace-local/analytics/recent-hits",
    );
    expect(new URL(String(url), window.location.origin).search).toBe("");
    expect((init as RequestInit | undefined)?.method ?? "GET").toBe("GET");
  });

  it("surfaces a server error's message on the error channel, verbatim", async () => {
    // See the previous test's comment — a fresh `Response` per call is required now that
    // `useWiredAnalytics()` fires a second fetch (`useAdminLocale()`'s `loadLanguage()`) alongside
    // the one this test cares about.
    fetchMock = vi.fn().mockImplementation(() => jsonResponse({ error: "hits table locked" }, 500));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useWiredAnalytics());
    await waitFor(() => expect(result.current.error).toBe("hits table locked"));
    expect(result.current.hits).toBeNull();
  });

  it("falls back to the exact string 'failed to load recent hits' when the rejection is not an Error", async () => {
    // Thrown directly by the fetch call itself (before `request()` can wrap it in an `ApiError`),
    // so `useAnalytics`'s `catch` sees a non-Error value and must hit its fallback branch.
    fetchMock = vi.fn(() => Promise.reject("network exploded"));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useWiredAnalytics());
    await waitFor(() => expect(result.current.error).toBe("failed to load recent hits"));
  });
});

describe("useWiredAnalytics — locale binding", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hands the screen a translator bound to the operator's saved admin language", async () => {
    // The first suite above leaves a never-settling language read in the shared in-flight cache;
    // a fresh read is what this test is about.
    dropInFlightSettingsReads({ namespaces: ["core.language"] });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/settings/effective") && String(url).includes("namespace=core.language")) {
        return jsonResponse({ data: [{ key: "locale", value: "es" }] });
      }
      return jsonResponse({ hits: [] });
    }));
    const { result } = renderHook(() => useWiredAnalytics());
    await waitFor(() => expect(result.current.t({ key: "Analytics" })).toBe("Analítica"));
  });
});
