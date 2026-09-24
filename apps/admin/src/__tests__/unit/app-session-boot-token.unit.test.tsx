// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useAdminSession } from "../../App.hooks";

/**
 * @file `useAdminSession`'s boot-token redemption (run-from-zip plan S2,
 * `ADS-memory/.local-artifacts/run-from-zip-plan-2026-09-23.md:112-117`) — the browser-side half of
 * the zip launcher's one-time sign-in link. `boot-token-fragment.unit.test.ts` covers the pure
 * `takeBootToken` helper in isolation; this file proves it is actually WIRED into the boot effect,
 * in the right order, and that a failed redemption degrades to the ordinary login rather than an
 * error screen.
 */

function meOk(id = "owner-1") {
  return new Response(JSON.stringify({ user: { id, username: "admin" } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function meUnauthenticated() {
  return new Response(JSON.stringify({ error: "unauthenticated", code: "UNAUTHENTICATED" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  window.history.replaceState(null, "", "/admin/");
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/admin/");
});

it("redeems a #boot= token before checking /auth/me, and the fragment is gone from the URL synchronously — before either fetch resolves", async () => {
  window.history.replaceState(null, "", "/admin/#boot=real-token-123");

  const calls: string[] = [];
  const hashAtCallTime: string[] = [];
  const fetchMock = vi.fn(async (url: string) => {
    calls.push(String(url));
    hashAtCallTime.push(window.location.hash);
    if (String(url).includes("/auth/boot-session")) return meOk("owner-1");
    return meOk("owner-1");
  });
  vi.stubGlobal("fetch", fetchMock);

  const { result } = renderHook(() => useAdminSession());

  // Synchronous, right after mount — before any awaited fetch has settled. If the fragment were
  // stripped only after redemption resolved, this would still see the raw token in the URL bar.
  expect(window.location.hash).toBe("");

  await waitFor(() => expect(result.current.checking).toBe(false));

  expect(calls).toEqual([
    "/api/admin/v1/auth/boot-session",
    "/api/admin/v1/auth/me",
  ]);
  // The URL was already scrubbed before EITHER fetch fired, not just before the second one.
  expect(hashAtCallTime).toEqual(["", ""]);
  expect(result.current.user).toEqual({ id: "owner-1", username: "admin" });
});

it("a bad/expired token falls through to the normal login — no error screen, /auth/me still runs", async () => {
  window.history.replaceState(null, "", "/admin/#boot=spent-token");

  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string) => {
    calls.push(String(url));
    if (String(url).includes("/auth/boot-session")) {
      return new Response(JSON.stringify({ error: "invalid or spent boot token", code: "UNAUTHENTICATED" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    // No real session was ever established, so /auth/me also 401s — the ordinary unauthenticated
    // boot outcome, which renders <Login/>.
    return meUnauthenticated();
  });
  vi.stubGlobal("fetch", fetchMock);

  const { result } = renderHook(() => useAdminSession());

  expect(window.location.hash).toBe("");

  await waitFor(() => expect(result.current.checking).toBe(false));

  expect(calls).toEqual(["/api/admin/v1/auth/boot-session", "/api/admin/v1/auth/me"]);
  expect(result.current.user).toBeNull();
});

it("no fragment: never calls boot-session, only the existing /auth/me chain runs", async () => {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string) => {
    calls.push(String(url));
    return meUnauthenticated();
  });
  vi.stubGlobal("fetch", fetchMock);

  const { result } = renderHook(() => useAdminSession());

  await waitFor(() => expect(result.current.checking).toBe(false));

  expect(calls).toEqual(["/api/admin/v1/auth/me"]);
  expect(result.current.user).toBeNull();
});
