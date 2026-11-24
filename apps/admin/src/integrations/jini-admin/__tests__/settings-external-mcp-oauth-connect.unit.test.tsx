import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { integrationsApi } from "@/features/integrations/api/integrations-api";
import type { ExternalMcpOAuthConnectWindow } from "@jini-ai/admin/screens/settings/hooks/use-external-mcp-oauth-connect.hooks";

import { useHostExternalMcpOAuthConnect } from "../settings-external-mcp-oauth-connect.hooks";

afterEach(() => {
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
