import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { integrationsApi } from "@/features/integrations/integrations-host-ports";
import type { ExternalMcpOAuthConnectWindow } from "@jini-ai/admin/screens/settings/hooks/use-external-mcp-oauth-connect.hooks";

import { useHostExternalMcpOAuthConnect } from "../settings-external-mcp-oauth-connect.hooks";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("api sign-in routes", () => {
  it("POSTs connect and device poll to the server's oauth routes", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ auth: { kind: "redirect_required", authorizationUrl: "x", expiresAt: "y" } }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await integrationsApi.connectExternalMcpOAuth({ serverId: "higgs field" });
    await integrationsApi.pollExternalMcpOAuthDevice({ serverId: "higgs field" });
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0]![0]).toBe("/api/admin/v1/workspaces/workspace-local/mcp-servers/higgs%20field/oauth/connect");
    expect(calls[0]![1].method).toBe("POST");
    expect(calls[1]![0]).toBe("/api/admin/v1/workspaces/workspace-local/mcp-servers/higgs%20field/oauth/device/poll");
    expect(calls[1]![1].method).toBe("POST");
  });
});

describe("useHostExternalMcpOAuthConnect", () => {
  it("reloads on the website callback page's own message type, through the live integrations port", async () => {
    const listeners = new Map<string, EventListener>();
    const win: ExternalMcpOAuthConnectWindow = {
      open: () => ({ location: { href: "about:blank" }, close: vi.fn() }),
      addEventListener: ((type: string, fn: EventListener) => listeners.set(type, fn)) as Window["addEventListener"],
      removeEventListener: ((type: string) => listeners.delete(type)) as Window["removeEventListener"],
      origin: "https://localhost:3000",
    };
    const connect = vi.spyOn(integrationsApi, "connectExternalMcpOAuth").mockResolvedValue({ auth: { kind: "redirect_required", authorizationUrl: "https://idp.example/auth", expiresAt: "z" } });
    const onConnected = vi.fn();
    const { result } = renderHook(() => useHostExternalMcpOAuthConnect({ serverId: "higgsfield", grant: "authorization_code", onConnected }, { win: () => win }));

    await act(() => result.current.connect());
    expect(connect).toHaveBeenCalledWith({ serverId: "higgsfield" });
    // The literal the website's `routes/oauth/callback-page.ts` posts; the binding must pass it through.
    act(() => listeners.get("message")!({ origin: win.origin, data: { type: "tovu:external-mcp-connected" } } as unknown as Event));
    expect(onConnected).toHaveBeenCalledTimes(1);
  });
});

it("forwards the shared destination and completes device sign-in on the polled server", async () => {
  vi.useFakeTimers();
  const route = "/api/admin/v1/workspaces/workspace-local/mcp-servers/device%20server/oauth";
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    if (input === route + "/connect" && init?.method === "POST" && init.body === '{"destination":"shared"}') {
      return Response.json({ auth: { kind: "device_code", userCode: "TEST-123", verificationUri: "https://provider.example/device", intervalSeconds: 2, expiresAt: "2026-11-27T12:00:00Z" } });
    }
    if (input === route + "/device/poll" && init?.method === "POST") return Response.json({ status: "connected" });
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetch);
  const open = vi.fn<ExternalMcpOAuthConnectWindow["open"]>().mockReturnValue(null);
  const win: ExternalMcpOAuthConnectWindow = {
    open, origin: window.location.origin,
    addEventListener: window.addEventListener.bind(window), removeEventListener: window.removeEventListener.bind(window),
  };
  const onConnected = vi.fn();
  const { result, unmount } = renderHook(() => useHostExternalMcpOAuthConnect({
    serverId: "device server", grant: "device_code", onConnected,
  }, { win: () => win }));

  await act(() => result.current.connect({ destination: "shared" }));
  expect(result.current.state).toEqual({ phase: "device", userCode: "TEST-123", verificationUri: "https://provider.example/device" });
  expect(open).toHaveBeenCalledExactlyOnceWith({ url: "https://provider.example/device" });
  await act(() => vi.advanceTimersByTimeAsync(1_999));
  expect(onConnected).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(result.current.state).toEqual({ phase: "idle" });
  expect(onConnected).toHaveBeenCalledExactlyOnceWith();
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([route + "/connect", route + "/device/poll"]);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("uses the host's fallback error when the connect port throws an untyped error", async () => {
  const open = vi.fn<ExternalMcpOAuthConnectWindow["open"]>().mockReturnValue(null);
  const win: ExternalMcpOAuthConnectWindow = {
    open, origin: window.location.origin,
    addEventListener: window.addEventListener.bind(window), removeEventListener: window.removeEventListener.bind(window),
  };
  const connect = vi.spyOn(integrationsApi, "connectExternalMcpOAuth").mockRejectedValue(new Error("offline"));
  const onConnected = vi.fn();
  const { result } = renderHook(() => useHostExternalMcpOAuthConnect({
    serverId: "research", grant: "authorization_code", onConnected,
  }, { win: () => win, fallbackError: "Try connecting Research again." }));

  await act(() => result.current.connect());
  expect(result.current.state).toEqual({ phase: "idle", error: "Try connecting Research again." });
  expect(open).toHaveBeenCalledExactlyOnceWith({ url: "about:blank" });
  expect(connect).toHaveBeenCalledExactlyOnceWith({ serverId: "research" });
  expect(onConnected).not.toHaveBeenCalled();
});
