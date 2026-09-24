import { afterEach, expect, test, vi } from "vitest";

import { api } from "../api";

/**
 * @file `api.redeemBootSession` — the thin wrapper `App.hooks.tsx`'s boot effect calls with the
 * token `takeBootToken` read off the URL fragment (run-from-zip plan S2). Asserts the actual `fetch`
 * call's URL/method/body, same discipline as `api-system-endpoints.unit.test.ts`, so a future edit
 * that breaks the request shape fails this test rather than only a coverage number. The route itself
 * (`POST /api/admin/v1/auth/boot-session`) already exists and is covered server-side by
 * `admin-boot-session-route.test.ts` — this only proves the client sends what that route expects.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

test("redeemBootSession POSTs the token to /auth/boot-session", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ user: { id: "owner-1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    })
  );

  const result = await api.redeemBootSession("tok-abc123");

  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe("/api/admin/v1/auth/boot-session");
  expect(calls[0].init?.method).toBe("POST");
  expect(JSON.parse(String(calls[0].init?.body))).toEqual({ token: "tok-abc123" });
  expect(result).toEqual({ user: { id: "owner-1" } });
});

test("redeemBootSession rejects on the documented 401 (invalid or spent token)", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ error: "invalid or spent boot token", code: "UNAUTHENTICATED" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    )
  );

  await expect(api.redeemBootSession("bad-token")).rejects.toThrow("invalid or spent boot token");
});
