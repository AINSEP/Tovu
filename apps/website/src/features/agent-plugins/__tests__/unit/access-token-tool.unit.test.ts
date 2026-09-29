import assert from "node:assert/strict";
import test from "node:test";
import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { InMemoryExternalMcpServerRepo, readEnabledExternalMcpConfigs, saveExternalMcpServer, type UIResource } from "#src/assistant/index";
import { isMcpUiToolCallAllowed } from "#src/assistant/mcp-ui-tool-calls";
import { SURFACE_DISMISSED_PARAM, SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import type { HttpClientPort, HttpRequest, HttpResponse } from "#src/platform/http/index";

import type { AgentPluginAccessTokenToolDeps } from "../../access-token-tool.js";
import type { McpServerConfig } from "../../manifest.js";
import { buildAgentPluginConnectRegistrations } from "../../tool-registrations.js";

/**
 * @file `agent_plugin_set_access_token`, the generic access-token fallback any Agent Plugin gets by
 * declaring `tovuTokenAuth` on a remote server in its `mcp.json`. Moved here from
 * `features/supabase-connect/` (SPEC-052's Supabase-only `supabase_set_access_token`) on 2026-09-29;
 * the Supabase specifics (tokens page, probe URL) now come from the plugin's own declaration.
 *
 * Driven end to end over the REAL External MCP store, sealer, and surface-exchange store — only the
 * vendor's probe endpoint is faked. A submission is simulated with `surfaceExchanges.deliver(...)`,
 * exactly as `mcp-ui-tool-calls-route.ts` delivers a human's click.
 */

const WORKSPACE = "ws-access-token";
const PRINCIPAL = "principal-1";
const TOKEN = "sbp_unit_test_token_that_must_never_echo";
const RAW_VENDOR_BODY = "raw vendor error body";
const SET_TOKEN = "agent_plugin_set_access_token";
const PROBE_URL = "https://api.supabase.com/v1/projects";
const TOKENS_PAGE = "https://supabase.com/dashboard/account/tokens";

/** The bundled `supabase` plugin's declaration, as `manifest.ts` parses it. */
const SUPABASE_SERVERS: Readonly<Record<string, McpServerConfig>> = {
  supabase: {
    type: "streamable-http",
    url: "https://mcp.supabase.com/mcp",
    tovuAuthMode: "oauth",
    tovuTokenAuth: { helpUrl: TOKENS_PAGE, probeUrl: PROBE_URL },
  },
};

const probeOk = (): HttpResponse => ({ status: 200, headers: {}, bodyText: JSON.stringify([{ ref: "abcdefghijklmnopqrst", name: "Shop" }]) });
const unauthorized = (): HttpResponse => ({ status: 401, headers: {}, bodyText: JSON.stringify({ message: RAW_VENDOR_BODY }) });

class FakeVendorApi implements HttpClientPort {
  readonly requests: HttpRequest[] = [];
  constructor(public respond: (request: HttpRequest) => HttpResponse) {}
  async send(request: HttpRequest): Promise<HttpResponse> {
    this.requests.push(request);
    return this.respond(request);
  }
}

async function setup(options: { servers?: Readonly<Record<string, McpServerConfig>> | null; rowUrl?: string } = {}) {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const clock = { nowIso: () => "2026-09-13T00:00:00.000Z" };
  const http = new FakeVendorApi(probeOk);
  // Exactly what federate-mcp.ts provisions when the plugin is enabled: disabled, oauth, no write grants.
  await saveExternalMcpServer(
    { repo, sealer, keyring, clock },
    {
      workspaceId: WORKSPACE,
      serverId: "supabase",
      transport: "streamable_http",
      authMode: "oauth",
      enabled: false,
      command: "",
      url: options.rowUrl ?? "https://mcp.supabase.com/mcp",
      args: "",
      allowedToolNames: "list_tables,execute_sql",
      writeAllowedToolNames: "",
      principalId: PRINCIPAL,
      provisionedByPluginId: "supabase",
    },
  );
  const servers = options.servers === undefined ? SUPABASE_SERVERS : options.servers;
  const deps: AgentPluginAccessTokenToolDeps = {
    workspaceId: WORKSPACE,
    authorize: (async () => ({ allowed: true, reason: "matched" })) as unknown as AgentPluginAccessTokenToolDeps["authorize"],
    clock,
    externalMcpServerRepo: repo,
    siteAssistantSecretSealer: sealer,
    siteAssistantSecretKeyring: keyring,
    customCredentialsHttpClient: http,
    resolveInstalledPlugin: async (pluginId) => (pluginId === "supabase" && servers !== null ? { servers } : null),
  };
  const surfaceExchanges = createSurfaceExchangeStore();
  const tools = new Map(buildAgentPluginConnectRegistrations(deps, { surfaceExchanges }).map((r) => [r.descriptor.id, r]));
  const readRow = () => repo.findByServerId({ workspaceId: WORKSPACE, serverId: "supabase" });
  return { repo, sealer, http, surfaceExchanges, tools, readRow };
}

type Env = Awaited<ReturnType<typeof setup>>;

function call(registration: ToolRegistration | undefined, options: { input?: unknown; emitSurface?: SurfaceEmitter } = {}) {
  assert.ok(registration, "tool must be wired");
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: PRINCIPAL },
    run: { id: "run-1" },
    input: options.input ?? { pluginId: "supabase" },
    signal: new AbortController().signal,
    ...(options.emitSurface ? { emitSurface: options.emitSurface } : {}),
  };
  return registration.handler(ctx);
}

