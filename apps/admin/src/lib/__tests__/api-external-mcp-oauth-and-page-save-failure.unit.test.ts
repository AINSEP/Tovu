import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { adminFailureChannel } from "../admin-failure-channel";
import { setAdminDraftIdentity } from "../admin-draft-identity";

beforeEach(() => { adminFailureChannel.reset(); setAdminDraftIdentity({ id: "owner" }); });
afterEach(() => { vi.unstubAllGlobals(); adminFailureChannel.reset(); setAdminDraftIdentity({ id: null }); });

const WS = "/api/admin/v1/workspaces/workspace-local";

function stubFetch(body: unknown) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

it("connectExternalMcpOAuth POSTs with no body for the default destination and sends the destination when one is chosen", async () => {
  const fetchMock = stubFetch({ auth: { kind: "redirect_required", url: "https://idp.example/auth" } });
  await expect(api.connectExternalMcpOAuth({ serverId: "s/1" })).resolves.toMatchObject({ auth: { kind: "redirect_required" } });
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toBe(`${WS}/mcp-servers/s%2F1/oauth/connect`);
  expect(init?.method).toBe("POST");
  expect(init?.body).toBeUndefined();

  await api.connectExternalMcpOAuth({ serverId: "s/1" }, { destination: "shared" });
  const [, shared] = fetchMock.mock.calls[1]!;
  expect(JSON.parse(shared?.body as string)).toEqual({ destination: "shared" });
});

it("pollExternalMcpOAuthDevice POSTs one poll and returns the pending wait or the connected result", async () => {
  const fetchMock = stubFetch({ status: "pending", retryAfterSeconds: 5 });
  await expect(api.pollExternalMcpOAuthDevice({ serverId: "s/1" })).resolves.toEqual({ status: "pending", retryAfterSeconds: 5 });
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toBe(`${WS}/mcp-servers/s%2F1/oauth/device/poll`);
  expect(init?.method).toBe("POST");
  stubFetch({ status: "connected" });
  await expect(api.pollExternalMcpOAuthDevice({ serverId: "s/1" })).resolves.toEqual({ status: "connected" });
});

it("a failed page save reports its incident in page wording, a failed post save in post wording", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "boom", errorId: "inc-9" }), { status: 500 })));
  await expect(api.updatePost({ id: "p1" }, { entry: "page" })).rejects.toBeInstanceOf(Error);
  expect(adminFailureChannel.getSnapshot()?.message).toMatch(/page/i);
  adminFailureChannel.reset();
  await expect(api.updatePost({ id: "p1" })).rejects.toBeInstanceOf(Error);
  expect(adminFailureChannel.getSnapshot()?.message).toMatch(/post/i);
  expect(adminFailureChannel.getSnapshot()?.message).not.toMatch(/page/i);
});
