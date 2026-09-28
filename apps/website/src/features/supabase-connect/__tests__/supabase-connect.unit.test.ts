import assert from "node:assert/strict";
import test from "node:test";
import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { InMemoryExternalMcpServerRepo, readEnabledExternalMcpConfigs, saveExternalMcpServer, type UIResource } from "#src/assistant/index";
import { isMcpUiToolCallAllowed } from "#src/assistant/mcp-ui-tool-calls";
import { SURFACE_DISMISSED_PARAM, SURFACE_EXCHANGE_ID_PARAM, createSurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import type { HttpClientPort, HttpRequest, HttpResponse } from "#src/platform/http/index";

import { buildSupabaseConnectRegistrations, type SupabaseConnectToolDeps } from "../tool-registrations.js";

/**
 * @file SPEC-052's access-token form tool (the last Supabase tool in core; the project picker was
 * deleted 2026-09-27), driven end to end over the REAL External MCP store, sealer, and
 * surface-exchange store — only Supabase's Management API is faked. A submission is simulated with
 * `surfaceExchanges.deliver(...)`, exactly as `mcp-ui-tool-calls-route.ts` delivers a human's click.
 */

const WORKSPACE = "ws-supabase-connect";
const PRINCIPAL = "principal-1";
const TOKEN = "sbp_unit_test_token_that_must_never_echo";
const RAW_SUPABASE_BODY = "raw supabase error body";
const SET_TOKEN = "supabase_set_access_token";

const projectsOk = (): HttpResponse => ({
  status: 200,
  headers: {},
  bodyText: JSON.stringify([{ ref: "abcdefghijklmnopqrst", name: "Shop", organization_id: "org-1" }]),
});
const unauthorized = (): HttpResponse => ({ status: 401, headers: {}, bodyText: JSON.stringify({ message: RAW_SUPABASE_BODY }) });

class FakeSupabaseApi implements HttpClientPort {
  readonly requests: HttpRequest[] = [];
  constructor(public respond: (request: HttpRequest) => HttpResponse) {}
  async send(request: HttpRequest): Promise<HttpResponse> {
    this.requests.push(request);
    return this.respond(request);
  }
}

async function setup(options: { withRow?: boolean } = {}) {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const clock = { nowIso: () => "2026-09-13T00:00:00.000Z" };
  const http = new FakeSupabaseApi(projectsOk);
  if (options.withRow !== false) {
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
        url: "https://mcp.supabase.com/mcp",
        args: "",
        allowedToolNames: "list_tables,execute_sql",
        writeAllowedToolNames: "",
        principalId: PRINCIPAL,
        provisionedByPluginId: "supabase",
      },
    );
  }
  const deps: SupabaseConnectToolDeps = {
    workspaceId: WORKSPACE,
    authorize: (async () => ({ allowed: true, reason: "matched" })) as unknown as SupabaseConnectToolDeps["authorize"],
    clock,
    externalMcpServerRepo: repo,
    siteAssistantSecretSealer: sealer,
    siteAssistantSecretKeyring: keyring,
    customCredentialsHttpClient: http,
  };
  const surfaceExchanges = createSurfaceExchangeStore();
  const build = (overrides: Partial<SupabaseConnectToolDeps> = {}) =>
    new Map(buildSupabaseConnectRegistrations({ ...deps, ...overrides }, { surfaceExchanges }).map((r) => [r.descriptor.id, r]));
  const readRow = () => repo.findByServerId({ workspaceId: WORKSPACE, serverId: "supabase" });
  return { repo, sealer, http, surfaceExchanges, tools: build(), build, readRow };
}

type Env = Awaited<ReturnType<typeof setup>>;

function call(registration: ToolRegistration | undefined, options: { input?: unknown; emitSurface?: SurfaceEmitter } = {}) {
  assert.ok(registration, "tool must be wired");
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: PRINCIPAL },
    run: { id: "run-1" },
    input: options.input ?? {},
    signal: new AbortController().signal,
    ...(options.emitSurface ? { emitSurface: options.emitSurface } : {}),
  };
  return registration.handler(ctx);
}