async function raise(tools: Map<string, ToolRegistration>) {
  const emitted: unknown[] = [];
  const pending = call(tools.get(SET_TOKEN), { emitSurface: async (surface) => void emitted.push(surface) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "the form must be emitted before the call parks");
  const html = (emitted[0] as { payload: { resource: UIResource } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the form must carry its exchange id");
  return { pending, html, exchangeId: match[1]!, emitted };
}

async function submit(env: Env, params: Record<string, unknown>) {
  const raised = await raise(env.tools);
  env.surfaceExchanges.deliver({ exchangeId: raised.exchangeId, toolId: SET_TOKEN, principalId: PRINCIPAL, params });
  return { ...raised, result: (await raised.pending) as Record<string, unknown> };
}

async function enableRow(env: Env): Promise<void> {
  const row = await env.readRow();
  assert.ok(row);
  await env.repo.upsert({ ...row, enabled: true });
}

test("a plugin that is not installed is refused before any form or network call", async () => {
  const env = await setup({ servers: null });
  const emitted: unknown[] = [];
  await assert.rejects(call(env.tools.get(SET_TOKEN), { emitSurface: async (s) => void emitted.push(s) }), /'supabase' is not an installed Agent Plugin/);
  assert.equal(emitted.length, 0);
  assert.equal(env.http.requests.length, 0);
  assert.equal(env.surfaceExchanges.size(), 0);
});

test("a plugin whose servers declare no tovuTokenAuth is refused: there is no token form for it", async () => {
  const env = await setup({ servers: { supabase: { type: "streamable-http", url: "https://mcp.supabase.com/mcp", tovuAuthMode: "oauth" } } });
  await assert.rejects(call(env.tools.get(SET_TOKEN), { emitSurface: async () => undefined }), /declares no access-token sign-in/);
  assert.equal(env.surfaceExchanges.size(), 0);
});

test("a row an operator pointed at another host is refused, so the token is never sent there", async () => {
  const env = await setup({ rowUrl: "https://elsewhere.example.com/mcp" });
  await assert.rejects(call(env.tools.get(SET_TOKEN), { emitSurface: async () => undefined }), /no longer points at/);
  assert.equal(env.surfaceExchanges.size(), 0);
  assert.equal(env.http.requests.length, 0);
});

test("INV-01: the token tool takes only a pluginId, so a token can never ride in on the model's own call", async () => {
  const env = await setup();
  await assert.rejects(call(env.tools.get(SET_TOKEN), { input: { pluginId: "supabase", token: TOKEN }, emitSurface: async () => undefined }), /takes only a pluginId/);
  assert.equal(env.surfaceExchanges.size(), 0);
});

test("with no emitSurface the token tool fails closed with no exchange and no network call", async () => {
  const env = await setup();
  await assert.rejects(call(env.tools.get(SET_TOKEN)), /no interactive form channel/);
  assert.equal(env.surfaceExchanges.size(), 0);
  assert.equal(env.http.requests.length, 0);
});

test("the form names the plugin and links its declared tokens page, exactly as the Supabase form did", async () => {
  const env = await setup();
  const { html, pending, exchangeId } = await raise(env.tools);
  assert.match(html, /Connect Supabase with an access token/);
  assert.ok(html.includes(`Create a personal access token at ${TOKENS_PAGE}, then paste it below.`));
  assert.match(html, /Supabase access token/);
  env.surfaceExchanges.deliver({ exchangeId, toolId: SET_TOKEN, principalId: PRINCIPAL, params: { [SURFACE_DISMISSED_PARAM]: true } });
  await pending;
});

test("AC-10/EC-03/EC-04: a valid token is probed at the declared URL, sealed as the row's static token, and never echoed anywhere", async () => {
  const env = await setup();
  const { html, result, emitted } = await submit(env, { token: TOKEN });

  assert.match(html, /type="password"/, "the token field must be masked");
  assert.equal(result.saved, true);
  assert.equal(env.http.requests.length, 1);
  assert.equal(env.http.requests[0]!.url, PROBE_URL);
  assert.equal(env.http.requests[0]!.method, "GET");
  assert.equal(env.http.requests[0]!.headers.authorization, `Bearer ${TOKEN}`);

  const row = await env.readRow();
  assert.equal(row?.authMode, "static_env", "the fallback token supersedes the unfinished OAuth attempt on the same row");
  assert.ok(row?.sealedOAuth, "the token is stored sealed");
  assert.equal(row?.enabled, false, "saving a token never enables the connection");
  assert.equal(row?.allowedToolNames, JSON.stringify(["list_tables", "execute_sql"]), "operator lists carry forward unchanged");
  for (const [what, value] of Object.entries({ result, emitted, row })) {
    assert.ok(!JSON.stringify(value).includes(TOKEN), `the raw token must not appear in the ${what}`);
  }
});

test("EC-03/REQ-14: a token the vendor rejects is not stored, and the vendor's raw body is not relayed", async () => {
  const env = await setup();
  env.http.respond = unauthorized;
  const { result, emitted } = await submit(env, { token: TOKEN });

  assert.deepEqual(result, { saved: false, reason: "invalid", message: "That access token didn't work. Create a new one and try again. Nothing was saved." });
  const row = await env.readRow();
  assert.equal(row?.authMode, "oauth");
  assert.equal(row?.sealedOAuth, null);
  assert.ok(!JSON.stringify([result, emitted]).includes(RAW_VENDOR_BODY));
});

test("an unreachable vendor stores nothing and says the plugin is unavailable", async () => {
  const env = await setup();
  env.http.respond = () => ({ status: 503, headers: {}, bodyText: RAW_VENDOR_BODY });
  const { result } = await submit(env, { token: TOKEN });
  assert.deepEqual(result, { saved: false, reason: "unavailable", message: "Supabase is unavailable right now. Try again shortly." });
  assert.equal((await env.readRow())?.sealedOAuth, null);
});

test("a blank token is refused without a probe, and a cancel stores nothing", async () => {
  const env = await setup();
  assert.equal((await submit(env, { token: "   " })).result.reason, "invalid");
  assert.deepEqual((await submit(env, { [SURFACE_DISMISSED_PARAM]: true })).result, { saved: false, reason: "cancelled" });
  assert.equal(env.http.requests.length, 0);
  assert.equal((await env.readRow())?.sealedOAuth, null);
});

test("AC-12: once saved and enabled, the account-wide row carries the token only as a Bearer header", async () => {
  const env = await setup();
  const { result } = await submit(env, { token: TOKEN });
  assert.equal(result.saved, true);
  await enableRow(env);

  const after = await readEnabledExternalMcpConfigs({ repo: env.repo, sealer: env.sealer }, WORKSPACE);
  assert.equal(after.configs.length, 1);
  const target = after.configs[0]!.target;
  assert.equal(target.kind, "streamable_http");
  if (target.kind !== "streamable_http") return;
  assert.equal(target.url, "https://mcp.supabase.com/mcp");
  assert.deepEqual(target.headers, { authorization: `Bearer ${TOKEN}` });
  assert.deepEqual(after.configs[0]!.writeAllowedToolNames, [], "INV-02: no write grant appears");
});

test("AC-08: the generic token form's tool id is redeemable; every deleted Supabase tool id is not", () => {
  assert.equal(isMcpUiToolCallAllowed(SET_TOKEN), true);
  assert.equal(isMcpUiToolCallAllowed("supabase_set_access_token"), false);
  assert.equal(isMcpUiToolCallAllowed("supabase_set_project_scope"), false);
  assert.equal(isMcpUiToolCallAllowed("supabase_get_database"), false);
  assert.equal(isMcpUiToolCallAllowed("mcp__supabase__execute_sql"), false);
});
