import { createTovuOAuthGuard } from "#src/platform/oauth/endpoint-safety";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import express from "express";

import { createDeviceAuthorizationStore, createExternalMcpOAuthService, saveExternalMcpServer } from "../../assistant/index.js";
import { createPendingAuthorizationStore, type OAuthFetch, type OAuthProviderDescriptor } from "../../platform/oauth/index.js";
import { createRouteDeps } from "../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../inbound/admin-http/dev-auth.js";
import { createExternalMcpModule } from "../runtime/composition/modules/external-mcp.js";
import { EXTERNAL_MCP_OAUTH_CALLBACK_PATH } from "../inbound/public-http/routes/external-mcp/oauth-callback-url.js";
import type { RouteDeps } from "../routes/types.js";
import { bootAuthenticated, startTestServer } from "./helpers/http-test-server.js";

/**
 * @file Route-level tests for the external-MCP OAuth routes — real Express app, real session auth,
 * real HTTP, real sealing, a scripted authorization server.
 *
 * Four properties can only be checked here, at the wire:
 * 1. The public callback is genuinely unauthenticated (it has to be — a `SameSite=Strict` cookie
 *    does not survive the provider's cross-site redirect) while the admin routes genuinely are not.
 * 2. Nothing from the callback request reaches the rendered page — the XSS property the shared
 *    callback page claims.
 * 3. No token, refresh token or client secret crosses the wire in any response.
 * 4. An unreachable provider surfaces as a 502 with `retryable: false`, distinctly from a provider
 *    that refused us (400) — the two demand different things of the operator.
 */

const WORKSPACE_ID = "workspace-local";
const SERVER_ID = "higgs";
const BASE = `/api/admin/v1/workspaces/${WORKSPACE_ID}/mcp-servers/${SERVER_ID}`;
const DUMMY_SECRET = "UNIT_DUMMY_CLIENT_SECRET_4242";

const PROVIDER: OAuthProviderDescriptor = {
  providerId: "test-provider",
  label: "Test Provider",
  supportedGrants: ["authorization_code", "device_code"],
  authorizationEndpoint: "https://auth.example.com/authorize",
  tokenEndpoint: "https://auth.example.com/token",
  deviceAuthorizationEndpoint: "https://auth.example.com/device",
  defaultScopes: [],
  usesPkce: true,
  clientAuth: "none",
};

interface ScriptStep {
  readonly status?: number;
  readonly json?: unknown;
  readonly throws?: Error;
}

function scriptedFetch(script: readonly ScriptStep[]) {
  let calls = 0;
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const fetchFn: OAuthFetch = async (url, init): Promise<Response> => {
    requests.push({ url: String(url), init });
    const step = script[Math.min(calls, script.length - 1)] ?? {};
    calls += 1;
    if (step.throws) throw step.throws;
    return new Response(JSON.stringify(step.json ?? {}), {
      status: step.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetchFn, requests };
}

async function buildTestApp(options: { script?: readonly ScriptStep[]; grant?: string } = {}) {
  const base = createRouteDeps();
  const http = scriptedFetch(options.script ?? []);
  const oauthDeps: Parameters<typeof createExternalMcpOAuthService>[0] = {
    workspaceId: base.workspaceId,
    repo: base.externalMcpServerRepo,
    sealer: base.siteAssistantSecretSealer,
    keyring: base.siteAssistantSecretKeyring,
    clock: base.clock,
    pending: createPendingAuthorizationStore({ clock: base.clock }),
    devices: createDeviceAuthorizationStore(),
    httpPorts: { guard: createTovuOAuthGuard({}, { allowLoopbackHttp: true }),
      fetchFn: ({ url }, init) => (http.fetchFn)(url, init) },
    lookupProvider: () => PROVIDER,
  };
  const deps: RouteDeps = { ...base, externalMcpOAuth: createExternalMcpOAuthService(oauthDeps) };

  await saveExternalMcpServer(
    {
      repo: deps.externalMcpServerRepo,
      sealer: deps.siteAssistantSecretSealer,
      keyring: deps.siteAssistantSecretKeyring,
      clock: deps.clock,
    },
    {
      workspaceId: deps.workspaceId,
      serverId: SERVER_ID,
      label: "Higgs",
      transport: "stdio",
      authMode: "oauth",
      enabled: true,
      command: "npx",
      args: "-y higgs-mcp",
      allowedToolNames: "generate_image",
      writeAllowedToolNames: "",
      principalId: "owner",
      oauth: {
        providerId: PROVIDER.providerId,
        grant: options.grant ?? "authorization_code",
        clientId: "tovu-client",
        clientSecret: DUMMY_SECRET,
        scopes: "images:generate",
        tokenEnvName: "HIGGS_TOKEN",
      },
    },
  );

  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  createExternalMcpModule(deps).registerRoutes?.(app);
  return { app, deps, http };
}

function req(baseUrl: string, path: string, cookie: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", cookie, ...(init.headers ?? {}) },
  });
}

