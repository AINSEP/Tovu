import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryExternalMcpServerRepo, saveExternalMcpServer, ExternalMcpReauthRequiredError } from "#src/assistant/index";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { probeExternalMcpServer } from "../external-mcp-probe.js";
import { fetchDaemonAdmissions } from "../external-mcp-admissions.js";

const NOW = "2026-10-01T00:00:00.000Z";
async function fixture(overrides: Record<string, unknown> = {}) {
  const keyring = new InMemoryKeyring();
  const deps = { workspaceId: "ws-n04", clock: { nowMs: () => Date.parse(NOW), nowIso: () => NOW }, externalMcpServerRepo: new InMemoryExternalMcpServerRepo(), siteAssistantSecretSealer: new AesGcmSecretSealer(keyring), siteAssistantSecretKeyring: keyring };
  await saveExternalMcpServer({ repo: deps.externalMcpServerRepo, sealer: deps.siteAssistantSecretSealer, keyring, clock: deps.clock }, {
    workspaceId: deps.workspaceId, serverId: "hosted", transport: "streamable_http", url: "https://hosted.example/mcp", command: "", args: "", authMode: "none", enabled: true, allowedToolNames: "read_thing", writeAllowedToolNames: "", principalId: "owner", ...overrides,
  });
  return deps;
}

for (const [title, overrides, id, status, error, code] of [
  ["unknown server", {}, "absent", 400, "no external MCP server is configured as 'absent'", "INVALID_MCP_SERVER"],
  ["disabled", { enabled: false }, "hosted", 400, "this server is disabled — enable it before probing", "MCP_SERVER_DISABLED"],
  ["local command", { transport: "stdio", command: "node", args: "server.js" }, "hosted", 400, "probe is not available for local-command servers yet — type tool names directly instead", "PROBE_UNSUPPORTED_TRANSPORT"],
] as const) test(`shared probe refuses ${title} before connecting`, async () => {
  const deps = await fixture(overrides);
  let connected = false;
  const result = await probeExternalMcpServer({ ...deps, connect: async () => { connected = true; throw new Error("must not connect"); } }, id);
  assert.equal(result.ok, false);
  assert.equal(result.status, status);
  assert.equal(result.body.error, error);
  assert.equal(result.body.code, code);
  assert.equal(connected, false);
});

test("shared probe lists and closes without invoking tools or leaking its resolved auth headers", async () => {
  const deps = await fixture({ authMode: "static_env", accessToken: "secret-n04" });
  let closed = 0;
  const result = await probeExternalMcpServer({ ...deps, connect: async (launch, timeout) => {
    assert.equal(launch.url, "https://hosted.example/mcp");
    assert.deepEqual(launch.headers, { authorization: "Bearer secret-n04" });
    assert.equal(timeout > 0, true);
    return { listTools: async () => [{ name: "read_thing", description: "Read a thing", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } }], callTool: async () => { throw new Error("must not call remote tools"); }, close: async () => { closed++; } };
  } }, "hosted");
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.body).sort(), ["probedAt", "tools"]);
  assert.equal(result.body.probedAt, NOW);
  assert.deepEqual(Object.keys(result.body.tools[0]).sort(), ["admitted", "allowlisted", "declaredAnnotations", "description", "destructiveDeclared", "hintsAbsent", "refusalReason", "remoteName", "writeAllowed", "writeDeclared"]);
  assert.equal(result.body.tools[0].remoteName, "read_thing");
  assert.equal(result.body.tools[0].admitted, true);
  assert.equal(JSON.stringify(result).includes("secret-n04"), false);
  assert.equal(closed, 1);
});

for (const phase of ["connect", "list", "close"] as const) test(`shared probe handles ${phase} failure and closes an opened session`, async () => {
  const deps = await fixture();
  let closed = 0;
  const result = await probeExternalMcpServer({ ...deps, connect: async () => {
    if (phase === "connect") throw new Error("private-token-in-upstream-error");
    return { listTools: async () => { if (phase === "list") throw new Error("private-token-in-upstream-error"); return []; }, callTool: async () => { throw new Error("unused"); }, close: async () => { closed++; if (phase === "close") throw new Error("close failed"); } };
  } }, "hosted");
  assert.equal(result.ok, phase === "close");
  if (phase !== "close") assert.deepEqual(result, { ok: false, status: 502, body: { error: "could not reach this server — the probe did not complete", code: "MCP_SERVER_UNREACHABLE" } });
  assert.equal(closed, phase === "connect" ? 0 : 1);
  assert.equal(JSON.stringify(result).includes("private-token"), false);
});

test("admissions uses the authenticated bounded daemon read and preserves current failures", async () => {
  let request: unknown;
  const result = await fetchDaemonAdmissions({ token: "private-daemon-token", daemonUrl: "http://127.0.0.1:4999", fetch: async (url, options) => {
    request = [url, options?.headers];
    assert.equal(options?.signal instanceof AbortSignal, true);
    return new Response(JSON.stringify({ connections: [], configFailures: [{ connectionId: "bad", reason: "cannot resolve" }] }), { status: 200 });
  } });
  assert.deepEqual(request, ["http://127.0.0.1:4999/api/federation/admissions", { Authorization: "Bearer private-daemon-token" }]);
  assert.deepEqual(result, { ok: true, connections: [], configFailures: [{ connectionId: "bad", reason: "cannot resolve" }] });
  assert.equal(JSON.stringify(result).includes("private-daemon-token"), false);
});

