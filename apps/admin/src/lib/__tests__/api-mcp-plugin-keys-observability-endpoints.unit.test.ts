import { afterEach, expect, test, vi } from "vitest";
import { api } from "../api";

afterEach(() => vi.unstubAllGlobals());

const WS = "/api/admin/v1/workspaces/workspace-local";

/** Replies 200 with `body` (or 204 with none) and records each request. */
function stubFetch(body?: unknown) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    body === undefined
      ? new Response(null, { status: 204 })
      : new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const lastCall = (fetchMock: ReturnType<typeof stubFetch>) => {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url, method: init?.method ?? "GET", body: init?.body === undefined ? undefined : JSON.parse(init.body as string) };
};

test("completeMfa POSTs the pending token and code once, uncached", async () => {
  const fetchMock = stubFetch({ user: { id: "u1" } });
  await expect(api.completeMfa({ pendingToken: "p", code: "123456" })).resolves.toEqual({ user: { id: "u1" } });
  expect(lastCall(fetchMock)).toEqual({ url: "/api/admin/v1/auth/mfa/login", method: "POST", body: { pendingToken: "p", code: "123456" } });
  expect(fetchMock.mock.calls[0]![1]?.cache).toBe("no-store");
});

test("shared MCP connection calls address the encoded server id with the right verb and body", async () => {
  const fetchMock = stubFetch({ ok: true });
  await api.useLocalMcpConnection({ serverId: "a/b" });
  expect(lastCall(fetchMock)).toEqual({ url: `${WS}/mcp-servers/a%2Fb/oauth/shared`, method: "DELETE", body: undefined });
  await api.stopSharedMcpConnection({ serverId: "a/b" });
  expect(lastCall(fetchMock)).toEqual({ url: `${WS}/mcp-servers/a%2Fb/oauth`, method: "DELETE", body: undefined });
  await api.listSharedMcpConnections({ serverId: "a/b" });
  expect(lastCall(fetchMock)).toEqual({ url: `${WS}/mcp-servers/a%2Fb/oauth/shared`, method: "GET", body: undefined });
  await api.useSharedMcpConnection({ serverId: "a/b", credentialId: "cred-1" });
  expect(lastCall(fetchMock)).toEqual({ url: `${WS}/mcp-servers/a%2Fb/oauth/shared`, method: "POST", body: { credentialId: "cred-1" } });
});

test("clearFsFilesCustomRoot DELETEs the custom-root endpoint", async () => {
  const fetchMock = stubFetch({ path: null });
  await expect(api.clearFsFilesCustomRoot()).resolves.toEqual({ path: null });
  expect(lastCall(fetchMock)).toEqual({ url: `${WS}/fs-files/custom-root`, method: "DELETE", body: undefined });
});

test("plugin provider settings are read and saved against the encoded plugin id", async () => {
  const fetchMock = stubFetch({ fields: [] });
  await api.getPluginProviderSettings({ pluginId: "p/1" });
  expect(lastCall(fetchMock)).toEqual({ url: `${WS}/plugins/p%2F1/provider-settings`, method: "GET", body: undefined });
  await api.savePluginProviderSettings({ pluginId: "p/1", values: { token: "" } });
  expect(lastCall(fetchMock)).toEqual({ url: `${WS}/plugins/p%2F1/provider-settings`, method: "PUT", body: { values: { token: "" } } });
});

test("useProjectKey PUTs the use flag to the encoded key id", async () => {
  const fetchMock = stubFetch({ keyId: "k/1", usedByThisSite: true, usedBy: [], appliesAt: "now" });
  await expect(api.useProjectKey({ keyId: "k/1", use: true })).resolves.toMatchObject({ usedByThisSite: true });
  expect(lastCall(fetchMock)).toEqual({ url: `${WS}/project-keys/k%2F1/use`, method: "PUT", body: { use: true } });
});

test("sendObservabilityTestError POSTs to the test-error route", async () => {
  const fetchMock = stubFetch({ sent: true });
  await api.sendObservabilityTestError();
  expect(lastCall(fetchMock)).toEqual({ url: `${WS}/system/observability/test-error`, method: "POST", body: undefined });
});

test("a failed shared-connection call rejects with the server's refusal", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "no access" } }), { status: 403, headers: { "Content-Type": "application/json" } })));
  await expect(api.useSharedMcpConnection({ serverId: "s", credentialId: "c" })).rejects.toBeInstanceOf(Error);
});
