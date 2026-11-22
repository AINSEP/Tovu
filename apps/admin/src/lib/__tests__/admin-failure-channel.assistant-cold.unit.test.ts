import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError, authenticatedAdminRequest } from "../admin-http/request";
import { adminFailureChannel } from "../admin-failure-channel";
import { setAdminDraftIdentity } from "../admin-draft-identity";

// A fresh dev server registers the agent daemon without spawning it, and an idle daemon parks. A page
// read answered "not running yet" put a red notice on screen although nothing was wrong; the
// caller already shows its own calm state and asks again. A real outage stays loud.
beforeEach(() => { adminFailureChannel.reset(); setAdminDraftIdentity({ id: "owner" }); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); adminFailureChannel.reset(); setAdminDraftIdentity({ id: null }); });

function respondWith({ body, status }: { body: unknown; status: number }): void {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
}

it.each([
  ["AGENT_DAEMON_PARKED", "the agent daemon is parked"],
  ["AGENT_DAEMON_UNAVAILABLE", "the server's external MCP admissions are unavailable — try again shortly"],
])("publishes no page notice for a read answered 503 %s, and still rejects to the caller", async (code, error) => {
  respondWith({ status: 503, body: { error, code } });
  const rejection = await authenticatedAdminRequest({ path: "", method: "GET" }, { basePath: "/api/agents" }).catch((caught: unknown) => caught);
  expect(rejection).toBeInstanceOf(ApiError);
  expect((rejection as ApiError).code).toBe(code);
  expect(adminFailureChannel.getSnapshot()).toBeNull();
});

it("still publishes a plain-words notice when the daemon is known to have failed", async () => {
  respondWith({ status: 503, body: { error: "the agent daemon is currently unavailable", code: "AGENT_DAEMON_KNOWN_FAILED" } });
  await authenticatedAdminRequest({ path: "", method: "GET" }, { basePath: "/api/agents" }).catch(() => undefined);
  const failure = adminFailureChannel.getSnapshot();
  expect(failure?.step).toBe("GET /api/agents (HTTP 503)");
  expect(failure?.cause).toContain("AGENT_DAEMON_KNOWN_FAILED");
});

it("still publishes a notice when a write is refused because the assistant is unavailable", async () => {
  respondWith({ status: 503, body: { error: "daemon readiness timed out", code: "AGENT_DAEMON_UNAVAILABLE" } });
  await authenticatedAdminRequest({ path: "/rescan", method: "POST" }, { basePath: "/api/agents" }).catch(() => undefined);
  expect(adminFailureChannel.getSnapshot()?.step).toBe("POST /api/agents/rescan (HTTP 503)");
});