test("the admin OAuth routes require a session", async (t) => {
  const { app } = await buildTestApp();
  const baseUrl = await startTestServer(app, t);

  assert.equal((await req(baseUrl, `${BASE}/oauth/connect`, "", { method: "POST", body: "{}" })).status, 401);
  assert.equal((await req(baseUrl, `${BASE}/oauth/device/poll`, "", { method: "POST", body: "{}" })).status, 401);
  assert.equal((await req(baseUrl, `${BASE}/oauth`, "", { method: "DELETE" })).status, 401);
});

test("the public callback is NOT behind the session gate — it could never work if it were", async (t) => {
  const { app } = await buildTestApp();
  const baseUrl = await startTestServer(app, t);

  const response = await fetch(`${baseUrl}${EXTERNAL_MCP_OAUTH_CALLBACK_PATH}/${SERVER_ID}?state=nope`);

  assert.notEqual(response.status, 401, "a SameSite=Strict cookie cannot survive the provider's redirect");
  assert.equal(response.status, 400, "an unknown state is refused, but by the state check, not by auth");
});

test("connect returns a redirect URL carrying PKCE, and no secret", async (t) => {
  const { app } = await buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const response = await req(baseUrl, `${BASE}/oauth/connect`, cookie, { method: "POST", body: "{}" });
  const body = (await response.json()) as { auth: { kind: string; authorizationUrl: string } };

  assert.equal(response.status, 200);
  assert.equal(body.auth.kind, "redirect_required");
  const url = new URL(body.auth.authorizationUrl);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok(url.searchParams.get("code_challenge"));
  assert.match(url.searchParams.get("state") ?? "", /^[A-Za-z0-9_-]{32}$/);
  const again = await req(baseUrl, `${BASE}/oauth/connect`, cookie, { method: "POST", body: "{}" });
  assert.equal(again.status, 200);
  const second = await again.json() as { auth: { authorizationUrl: string } };
  const secondUrl = new URL(second.auth.authorizationUrl);
  assert.notEqual(secondUrl.searchParams.get("state"), url.searchParams.get("state"));
  assert.notEqual(secondUrl.searchParams.get("code_challenge"), url.searchParams.get("code_challenge"));
  assert.equal(url.searchParams.get("code_verifier"), null, "the verifier must never reach the browser");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    `${baseUrl}${EXTERNAL_MCP_OAUTH_CALLBACK_PATH}/${SERVER_ID}`,
    "the callback URL is built from the request, so a reverse-proxied deployment gets the right origin",
  );
  assert.ok(!JSON.stringify(body).includes(DUMMY_SECRET));
});

