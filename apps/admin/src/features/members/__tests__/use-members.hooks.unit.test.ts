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
  it("t falls back to the English source string for the default locale", async () => {
    vi.stubGlobal("fetch", stubFetchWithLocale("en"));
    const { result } = renderHook(() => useWiredMembers());

    await waitFor(() => expect(result.current.t("Members")).toBe("Members"));
    expect(result.current.locale).toBe("en");
  });

  it("t returns the Spanish translation and locale reflects 'es' once the locale settings fetch resolves", async () => {
    vi.stubGlobal("fetch", stubFetchWithLocale("es"));
    const { result } = renderHook(() => useWiredMembers());

    await waitFor(() => expect(result.current.locale).toBe("es"));
    expect(result.current.t("Members")).toBe("Miembros");
  });
});