async function raise(tools: Map<string, ToolRegistration>, toolId: string) {
  const emitted: unknown[] = [];
  const pending = call(tools.get(toolId), { emitSurface: async (surface) => void emitted.push(surface) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "the form must be emitted before the call parks");
  const html = (emitted[0] as { payload: { resource: UIResource } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the form must carry its exchange id");
  return { pending, html, exchangeId: match[1]!, emitted };
}

async function submit(env: Env, toolId: string, params: Record<string, unknown>, tools = env.tools) {
  const raised = await raise(tools, toolId);
  env.surfaceExchanges.deliver({ exchangeId: raised.exchangeId, toolId, principalId: PRINCIPAL, params });
  return { ...raised, result: (await raised.pending) as Record<string, unknown> };
}

async function enableRow(env: Env): Promise<void> {
  const row = await env.readRow();
  assert.ok(row);
  await env.repo.upsert({ ...row, enabled: true });
}

test("REQ-02: with no 'supabase' connection the token tool refuses before any form or network call", async () => {
  const env = await setup({ withRow: false });
  const emitted: unknown[] = [];
  await assert.rejects(call(env.tools.get(SET_TOKEN), { emitSurface: async (s) => void emitted.push(s) }), /turn on the 'supabase' plugin in the Agent Plugins admin screen/);
  assert.equal(emitted.length, 0);
  assert.equal(env.http.requests.length, 0);
  assert.equal(env.surfaceExchanges.size(), 0);
});

test("INV-01: the token tool accepts no input, so a token can never ride in on the model's own call", async () => {
  const env = await setup();
  await assert.rejects(call(env.tools.get(SET_TOKEN), { input: { token: TOKEN }, emitSurface: async () => undefined }), /accepts no input/);
  assert.equal(env.surfaceExchanges.size(), 0);
});

test("with no emitSurface the token tool fails closed with no exchange and no network call", async () => {
  const env = await setup();
  await assert.rejects(call(env.tools.get(SET_TOKEN)), /no interactive form channel/);
  assert.equal(env.surfaceExchanges.size(), 0);
  assert.equal(env.http.requests.length, 0);
});

test("AC-10/EC-03/EC-04: a valid token is probed, sealed as the row's static token, and never echoed anywhere", async () => {
  const env = await setup();
  const { html, result, emitted } = await submit(env, SET_TOKEN, { token: TOKEN });

  assert.match(html, /type="password"/, "the token field must be masked");
  assert.equal(result.saved, true);
  assert.equal(env.http.requests.length, 1);
  assert.equal(env.http.requests[0]!.url, "https://api.supabase.com/v1/projects");
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

test("EC-03/REQ-14: a token Supabase rejects is not stored, and Supabase's raw body is not relayed", async () => {
  const env = await setup();
  env.http.respond = unauthorized;
  const { result, emitted } = await submit(env, SET_TOKEN, { token: TOKEN });

  assert.deepEqual(result, { saved: false, reason: "invalid", message: "That access token didn't work. Create a new one and try again. Nothing was saved." });
  const row = await env.readRow();
  assert.equal(row?.authMode, "oauth");
  assert.equal(row?.sealedOAuth, null);
  assert.ok(!JSON.stringify([result, emitted]).includes(RAW_SUPABASE_BODY));
});

test("a blank token is refused without a probe, and a cancel stores nothing", async () => {
  const env = await setup();
  assert.equal((await submit(env, SET_TOKEN, { token: "   " })).result.reason, "invalid");
  assert.deepEqual((await submit(env, SET_TOKEN, { [SURFACE_DISMISSED_PARAM]: true })).result, { saved: false, reason: "cancelled" });
  assert.equal(env.http.requests.length, 0);
  assert.equal((await env.readRow())?.sealedOAuth, null);
});

test("AC-12: once saved and enabled, the account-wide row carries the token only as a Bearer header", async () => {
  // AC-05/06/07 (the one-project picker) and AC-11 (INV-04) were dropped: the supabase agent plugin
  // connects account-wide (plan v2 slices R1, and the picker's deletion on 2026-09-27).
  const env = await setup();
  const { result } = await submit(env, SET_TOKEN, { token: TOKEN });
  assert.equal(result.saved, true);
  assert.doesNotMatch(String(result.next), /supabase_set_project_scope/, "never points at a deleted tool");
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

test("AC-08: the token form's tool id is redeemable; an unlisted or deleted Supabase tool id is not", () => {
  assert.equal(isMcpUiToolCallAllowed(SET_TOKEN), true);
  assert.equal(isMcpUiToolCallAllowed("supabase_set_project_scope"), false);
  assert.equal(isMcpUiToolCallAllowed("supabase_get_database"), false);
  assert.equal(isMcpUiToolCallAllowed("supabase_execute_sql"), false);
  assert.equal(isMcpUiToolCallAllowed("mcp__supabase__execute_sql"), false);
});
