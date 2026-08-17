import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAnalytics, useWiredAnalytics } from "../hooks/use-analytics.hooks";
import { createFakeAnalyticsPort } from "../hooks/analytics-dependencies.hooks";

/**
 * @file `useAnalytics` — the Analytics screen's one fetch-on-mount effect, extracted verbatim from
 * `Analytics.tsx`. Pins the exact error strings (moved verbatim during extraction) and the
 * null-until-loaded contract `Analytics.tsx` branches its loading state on.
 *
 * The pre-existing suite below exercises `useWiredAnalytics()` — `api.listRecentAnalyticsHits`
 * goes through `lib/api.ts`'s `request()`, which calls the global `fetch` — stubbed here the same
 * way `Comments.unit.test.tsx`/`Media.unit.test.tsx` stub it, rather than mocking the `api` module.
 * The `injected port` describe block below is new: it renders the pure `useAnalytics(port, t)`
 * against `createFakeAnalyticsPort` directly, no `fetch` stub at all — see `analytics-port.hooks.ts`
 * for why the injection exists.
 *
 * `t` (2026-08-11, standing i18n rule — see `use-analytics.hooks.ts`'s own file header): every
 * `useAnalytics(port, ...)` call below passes `fakeT`, the identity function, matching
 * `wired-hooks-convention.md`'s own `t: (k) => k` example — except the dedicated "injected t is
 * genuinely returned" group, which uses a distinctive fake to prove the value is not built
 * internally.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Identity translator for tests that don't care about `t`'s own behavior — see this file's header. */
const fakeT = (key: string): string => key;

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
    // technique `use-redirects.hooks.unit.test.tsx`'s `routeFetch` helper uses, fixes that.
    fetchMock = vi.fn().mockImplementation(() => jsonResponse({ hits: [HIT] }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useWiredAnalytics());
    await waitFor(() => expect(result.current.hits).toEqual([HIT]));
    expect(result.current.error).toBeNull();
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

describe("useAnalytics — injected port", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves hits from the fake port's seed, with no fetch involved", async () => {
    const networkMock = vi.fn();
    vi.stubGlobal("fetch", networkMock);
    const port = createFakeAnalyticsPort({ hits: [HIT] });
    const { result } = renderHook(() => useAnalytics(port, fakeT));

    await waitFor(() => expect(result.current.hits).toEqual([HIT]));
    expect(result.current.error).toBeNull();
    // Proves the injection actually took — a hook that still reached `api` internally would have
    // hit this stub and made the assertion above fail differently (unresolved hits), but this is
    // the direct proof: the network was never touched at all.
    expect(networkMock).not.toHaveBeenCalled();
  });

  it("surfaces a rejected port call's message on the error channel", async () => {
    const networkMock = vi.fn();
    vi.stubGlobal("fetch", networkMock);
    const port = createFakeAnalyticsPort();
    port.listRecentAnalyticsHits = () => Promise.reject(new Error("hits table locked"));
    const { result } = renderHook(() => useAnalytics(port, fakeT));

    await waitFor(() => expect(result.current.error).toBe("hits table locked"));
    expect(result.current.hits).toBeNull();
    expect(networkMock).not.toHaveBeenCalled();
  });
});

describe("useAnalytics — injected t is genuinely returned, not built internally", () => {
  /**
   * Standing i18n rule (2026-08-11, `Analytics.tsx` no longer imports `useAdminLocale`/
   * `analytics-i18n` itself): `t` must come from the hook's own second parameter, not something
   * this hook quietly rebuilds from a dictionary it reaches for on its own. A DISTINCTIVE fake (not
   * the identity `fakeT` every other test in this file uses) proves the returned `t` is literally
   * the same function reference passed in — an identity `t` would pass this same assertion even if
   * the hook silently ignored its `t` argument and returned its own `(k) => k`. Mirrors
   * `use-post-editor.hooks.unit.test.tsx`'s identical negative-verification group.
   */
  it("result.current.t is exactly the injected function, not a hook-internal one", async () => {
    const port = createFakeAnalyticsPort({ hits: [HIT] });
    const distinctiveT = (key: string): string => `TRANSLATED[${key}]`;

    const { result } = renderHook(() => useAnalytics(port, distinctiveT));

    await waitFor(() => expect(result.current.hits).toEqual([HIT]));
    expect(result.current.t("Analytics")).toBe("TRANSLATED[Analytics]");
    expect(result.current.t).toBe(distinctiveT);
  });
});
