import { credentialSaveFixtureInput, credentialSaveFixtureRegistrations } from "../../../../__tests__/support/credential-save.js";
import { saveAgentPluginToken } from "../../access-token-tool.js";
import assert from "node:assert/strict";
import test from "node:test";
import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { InMemoryExternalMcpServerRepo, readEnabledExternalMcpConfigs, saveExternalMcpServer, type UIResource } from "#src/assistant/index";
import { isMcpUiToolCallAllowed } from "#src/assistant/mcp-ui-tool-calls";
import { SURFACE_DISMISSED_PARAM, SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore, type SurfaceExchange } from "@jini-ai/daemon/surface-exchanges";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import type { HttpClientPort, HttpRequest, HttpResponse } from "#src/platform/http/index";

import type { AgentPluginAccessTokenToolDeps } from "../../access-token-tool.js";
import type { McpServerConfig } from "../../mcp-metadata.js";
import { buildAgentPluginConnectRegistrations } from "../../tool-registrations.js";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


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
const SET_TOKEN = "credential_save";
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

async function setup(
  options: { servers?: Readonly<Record<string, McpServerConfig>> | null; rowUrl?: string; allowedToolNames?: string; pluginOffByOperator?: boolean; switchOnFails?: boolean; permissionDenied?: boolean } = {},
) {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const clock = { nowMs: () => Date.parse("2026-09-13T00:00:00.000Z"), nowIso: () => "2026-09-13T00:00:00.000Z" };
  const http = new FakeVendorApi(probeOk);
  const connected: string[] = [];
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
      allowedToolNames: options.allowedToolNames ?? "list_tables,execute_sql",
      writeAllowedToolNames: "",
      principalId: PRINCIPAL,
      provisionedByPluginId: "supabase",
    },
  );
  const servers = options.servers === undefined ? SUPABASE_SERVERS : options.servers;
  const deps: AgentPluginAccessTokenToolDeps = {
    workspaceId: WORKSPACE,
    authorize: (async () => ({ allowed: !options.permissionDenied, reason: options.permissionDenied ? "no_grant" : "matched" })) as unknown as AgentPluginAccessTokenToolDeps["authorize"],
    clock,
    externalMcpServerRepo: repo,
    siteAssistantSecretSealer: sealer,
    siteAssistantSecretKeyring: keyring,
    customCredentialsHttpClient: http,
    resolveInstalledPlugin: async (pluginId) => (pluginId === "supabase" && servers !== null ? { servers } : null),
    // Stands in for apply-connect-defaults: switches on only a row nobody edited (empty lists).
    onConnected: async (serverId) => {
      if (options.switchOnFails) throw new Error("activations file busy");
      connected.push(serverId);
      const row = await repo.findByServerId({ workspaceId: WORKSPACE, serverId });
      if (row && (row.allowedToolNames ?? "[]") === "[]") await repo.upsert({ ...row, enabled: true, allowedToolNames: JSON.stringify(["list_tables"]) });
    },
    isPluginOffByOperator: async () => options.pluginOffByOperator === true,
    // Never the real activations file (switch-on-saved-token.unit.test.ts covers that one).
    switchPluginOn: async () => options.pluginOffByOperator !== true,
  };
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
  const tools = new Map(credentialSaveFixtureRegistrations({ registrations: buildAgentPluginConnectRegistrations(deps, { surfaceExchanges }), adapters: { agentPluginToken: (ctx, optional = {}) => saveAgentPluginToken({ ctx, routeDeps: deps, surfaces: { surfaceExchanges } }, optional) } }).map((r) => [r.descriptor.id, r]));
  const readRow = () => repo.findByServerId({ workspaceId: WORKSPACE, serverId: "supabase" });
  return { repo, sealer, http, surfaceExchanges, tools, readRow, connected };
}

type Env = Awaited<ReturnType<typeof setup>>;

