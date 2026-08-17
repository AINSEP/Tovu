// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { useAdminSession } from "../../App.hooks";
import { api } from "../../lib/api";

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
 * original version of this fix) is too broad — a relayed Composio connector failure (bad API key)
 * is ALSO a verbatim 401 in this codebase (`src/server/routes/admin/connectors/errors.ts`), so the
 * original fix would silently log the whole tab out on a bad third-party key, with a perfectly
 * valid Tovu session. The fix narrowed to `status === 401 && code === "UNAUTHENTICATED"` — every
 * genuine session-invalidity 401 in `dev-auth.ts` sets that code; Composio's relay does not. The
 * third test below proves the narrowed gate: a 401 without that code must NOT clear the session.
 */

afterEach(() => {
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

  await api.listPosts().catch(() => undefined);

  // No waitFor here on purpose — asserting a NEGATIVE (nothing changed) needs a settled read, not
  // a race against whatever `onUnauthenticated` would have done if it (wrongly) fired on 403.
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(result.current.user).toEqual({ id: "u1", username: "admin" });
});

it("a 401 WITHOUT code UNAUTHENTICATED (e.g. a relayed Composio connector failure) does NOT clear the session", async () => {
  let call = 0;
  const fetchMock = vi.fn(async () => {
    call += 1;
    if (call === 1) {
      return new Response(JSON.stringify({ user: { id: "u1", username: "admin" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    // Real shape from src/server/routes/admin/connectors/errors.ts relaying Composio's own 401 for
    // a bad/expired API key — status 401, but NOT a session-invalidity signal.
    return new Response(JSON.stringify({ error: "Composio tools request failed with HTTP 401", code: "CONNECTOR_EXECUTION_FAILED" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);

  const { result } = renderHook(() => useAdminSession());
  await waitFor(() => expect(result.current.checking).toBe(false));

  await api.listConnectors().catch(() => undefined);

  // Same reasoning as the 403 case above — a settled read, not a race.
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(result.current.user).toEqual({ id: "u1", username: "admin" });
});
