import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AdminApiError } from "@jini-ai/core/admin-runtime";
import { integrationsApi } from "@/features/integrations/integrations-host-ports";
import { externalMcpSharedChoicePort, useHostExternalMcpSharedChoice } from "../settings-external-mcp-shared-choice.hooks";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const serverId = "research tools";
const route = "/api/admin/v1/workspaces/workspace-local/mcp-servers/research%20tools/oauth";
const connections = [{ credentialId: "owner-connection-2", label: "Research account" }];

it("grants the requested saved connection and reloads the server's resulting selection", async () => {
  let current: { credentialId: string; status: string; granted: boolean } | null = null;
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    if (input !== route + "/shared") return new Response(null, { status: 404 });
    if (init?.method === "POST" && init.body === '{"credentialId":"owner-connection-2"}') {
      current = { credentialId: "owner-connection-2", status: "connected", granted: true };
      return Response.json({ connected: true });
    }
    if ((init?.method ?? "GET") === "GET") return Response.json({ available: true, connections, current });
    return new Response(null, { status: 400 });
  });
  vi.stubGlobal("fetch", fetch);
  const onChanged = vi.fn();
  const { result } = renderHook(() => useHostExternalMcpSharedChoice({ serverId, onChanged }));

  await act(() => result.current.load());
  expect(result.current.view).toEqual({ available: true, connections, current: null });
  await act(() => result.current.chooseSaved({ credentialId: "owner-connection-2" }));
  expect(result.current.error).toBe("");
  expect(result.current.view?.current).toEqual({ credentialId: "owner-connection-2", status: "connected", granted: true });
  expect(onChanged).toHaveBeenCalledExactlyOnceWith();
});

it("preserves the status, code, body and message of an API refusal", async () => {
  const body = { code: "CONNECTION_LOCKED", error: "The saved connection is locked." };
  vi.stubGlobal("fetch", vi.fn<typeof globalThis.fetch>(async (input, init) =>
    input === route + "/shared" && (init?.method ?? "GET") === "GET"
      ? Response.json(body, { status: 409 })
      : new Response(null, { status: 404 }),
  ));
  const error = await externalMcpSharedChoicePort.listSharedMcpConnections({ serverId }).catch((cause: unknown) => cause);
  expect(error).toBeInstanceOf(AdminApiError);
  expect(error).toMatchObject({ status: 409, code: "CONNECTION_LOCKED", message: "The saved connection is locked.", body });
});

it("does not turn a transport exception into operator-facing API copy", async () => {
  const cause = new Error("Unexpected transport failure");
  const stop = vi.spyOn(integrationsApi, "stopSharedMcpConnection").mockRejectedValue(cause);
  await expect(externalMcpSharedChoicePort.stopSharedMcpConnection({ serverId })).rejects.toBe(cause);
  expect(stop).toHaveBeenCalledExactlyOnceWith({ serverId });
});

it.each([
  ["stopHere", route],
  ["chooseLocal", route + "/shared"],
] as const)("%s clears the shared selection using the matching delete route", async (action, deletePath) => {
  let current: { credentialId: string; status: string; granted: boolean } | null = {
    credentialId: "owner-connection-2", status: "connected", granted: true,
  };
  vi.stubGlobal("fetch", vi.fn<typeof globalThis.fetch>(async (input, init) => {
    if (input === deletePath && init?.method === "DELETE") {
      current = null;
      return new Response(null, { status: 204 });
    }
    if (input === route + "/shared" && (init?.method ?? "GET") === "GET") {
      return Response.json({ available: true, connections, current });
    }
    return new Response(null, { status: 404 });
  }));
  const onChanged = vi.fn();
  const { result } = renderHook(() => useHostExternalMcpSharedChoice({ serverId, onChanged }));
  await act(() => result.current.load());
  expect(result.current.view?.current?.credentialId).toBe("owner-connection-2");
  await act(() => result.current[action]());
  expect(result.current.view?.current).toBeNull();
  expect(result.current.error).toBe("");
  expect(onChanged).toHaveBeenCalledExactlyOnceWith();
});