test("a full handshake connects, and no response anywhere carries a token or the client secret", async (t) => {
  const { app, http } = await buildTestApp({
    script: [{ json: { access_token: "at-wire", refresh_token: "rt-wire", expires_in: 3600 } }],
  });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const connect = await req(baseUrl, `${BASE}/oauth/connect`, cookie, { method: "POST", body: "{}" });
  const { auth } = (await connect.json()) as { auth: { authorizationUrl: string } };
  const state = new URL(auth.authorizationUrl).searchParams.get("state") ?? "";

  const callback = await fetch(
    `${baseUrl}${EXTERNAL_MCP_OAUTH_CALLBACK_PATH}/${SERVER_ID}?state=${encodeURIComponent(state)}&code=auth-code`,
  );
  const html = await callback.text();
  assert.equal(callback.status, 200);
  assert.match(html, /Connected/);
  assert.equal(http.requests.length, 1);
  const exchange = http.requests[0];
  assert.equal(exchange.url, PROVIDER.tokenEndpoint);
  assert.equal(exchange.init?.method, "POST");
  const form = new URLSearchParams(String(exchange.init?.body));
  const authorization = new URL(auth.authorizationUrl);
  assert.equal(form.get("grant_type"), "authorization_code");
  assert.equal(form.get("code"), "auth-code");
  assert.equal(form.get("redirect_uri"), authorization.searchParams.get("redirect_uri"));
  assert.equal(form.get("client_id"), "tovu-client");
  assert.equal(form.get("client_secret"), null, "the provider declares a public client");
  const verifier = form.get("code_verifier") ?? "";
  assert.match(verifier, /^[A-Za-z0-9._~-]{43,128}$/);
  assert.equal(createHash("sha256").update(verifier, "ascii").digest("base64url"), authorization.searchParams.get("code_challenge"));
  assert.ok(!html.includes("at-wire"));
  assert.ok(!html.includes(state), "nothing from the request may be interpolated into the page");

  const list = await req(baseUrl, `/api/admin/v1/workspaces/${WORKSPACE_ID}/mcp-servers`, cookie);
  const listBody = await list.text();
  assert.ok(listBody.includes('"status":"connected"'));
  assert.ok(!listBody.includes("at-wire"), "the access token must never cross the wire");
  assert.ok(!listBody.includes("rt-wire"), "the refresh token must never cross the wire");
  assert.ok(!listBody.includes(DUMMY_SECRET), "the client secret must never cross the wire");
});

test("a callback carrying an attacker-shaped state renders the fixed failure page, uninterpolated", async (t) => {
  const { app } = await buildTestApp();
  const baseUrl = await startTestServer(app, t);

  const hostile = '"><script>alert(1)</script>';
  const response = await fetch(
    `${baseUrl}${EXTERNAL_MCP_OAUTH_CALLBACK_PATH}/${SERVER_ID}?state=${encodeURIComponent(hostile)}`,
  );
  const html = await response.text();

  assert.equal(response.status, 400);
  assert.ok(!html.includes("alert(1)"));
  assert.ok(!html.includes("<script>alert"));
  assert.match(html, /Couldn’t finish connecting/);
});

test("a callback with no state at all is refused before anything is attempted", async (t) => {
  const { app } = await buildTestApp();
  const baseUrl = await startTestServer(app, t);

  const response = await fetch(`${baseUrl}${EXTERNAL_MCP_OAUTH_CALLBACK_PATH}/${SERVER_ID}`);

  assert.equal(response.status, 400);
  assert.match(await response.text(), /Couldn’t finish connecting/);
});

test("an unreachable provider is a 502 with retryable:false — distinct from a provider that refused us", async (t) => {
  const { app } = await buildTestApp({
    grant: "device_code",
    script: [{ throws: Object.assign(new Error("timed out"), { name: "TimeoutError" }) }],
  });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const response = await req(baseUrl, `${BASE}/oauth/connect`, cookie, { method: "POST", body: "{}" });
  const body = (await response.json()) as { code: string; details: { retryable: boolean; operatorAction: string } };

  assert.equal(response.status, 502);
  assert.equal(body.code, "OAUTH_PROVIDER_UNREACHABLE");
  assert.equal(body.details.retryable, false);
  assert.match(body.details.operatorAction, /Nothing was retried automatically/);
});