test("missing admissions token refuses without a request", async () => {
  let requested = false;
  assert.deepEqual(await fetchDaemonAdmissions({ token: "", fetch: async () => { requested = true; throw new Error("must not fetch"); } }), { ok: false, body: { error: "the agent daemon token is not configured", code: "AGENT_DAEMON_UNAVAILABLE" } });
  assert.equal(requested, false);
});

for (const [title, response] of [
  ["non-200", () => new Response("private-error", { status: 401 })],
  ["connection refused", () => { throw new Error("private-error"); }],
  ["invalid JSON", () => new Response("private-error", { status: 200 })],
  ["missing roster", () => new Response("{}", { status: 200 })],
] as const) test(`admissions ${title} is unavailable, never an empty success`, async () => {
  const result = await fetchDaemonAdmissions({ token: "token", daemonUrl: "http://127.0.0.1:4999", fetch: async () => response() });
  assert.deepEqual(result, { ok: false, body: { error: title === "non-200" ? "the agent daemon could not report what it admitted" : "the agent daemon is not reachable — the assistant may not be running", code: "AGENT_DAEMON_UNAVAILABLE" } });
  assert.equal(JSON.stringify(result).includes("private-error"), false);
});

test("older daemon response omits configFailures", async () => {
  assert.deepEqual(await fetchDaemonAdmissions({ token: "token", daemonUrl: "http://127.0.0.1:4999", fetch: async () => new Response('{"connections":[]}', { status: 200 }) }), { ok: true, connections: [] });
});

test("OAuth refresh errors never send provider credentials to the model", async () => {
  const deps = await fixture({ authMode: "oauth", oauth: { grant: "authorization_code", clientId: "client" } });
  const record = (await deps.externalMcpServerRepo.findByServerId({ workspaceId: deps.workspaceId, serverId: "hosted" }))!;
  await deps.externalMcpServerRepo.upsert({ ...record, oauthStatus: "connected" });
  let connected = false;
  const externalMcpOAuth = { tokenResolver: { resolveAccessToken: async () => { throw new Error("Bearer n04-private-refresh-token"); } } } as never;
  const result = await probeExternalMcpServer({ ...deps, externalMcpOAuth, connect: async () => { connected = true; throw new Error("must not connect"); } }, "hosted");
  assert.deepEqual(result, { ok: false, status: 502, body: { error: "its OAuth access token could not be obtained: OAuth token resolution failed — reconnect this server in Settings → External MCP", code: "MCP_SERVER_UNREACHABLE" } });
  assert.equal(JSON.stringify(result).includes("n04-private-refresh-token"), false);
  assert.equal(connected, false);
});

test("a credential decryption error cannot echo secret payloads", async () => {
  const deps = await fixture({ authMode: "static_env", accessToken: "stored-token" });
  const siteAssistantSecretSealer = { open: async () => { throw new Error("n04-private-decrypted-payload"); } } as never;
  const result = await probeExternalMcpServer({ ...deps, siteAssistantSecretSealer, connect: async () => { throw new Error("must not connect"); } }, "hosted");
  assert.deepEqual(result, { ok: false, status: 502, body: { error: "its stored access token could not be decrypted — re-enter it in Settings → External MCP", code: "MCP_SERVER_UNREACHABLE" } });
  assert.equal(JSON.stringify(result).includes("n04-private-decrypted-payload"), false);
});

test("typed OAuth revocation remains a safe, actionable 409", async () => {
  const deps = await fixture({ authMode: "oauth", oauth: { grant: "authorization_code", clientId: "client" } });
  const record = (await deps.externalMcpServerRepo.findByServerId({ workspaceId: deps.workspaceId, serverId: "hosted" }))!;
  await deps.externalMcpServerRepo.upsert({ ...record, oauthStatus: "connected" });
  const externalMcpOAuth = { tokenResolver: { resolveAccessToken: async () => { throw new ExternalMcpReauthRequiredError({ serverId: "hosted" }); } } } as never;
  const result = await probeExternalMcpServer({ ...deps, externalMcpOAuth }, "hosted");
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(result.body.error, "its authorization expired or was revoked — reconnect it in Settings → External MCP");
  assert.equal(result.body.code, "EXTERNAL_MCP_REAUTH_REQUIRED");
});

test("stored environment decryption failure uses fixed copy instead of a raw parser or crypto error", async () => {
  const deps = await fixture({ env: "API_KEY=env-secret" });
  const siteAssistantSecretSealer = { open: async () => { throw new Error("env-secret-in-crypto-error"); } } as never;
  const result = await probeExternalMcpServer({ ...deps, siteAssistantSecretSealer }, "hosted");
  assert.deepEqual(result, { ok: false, status: 502, body: { error: "stored credentials could not be decrypted — check the site credential store and re-enter them in Settings → External MCP", code: "MCP_SERVER_UNREACHABLE" } });
  assert.equal(JSON.stringify(result).includes("env-secret"), false);
});
