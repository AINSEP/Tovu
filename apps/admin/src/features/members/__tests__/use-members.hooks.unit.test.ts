import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useWiredMembers } from "../hooks/use-members.hooks";

/**
 * @file `useMembers`'s own `t`/`locale` fields (2026-08-11, standing i18n rule — see this hook's
 * own file header for the full rationale). No dedicated hook-level test existed for `useMembers`
 * before this change — `Members.unit.test.tsx` already covers the load/row-action behavior
 * end-to-end through the real component; this file adds only what the i18n move itself needs proof
 * of, that `t`/`locale` reflect the hook's own resolved locale rather than a hardcoded English
 * pass-through.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Routes the locale settings fetch to a fixed response and rejects the members list — this file
 *  has nothing to say about the list's own outcome, and a real pending promise would just make
 *  `waitFor` below wait longer for no assertion benefit. */
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

describe("useMembers — t/locale reflect the resolved locale", () => {
  // No "t falls back to the English source string for the default locale" test here: MEMBERS_DICT
  // has no "en" entries, so `t("Members")` returns "Members" on a dictionary miss regardless of
  // wiring — and since that condition is already true before the fetch resolves, a `waitFor` gated
  // on it exits immediately, so a follow-up `locale` assertion isn't reliably proven to run after
  // the fetch settles either (DEFAULT_LOCALE is also "en", so it can pass on the pre-fetch value by
  // coincidence). The test below is the real proof: both `t` and `locale` are pinned to values only
  // the resolved 'es' fetch can produce.
  it("t returns the Spanish translation and locale reflects 'es' once the locale settings fetch resolves", async () => {
    vi.stubGlobal("fetch", stubFetchWithLocale("es"));
    const { result } = renderHook(() => useWiredMembers());

    await waitFor(() => expect(result.current.locale).toBe("es"));
    expect(result.current.t("Members")).toBe("Miembros");
  });
});