test("a provider that refuses the request is a 400, so the operator checks configuration rather than the network", async (t) => {
  const { app } = await buildTestApp({
    grant: "device_code",
    script: [{ status: 400, json: { error: "invalid_client", error_description: "tenant acme-internal is not authorized" } }],
  });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const response = await req(baseUrl, `${BASE}/oauth/connect`, cookie, { method: "POST", body: "{}" });
  const raw = await response.text();

  assert.equal(response.status, 400);
  assert.ok(raw.includes("OAUTH_PROVIDER_REJECTED"));
  assert.ok(!raw.includes("acme-internal"), "a provider's error_description must not be echoed to the caller");
});

test("the device grant returns a user code over the wire and keeps the device code server-side", async (t) => {
  const { app } = await buildTestApp({
    grant: "device_code",
    script: [
      {
        json: {
          device_code: "device-secret-value",
          user_code: "WDJB-MJHT",
          verification_uri: "https://auth.example.com/activate",
          expires_in: 900,
          interval: 5,
        },
      },
      { status: 400, json: { error: "authorization_pending" } },
      { status: 400, json: { error: "slow_down", interval: 10 } },
      { json: { access_token: "device-access-token", refresh_token: "device-refresh-token", expires_in: 3600 } },
    ],
  });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const connect = await req(baseUrl, `${BASE}/oauth/connect`, cookie, { method: "POST", body: "{}" });
  const raw = await connect.text();

  assert.equal(connect.status, 200);
  assert.ok(raw.includes("WDJB-MJHT"));
  assert.ok(!raw.includes("device-secret-value"), "the device code must stay server-side");

  const poll = await req(baseUrl, `${BASE}/oauth/device/poll`, cookie, { method: "POST", body: "{}" });
  assert.equal(poll.status, 200);
  assert.deepEqual(await poll.json(), { status: "pending", retryAfterSeconds: 5 });
  const slower = await req(baseUrl, `${BASE}/oauth/device/poll`, cookie, { method: "POST", body: "{}" });
  assert.equal(slower.status, 200);
  assert.deepEqual(await slower.json(), { status: "pending", retryAfterSeconds: 10 });
  const completed = await req(baseUrl, `${BASE}/oauth/device/poll`, cookie, { method: "POST", body: "{}" });
  assert.equal(completed.status, 200);
  assert.deepEqual(await completed.json(), { status: "connected" });
  const list = await (await req(baseUrl, `/api/admin/v1/workspaces/${WORKSPACE_ID}/mcp-servers`, cookie)).text();
  assert.ok(list.includes('"status":"connected"'));
  assert.ok(list.includes('"hasStoredToken":true'));
  assert.ok(!list.includes("device-access-token"));
  assert.ok(!list.includes("device-refresh-token"));
});

for (const [providerError, code] of [["access_denied", "OAUTH_ACCESS_DENIED"], ["expired_token", "OAUTH_EXPIRED_TOKEN"]]) {
  test(`a device poll returning ${providerError} is terminal at the HTTP boundary`, async (t) => {
    const { app } = await buildTestApp({ grant: "device_code", script: [
      { json: { device_code: "device-secret", user_code: "CODE", verification_uri: "https://auth.example.com/activate", expires_in: 900 } },
      { status: 400, json: { error: providerError } },
    ] });
    const { baseUrl, cookie } = await bootAuthenticated(app, t);
    assert.equal((await req(baseUrl, `${BASE}/oauth/connect`, cookie, { method: "POST", body: "{}" })).status, 200);
    const poll = await req(baseUrl, `${BASE}/oauth/device/poll`, cookie, { method: "POST", body: "{}" });
    assert.equal(poll.status, 400);
    const body = await poll.json() as { code: string; details: { retryable: boolean } };
    assert.equal(body.code, code);
    assert.equal(body.details.retryable, false);
    const list = await (await req(baseUrl, `/api/admin/v1/workspaces/${WORKSPACE_ID}/mcp-servers`, cookie)).text();
    assert.ok(list.includes('"status":"disconnected"'));
    assert.ok(list.includes('"hasStoredToken":false'));
  });
}

