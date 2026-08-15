import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useWiredDashboard } from "../hooks/use-dashboard.hooks";

/**
 * @file `useWiredDashboard`'s own `t` field (2026-08-11, standing i18n rule — see `use-dashboard
 * .hooks.ts`'s own file header for the full rationale). Exercises `useWiredDashboard` specifically
 * (not the injected `useDashboard`) because resolving `t` from the real `useAdminLocale()` is
 * exactly what only the wired half does — `useDashboard` itself just receives `t` as a dependency,
 * covered instead by `use-dashboard-port.unit.test.ts`'s injected-port coverage.
 *
 * No dedicated hook-level test existed for this before the i18n change (`Dashboard.unit
 * .test.tsx` already covers the five-fetch/merge/error behavior end-to-end); this file adds only
 * what the i18n move itself needs proof of — that `t` reflects the hook's own resolved `locale`,
 * not a hardcoded English pass-through.
 *
 * All five of this hook's own fetches are stubbed to reject immediately — this file has nothing to
 * say about their outcomes, and a real pending promise would just make `waitFor` below wait
 * longer for no assertion benefit.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Routes the locale settings fetch to a fixed response and rejects every other endpoint this hook
 *  calls — same interceptor shape `Dashboard.unit.test.tsx`'s own `beforeEach` uses, minus the
 *  data-endpoint routing this file doesn't need. */
function stubFetchWithLocale(locale: string) {
  return vi.fn((url: string) => {
    if (String(url).includes("/settings/effective") && String(url).includes("namespace=core.language")) {
      return Promise.resolve(jsonResponse({ data: [{ key: "locale", value: locale }] }));
    }
    return Promise.reject(new Error("unrouted in this test"));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useWiredDashboard — t reflects the resolved locale", () => {
  // No "t falls back to the English source string for the default locale" test here: DASHBOARD_DICT
  // has no "en" entries, so `DICT[locale]?.[key] ?? key` returns `key` for every locale on a miss,
  // not only "en" — that assertion would pass identically whether `t` were wired to the resolved
  // locale or hardcoded to an identity function. The test below is the real proof: it requires the
  // hook to have actually resolved the fetched locale AND looked it up in the dictionary.
  it("t returns the Spanish translation once the locale settings fetch resolves to 'es'", async () => {
    vi.stubGlobal("fetch", stubFetchWithLocale("es"));
    const { result } = renderHook(() => useWiredDashboard());

    // `t` starts out against the DEFAULT_LOCALE ("en") until `useAdminLocale`'s own fetch settles —
    // this is the exact effect being proven, so wait for the resolved value, not the initial one.
    await waitFor(() => expect(result.current.t("Dashboard")).toBe("Panel"));
  });
});