function call(registration: ToolRegistration | undefined, options: { input?: unknown; emitSurface?: SurfaceEmitter; signal?: AbortSignal } = {}) {
  assert.ok(registration, "tool must be wired");
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: PRINCIPAL },
    run: { id: "run-1" },
    input: registration.descriptor.id === SET_TOKEN ? credentialSaveFixtureInput({ input: options.input ?? { pluginId: "supabase" }, kind: "agent-plugin-token" }) : options.input ?? { pluginId: "supabase" },
    signal: options.signal ?? new AbortController().signal,
    ...(options.emitSurface ? { emitSurface: options.emitSurface } : {}),
  };
  return invokeFixtureHandler(registration, ctx);
}

async function raise(tools: Map<string, ToolRegistration>, signal?: AbortSignal) {
  const emitted: unknown[] = [];
  const pending = call(tools.get(SET_TOKEN), { emitSurface: async (surface) => void emitted.push(surface), signal });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "the form must be emitted before the call parks");
  const html = (emitted[0] as { payload: { resource: UIResource } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the form must carry its exchange id");
  return { pending, html, exchangeId: match[1]!, emitted };
}

async function submit(env: Env, params: Record<string, unknown>) {
  const raised = await raise(env.tools);
  env.surfaceExchanges.deliver({ exchangeId: raised.exchangeId, principalId: PRINCIPAL, params }, { toolId: SET_TOKEN });
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

test("the form names the plugin and displays its declared tokens page in the help text", async () => {
  const env = await setup();
  const { html, pending, exchangeId } = await raise(env.tools);
  assert.match(html, /Connect Supabase with an access token/);
  assert.ok(html.includes(`Create a personal access token at ${TOKENS_PAGE}, then paste it below.`));
  assert.match(html, /Supabase access token/);
  env.surfaceExchanges.deliver({ exchangeId, principalId: PRINCIPAL, params: { [SURFACE_DISMISSED_PARAM]: true } }, { toolId: SET_TOKEN });
  await pending;
});

test("AC-10/EC-03/EC-04: a valid token is probed at the declared URL, sealed as the row's static token, and never echoed anywhere", async () => {
  const env = await setup();
  const { html, result, emitted, exchangeId } = await submit(env, { token: TOKEN });

  const uris = emitted.map(surface => (surface as { payload: { resource: UIResource } }).payload.resource.resource.uri);
  assert.deepEqual(uris, [
    `ui://tovu/secret-card/credential_save/${exchangeId}`,
    `ui://tovu/secret-card/credential_save/${exchangeId}`,
  ], "the engine replaces the form with its real save outcome");

  assert.match(html, /type="password"/, "the token field must be masked");
  assert.equal(result.saved, true);
  assert.equal(env.http.requests.length, 1);
  assert.equal(env.http.requests[0]!.url, PROBE_URL);
  assert.equal(env.http.requests[0]!.method, "GET");
  assert.equal(env.http.requests[0]!.headers.authorization, `Bearer ${TOKEN}`);

  const row = await env.readRow();
  assert.equal(row?.authMode, "static_env", "the fallback token supersedes the unfinished OAuth attempt on the same row");
  assert.ok(row?.sealedOAuth, "the token is stored sealed");
  assert.equal(row?.enabled, false, "a connection whose tool lists an operator already edited is left as they set it");
  assert.equal(row?.allowedToolNames, JSON.stringify(["list_tables", "execute_sql"]), "operator lists carry forward unchanged");
  assert.match(String(result.next), /Add-Ons → Integrations → External MCP/, "the result names the screen that switches it on");
  for (const [what, value] of Object.entries({ result, emitted, row })) {
    assert.ok(!JSON.stringify(value).includes(TOKEN), `the raw token must not appear in the ${what}`);
  }
});

test("EC-03/REQ-14: a token the vendor rejects is not stored, and the vendor's raw body is not relayed", async () => {
  const env = await setup();
  env.http.respond = unauthorized;
  const { result, emitted } = await submit(env, { token: TOKEN });

  assert.deepEqual(result, { saved: false, reason: "invalid", message: "The server rejected this token." });
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

test("IRON RULE: saving a token on an untouched connection switches the plugin on, with no manual step", async () => {
  const env = await setup({ allowedToolNames: "" });
  const { result, emitted } = await submit(env, { token: TOKEN });
  assert.equal(result.saved, true);
  assert.deepEqual(env.connected, ["supabase"], "the sign-in's own connect defaults run after the save");
  assert.equal((await env.readRow())?.enabled, true);
  assert.equal(result.next, "Supabase is connected and switched on. Its tools are ready to use.");
  assert.ok(!String(result.next).includes("Settings"), "no instruction to go and switch it on by hand");
  assert.ok(JSON.stringify(emitted).includes("switched on"), "the form's outcome says the same thing");
});

test("a plugin an operator turned off keeps the token but stays off, and the result names the Agent Plugins screen", async () => {
  const env = await setup({ allowedToolNames: "", pluginOffByOperator: true });
  const { result } = await submit(env, { token: TOKEN });
  assert.equal(result.saved, true);
  assert.deepEqual(env.connected, [], "an operator's off switch must not be overridden");
  const row = await env.readRow();
  assert.equal(row?.authMode, "static_env");
  assert.equal(row?.enabled, false);
  assert.equal(
    result.next,
    "Token saved. Supabase stays off because an operator turned it off. To use it, switch 'Supabase' on in Add-Ons → Agent Plugins.",
  );
});

test("a failure switching on after the save still reports the token as saved, with a retry step", async () => {
  const env = await setup({ allowedToolNames: "", switchOnFails: true });
  const { result } = await submit(env, { token: TOKEN });
  assert.equal(result.saved, true);
  assert.equal((await env.readRow())?.authMode, "static_env");
  assert.equal(result.next, "Token saved, but Supabase could not be switched on automatically. Save the token again to retry.");
});

test("permission denial raises no form, opens no exchange and leaves the token row unchanged", async () => {
  const env = await setup({ permissionDenied: true });
  const before = await env.readRow();
  const emitted: unknown[] = [];
  await assert.rejects(call(env.tools.get(SET_TOKEN), { emitSurface: async (s) => void emitted.push(s) }), /no_grant/);
  assert.deepEqual(emitted, []);
  assert.equal(env.surfaceExchanges.size(), 0);
  assert.deepEqual(env.http.requests, []);
  assert.deepEqual(await env.readRow(), before);
});

test("a rejected HTTP transport returns unavailable, saves nothing and closes the exchange", async () => {
  const env = await setup();
  const before = await env.readRow();
  env.http.respond = () => { throw new Error(`transport failed ${TOKEN}`); };
  const { result, emitted } = await submit(env, { token: TOKEN });
  assert.deepEqual(result, { saved: false, reason: "unavailable", message: "Supabase is unavailable right now. Try again shortly." });
  assert.equal(env.http.requests.length, 1);
  assert.deepEqual(await env.readRow(), before);
  assert.equal(env.surfaceExchanges.size(), 0);
  assert.ok(!JSON.stringify([result, emitted]).includes(TOKEN));
});

test("a store failure after a successful probe is redacted and leaves the previous row intact", async (t) => {
  const env = await setup();
  const { pending, exchangeId, emitted } = await raise(env.tools);
  const before = await env.readRow();
  const writes = t.mock.method(env.repo, "upsert", async () => { throw new Error(`store failed ${TOKEN}`); });
  env.surfaceExchanges.deliver({ exchangeId, principalId: PRINCIPAL, params: { token: TOKEN } }, { toolId: SET_TOKEN });
  const result = await pending;
  assert.deepEqual(result, { saved: false, reason: "error", message: "The access token could not be saved. Nothing was changed." });
  assert.equal(writes.mock.callCount(), 1);
  assert.equal(env.http.requests.length, 1);
  assert.deepEqual(await env.readRow(), before);
  assert.equal(env.surfaceExchanges.size(), 0);
  assert.ok(!JSON.stringify([result, emitted]).includes(TOKEN));
});

for (const ending of ["expired", "abandoned", "abort"] as const) {
  test(`a pending form that is ${ending} saves nothing and rejects late answers`, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const env = await setup();
    const before = await env.readRow();
    let exchange: SurfaceExchange | undefined;
    const open = env.surfaceExchanges.open.bind(env.surfaceExchanges);
    t.mock.method(env.surfaceExchanges, "open", (...args: Parameters<typeof open>) => {
      exchange = open(...args);
      return exchange;
    });
    const controller = new AbortController();
    const { pending, exchangeId } = await raise(env.tools, controller.signal);
    assert.equal(env.surfaceExchanges.size(), 1);
    if (ending === "expired") t.mock.timers.tick(5 * 60 * 1000);
    else if (ending === "abort") controller.abort();
    else exchange!.close({});
    assert.deepEqual(await pending, { saved: false, reason: ending === "abort" ? "abandoned" : ending });
    assert.equal(env.surfaceExchanges.size(), 0);
    assert.deepEqual(env.surfaceExchanges.deliver({ exchangeId, principalId: PRINCIPAL, params: { token: TOKEN } }, { toolId: SET_TOKEN }), { ok: false, reason: "unknown-or-closed" });
    assert.deepEqual(env.http.requests, []);
    assert.deepEqual(await env.readRow(), before);
  });
}

/** Supplies the fixture emitter through the canonical handler options, including headless calls. */
function invokeFixtureHandler(
  registration: import("@jini-ai/core").ToolRegistration,
  context: import("@jini-ai/core").ToolExecutionContext & { emitSurface?: import("@jini-ai/core").SurfaceEmitter },
) {
  const { emitSurface, ...required } = context;
  return registration.handler(required, emitSurface ? { emitSurface } : {});
}

for (const [token, message] of [
  ['x'.repeat(8193), 'The token exceeds the 8192-character limit. Copy only the token.'],
  ['café_東京', 'Hosted tokens must use visible ASCII characters (0x21–0x7E).'],
  ['abc def', 'Hosted tokens must use visible ASCII characters (0x21–0x7E).'],
  ['   ', 'Enter a token. Spaces alone are not a token.'],
]) test(`credential validation precedes the agent-plugin probe (${message})`, async () => {
  const env = await setup(); const { result } = await submit(env, { token });
  assert.deepEqual(result, { saved: false, reason: 'invalid', message });
  assert.equal(env.http.requests.length, 0, 'invalid bytes must not be probed');
  assert.equal((await env.readRow())?.authMode, 'oauth', 'invalid bytes must not replace a working grant');
});

test("an abort during the token probe prevents the sealed write and plugin activation", async () => {
  const env = await setup();
  const before = await env.readRow();
  const controller = new AbortController();
  const { pending, exchangeId } = await raise(env.tools, controller.signal);
  env.http.respond = () => { controller.abort(); return probeOk(); };
  env.surfaceExchanges.deliver({ exchangeId, principalId: PRINCIPAL, params: { token: TOKEN } }, { toolId: SET_TOKEN });
  assert.deepEqual(await pending, { saved: false, reason: "abandoned" });
  assert.deepEqual(await env.readRow(), before);
  assert.deepEqual(env.connected, []);
  assert.equal(env.surfaceExchanges.size(), 0);
});

test("a run aborted before preparation opens no form and leaves the plugin row unchanged", async () => {
  const env = await setup();
  const before = await env.readRow();
  const controller = new AbortController();
  controller.abort();
  const emitted: unknown[] = [];
  await assert.rejects(call(env.tools.get(SET_TOKEN), { signal: controller.signal, emitSurface: async surface => { emitted.push(surface); } }),
    (error: unknown) => error === controller.signal.reason);
  assert.deepEqual(await env.readRow(), before);
  assert.deepEqual(emitted, []);
  assert.deepEqual(env.http.requests, []);
  assert.equal(env.surfaceExchanges.size(), 0);
});

test("a destination repointed while the token form is open cannot receive the submitted credential", async () => {
  const env = await setup();
  const { pending, exchangeId, emitted } = await raise(env.tools);
  const row = await env.readRow();
  assert.ok(row);
  const changed = { ...row, url: "https://elsewhere.example.com/mcp" };
  await env.repo.upsert(changed);
  env.surfaceExchanges.deliver({ exchangeId, principalId: PRINCIPAL, params: { token: TOKEN } }, { toolId: SET_TOKEN });
  assert.deepEqual(await pending, { saved: false, reason: "error", message: "agent_plugin_set_access_token: the 'supabase' connection no longer points at Supabase. Nothing was changed." });
  assert.deepEqual(await env.readRow(), changed);
  assert.deepEqual(env.connected, []);
  assert.equal(env.surfaceExchanges.size(), 0);
  assert.equal(JSON.stringify(emitted).includes(TOKEN), false);
});