test("a declined authorization callback renders failure and performs no exchange", async (t) => {
  const { app, http } = await buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const connect = await req(baseUrl, `${BASE}/oauth/connect`, cookie, { method: "POST", body: "{}" });
  const body = await connect.json() as { auth: { authorizationUrl: string } };
  const state = new URL(body.auth.authorizationUrl).searchParams.get("state")!;
  const callback = await fetch(`${baseUrl}${EXTERNAL_MCP_OAUTH_CALLBACK_PATH}/${SERVER_ID}?state=${encodeURIComponent(state)}&error=access_denied`);
  assert.equal(callback.status, 400);
  assert.match(await callback.text(), /Couldn’t finish connecting/);
  assert.deepEqual(http.requests, []);
});

test("a workspace id that is not this site's is 404 on every OAuth route", async (t) => {
  const { app } = await buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const other = `/api/admin/v1/workspaces/not-this-site/mcp-servers/${SERVER_ID}`;

  assert.equal((await req(baseUrl, `${other}/oauth/connect`, cookie, { method: "POST", body: "{}" })).status, 404);
  assert.equal((await req(baseUrl, `${other}/oauth/device/poll`, cookie, { method: "POST", body: "{}" })).status, 404);
  assert.equal((await req(baseUrl, `${other}/oauth`, cookie, { method: "DELETE" })).status, 404);
});

test("connecting a server that is not OAuth-authenticated is a 400 naming the field, not a 500", async (t) => {
  const { app, deps } = await buildTestApp();
  await saveExternalMcpServer(
    {
      repo: deps.externalMcpServerRepo,
      sealer: deps.siteAssistantSecretSealer,
      keyring: deps.siteAssistantSecretKeyring,
      clock: deps.clock,
    },
    {
      workspaceId: deps.workspaceId,
      serverId: "plain",
      transport: "stdio",
      authMode: "static_env",
      enabled: true,
      command: "npx",
      args: "-y plain-mcp",
      allowedToolNames: "",
      writeAllowedToolNames: "",
      principalId: "owner",
    },
  );
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const response = await req(
    baseUrl,
    `/api/admin/v1/workspaces/${WORKSPACE_ID}/mcp-servers/plain/oauth/connect`,
    cookie,
    { method: "POST", body: "{}" },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "external MCP server 'plain' is not configured to use OAuth",
    code: "INVALID_MCP_SERVER",
    details: { field: "authMode" },
  });
});

test("disconnect clears the authorization but keeps the server row", async (t) => {
  const { app } = await buildTestApp({
    script: [{ json: { access_token: "at-wire", refresh_token: "rt-wire", expires_in: 3600 } }],
  });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const connect = await req(baseUrl, `${BASE}/oauth/connect`, cookie, { method: "POST", body: "{}" });
  const { auth } = (await connect.json()) as { auth: { authorizationUrl: string } };
  const state = new URL(auth.authorizationUrl).searchParams.get("state") ?? "";
  const callback = await fetch(`${baseUrl}${EXTERNAL_MCP_OAUTH_CALLBACK_PATH}/${SERVER_ID}?state=${encodeURIComponent(state)}&code=c`);
  assert.equal(callback.status, 200);
  const before = await (await req(baseUrl, `/api/admin/v1/workspaces/${WORKSPACE_ID}/mcp-servers`, cookie)).text();
  assert.ok(before.includes('"status":"connected"'));
  assert.ok(before.includes('"hasStoredToken":true'));

  const response = await req(baseUrl, `${BASE}/oauth`, cookie, { method: "DELETE" });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { disconnected: true, restartRequired: true });
  const list = await (await req(baseUrl, `/api/admin/v1/workspaces/${WORKSPACE_ID}/mcp-servers`, cookie)).text();
  assert.ok(list.includes(`"serverId":"${SERVER_ID}"`), "the row survives — only the authorization is dropped");
  assert.ok(list.includes('"status":"disconnected"'));
  assert.ok(list.includes('"hasStoredToken":false'));
});
