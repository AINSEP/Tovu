import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { authenticatedAdminRequest } from "../admin-http/request";
import { adminFailureChannel } from "../admin-failure-channel";
import { setAdminDraftIdentity } from "../admin-draft-identity";

// A route missing from ADMIN_FAILURE_VOCABULARY used to render only "Load information (HTTP 503)" and
// drop the server's own `{error, code}`, so the notice named neither what failed nor why.
beforeEach(() => { adminFailureChannel.reset(); setAdminDraftIdentity({ id: "owner" }); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); adminFailureChannel.reset(); setAdminDraftIdentity({ id: null }); });

function respondWith({ body, status }: { body: unknown; status: number }): void {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
}

it("names the method, full path and the server's own code and reason for a route missing from the vocabulary", async () => {
  respondWith({ status: 503, body: { error: "the agent daemon is currently unavailable", code: "AGENT_DAEMON_KNOWN_FAILED" } });
  await authenticatedAdminRequest({ path: "", method: "GET" }, { basePath: "/api/agents" }).catch(() => undefined);
  const failure = adminFailureChannel.getSnapshot();
  expect(failure?.step).toBe("GET /api/agents (HTTP 503)");
  expect(failure?.cause).toContain("AGENT_DAEMON_KNOWN_FAILED");
  expect(failure?.cause).toContain("the agent daemon is currently unavailable");
  expect(failure?.copyText).not.toContain("Load information");
});

it("redacts ids, query strings and secret-shaped server text from the details", async () => {
  const key = `tovu_ak_0123456789ab.${"S".repeat(24)}`;
  respondWith({ status: 503, body: { error: `upstream refused ${key}`, code: "UPSTREAM_REFUSED" } });
  await authenticatedAdminRequest({ path: "/c-7f3e9a21/messages?token=QUERY_CANARY", method: "GET" }, { basePath: "/api/assistant/chats" }).catch(() => undefined);
  const failure = adminFailureChannel.getSnapshot();
  expect(failure?.step).toBe("GET /api/assistant/chats/:id/messages (HTTP 503)");
  expect(failure?.cause).toContain("UPSTREAM_REFUSED");
  expect(failure?.copyText).not.toMatch(/c-7f3e9a21|QUERY_CANARY|S{24}/);
});

it("leaves out server text that is not a small {error, code} reply, and for signed-out requests", async () => {
  respondWith({ status: 503, body: { error: "x".repeat(2_000), code: "TOO_LONG_CANARY" } });
  await authenticatedAdminRequest({ path: "", method: "GET" }, { basePath: "/api/agents" }).catch(() => undefined);
  expect(adminFailureChannel.getSnapshot()?.copyText).not.toContain("TOO_LONG_CANARY");
  adminFailureChannel.reset();
  setAdminDraftIdentity({ id: null });
  respondWith({ status: 503, body: { error: "SIGNED_OUT_CANARY", code: "AGENT_DAEMON_KNOWN_FAILED" } });
  await authenticatedAdminRequest({ path: "", method: "GET" }, { basePath: "/api/agents" }).catch(() => undefined);
  expect(adminFailureChannel.getSnapshot()?.step).toBe("GET /api/agents (HTTP 503)");
  expect(adminFailureChannel.getSnapshot()?.copyText).not.toContain("SIGNED_OUT_CANARY");
});

it("keeps approved vocabulary wording, without server text, for routes the vocabulary names", async () => {
  respondWith({ status: 503, body: { error: "KNOWN_ROUTE_CANARY", code: "DATABASE_BUSY" } });
  await authenticatedAdminRequest({ path: "/pages", method: "GET" }).catch(() => undefined);
  const failure = adminFailureChannel.getSnapshot();
  expect(failure?.step).toBe("Load pages (HTTP 503)");
  expect(failure?.copyText).not.toContain("KNOWN_ROUTE_CANARY");
});
