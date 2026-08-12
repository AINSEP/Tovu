import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDashboard } from "../hooks/use-dashboard.hooks";

/**
 * @file `useDashboard`'s own `t` field (2026-08-11, standing i18n rule — see this hook's own file
 * header for the full rationale, including why this hook stayed a direct `api` import rather than
 * getting the full port conversion the rest of this sweep uses).
 *
 * No dedicated hook-level test existed for `useDashboard` before this change (`Dashboard.unit
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

describe("useDashboard — t reflects the resolved locale", () => {
  it("t falls back to the English source string for the default locale", async () => {
    vi.stubGlobal("fetch", stubFetchWithLocale("en"));
    const { result } = renderHook(() => useDashboard());

    await waitFor(() => expect(result.current.t("Dashboard")).toBe("Dashboard"));
  });

  it("t returns the Spanish translation once the locale settings fetch resolves to 'es'", async () => {
    vi.stubGlobal("fetch", stubFetchWithLocale("es"));
    const { result } = renderHook(() => useDashboard());

    // `t` starts out against the DEFAULT_LOCALE ("en") until `useAdminLocale`'s own fetch settles —
    // this is the exact effect being proven, so wait for the resolved value, not the initial one.
    await waitFor(() => expect(result.current.t("Dashboard")).toBe("Panel"));
  });
});
