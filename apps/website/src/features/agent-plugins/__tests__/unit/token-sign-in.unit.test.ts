import assert from "node:assert/strict";
import test from "node:test";

import type { HttpClientPort, HttpRequest, HttpResponse } from "#src/platform/http/index";

import type { InstalledAgentPluginServers } from "../../import-access-token.js";
import type { McpServerConfig, RemoteMcpServerConfig } from "../../mcp-metadata.js";
import { checkAgentPluginAccessToken, listTokenSignInPlugins } from "../../token-sign-in.js";

/**
 * @file `token-sign-in.ts`: which installed plugins take a pasted token, and the one-GET check of a
 * token before create-site onboarding saves anything. The plugin lookup and HTTP client are injected.
 */

const TOKEN = "sbp_check_token_never_echoed";
const PROBE_URL = "https://api.supabase.com/v1/projects";

const tokenServer = (probeUrl = PROBE_URL): RemoteMcpServerConfig => ({
  type: "streamable-http",
  url: "https://mcp.supabase.com/mcp",
  tovuTokenAuth: { helpUrl: "https://supabase.com/dashboard/account/tokens", probeUrl },
});
const plainServer: McpServerConfig = { type: "streamable-http", url: "https://example.com/mcp" };

class FakeVendorApi implements HttpClientPort {
  readonly requests: HttpRequest[] = [];
  constructor(private readonly respond: (request: HttpRequest) => HttpResponse | Promise<HttpResponse>) {}
  async send(request: HttpRequest): Promise<HttpResponse> {
    this.requests.push(request);
    return this.respond(request);
  }
}

const status = (code: number) => (): HttpResponse => ({ status: code, headers: {}, bodyText: "{}" });

function check(http: HttpClientPort, servers: Readonly<Record<string, McpServerConfig>> | null | "throws", pluginId = "supabase") {
  return checkAgentPluginAccessToken(
    {
      workspaceId: "ws-check",
      httpClient: http,
      resolveInstalledPlugin: async () => {
        if (servers === "throws") throw new Error("plugin dir unreadable");
        return servers === null ? null : { servers };
      },
    },
    { pluginId, token: TOKEN },
  );
}

test("a token the vendor accepts is ok: one GET to the declared probe URL with the token as a Bearer header", async () => {
  const http = new FakeVendorApi(status(200));
  assert.equal(await check(http, { supabase: tokenServer() }), "ok");
  assert.equal(http.requests.length, 1);
  assert.equal(http.requests[0]?.method, "GET");
  assert.equal(http.requests[0]?.url, PROBE_URL);
  assert.equal(http.requests[0]?.headers?.authorization, `Bearer ${TOKEN}`);
});

test("401 and 403 are invalid; any other failure or an unreachable vendor is unavailable", async () => {
  assert.equal(await check(new FakeVendorApi(status(401)), { supabase: tokenServer() }), "invalid");
  assert.equal(await check(new FakeVendorApi(status(403)), { supabase: tokenServer() }), "invalid");
  assert.equal(await check(new FakeVendorApi(status(503)), { supabase: tokenServer() }), "unavailable");
  const unreachable = new FakeVendorApi(() => Promise.reject(new Error("ECONNREFUSED")));
  assert.equal(await check(unreachable, { supabase: tokenServer() }), "unavailable");
});

test("unsupported, with no network call: not installed, lookup throws, no token-auth server, or more than one", async () => {
  const cases: ReadonlyArray<Readonly<Record<string, McpServerConfig>> | "throws" | null> = [null, "throws", { plain: plainServer }, { a: tokenServer(), b: tokenServer("https://other.example/p") }];
  for (const servers of cases) {
    const http = new FakeVendorApi(status(200));
    assert.equal(await check(http, servers), "unsupported", JSON.stringify(servers));
    assert.equal(http.requests.length, 0);
  }
});

test("a stdio server never counts as the token-auth server", async () => {
  const http = new FakeVendorApi(status(200));
  const stdio = { type: "stdio", command: "x", args: [] } as unknown as McpServerConfig;
  assert.equal(await check(http, { local: stdio, plain: plainServer }), "unsupported");
});

test("the sign-in list names each token plugin once, sorted by id, with its tokens page", async () => {
  const listed = await listTokenSignInPlugins("ws-list", async (workspaceId): Promise<readonly InstalledAgentPluginServers[]> => {
    assert.equal(workspaceId, "ws-list");
    return [
      { pluginId: "zeta-db", servers: { z: { ...tokenServer(), tovuTokenAuth: { helpUrl: "https://zeta.example/t", probeUrl: "https://zeta.example/p" } } } },
      { pluginId: "plain", servers: { plain: plainServer } },
      { pluginId: "supabase", servers: { supabase: tokenServer() } },
      { pluginId: "twice", servers: { a: tokenServer(), b: tokenServer() } },
    ];
  });
  assert.deepEqual(listed, [
    { pluginId: "supabase", displayName: "Supabase", helpUrl: "https://supabase.com/dashboard/account/tokens" },
    { pluginId: "zeta-db", displayName: "Zeta Db", helpUrl: "https://zeta.example/t" },
  ]);
});
