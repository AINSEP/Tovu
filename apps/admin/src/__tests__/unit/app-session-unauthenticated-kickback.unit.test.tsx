// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { useAdminSession } from "../../App.hooks";
import { api } from "../../lib/api";
import * as apiModule from "../../lib/api";

/**
 * @file The live bug, 2026-08-17: `useAdminSession` only ever checked auth ONCE, at boot
 * (`/auth/me` on mount) — a session that goes invalid mid-tab (expiry, revoke, or the server
 * restarting and dropping in-memory state) left `user` stuck non-null forever, so `App.tsx`'s
 * `if (!user) return <Login .../>` gate never re-fired. Every OTHER screen's own `request()` call
 * (source control, deployments, assistant, recovery — reported live, all at once) just kept
 * 401ing silently instead, each one "loading forever" with no explanation. The fix: `lib/api.ts`'s
 * `request()` now notifies a shared `onUnauthenticated` listener set on any real 401, and
 * `useAdminSession` subscribes to clear `user` — reusing the EXISTING `<Login>` gate instead of
 * adding a second one. This test proves the INTEGRATION: a 401 from an unrelated screen's own call
 * (`listPosts`, standing in for "any screen"), not `/auth/me` itself, still clears the session.
 *
 * Second bug, found by adversarial review the same day: gating on bare `status === 401` (the
 * original version of this fix) is too broad — a relayed third-party failure (bad API key) can
 * ALSO be a verbatim 401 (the since-removed connectors routes relayed one exactly so), so the
 * original fix would silently log the whole tab out on a bad third-party key, with a perfectly
 * valid Tovu session. The fix narrowed to `status === 401 && code === "UNAUTHENTICATED"` — every
 * genuine session-invalidity 401 in `dev-auth.ts` sets that code; a third-party relay does not. The
 * third test below proves the narrowed gate: a 401 without that code must NOT clear the session.
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("a 401 from an unrelated screen's own api call clears the session, not just that one call", async () => {
  let call = 0;
  const fetchMock = vi.fn(async () => {
    call += 1;
    if (call === 1) {
      // The boot-time /auth/me check — session is genuinely valid at mount.
      return new Response(JSON.stringify({ user: { id: "u1", username: "admin" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    // A LATER call from some other, unrelated screen, made after the session has since expired
    // server-side. Real shape confirmed live against this repo's own dev server, 2026-08-17.
    return new Response(JSON.stringify({ error: "unauthenticated", code: "UNAUTHENTICATED" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);

  const { result } = renderHook(() => useAdminSession());

  await waitFor(() => expect(result.current.checking).toBe(false));
  expect(result.current.user).toEqual({ id: "u1", username: "admin" });

  // Some unrelated screen's own request hits the now-expired session. Before this fix, this 401
  // only ever reached THAT screen's own catch block — `useAdminSession`'s `user` never learned
  // about it, so `App.tsx` kept rendering the real shell around a dead session.
  await api.listPosts().catch(() => undefined);

  await waitFor(() => expect(result.current.user).toBeNull());
});

it("a 403 (authenticated but forbidden) does NOT clear the session — a real permission error must not kick the operator to login", async () => {
  let call = 0;
  const fetchMock = vi.fn(async () => {
    call += 1;
    if (call === 1) {
      return new Response(JSON.stringify({ user: { id: "u1", username: "admin" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "forbidden", code: "FORBIDDEN" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);

  const { result } = renderHook(() => useAdminSession());
  await waitFor(() => expect(result.current.checking).toBe(false));

  await act(async () => { await expect(api.listPosts()).rejects.toMatchObject({ status: 403 }); });
  expect(result.current.user).toEqual({ id: "u1", username: "admin" });
});

it("a 401 WITHOUT code UNAUTHENTICATED (e.g. a relayed third-party 401) does NOT clear the session", async () => {
  let call = 0;
  const fetchMock = vi.fn(async () => {
    call += 1;
    if (call === 1) {
      return new Response(JSON.stringify({ user: { id: "u1", username: "admin" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    // A relayed third-party 401 (e.g. an upstream service rejecting a bad/expired API key) —
    // status 401, but NOT a session-invalidity signal.
    return new Response(JSON.stringify({ error: "Upstream request failed with HTTP 401", code: "UPSTREAM_REQUEST_FAILED" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);

  const { result } = renderHook(() => useAdminSession());
  await waitFor(() => expect(result.current.checking).toBe(false));

  await act(async () => { await expect(api.listExternalMcpServers()).rejects.toMatchObject({ status: 401 }); });
  expect(result.current.user).toEqual({ id: "u1", username: "admin" });
});

it("unsubscribes on unmount so a later 401 cannot notify the removed session", async () => {
  const subscribe = apiModule.onUnauthenticated;
  const notified = vi.fn();
  const unsubscribe = vi.fn();
  const registration = vi.spyOn(apiModule, "onUnauthenticated").mockImplementation((listener) => {
    const remove = subscribe(() => { notified(); listener(); });
    return () => { unsubscribe(); remove(); };
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
    user: { id: "u1", username: "admin" },
  }))).mockResolvedValueOnce(new Response(JSON.stringify({ code: "UNAUTHENTICATED" }), { status: 401 })));
  const { result, unmount } = renderHook(() => useAdminSession());
  await waitFor(() => expect(result.current.user?.id).toBe("u1"));
  expect(registration).toHaveBeenCalledTimes(1);
  unmount();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  await expect(api.listPosts()).rejects.toMatchObject({ status: 401 });
  expect(notified).not.toHaveBeenCalled();
});
