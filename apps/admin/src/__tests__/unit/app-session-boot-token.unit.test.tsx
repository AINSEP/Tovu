// @vitest-environment jsdom
import { act, render, renderHook, screen, waitFor } from "@/__tests__/fetch-query-render";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { isPublishToLiveAvailable, setPublishToLiveAvailable } from "../../features/publish-content/hooks/publish-availability.store";
import { useAdminSession } from "../../App.hooks";
import { Login } from "../../features/auth";
import { api } from "../../lib/api";

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
  setPublishToLiveAvailable(true);
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/admin/");
});

it("redeems a #boot= token before checking /auth/me, and the fragment is gone from the URL synchronously — before either fetch resolves", async () => {
  window.history.replaceState(null, "", "/admin/#boot=real-token-123");

  const calls: string[] = [];
  const hashAtCallTime: string[] = [];
  let finishRedemption!: (response: Response) => void;
  const redemption = new Promise<Response>((resolve) => { finishRedemption = resolve; });
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    calls.push(String(url));
    hashAtCallTime.push(window.location.hash);
    if (String(url).includes("/auth/boot-session")) return redemption;
    return meOk("owner-1");
  });
  vi.stubGlobal("fetch", fetchMock);

  const { result } = renderHook(() => useAdminSession());

  // Synchronous, right after mount — before any awaited fetch has settled. If the fragment were
  // stripped only after redemption resolved, this would still see the raw token in the URL bar.
  expect(window.location.hash).toBe("");
  expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/v1/auth/boot-session");
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST" });
  expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ token: "real-token-123" });

  // Flush queued microtasks while redemption is still blocked: auth/me must wait for its cookie.
  await act(async () => {});
  expect(calls).toEqual(["/api/admin/v1/auth/boot-session"]);
  expect(result.current.checking).toBe(true);
  expect(result.current.user).toBeNull();
  await act(async () => { finishRedemption(meOk("owner-1")); });

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

it("no fragment: an unauthenticated loopback browser tries local bootstrap and falls back to login when refused", async () => {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string) => {
    calls.push(String(url));
    return meUnauthenticated();
  });
  vi.stubGlobal("fetch", fetchMock);

  const { result } = renderHook(() => useAdminSession());

  await waitFor(() => expect(result.current.checking).toBe(false));

  expect(calls).toEqual(["/api/admin/v1/auth/me", "/api/admin/v1/auth/local-boot-session"]);
  expect(result.current.user).toBeNull();
});

it.each([401, 403, 404, 500])("local bootstrap HTTP %s shows username/password login and attempts boot exactly once, including Strict Mode replay", async (status) => {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).endsWith("/auth/local-boot-session")) {
      return new Response(JSON.stringify({ error: "local owner sign-in is disabled", code: "NOT_FOUND" }), {
        status, headers: { "content-type": "application/json" },
      });
    }
    return meUnauthenticated();
  });
  vi.stubGlobal("fetch", fetchMock);

  // Use App's gate with the real Login, whose locale read can itself receive another 401.
  function SessionGate() {
    const session = useAdminSession();
    if (session.checking) return <div>Loading Tovu…</div>;
    if (!session.user) return <Login onLogin={session.handleLogin} />;
    return <div>Signed in</div>;
  }
  render(<StrictMode><SessionGate /></StrictMode>);
  await screen.findByLabelText("Username");
  expect(screen.getByLabelText("Password")).toBeTruthy();
  // Repeated settings failures after fallback must not re-enter the loading gate or retry boot.
  await act(async () => {
    await Promise.all([
      api.getSettingsEffective({ namespace: "core.language" }).catch(() => undefined),
      api.getSettingsEffective({ namespace: "core.appearance" }).catch(() => undefined),
    ]);
  });
  expect(screen.queryByText("Loading Tovu…")).toBeNull();
  expect(screen.getByLabelText("Username")).toBeTruthy();
  const bootCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/auth/local-boot-session"));
  expect(bootCalls).toHaveLength(1);
  expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/auth/me"))).toHaveLength(1);
});

it.each([
  [{ canPublishToLive: false }, false],
  [{ canPublishToLive: true }, true],
  [{}, true],
] as const)("boot auth/me publishes availability %j into the real store", async (flag, expected) => {
  setPublishToLiveAvailable(!expected);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url) !== "/api/admin/v1/auth/me") throw new Error(`unexpected session URL ${url}`);
    return new Response(JSON.stringify({ user: { id: "owner-1", username: "admin" }, ...flag }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }));
  const { result } = renderHook(() => useAdminSession());
  await waitFor(() => expect(result.current.checking).toBe(false));
  expect(result.current.user?.id).toBe("owner-1");
  expect(isPublishToLiveAvailable()).toBe(expected);
});
