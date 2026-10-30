// openid-client validates token_type; successful provider fixtures include the required wire field.
import { externalMcpVaultRecord, sealExternalMcpVaultPayload } from "../external-mcp-vault.js";
import { createOAuthProviderRegistry, MAX_AUTHORIZATION_STATE_LENGTH, OAuthError } from "@jini-ai/oauth";
import { formatAad } from "@jini-ai/platform/secrets";
import { createTovuOAuthGuard } from "../../../platform/oauth/endpoint-safety.js";
import assert from "node:assert/strict";
import test from "node:test";

import { ToolInputError } from "@jini-ai/core";

import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import type { KeyringPort, SecretSealerPort } from "../../webhooks/ports.js";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { type OAuthProviderDescriptor } from "../../../platform/oauth/index.js";
import { createDeviceAuthorizationStore, createExternalMcpConnectionGate, createExternalMcpOAuthService, ExternalMcpReauthRequiredError, externalMcpSettingsDeepLink } from "../external-mcp-oauth.js";
import { ExternalMcpConnectionRevokedError } from "../external-mcp-revocation.js";
import { InMemoryExternalMcpServerRepo } from "../external-mcp-store.memory.js";
import { ExternalMcpValidationError, ExternalMcpSecretStoreUnconfiguredError, externalMcpAdmissionRevision, listExternalMcpServerViews, openExternalMcpOAuthPayload, readEnabledExternalMcpConfigs, saveExternalMcpServer } from "../external-mcp-store.js";
import { type ExternalMcpServerRepoPort } from "../contracts.js";
import type { FederatedCallTarget } from "@jini-ai/mcp/federation";

/**
 * @file `external-mcp-oauth.ts` — the join between the generic OAuth client and one connection row.
 *
 * What this file proves, in order of how much it would hurt to get wrong:
 * 1. `needs_reauth` is reached on a dead grant, is DURABLE, and clears the stored token.
 * 2. The terminal error a model sees literally tells it to stop.
 * 3. `expiresAt` lands in PLAINTEXT on the row — readable with no sealer at all.
 * 4. A refreshed token is resealed WITHOUT losing the client secret sharing its blob.
 * 5. A slow provider at connect time fails once, fast, with no retry.
 * 6. A `needs_reauth` connection is reported at boot rather than silently contributing no tools.
 */

const WORKSPACE = "workspace-1";
const SERVER = "higgs";
const REDIRECT_URI = "https://tovu.example.com/api/mcp-servers/oauth/callback/higgs";

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

function scriptedFetch(script: readonly ScriptStep[], options: { rejectReplayedCodes?: boolean } = {}): { fetchFn: typeof fetch; callCount(): number; requests: { url: string; init: RequestInit | undefined }[] } {
  let calls = 0;
  const usedCodes = new Set<string>();
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    requests.push({ url: String(url), init });
    const step = script[Math.min(calls, script.length - 1)] ?? {};
    calls += 1;
    const form = new URLSearchParams(String(init?.body));
    if (options.rejectReplayedCodes && form.get("grant_type") === "authorization_code") {
      const code = form.get("code") ?? "";
      if (usedCodes.has(code)) return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
      usedCodes.add(code);
    }
    if (step.throws) throw step.throws;
    return new Response(JSON.stringify(step.json ?? {}), {
      status: step.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { fetchFn, callCount: () => calls, requests };
}

function makeClock(startIso = "2026-08-25T12:00:00.000Z") {
  let nowMs = Date.parse(startIso);
  return {
    nowMs: () => nowMs,
    nowIso: () => new Date(nowMs).toISOString(),
    advance: (ms: number) => {
      nowMs += ms;
    },
  };
}

async function makeHarness(options: { script?: readonly ScriptStep[]; grant?: string; clientAuth?: OAuthProviderDescriptor['clientAuth']; rejectReplayedCodes?: boolean } = {}) {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const clock = makeClock();
  const http = scriptedFetch(options.script ?? [], options);

  await saveExternalMcpServer(
    { repo, sealer, keyring, clock },
    {
      workspaceId: WORKSPACE,
      serverId: SERVER,
      label: "Higgs",
      transport: "stdio",
      authMode: "oauth",
      enabled: true,
      command: "npx",
      args: "-y higgs-mcp",
      allowedToolNames: "generate_image",
      // generate_image is an unannotated write, so the per-call grant check needs "may write".
      writeAllowedToolNames: "generate_image",
      principalId: "principal-1",
      oauth: {
        providerId: PROVIDER.providerId,
        grant: options.grant ?? "authorization_code",
        clientId: "tovu-client",
        clientSecret: "s3cr3t",
        scopes: "images:generate",
        tokenEnvName: "HIGGS_TOKEN",
      },
    },
  );

  const service = createExternalMcpOAuthService({
    workspaceId: WORKSPACE,
    repo,
    sealer,
    keyring,
    clock,
    devices: createDeviceAuthorizationStore(),
    httpPorts: { guard: createTovuOAuthGuard({}, { allowLoopbackHttp: true }),
      fetchFn: ({ url }, init) => (http.fetchFn)(url, init) },
    lookupProvider: () => ({ ...PROVIDER, clientAuth: options.clientAuth ?? PROVIDER.clientAuth }),
  });

  return { repo, sealer, keyring, clock, http, service };
}

async function readRow(repo: InMemoryExternalMcpServerRepo) {
  const row = await repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });
  assert.ok(row);
  return row;
}

for (const typedEndpoints of [false, true]) {
  test(`beginConnect persists the discovered protected resource (${typedEndpoints ? "typed" : "discovered"} endpoints)`, async () => {
    const resource = "https://mcp.example.com/mcp";
    const { repo, service, http } = await makeHarness({ script: [
      { json: { resource, authorization_servers: ["https://auth.example.com"] } },
      { json: {
        issuer: "https://auth.example.com", authorization_endpoint: PROVIDER.authorizationEndpoint,
        token_endpoint: PROVIDER.tokenEndpoint, grant_types_supported: ["authorization_code"],
      } },
    ] });
    const tokenEndpoint = typedEndpoints ? "https://auth.example.com/custom-token" : PROVIDER.tokenEndpoint;
    await repo.upsert({ ...await readRow(repo), transport: "streamable_http", url: resource,
      oauthProviderId: null, oauthGrant: null,
      oauthEndpointsJson: typedEndpoints ? JSON.stringify({ tokenEndpoint }) : null });

    const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });

    assert.equal(started.kind, "redirect_required");
    assert.equal(new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("resource"), resource);
    const stored = JSON.parse((await readRow(repo)).oauthEndpointsJson!);
    assert.equal(stored.resource, resource);
    assert.equal(stored.tokenEndpoint, tokenEndpoint, "discovery must preserve operator-typed endpoints");
    assert.equal(http.callCount(), 2, "resource and endpoints come from the same discovery");
  });
}

for (const resource of ["https://vendor.example.com/protected-api", undefined]) {
  test(`redirect, code exchange and refresh ${resource ? "retain the stored resource" : "support legacy rows without a resource"}`, async () => {
    const { repo, service, http, clock } = await makeHarness({ script: [
      { json: { token_type: "Bearer", access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } },
      { json: { token_type: "Bearer", access_token: "at-2", refresh_token: "rt-2", expires_in: 3600 } },
    ] });
    await repo.upsert({ ...await readRow(repo), oauthEndpointsJson: JSON.stringify({ resource }) });
    const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
    assert.equal(started.kind, "redirect_required");
    const authorizationUrl = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "");
    assert.equal(authorizationUrl.searchParams.get("resource"), resource ?? null);
    await service.completeAuthorizationCallback({ serverId: SERVER, redirectUri: REDIRECT_URI,
      params: { state: authorizationUrl.searchParams.get("state")!, code: "auth-code" } });
    clock.advance(60 * 60 * 1000);

    assert.equal(await service.tokenResolver.resolveAccessToken({ serverId: SERVER }), "at-2");
    assert.equal(http.requests.length, 2);
    for (const request of http.requests) {
      assert.equal(new URLSearchParams(String(request.init?.body)).get("resource"), resource ?? null);
    }
  });

  test(`device start and poll ${resource ? "use the stored resource" : "support legacy rows without a resource"}`, async () => {
    const { repo, service, http } = await makeHarness({ grant: "device_code", script: [
      { json: { device_code: "dc-1", user_code: "UC-1", verification_uri: "https://auth.example.com/device", expires_in: 600, interval: 1 } },
      { json: { token_type: "Bearer", access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } },
    ] });
    await repo.upsert({ ...await readRow(repo), oauthEndpointsJson: JSON.stringify({ resource }) });

    assert.equal((await service.beginConnect({ serverId: SERVER })).kind, "device_code");
    assert.deepEqual(await service.pollDeviceAuthorization({ serverId: SERVER }), { status: "connected" });
    assert.equal(http.requests.length, 2);
    for (const request of http.requests) {
      assert.equal(new URLSearchParams(String(request.init?.body)).get("resource"), resource ?? null);
    }
  });
}

/** Runs a full redirect handshake: start it, read the `state` back off the authorization URL the
 *  browser would have followed, and complete the callback with it. */
async function connect(service: ReturnType<typeof createExternalMcpOAuthService>, code = "auth-code"): Promise<void> {
  const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  assert.equal(started.kind, "redirect_required");
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state");
  await service.completeAuthorizationCallback({ serverId: SERVER, redirectUri: REDIRECT_URI, params: { state: state ?? "", code } });
}

test("saving an OAuth connection stores its identity in plaintext and its secret sealed", async () => {
  const { repo, sealer } = await makeHarness();
  const row = await readRow(repo);

  assert.equal(row.authMode, "oauth");
  assert.equal(row.oauthClientId, "tovu-client");
  assert.equal(row.oauthGrant, "authorization_code");
  assert.equal(row.oauthScopesJson, JSON.stringify(["images:generate"]));
  assert.equal(row.oauthTokenEnvName, "HIGGS_TOKEN");
  // The secret is not on the row in the clear...
  assert.ok(row.sealedOAuth !== null);
  assert.ok(!JSON.stringify(row.sealedOAuth).includes("s3cr3t"));
  // ...but it is what the blob holds.
  assert.equal((await openExternalMcpOAuthPayload(sealer, row)).clientSecret, "s3cr3t");
});

test("the admin read model never carries a token, a refresh token, or a client secret", async () => {
  const { repo, service } = await makeHarness({
    script: [{ json: { token_type: "Bearer", access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }],
  });
  await connect(service);

  const [view] = await listExternalMcpServerViews({ repo }, WORKSPACE);

  assert.ok(view);
  const serialized = JSON.stringify(view);
  assert.ok(!serialized.includes("at-1"), "the access token must never reach the read model");
  assert.ok(!serialized.includes("rt-1"), "the refresh token must never reach the read model");
  assert.ok(!serialized.includes("s3cr3t"), "the client secret must never reach the read model");
  assert.equal(view.oauth.status, "connected");
  assert.equal(view.oauth.hasStoredToken, true);
});

test("a completed handshake writes expiresAt in PLAINTEXT — readable with no sealer at all", async () => {
  const { repo, service } = await makeHarness({
    script: [{ json: { token_type: "Bearer", access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }],
  });

  const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  assert.equal(started.kind, "redirect_required");
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state");
  await service.completeAuthorizationCallback({ serverId: SERVER, redirectUri: REDIRECT_URI, params: { state: state ?? "", code: "auth-code" } });

  const row = await readRow(repo);
  assert.equal(row.oauthStatus, "connected");
  // The whole point of the plaintext column: this assertion touches no keyring and no sealer.
  assert.equal(row.oauthExpiresAt, "2026-08-25T13:00:00.000Z");
});

test("beginConnect moves the row to `pending` without contacting the provider for the redirect grant", async () => {
  const { repo, http, service } = await makeHarness();

  await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });

  assert.equal((await readRow(repo)).oauthStatus, "pending");
  assert.equal(http.callCount(), 0, "the browser asks the provider, not this process");
});

test("a provider that is unreachable at connect time fails ONCE, fast, and is not retried", async () => {
  const { http, service } = await makeHarness({
    script: [{ throws: Object.assign(new Error("timed out"), { name: "TimeoutError" }) }],
  });
  const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state");

  let caught: unknown;
  try {
    await service.completeAuthorizationCallback({ serverId: SERVER, redirectUri: REDIRECT_URI, params: { state: state ?? "", code: "c" } });
  } catch (error) {
    caught = error;
  }

  assert.ok(caught instanceof OAuthError);
  assert.equal(caught.code, "OAUTH_PROVIDER_UNREACHABLE");
  assert.equal(caught.retryable, false);
  assert.equal(http.callCount(), 1, "an authorization code is single-use — retrying can burn one that worked");
});

test("a replayed code reaches the provider once and its single-use check rejects it", async () => {
  const { http, service } = await makeHarness({
    rejectReplayedCodes: true,
    script: [{ json: { token_type: "Bearer", access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }],
  });
  const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state");
  const params = { state: state ?? "", code: "auth-code" };

  await service.completeAuthorizationCallback({ serverId: SERVER, redirectUri: REDIRECT_URI, params });

  await assert.rejects(
    () => service.completeAuthorizationCallback({ serverId: SERVER, redirectUri: REDIRECT_URI, params }),
    (error: unknown) => error instanceof OAuthError && error.code === "OAUTH_INVALID_GRANT" && error.providerErrorCode === "invalid_grant",
  );
  assert.equal(http.callCount(), 2);
});

test("a refresh reseals the token WITHOUT losing the client secret sharing its blob", async () => {
  const { repo, sealer, clock, service } = await makeHarness({
    script: [
      { json: { token_type: "Bearer", access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } },
      { json: { token_type: "Bearer", access_token: "at-2", refresh_token: "rt-2", expires_in: 3600 } },
    ],
  });
  const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state");
  await service.completeAuthorizationCallback({ serverId: SERVER, redirectUri: REDIRECT_URI, params: { state: state ?? "", code: "c" } });

  clock.advance(60 * 60 * 1000);
  assert.equal(await service.tokenResolver.resolveAccessToken({ serverId: SERVER }), "at-2");

  const payload = await openExternalMcpOAuthPayload(sealer, await readRow(repo));
  assert.equal(payload.tokens?.accessToken, "at-2");
  assert.equal(payload.tokens?.refreshToken, "rt-2");
  assert.equal(payload.clientSecret, "s3cr3t", "a writer that seals { tokens } alone deletes the client secret");
  assert.equal((await readRow(repo)).oauthExpiresAt, "2026-08-25T14:00:00.000Z");
});

test('refresh POST carries the saved refresh token and unsealed client secret to the token endpoint', async () => {
  const { clock, http, service } = await makeHarness({
    clientAuth: 'client_secret_post',
    script: [
      { json: { token_type: "Bearer", access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600 } },
      { json: { token_type: "Bearer", access_token: 'at-2', refresh_token: 'rt-2', expires_in: 3600 } },
    ],
  });
  await connect(service);
  clock.advance(60 * 60 * 1000);
  assert.equal(await service.tokenResolver.resolveAccessToken({ serverId: SERVER }), 'at-2');
  assert.equal(http.requests.length, 2);
  const request = http.requests[1]!;
  assert.equal(request.url, PROVIDER.tokenEndpoint);
  assert.equal(request.init?.method, 'POST');
  // openid-client serializes the form with an explicit UTF-8 charset.
  assert.equal(new Headers(request.init?.headers).get('content-type'), 'application/x-www-form-urlencoded;charset=UTF-8');
  const body = new URLSearchParams(String(request.init?.body));
  assert.equal(body.get('grant_type'), 'refresh_token');
  assert.equal(body.get('refresh_token'), 'rt-1');
  assert.equal(body.get('client_id'), 'tovu-client');
  assert.equal(body.get('client_secret'), 's3cr3t');
});

test("a provider answering invalid_grant transitions to needs_reauth, clears the token, and surfaces a non-retryable error", async () => {
  const { repo, sealer, clock, service } = await makeHarness({
    script: [
      { json: { token_type: "Bearer", access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } },
      { status: 400, json: { error: "invalid_grant" } },
    ],
  });
  const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state");
  await service.completeAuthorizationCallback({ serverId: SERVER, redirectUri: REDIRECT_URI, params: { state: state ?? "", code: "c" } });
  clock.advance(60 * 60 * 1000);

  let caught: unknown;
  try {
    await service.tokenResolver.resolveAccessToken({ serverId: SERVER });
  } catch (error) {
    caught = error;
  }

  assert.ok(caught instanceof ExternalMcpReauthRequiredError);
  assert.equal(caught.retryable, false);
  assert.equal(caught.code, "EXTERNAL_MCP_REAUTH_REQUIRED");
  assert.equal(
    caught.message,
    '"Higgs" is disconnected: its authorization expired or was revoked. Ask the operator to reconnect it in Settings → External MCP. Do not retry this tool.',
  );
  assert.equal(caught.settingsLink, "/settings/external-mcp?server=higgs");

  const row = await readRow(repo);
  assert.equal(row.oauthStatus, "needs_reauth");
  assert.equal(row.oauthExpiresAt, null);
  const payload = await openExternalMcpOAuthPayload(sealer, row);
  assert.equal(payload.tokens, undefined, "a known-dead credential must not stay on the row");
  assert.equal(payload.clientSecret, "s3cr3t", "the client secret sharing the blob must survive the clear");
});

test("markNeedsReauth clears the token but PRESERVES the client secret sharing its blob", async () => {
  // For a dynamically-registered (RFC 7591) client the operator never saw this secret, so losing it
  // here means the row can never be re-authorized again — only deleted and recreated from scratch.
  const { repo, sealer, clock, service } = await makeHarness({
    script: [
      { json: { token_type: "Bearer", access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } },
      { status: 400, json: { error: "invalid_grant" } },
    ],
  });
  await connect(service);
  clock.advance(60 * 60 * 1000);

  await assert.rejects(() => service.tokenResolver.resolveAccessToken({ serverId: SERVER }));

  const row = await readRow(repo);
  assert.equal(row.oauthStatus, "needs_reauth");
  assert.ok(row.sealedOAuth !== null, "the client secret must not be wiped along with the dead token");
  const payload = await openExternalMcpOAuthPayload(sealer, row);
  assert.equal(payload.clientSecret, "s3cr3t");
  assert.equal(payload.tokens, undefined);
});

test("needs_reauth is DURABLE — a second call does not re-probe the provider", async () => {
  const { http, clock, service } = await makeHarness({
    script: [
      { json: { token_type: "Bearer", access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } },
      { status: 400, json: { error: "invalid_grant" } },
    ],
  });
  const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state");
  await service.completeAuthorizationCallback({ serverId: SERVER, redirectUri: REDIRECT_URI, params: { state: state ?? "", code: "c" } });
  clock.advance(60 * 60 * 1000);

  await assert.rejects(() => service.tokenResolver.resolveAccessToken({ serverId: SERVER }));
  const callsAfterFirst = http.callCount();
  await assert.rejects(() => service.tokenResolver.resolveAccessToken({ serverId: SERVER }));

  assert.equal(http.callCount(), callsAfterFirst, "a durable state must not be re-tested on every tool call");
});

test("a TRANSIENT refresh failure does not mark the connection needs_reauth", async () => {
  const { repo, clock, service } = await makeHarness({
    script: [
      { json: { token_type: "Bearer", access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } },
      { throws: Object.assign(new Error("timed out"), { name: "TimeoutError" }) },
    ],
  });
  const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state");
  await service.completeAuthorizationCallback({ serverId: SERVER, redirectUri: REDIRECT_URI, params: { state: state ?? "", code: "c" } });
  clock.advance(60 * 60 * 1000);

  await assert.rejects(
    () => service.tokenResolver.resolveAccessToken({ serverId: SERVER }),
    (error: unknown) => error instanceof OAuthError && error.code === "OAUTH_PROVIDER_UNREACHABLE",
  );

  const row = await readRow(repo);
  assert.equal(row.oauthStatus, "connected", "a provider having a bad minute must not nag the operator");
  assert.ok(row.sealedOAuth !== null);
});

test("boot-time federation injects the access token into the operator's chosen env variable", async () => {
  const { repo, sealer, service } = await makeHarness({
    script: [{ json: { token_type: "Bearer", access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }],
  });
  const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state");
  await service.completeAuthorizationCallback({ serverId: SERVER, redirectUri: REDIRECT_URI, params: { state: state ?? "", code: "c" } });

  const { configs, failures } = await readEnabledExternalMcpConfigs({ repo, sealer, oauth: service.tokenResolver }, WORKSPACE);

  assert.deepEqual(failures, []);
  assert.equal(configs.length, 1);
  assert.equal(configs[0]?.authMode, "oauth");
  const target = configs[0]?.target;
  assert.equal(target?.kind, "stdio");
  assert.deepEqual(target?.kind === "stdio" ? target.env : null, { HIGGS_TOKEN: "at-1" });
});

test("a needs_reauth connection is REPORTED at boot, not silently dropped", async () => {
  const { repo, sealer, clock, service } = await makeHarness({
    script: [
      { json: { token_type: "Bearer", access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } },
      { status: 400, json: { error: "invalid_grant" } },
    ],
  });
  const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state");
  await service.completeAuthorizationCallback({ serverId: SERVER, redirectUri: REDIRECT_URI, params: { state: state ?? "", code: "c" } });
  clock.advance(60 * 60 * 1000);
  await assert.rejects(() => service.tokenResolver.resolveAccessToken({ serverId: SERVER }));

  const { configs, failures } = await readEnabledExternalMcpConfigs({ repo, sealer, oauth: service.tokenResolver }, WORKSPACE);

  assert.deepEqual(configs, []);
  assert.deepEqual(failures, [
    { serverId: SERVER, reason: "its authorization expired or was revoked — reconnect it in Settings → External MCP" },
  ]);
});

test("an OAuth row read by a process with no token resolver is reported rather than launched credential-free", async () => {
  const { repo, sealer } = await makeHarness();

  const { configs, failures } = await readEnabledExternalMcpConfigs({ repo, sealer }, WORKSPACE);

  assert.deepEqual(configs, []);
  assert.equal(failures.length, 1);
  assert.equal(failures[0]?.reason, "it has not been authorized yet (status 'disconnected') — connect it in Settings → External MCP");
});

// ---------------------------------------------------------------------------
// reportAuthFailure — discovering a dead grant MID-SESSION, from a live 401/403, rather than at the
// boot-time refresh `tokenResolver.resolveAccessToken` already covers. Wired as
// `mcp-federation/registrations.ts`'s `FederationDeps.onAuthFailed`.
// ---------------------------------------------------------------------------

test("reportAuthFailure marks needs_reauth, preserves the client secret, and surfaces the same terminal error tokenResolver throws", async () => {
  const { repo, sealer, service } = await makeHarness({
    script: [{ json: { token_type: "Bearer", access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }],
  });
  await connect(service);

  // What `adapter.http.ts` actually throws when the remote rejects a live call — the token was
  // valid at boot, so `tokenResolver` never ran again; there is no periodic refresh (see 4c).
  const liveAuthFailure = new Error(
    "mcp-federation: the server refused 'tools/call' with 401 — its authorization has expired or been revoked, reconnect it in Settings → External MCP",
  );

  let caught: unknown;
  try {
    await service.reportAuthFailure(SERVER, liveAuthFailure);
  } catch (error) {
    caught = error;
  }

  assert.ok(caught instanceof ExternalMcpReauthRequiredError);
  assert.equal(caught.retryable, false);
  assert.match(caught.message, /Do not retry this tool\.$/);

  const row = await readRow(repo);
  assert.equal(row.oauthStatus, "needs_reauth");
  const payload = await openExternalMcpOAuthPayload(sealer, row);
  assert.equal(payload.tokens, undefined, "the now-known-dead token must not stay on the row");
  assert.equal(payload.clientSecret, "s3cr3t", "the client secret must survive a live auth failure too, not just a refresh-time one");
});

test("reportAuthFailure is idempotent against a connection already needs_reauth — it does not re-clear or re-timestamp the row", async () => {
  const { repo, clock, service } = await makeHarness({
    script: [
      { json: { token_type: "Bearer", access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } },
      { status: 400, json: { error: "invalid_grant" } },
    ],
  });
  await connect(service);
  clock.advance(60 * 60 * 1000);
  await assert.rejects(() => service.tokenResolver.resolveAccessToken({ serverId: SERVER }));
  const rowAfterFirstMark = await readRow(repo);
  assert.equal(rowAfterFirstMark.oauthStatus, "needs_reauth");

  clock.advance(5_000); // a later live call discovering the SAME already-durable state

  await assert.rejects(
    () => service.reportAuthFailure(SERVER, new Error("boom")),
    (error: unknown) => error instanceof ExternalMcpReauthRequiredError,
  );

  const rowAfterSecondCall = await readRow(repo);
  assert.equal(
    rowAfterSecondCall.updatedAt,
    rowAfterFirstMark.updatedAt,
    "an already-durable state must not be rewritten on every subsequent discovery",
  );
});

test("reportAuthFailure passes a non-OAuth connection's error through unchanged — there is no reauth state to record", async () => {
  const { repo, sealer, keyring, clock, service } = await makeHarness();
  await saveExternalMcpServer(
    { repo, sealer, keyring, clock },
    {
      workspaceId: WORKSPACE,
      serverId: "plain",
      transport: "stdio",
      authMode: "static_env",
      enabled: true,
      command: "npx",
      args: "-y plain-mcp",
      allowedToolNames: "",
      writeAllowedToolNames: "",
      principalId: "principal-1",
    },
  );
  const original = new Error("mcp-federation: the server answered 'tools/call' with HTTP 500");

  await assert.rejects(() => service.reportAuthFailure("plain", original), (error: unknown) => error === original);
});

test("disconnect clears the token, preserves the client secret, and returns the row to disconnected", async () => {
  const { repo, sealer, service } = await makeHarness({
    script: [{ json: { token_type: "Bearer", access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }],
  });
  const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state");
  await service.completeAuthorizationCallback({ serverId: SERVER, redirectUri: REDIRECT_URI, params: { state: state ?? "", code: "c" } });

  await service.disconnect({ serverId: SERVER });

  const row = await readRow(repo);
  assert.equal(row.oauthStatus, "disconnected");
  assert.equal(row.oauthExpiresAt, null);
  const payload = await openExternalMcpOAuthPayload(sealer, row);
  assert.equal(payload.tokens, undefined);
  assert.equal(payload.clientSecret, "s3cr3t", "disconnecting must not destroy a client secret the operator may never see again");
});

test("disconnect stops the read model claiming a stored token — even though the sealed blob survives", async () => {
  const { repo, service } = await makeHarness({
    script: [{ json: { token_type: "Bearer", access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }],
  });
  await connect(service);
  assert.equal((await listExternalMcpServerViews({ repo }, WORKSPACE))[0]?.oauth.hasStoredToken, true);

  await service.disconnect({ serverId: SERVER });

  const [view] = await listExternalMcpServerViews({ repo }, WORKSPACE);
  assert.ok(view, "the row survives a disconnect — only the authorization is dropped");
  assert.equal(view.oauth.status, "disconnected");
  assert.equal(view.oauth.hasStoredToken, false, "the API must not report a stored token for a disconnected connection");
  // Why this was ever wrong: the blob is still on the row, holding the client secret the sibling
  // test pins. Blob presence therefore cannot be what `hasStoredToken` reads.
  assert.notEqual((await readRow(repo)).sealedOAuth, null, "the preserved client secret's blob must still be on the row");
});

test("the device grant returns a user code and verification URL, and never exposes the device code", async () => {
  const { service } = await makeHarness({
    grant: "device_code",
    script: [
      {
        json: {
          device_code: "device-secret",
          user_code: "WDJB-MJHT",
          verification_uri: "https://auth.example.com/activate",
          expires_in: 900,
          interval: 5,
        },
      },
    ],
  });

  const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });

  assert.equal(started.kind, "device_code");
  assert.ok(!JSON.stringify(started).includes("device-secret"), "the device code must stay server-side");
  if (started.kind === "device_code") {
    assert.equal(started.userCode, "WDJB-MJHT");
    assert.equal(started.verificationUri, "https://auth.example.com/activate");
    assert.equal(started.intervalSeconds, 5);
  }
});

/**
 * ---------------------------------------------------------------------------
 * `redirectUri` is optional, and the GRANT decides whether one is needed
 * ---------------------------------------------------------------------------
 * `beginConnect` used to take a required `redirectUri: string`, which pushed the "do we have a
 * public origin?" question up to every caller — and the caller that has no live HTTP request to
 * derive one from (`features/external-mcp/tool-registrations.ts`'s `external_mcp_oauth_connect`)
 * therefore refused EVERY connect when `TOVU_PUBLIC_URL` was unset, including the device grant,
 * which never uses a redirect URI at all. The grant is the only thing that knows, so it decides here.
 */

test("the device grant needs no redirect URI at all — beginConnect starts without one", async () => {
  const { service } = await makeHarness({
    grant: "device_code",
    script: [
      {
        json: {
          device_code: "device-secret",
          user_code: "WDJB-MJHT",
          verification_uri: "https://auth.example.com/activate",
          expires_in: 900,
          interval: 5,
        },
      },
    ],
  });

  const started = await service.beginConnect({ serverId: SERVER });

  assert.equal(started.kind, "device_code");
  if (started.kind === "device_code") assert.equal(started.userCode, "WDJB-MJHT");
});

test("the authorization-code grant with no redirect URI is refused with a message naming TOVU_PUBLIC_URL", async () => {
  const { service } = await makeHarness({ grant: "authorization_code", script: [{ json: {} }] });

  await assert.rejects(
    () => service.beginConnect({ serverId: SERVER }),
    (error: unknown) => {
      assert.ok(error instanceof Error, `expected an Error, got ${String(error)}`);
      assert.match(
        (error as Error).message,
        /TOVU_PUBLIC_URL/,
        "an authorization-code redirect genuinely IS required — the refusal has to say what to set, not just refuse",
      );
      return true;
    },
  );
});

test("polling a device authorization reports pending, then connects, and stores the token", async () => {
  const { repo, sealer, service } = await makeHarness({
    grant: "device_code",
    script: [
      { json: { device_code: "device-secret", user_code: "WDJB-MJHT", verification_uri: "https://auth.example.com/activate", expires_in: 900, interval: 5 } },
      { status: 400, json: { error: "authorization_pending" } },
      { json: { token_type: "Bearer", access_token: "at-device", refresh_token: "rt-device", expires_in: 3600 } },
    ],
  });
  await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });

  assert.deepEqual(await service.pollDeviceAuthorization({ serverId: SERVER }), { status: "pending", retryAfterSeconds: 5 });
  assert.deepEqual(await service.pollDeviceAuthorization({ serverId: SERVER }), { status: "connected" });

  const row = await readRow(repo);
  assert.equal(row.oauthStatus, "connected");
  assert.equal(row.oauthExpiresAt, "2026-08-25T13:00:00.000Z");
  const payload = await openExternalMcpOAuthPayload(sealer, row);
  assert.equal(payload.tokens?.accessToken, 'at-device');
  assert.equal(payload.tokens?.refreshToken, 'rt-device');
  assert.equal(await service.tokenResolver.resolveAccessToken({ serverId: SERVER }), 'at-device');
});

test("a declined device authorization is terminal and drops the in-flight attempt", async () => {
  const { repo, service } = await makeHarness({
    grant: "device_code",
    script: [
      { json: { device_code: "device-secret", user_code: "WDJB-MJHT", verification_uri: "https://auth.example.com/activate", expires_in: 900, interval: 5 } },
      { status: 400, json: { error: "access_denied" } },
    ],
  });
  await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });

  await assert.rejects(
    () => service.pollDeviceAuthorization({ serverId: SERVER }),
    (error: unknown) => error instanceof OAuthError && error.code === "OAUTH_ACCESS_DENIED" && error.retryable === false,
  );

  assert.equal((await readRow(repo)).oauthStatus, "disconnected");
  await assert.rejects(
    () => service.pollDeviceAuthorization({ serverId: SERVER }),
    (error: unknown) => error instanceof OAuthError && error.code === "OAUTH_INVALID_STATE",
  );
});

test("re-pointing an OAuth connection's client id discards the token it no longer matches", async () => {
  const { repo, sealer, keyring, clock, service } = await makeHarness({
    script: [{ json: { token_type: "Bearer", access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }],
  });
  const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state");
  await service.completeAuthorizationCallback({ serverId: SERVER, redirectUri: REDIRECT_URI, params: { state: state ?? "", code: "c" } });
  assert.equal((await readRow(repo)).oauthStatus, "connected");

  await saveExternalMcpServer(
    { repo, sealer, keyring, clock },
    {
      workspaceId: WORKSPACE,
      serverId: SERVER,
      transport: "stdio",
      authMode: "oauth",
      enabled: true,
      command: "npx",
      args: "-y higgs-mcp",
      allowedToolNames: "generate_image",
      writeAllowedToolNames: "",
      principalId: "principal-1",
      oauth: { clientId: "a-different-client" },
    },
  );

  const row = await readRow(repo);
  assert.equal(row.oauthStatus, "disconnected");
  assert.equal(row.oauthExpiresAt, null);
  assert.equal((await openExternalMcpOAuthPayload(sealer, row)).tokens, undefined);
});

test("a save that changes nothing about the OAuth binding leaves the live connection alone", async () => {
  const { repo, sealer, keyring, clock, service } = await makeHarness({
    script: [{ json: { token_type: "Bearer", access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }],
  });
  const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state");
  await service.completeAuthorizationCallback({ serverId: SERVER, redirectUri: REDIRECT_URI, params: { state: state ?? "", code: "c" } });

  // The shape an enable/disable toggle sends: nothing about OAuth changes.
  await saveExternalMcpServer(
    { repo, sealer, keyring, clock },
    {
      workspaceId: WORKSPACE,
      serverId: SERVER,
      transport: "stdio",
      enabled: false,
      command: "npx",
      args: "-y higgs-mcp",
      allowedToolNames: "generate_image",
      writeAllowedToolNames: "",
      principalId: "principal-1",
    },
  );

  const row = await readRow(repo);
  assert.equal(row.enabled, false);
  assert.equal(row.oauthStatus, "connected", "an operator toggling a server must not have to re-authorize it");
  assert.equal((await openExternalMcpOAuthPayload(sealer, row)).tokens?.accessToken, "at-1");
});

test("the settings deep link escapes its server id", () => {
  assert.equal(externalMcpSettingsDeepLink("a b&c"), "/settings/external-mcp?server=a%20b%26c");
});

// ---------------------------------------------------------------------------
// The federation liveness-and-revocation gate
//
// Federated tools are registered once and never unregistered — `buildToolCatalogQuery` snapshots the
// registry into a one-shot FTS index, so removal would leave a tool discoverable but unexecutable.
// This gate is what makes a dead OR REVOKED connection refuse at the call instead of the model
// looping on it. `external-mcp-connection-revocation.test.ts` exercises the same gate end to end,
// through the real daemon wiring; this section exercises `createExternalMcpConnectionGate` directly.
// ---------------------------------------------------------------------------

/** A roster call target for `SERVER`'s admitted `remoteName`, computed from the row's CURRENT
 *  admission revision — the shape `toResolvedFederatedConnections` would have stamped onto it at
 *  admission time, reconstructed here since these tests build the gate directly rather than through
 *  `attachFederatedMcpTools`. */
async function rosterCallTarget(repo: InMemoryExternalMcpServerRepo, serverId: string, remoteName: string): Promise<FederatedCallTarget> {
  const row = await repo.findByServerId({ workspaceId: WORKSPACE, serverId });
  assert.ok(row, `expected a row for '${serverId}'`);
  return { remoteName, declaredAnnotations: undefined, origin: { kind: "roster", admissionRevision: externalMcpAdmissionRevision(row) } };
}

test("the connection gate lets a healthy OAuth connection through", async () => {
  const { repo, service } = await makeHarness({
    script: [{ json: { token_type: "Bearer", access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }],
  });
  await connect(service);
  const gate = createExternalMcpConnectionGate({ workspaceId: WORKSPACE, repo });

  await gate(SERVER, await rosterCallTarget(repo, SERVER, "generate_image"));
});

test("the connection gate refuses a needs_reauth connection with the terminal, model-legible error", async () => {
  const { repo, clock, service } = await makeHarness({
    script: [
      { json: { token_type: "Bearer", access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } },
      { status: 400, json: { error: "invalid_grant" } },
    ],
  });
  await connect(service);
  clock.advance(60 * 60 * 1000);
  await assert.rejects(() => service.tokenResolver.resolveAccessToken({ serverId: SERVER }));
  const gate = createExternalMcpConnectionGate({ workspaceId: WORKSPACE, repo });
  const call = await rosterCallTarget(repo, SERVER, "generate_image");

  let caught: unknown;
  try {
    await gate(SERVER, call);
  } catch (error) {
    caught = error;
  }

  assert.ok(caught instanceof ExternalMcpReauthRequiredError);
  assert.equal(caught.retryable, false);
  assert.match(caught.message, /Do not retry this tool\.$/);
});

test("the gate still refuses a needs_reauth ROSTER connection with the unchanged reauth error", async () => {
  // The same fixture as the test above, restated under this file's own name for the case
  // `external-mcp-revocation.ts`'s NEW grant/revision checks must not shadow: `rosterRefusalFor`
  // returns null for this row (its revision, enabled state and grants are all unchanged since
  // admission), so the gate must still fall through to the ORIGINAL `needs_reauth` check below it.
  const { repo, clock, service } = await makeHarness({
    script: [
      { json: { token_type: "Bearer", access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } },
      { status: 400, json: { error: "invalid_grant" } },
    ],
  });
  await connect(service);
  clock.advance(60 * 60 * 1000);
  await assert.rejects(() => service.tokenResolver.resolveAccessToken({ serverId: SERVER }));
  const gate = createExternalMcpConnectionGate({ workspaceId: WORKSPACE, repo });
  const call = await rosterCallTarget(repo, SERVER, "generate_image");

  await assert.rejects(
    () => gate(SERVER, call),
    (error: unknown) => {
      assert.ok(error instanceof ExternalMcpReauthRequiredError);
      assert.equal(error.retryable, false);
      assert.match(error.message, /Do not retry this tool\.$/);
      return true;
    },
  );
});

test("the connection gate reads the ROW, so the daemon sees a state the web server discovered", async () => {
  // Two independent gates over the same repo — the shape the two processes actually have. No
  // in-memory flag is shared; only the row is.
  const { repo, clock, service } = await makeHarness({
    script: [
      { json: { token_type: "Bearer", access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } },
      { status: 400, json: { error: "invalid_grant" } },
    ],
  });
  await connect(service);
  const daemonGate = createExternalMcpConnectionGate({ workspaceId: WORKSPACE, repo });
  const call = await rosterCallTarget(repo, SERVER, "generate_image");
  await daemonGate(SERVER, call);

  // The "web server" discovers the dead grant.
  clock.advance(60 * 60 * 1000);
  await assert.rejects(() => service.tokenResolver.resolveAccessToken({ serverId: SERVER }));

  // The "daemon"'s gate, built before that happened, now refuses.
  await assert.rejects(() => daemonGate(SERVER, call), (error: unknown) => error instanceof ExternalMcpReauthRequiredError);
});

test("the connection gate passes through a connection id it has no row for — presets have none", async () => {
  const { repo } = await makeHarness();
  const gate = createExternalMcpConnectionGate({ workspaceId: WORKSPACE, repo });

  await gate("supabase", { remoteName: "some_tool", declaredAnnotations: undefined, origin: { kind: "preset" } });
});

test("a preset call is not refused for a missing row, even for a connection id that looks like a roster one", async () => {
  const { repo } = await makeHarness();
  const gate = createExternalMcpConnectionGate({ workspaceId: WORKSPACE, repo });

  // `higgs` DOES have a row (created by `makeHarness`) — this proves the preset short-circuit is
  // driven by `call.origin.kind`, not by whether a row happens to exist.
  await gate(SERVER, { remoteName: "generate_image", declaredAnnotations: undefined, origin: { kind: "preset" } });
});

test("the gate refuses an OAuth connection the operator disconnected", async () => {
  const { repo, service } = await makeHarness({
    script: [{ json: { token_type: "Bearer", access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }],
  });
  await connect(service);
  await service.disconnect({ serverId: SERVER });
  const gate = createExternalMcpConnectionGate({ workspaceId: WORKSPACE, repo });
  const call = await rosterCallTarget(repo, SERVER, "generate_image");

  await assert.rejects(
    () => gate(SERVER, call),
    (error: unknown) => {
      assert.ok(error instanceof ExternalMcpConnectionRevokedError, `expected ExternalMcpConnectionRevokedError, got ${String(error)}`);
      assert.ok(error instanceof ToolInputError);
      assert.equal(error.reason, "disconnected");
      assert.equal(
        error.message,
        '"Higgs" is disconnected in Integrations → External MCP. Ask the operator to reconnect it. Do not retry this tool.',
      );
      return true;
    },
  );
});

test("the gate refuses a non-preset call with no admission origin", async () => {
  const { repo, service } = await makeHarness({
    script: [{ json: { token_type: "Bearer", access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }],
  });
  await connect(service);
  const gate = createExternalMcpConnectionGate({ workspaceId: WORKSPACE, repo });

  await assert.rejects(
    () => gate(SERVER, { remoteName: "generate_image", declaredAnnotations: undefined, origin: undefined }),
    (error: unknown) => {
      assert.ok(error instanceof ExternalMcpConnectionRevokedError);
      assert.equal(error.reason, "unverifiable");
      return true;
    },
  );
});

test("the connection gate ignores a static_env server, which has no authorization to lose", async () => {
  const { repo, sealer, keyring, clock } = await makeHarness();
  await saveExternalMcpServer(
    { repo, sealer, keyring, clock },
    {
      workspaceId: WORKSPACE,
      serverId: "plain",
      transport: "stdio",
      authMode: "static_env",
      enabled: true,
      command: "npx",
      args: "-y plain-mcp",
      allowedToolNames: "some_tool",
      writeAllowedToolNames: "some_tool",
      principalId: "principal-1",
    },
  );
  const gate = createExternalMcpConnectionGate({ workspaceId: WORKSPACE, repo });

  await gate("plain", await rosterCallTarget(repo, "plain", "some_tool"));
});

// ---------------------------------------------------------------------------
// The clear-token escape hatches under a BROKEN credential store.
//
// `setOAuthStatus`'s clear-token branch is a read-modify-write through the sealer AND the keyring
// (it must be — nulling `sealedOAuth` wholesale would delete the client secret sharing the blob).
// That made every operator escape hatch depend on a successful decrypt-then-reseal, so clearing a
// token started failing in the one situation where clearing it is the whole point: the blob is
// already unrecoverable. Nothing above exercises a failing sealer or keyring, which is why that
// shipped green. Each double below breaks exactly one leg, so a fix that only covers `open` cannot
// pass the `seal` case by accident.
// ---------------------------------------------------------------------------

/** A sealer that cannot open anything — a rotated `TOVU_SITE_KEY`, a changed AAD, or a
 *  corrupt row. `openExternalMcpOAuthPayload` converts any `open` failure into
 *  `ExternalMcpSecretStoreUnconfiguredError`; sealing is left working so the failure is unambiguously
 *  the read leg. */
function sealerThatCannotOpen(inner: SecretSealerPort): SecretSealerPort {
  return {
    seal: (input) => inner.seal(input),
    open: () => Promise.reject(new Error("Unsupported state or unable to authenticate data")),
  };
}

/** Opens `healthyOpens` times and then stops — a site key that goes away BETWEEN a boot-time read
 *  and the write that follows it, which is how a live session discovers the problem rather than a
 *  process that was broken from the start. */
function sealerThatStopsOpeningAfter(inner: SecretSealerPort, healthyOpens: number): SecretSealerPort {
  let opens = 0;
  return {
    seal: (input) => inner.seal(input),
    open: async (input, optional) => {
      opens += 1;
      if (opens > healthyOpens) throw new Error("Unsupported state or unable to authenticate data");
      return inner.open(input, optional);
    },
  };
}

/** Opens onto a payload written by a NEWER build. `hydrateExternalMcpOAuthPayload` refuses it with a
 *  plain `Error`, deliberately outside its own catch — so this is a real route by which
 *  `openExternalMcpOAuthPayload` throws something that is NOT
 *  `ExternalMcpSecretStoreUnconfiguredError`, and the only honest way to prove the degrade is
 *  targeted rather than a blanket `catch`. */
function sealerThatOpensAFutureSchemaVersion(inner: SecretSealerPort): SecretSealerPort {
  return {
    seal: (input) => inner.seal(input),
    open: async () => JSON.stringify({ schemaVersion: 99, clientSecret: "s3cr3t" }),
  };
}

/** A keyring with no active key. Only `activeKey()` breaks: `AesGcmSecretSealer.open` re-derives
 *  from `sealed.keyId` via `derive()`, so reads keep working and the ONLY failing step is the
 *  re-seal. Never recovers — models a sustained outage, not a blip. */
function keyringWithNoActiveKey(inner: KeyringPort): KeyringPort {
  return {
    activeKey: () => Promise.reject(new Error("TOVU_SITE_KEY is not set")),
    deriveSigningSecret: (input) => inner.deriveSigningSecret(input),
    derive: (input) => inner.derive(input),
  };
}

/** Like {@link keyringWithNoActiveKey}, but `activeKey()` only rejects `failures` times and then
 *  defers to the real keyring — a blip the clear-token retry is meant to ride out, not a sustained
 *  outage. */
function keyringWhoseActiveKeyFailsThenRecovers(inner: KeyringPort, failures: number): KeyringPort {
  let calls = 0;
  return {
    activeKey: () => {
      calls += 1;
      if (calls <= failures) return Promise.reject(new Error("TOVU_SITE_KEY is not set"));
      return inner.activeKey();
    },
    deriveSigningSecret: (input) => inner.deriveSigningSecret(input),
    derive: (input) => inner.derive(input),
  };
}

/** A repo whose row write rejects. Models the failure that is left AFTER the secret-store degrade —
 *  it never reaches the sealer at all. */
function repoWhoseUpsertRejects(inner: ExternalMcpServerRepoPort, error: Error): ExternalMcpServerRepoPort {
  return {
    listByWorkspaceId: (workspaceId) => inner.listByWorkspaceId(workspaceId),
    findByServerId: (input) => inner.findByServerId(input),
    upsert: () => Promise.reject(error),
    deleteByServerId: (input) => inner.deleteByServerId(input),
    tryClaimOAuthRefreshLease: (input) => inner.tryClaimOAuthRefreshLease(input),
    releaseOAuthRefreshLease: (input) => inner.releaseOAuthRefreshLease(input),
  };
}

/** Rebuilds the service over the SAME repo and row with one dependency swapped. The row is written
 *  by the real sealer first, so every case below is "the credential store broke after a successful
 *  connect" — the operator's actual situation, not a process that never worked. */
function serviceWithBrokenDependency(
  base: Awaited<ReturnType<typeof makeHarness>>,
  overrides: { sealer?: SecretSealerPort; keyring?: KeyringPort; repo?: ExternalMcpServerRepoPort; workspaceId?: string },
): ReturnType<typeof createExternalMcpOAuthService> {
  return createExternalMcpOAuthService({
    workspaceId: overrides.workspaceId ?? WORKSPACE,
    repo: overrides.repo ?? base.repo,
    sealer: overrides.sealer ?? base.sealer,
    keyring: overrides.keyring ?? base.keyring,
    clock: base.clock,
    devices: createDeviceAuthorizationStore(),
    httpPorts: { guard: createTovuOAuthGuard({}, { allowLoopbackHttp: true }),
      fetchFn: ({ url }, init) => (base.http.fetchFn)(url, init) },
    lookupProvider: () => PROVIDER,
  });
}

const CONNECTED_SCRIPT: readonly ScriptStep[] = [{ json: { token_type: "Bearer", access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }];

test("sealed redirect state survives rebuilding the service and carries only encrypted verifier material", async () => {
  const h = await makeHarness({ script: CONNECTED_SCRIPT });
  const started = await h.service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  assert.equal(started.kind, "redirect_required");
  if (started.kind !== "redirect_required") throw new Error("expected redirect");
  const url = new URL(started.authorizationUrl);
  const state = url.searchParams.get("state")!;
  assert.ok(state.length > 256 && state.length <= MAX_AUTHORIZATION_STATE_LENGTH);
  const sealed = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
  const aad = formatAad({ kind: "oauth-redirect-state", version: "v1", parts: [JSON.stringify([WORKSPACE, SERVER])] });
  const payload = JSON.parse(await h.sealer.open({ sealed }, { aad }));
  assert.equal(payload.workspaceId, WORKSPACE);
  assert.equal(payload.serverId, SERVER);
  assert.equal(payload.providerId, PROVIDER.providerId);
  assert.equal(payload.redirectUri, REDIRECT_URI);
  assert.equal(payload.exp, h.clock.nowMs() + 600_000);
  assert.equal(payload.principalId, undefined, "the existing OAuth flow binds no principal");
  assert.ok(!url.href.includes(payload.codeVerifier));
  const rebuilt = serviceWithBrokenDependency(h, {});
  await rebuilt.completeAuthorizationCallback({ serverId: SERVER, redirectUri: REDIRECT_URI, params: { state, code: "c" } });
  const form = new URLSearchParams(String(h.http.requests[0]?.init?.body));
  assert.equal(form.get("code_verifier"), payload.codeVerifier);
  assert.equal(form.get("redirect_uri"), REDIRECT_URI);
  assert.equal((await readRow(h.repo)).oauthStatus, "connected");
});

test("expired, tampered and oversize sealed redirect state cannot reach exchange", async () => {
  const h = await makeHarness({ script: CONNECTED_SCRIPT });
  const started = await h.service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  if (started.kind !== "redirect_required") throw new Error("expected redirect");
  const state = new URL(started.authorizationUrl).searchParams.get("state")!;
  const envelope = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
  const ciphertext = Buffer.from(envelope.ciphertext, "base64");
  ciphertext[0] = ciphertext[0]! ^ 1;
  envelope.ciphertext = ciphertext.toString("base64");
  for (const invalid of [Buffer.from(JSON.stringify(envelope)).toString("base64url"), "x".repeat(MAX_AUTHORIZATION_STATE_LENGTH + 1)]) {
    await assert.rejects(() => h.service.completeAuthorizationCallback({ serverId: SERVER, redirectUri: REDIRECT_URI, params: { state: invalid, code: "c" } }),
      (error: unknown) => error instanceof OAuthError && error.code === "OAUTH_INVALID_STATE");
  }
  h.clock.advance(600_000);
  await assert.rejects(() => h.service.completeAuthorizationCallback({ serverId: SERVER, redirectUri: REDIRECT_URI, params: { state, code: "c" } }),
    (error: unknown) => error instanceof OAuthError && error.code === "OAUTH_INVALID_STATE");
  assert.equal(h.http.callCount(), 0);
  assert.equal((await readRow(h.repo)).oauthStatus, "pending");
});

test("sealed redirect state rejects another workspace, server and exact callback URI", async () => {
  const h = await makeHarness({ script: CONNECTED_SCRIPT });
  const started = await h.service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  if (started.kind !== "redirect_required") throw new Error("expected redirect");
  const state = new URL(started.authorizationUrl).searchParams.get("state")!;
  const row = await readRow(h.repo);
  // Public-client targets need no client secret: a copied credential must not mask the state check.
  await h.repo.upsert({ ...row, workspaceId: "other-workspace", sealedOAuth: null });
  await h.repo.upsert({ ...row, serverId: "other-server", sealedOAuth: null });
  const wrongWorkspace = serviceWithBrokenDependency(h, { workspaceId: "other-workspace" });
  for (const [service, serverId, redirectUri] of [
    [wrongWorkspace, SERVER, REDIRECT_URI],
    [h.service, "other-server", REDIRECT_URI],
    [h.service, SERVER, `${REDIRECT_URI}/`],
  ] as const) {
    await assert.rejects(() => service.completeAuthorizationCallback({ serverId, redirectUri, params: { state, code: "c" } }),
      (error: unknown) => error instanceof OAuthError && error.code === "OAUTH_INVALID_STATE");
  }
  assert.equal(h.http.callCount(), 0);
  await h.service.completeAuthorizationCallback({ serverId: SERVER, redirectUri: REDIRECT_URI, params: { state, code: "c" } });
  assert.equal(h.http.callCount(), 1, "failed binding checks do not burn a valid sealed state");
});

test("disconnect still clears an UNOPENABLE blob and reaches disconnected — a rotated site key must not wedge the escape hatch", async () => {
  const base = await makeHarness({ script: CONNECTED_SCRIPT });
  await connect(base.service);
  const service = serviceWithBrokenDependency(base, { sealer: sealerThatCannotOpen(base.sealer) });

  await service.disconnect({ serverId: SERVER });

  const row = await readRow(base.repo);
  assert.equal(row.oauthStatus, "disconnected");
  assert.equal(row.oauthExpiresAt, null);
  assert.equal(
    row.sealedOAuth,
    null,
    "a blob that cannot be decrypted is already lost — nulling it loses nothing that was not lost already",
  );
});

test("a re-seal that fails once and then recovers is retried transparently — the clear still succeeds", async () => {
  const base = await makeHarness({ script: CONNECTED_SCRIPT });
  await connect(base.service);
  // Fails once, well inside the retry budget, then behaves like the real keyring.
  const service = serviceWithBrokenDependency(base, { keyring: keyringWhoseActiveKeyFailsThenRecovers(base.keyring, 1) });

  await service.disconnect({ serverId: SERVER });

  const row = await readRow(base.repo);
  assert.equal(row.oauthStatus, "disconnected");
  const payload = await openExternalMcpOAuthPayload(base.sealer, row);
  assert.equal(payload.tokens, undefined, "a transient blip must not stop the token from actually being cleared once retried");
  assert.equal(payload.clientSecret, "s3cr3t");
});

test("disconnect does NOT wipe the client secret when the KEYRING re-seal leg keeps failing, and surfaces the failure instead of reporting a false success", async () => {
  const base = await makeHarness({ script: CONNECTED_SCRIPT });
  await connect(base.service);
  // The sealer stays real, so the blob OPENS: the only step that can fail is the re-seal. Unlike
  // `sealerThatCannotOpen` above, this is NOT "already unrecoverable" — the secret was just decrypted
  // in this very call, so wholesale-nulling it would destroy something still known-good. It never
  // recovers, so the bounded retry exhausts and the failure must surface rather than be swallowed
  // into a status update ("disconnected") the stored blob does not actually match.
  const service = serviceWithBrokenDependency(base, { keyring: keyringWithNoActiveKey(base.keyring) });

  await assert.rejects(
    () => service.disconnect({ serverId: SERVER }),
    (error: unknown) => error instanceof ExternalMcpSecretStoreUnconfiguredError,
  );

  const row = await readRow(base.repo);
  assert.equal(row.oauthStatus, "connected", "a call that never wrote anything must not claim the row moved to disconnected");
  const payload = await openExternalMcpOAuthPayload(base.sealer, row);
  assert.equal(payload.clientSecret, "s3cr3t", "the client secret must survive an exhausted re-seal retry, same as a transient one");
  assert.equal(payload.tokens?.accessToken, "at-1", "nothing was written, so the (still live) token is untouched too");
});

test("markNeedsReauth records the durable state even when the blob became unopenable mid-session", async () => {
  const base = await makeHarness({
    script: [{ json: { token_type: "Bearer", access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }, { status: 400, json: { error: "invalid_grant" } }],
  });
  await connect(base.service);
  base.clock.advance(60 * 60 * 1000);
  // Two healthy opens — the refresher's own read of the token, then `resolveClient` reading the
  // client secret for the refresh request — and the THIRD, the clear that follows the provider's
  // rejection, finds the key gone. Losing the state write here is the worst of the three cases:
  // `needs_reauth` is what stops every later tool call from re-probing a grant already refused.
  const service = serviceWithBrokenDependency(base, { sealer: sealerThatStopsOpeningAfter(base.sealer, 2) });

  await assert.rejects(() => service.tokenResolver.resolveAccessToken({ serverId: SERVER }));

  const row = await readRow(base.repo);
  assert.equal(row.oauthStatus, "needs_reauth", "the durable state must be recorded even when the dead token cannot be read back");
  assert.equal(row.sealedOAuth, null);
});

test("reportAuthFailure throws the TERMINAL error even when the status write fails — the do-not-retry signal is the guarantee", async () => {
  // `external_mcp_reauth_prompt` and `createExternalMcpConnectionGate` both branch on the CLASS of
  // this error. Replacing it with an incidental write failure does not just lose a diagnostic: the
  // gate never engages and the model is told nothing that makes it stop retrying a dead connection.
  const base = await makeHarness({ script: CONNECTED_SCRIPT });
  await connect(base.service);
  const writeFailure = new Error("database is locked");
  const service = serviceWithBrokenDependency(base, { repo: repoWhoseUpsertRejects(base.repo, writeFailure) });

  await assert.rejects(
    () => service.reportAuthFailure(SERVER, new Error("mcp-federation: the server refused 'tools/call' with 401")),
    (error: unknown) => {
      assert.ok(error instanceof ExternalMcpReauthRequiredError, `expected the terminal error, got ${String(error)}`);
      assert.equal(error.retryable, false);
      assert.match(error.message, /Do not retry this tool\.$/);
      assert.equal(error.cause, writeFailure, "the best-effort write's failure must survive as `cause`, not vanish");
      return true;
    },
  );
});

test("a clear-token failure that is NOT the secret store still propagates — the degrade is targeted, not a blanket swallow", async () => {
  const base = await makeHarness({ script: CONNECTED_SCRIPT });
  await connect(base.service);
  const service = serviceWithBrokenDependency(base, { sealer: sealerThatOpensAFutureSchemaVersion(base.sealer) });

  await assert.rejects(
    () => service.disconnect({ serverId: SERVER }),
    (error: unknown) =>
      error instanceof Error &&
      !(error instanceof ExternalMcpSecretStoreUnconfiguredError) &&
      /newer than this build understands/.test(error.message),
  );

  assert.equal(
    (await readRow(base.repo)).oauthStatus,
    "connected",
    "a row must not be moved on a failure this module does not understand",
  );
});

// REGRESSION: fails if refreshAccessToken is replaced by requestOAuthToken without carrying the old refresh token.
test("a nonrotating refresh token stays sealed for the next refresh", async () => {
  const { clock, http, service } = await makeHarness({ script: [
    { json: { token_type: "Bearer", access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } },
    { json: { token_type: "Bearer", access_token: "at-2", expires_in: 3600 } },
    { json: { token_type: "Bearer", access_token: "at-3", expires_in: 3600 } },
  ] });
  await connect(service);
  clock.advance(60 * 60 * 1000);
  assert.equal(await service.tokenResolver.resolveAccessToken({ serverId: SERVER }), "at-2");
  clock.advance(60 * 60 * 1000);
  assert.equal(await service.tokenResolver.resolveAccessToken({ serverId: SERVER }), "at-3");
  const body = new URLSearchParams(String(http.requests[2].init?.body));
  assert.equal(body.get("refresh_token"), "rt-1");
});


test("vault-backed memory writes publish both envelopes, status and expiry together", async () => {
  const { repo, sealer, keyring } = await makeHarness();
  const original = await readRow(repo);
  const env = await sealExternalMcpVaultPayload({ deps: { sealer, keyring }, identity: original, kind: "mcp-env", payload: { API_KEY: "env-before" } });
  await repo.upsert({ ...original, sealedEnv: env });
  const before = await readRow(repo);
  const replacementEnv = await sealExternalMcpVaultPayload({ deps: { sealer, keyring }, identity: before, kind: "mcp-env", payload: { API_KEY: "env-after" } });
  const wrongServerAuth = await sealExternalMcpVaultPayload({ deps: { sealer, keyring }, identity: { ...before, serverId: "other-server" },
    kind: "mcp-auth", payload: { clientSecret: "other-secret" } });
  await assert.rejects(repo.upsert({ ...before, sealedEnv: replacementEnv, sealedOAuth: wrongServerAuth,
    oauthStatus: "connected", oauthExpiresAt: "2099-01-01T00:00:00.000Z" }));
  assert.deepEqual(await readRow(repo), before);
  assert.equal((await openExternalMcpOAuthPayload(sealer, await readRow(repo))).clientSecret, "s3cr3t");
});

test("a carried vault pointer deleted by another writer cannot resurrect its old payload", async () => {
  const { repo, sealer, keyring } = await makeHarness();
  const before = await readRow(repo);
  const replacement = await sealExternalMcpVaultPayload({ deps: { sealer, keyring }, identity: before, kind: "mcp-auth", payload: { clientSecret: "replacement" } });
  await repo.upsert({ ...before, sealedOAuth: replacement });
  const current = await readRow(repo);
  assert.notEqual(externalMcpVaultRecord({ sealed: before.sealedOAuth!, identity: before, kind: "mcp-auth" }).id,
    externalMcpVaultRecord({ sealed: current.sealedOAuth!, identity: current, kind: "mcp-auth" }).id);
  await assert.rejects(repo.upsert(before));
  assert.deepEqual(await readRow(repo), current);
  assert.equal((await openExternalMcpOAuthPayload(sealer, current)).clientSecret, "replacement");
});

test("the vault envelope stays opaque in JSON and a plain envelope cannot lose its ownership check", async () => {
  const { repo, sealer } = await makeHarness();
  const row = await readRow(repo);
  assert.ok(row.sealedOAuth);
  assert.deepEqual(Object.keys(row.sealedOAuth).sort(), ["alg", "ciphertext", "keyId", "nonce"]);
  assert.ok(!JSON.stringify(row).includes("s3cr3t"));
  const detached = JSON.parse(JSON.stringify(row.sealedOAuth));
  await assert.rejects(openExternalMcpOAuthPayload(sealer, { ...row, sealedOAuth: detached }), /could not be decrypted/);
});


test("returned memory vault envelopes cannot mutate stored credentials through aliases", async () => {
  const { repo, sealer } = await makeHarness();
  const row = await readRow(repo);
  const originalCiphertext = row.sealedOAuth!.ciphertext;
  (row.sealedOAuth as { ciphertext: string }).ciphertext = "tampered";
  assert.equal((await readRow(repo)).sealedOAuth!.ciphertext, originalCiphertext);
  await assert.rejects(repo.upsert(row));
  assert.equal((await openExternalMcpOAuthPayload(sealer, await readRow(repo))).clientSecret, "s3cr3t");
});

// ---------------------------------------------------------------------------
// BRANCH PINS (L114 code-health): every branch of `external-mcp-oauth.ts` the cases above leave
// unexercised, pinned against the pre-refactor code. Rows are bent into the shape under test with
// a direct `repo.upsert`, because `saveExternalMcpServer` refuses most of these shapes up front.
// ---------------------------------------------------------------------------

type Harness = Awaited<ReturnType<typeof makeHarness>>;

/** A second service over the harness's own store, for the deps `makeHarness` does not expose. */
function serviceOver(h: Harness, extra: Partial<Parameters<typeof createExternalMcpOAuthService>[0]> = {}) {
  return createExternalMcpOAuthService({
    workspaceId: WORKSPACE, repo: h.repo, sealer: h.sealer, keyring: h.keyring, clock: h.clock,
    devices: createDeviceAuthorizationStore(),
    httpPorts: { guard: createTovuOAuthGuard({}, { allowLoopbackHttp: true }), fetchFn: ({ url }, init) => h.http.fetchFn(url, init) },
    lookupProvider: () => PROVIDER,
    ...extra,
  });
}

/** The harness row, rewritten with `patch`. */
async function bendRow(h: Harness, patch: Partial<Awaited<ReturnType<typeof readRow>>>): Promise<void> {
  await h.repo.upsert({ ...(await readRow(h.repo)), ...patch });
}

/** The `scope` a redirect connect asks the provider for, or null when it asks for none. */
async function requestedScope(h: Harness): Promise<string | null> {
  const started = await h.service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  assert.ok(started.kind === "redirect_required");
  return new URL(started.authorizationUrl).searchParams.get("scope");
}

const TOKEN_SCRIPT = [{ json: { token_type: "Bearer", access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }];

test("a post-connect step that throws is logged and does not fail the sign-in", async (t) => {
  const h = await makeHarness({ script: TOKEN_SCRIPT });
  const warnings: string[] = [];
  t.mock.method(console, "warn", (line: string) => { warnings.push(line); });
  await connect(serviceOver(h, { onConnected: async () => { throw new Error("defaults exploded"); } }));
  assert.equal((await readRow(h.repo)).oauthStatus, "connected");
  assert.deepEqual(warnings, ["[external-mcp] 'higgs': post-connect step failed: defaults exploded"]);
});

test("a post-connect step that throws a non-Error is logged by its string form", async (t) => {
  const h = await makeHarness({ script: TOKEN_SCRIPT });
  const warnings: string[] = [];
  t.mock.method(console, "warn", (line: string) => { warnings.push(line); });
  await connect(serviceOver(h, { onConnected: async () => { throw "plain failure"; } }));
  assert.deepEqual(warnings, ["[external-mcp] 'higgs': post-connect step failed: plain failure"]);
});

test("connecting a server id with no row is refused, naming the id", async () => {
  const { service } = await makeHarness();
  await assert.rejects(service.beginConnect({ serverId: "ghost", redirectUri: REDIRECT_URI }),
    (error: unknown) => error instanceof ExternalMcpValidationError && error.field === "id" && error.message === "no external MCP server is configured as 'ghost'");
});

test("connecting a row that does not use OAuth is refused, naming the row", async () => {
  const h = await makeHarness();
  await bendRow(h, { authMode: "static_env" });
  await assert.rejects(h.service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI }),
    (error: unknown) => error instanceof ExternalMcpValidationError && error.field === "authMode" && error.message === "external MCP server 'higgs' is not configured to use OAuth");
});

test("a stored endpoints value that is valid JSON but not an object is read as no endpoints", async () => {
  const h = await makeHarness();
  await bendRow(h, { oauthEndpointsJson: "[1]" });
  assert.equal(await requestedScope(h), "images:generate");
});

test("a corrupt stored endpoints value is read as no endpoints", async () => {
  const h = await makeHarness();
  await bendRow(h, { oauthEndpointsJson: "{not json" });
  assert.equal(await requestedScope(h), "images:generate");
});

test("a row with no stored scopes asks the provider for none", async () => {
  const h = await makeHarness();
  await bendRow(h, { oauthScopesJson: null });
  assert.equal(await requestedScope(h), null);
});

test("stored scopes that are not a JSON array ask the provider for none", async () => {
  const h = await makeHarness();
  await bendRow(h, { oauthScopesJson: JSON.stringify({ scope: "x" }) });
  assert.equal(await requestedScope(h), null);
});

test("corrupt stored scopes ask the provider for none", async () => {
  const h = await makeHarness();
  await bendRow(h, { oauthScopesJson: "[not json" });
  assert.equal(await requestedScope(h), null);
});

test("a provider-less row with only token and device endpoints connects by device code under a connection-scoped provider", async () => {
  const h = await makeHarness({ grant: "device_code", script: [{ json: { device_code: "dc-1", user_code: "ABCD-EFGH", verification_uri: "https://auth.example.com/activate", expires_in: 900, interval: 5 } }] });
  await bendRow(h, { oauthProviderId: null, oauthEndpointsJson: JSON.stringify({ tokenEndpoint: "https://auth.example.com/token", deviceAuthorizationEndpoint: "https://auth.example.com/device" }) });
  const started = await h.service.beginConnect({ serverId: SERVER });
  assert.equal(started.kind, "device_code");
  assert.equal(h.http.requests[0]?.url, "https://auth.example.com/device");
});

test("a callback for a row that names neither a provider nor a token endpoint is refused with the operator's fix", async () => {
  const h = await makeHarness();
  await bendRow(h, { oauthProviderId: null });
  await assert.rejects(h.service.completeAuthorizationCallback({ serverId: SERVER, redirectUri: REDIRECT_URI, params: { state: "s", code: "c" } }),
    (error: unknown) => error instanceof OAuthError && error.code === "OAUTH_INVALID_REQUEST"
      && error.message.includes("external MCP server 'higgs' names no OAuth provider and defines no token endpoint"));
});

test("a callback for a row with no client id is refused, naming the missing client id", async () => {
  const h = await makeHarness();
  await bendRow(h, { oauthClientId: null });
  await assert.rejects(h.service.completeAuthorizationCallback({ serverId: SERVER, redirectUri: REDIRECT_URI, params: { state: "s", code: "c" } }),
    (error: unknown) => error instanceof OAuthError && error.code === "OAUTH_INVALID_REQUEST"
      && error.message.includes("external MCP server 'higgs' has no OAuth client id"));
});

test("connecting a stdio row that names no provider and no endpoints is refused before any request", async () => {
  const h = await makeHarness();
  await bendRow(h, { oauthProviderId: null });
  await assert.rejects(h.service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI }),
    (error: unknown) => error instanceof OAuthError && error.code === "OAUTH_INVALID_REQUEST"
      && error.message.includes("external MCP server 'higgs' names no OAuth provider and defines no token endpoint"));
  assert.equal(h.http.callCount(), 0);
});

test("without a lookupProvider, a registered provider is resolved from the injected registry", async () => {
  const h = await makeHarness();
  const providers = createOAuthProviderRegistry({ guard: createTovuOAuthGuard({}, { allowLoopbackHttp: true }) });
  providers.register({ descriptor: PROVIDER });
  const started = await serviceOver(h, { lookupProvider: undefined, providers }).beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  assert.ok(started.kind === "redirect_required");
  assert.equal(new URL(started.authorizationUrl).origin, "https://auth.example.com");
});

test("disconnecting a row whose client id is already gone only resets its status", async () => {
  const h = await makeHarness();
  await bendRow(h, { oauthClientId: null, oauthEndpointsJson: JSON.stringify({ dynamicClientId: "old" }) });
  await h.service.disconnect({ serverId: SERVER });
  const row = await readRow(h.repo);
  assert.equal(row.oauthStatus, "disconnected");
  assert.equal(row.oauthEndpointsJson, JSON.stringify({ dynamicClientId: "old" }));
});

test("disconnecting a server id with no row writes nothing", async () => {
  const h = await makeHarness();
  await h.service.disconnect({ serverId: "ghost" });
  assert.equal(await h.repo.findByServerId({ workspaceId: WORKSPACE, serverId: "ghost" }), null);
});

test("a completed sign-in on a row with no client secret seals the tokens alone", async () => {
  const h = await makeHarness({ script: TOKEN_SCRIPT });
  await bendRow(h, { sealedOAuth: null });
  await connect(h.service);
  const payload = await openExternalMcpOAuthPayload(h.sealer, await readRow(h.repo));
  assert.equal(payload.clientSecret, undefined);
  assert.equal(payload.tokens?.accessToken, "at-1");
});

test("resolving a token for a server id with no row reports re-authorization under the server id", async () => {
  const { service } = await makeHarness();
  await assert.rejects(service.tokenResolver.resolveAccessToken({ serverId: "ghost" }),
    (error: unknown) => error instanceof ExternalMcpReauthRequiredError && error.serverId === "ghost" && error.message.startsWith('"ghost" is disconnected'));
});

test("resolving a token for a row that holds none reports re-authorization under its label", async () => {
  const { service } = await makeHarness();
  await assert.rejects(service.tokenResolver.resolveAccessToken({ serverId: SERVER }),
    (error: unknown) => error instanceof ExternalMcpReauthRequiredError && error.message.startsWith('"Higgs" is disconnected'));
});

test("a refresh lease held elsewhere is waited on, then the still-valid token is used once the wait budget runs out", async () => {
  const h = await makeHarness({ script: TOKEN_SCRIPT });
  await connect(h.service);
  h.clock.advance(3_600_000 - 60_000);
  const nowIso = h.clock.nowIso();
  assert.equal(await h.repo.tryClaimOAuthRefreshLease({ workspaceId: WORKSPACE, serverId: SERVER, nowIso, leaseUntil: "2099-01-01T00:00:00.000Z" }), true);
  const pending = h.service.tokenResolver.resolveAccessToken({ serverId: SERVER });
  // Let the refresher reach its lease wait (and fix its deadline) before time moves past it.
  await new Promise((resolve) => setTimeout(resolve, 100));
  h.clock.advance(6_000);
  assert.equal(await pending, "at-1");
});

test("a post-connect step that succeeds is handed the server id and logs nothing", async (t) => {
  const h = await makeHarness({ script: TOKEN_SCRIPT });
  const warn = t.mock.method(console, "warn", () => {});
  const connected: string[] = [];
  await connect(serviceOver(h, { onConnected: async (serverId) => { connected.push(serverId); } }));
  assert.deepEqual(connected, [SERVER]);
  assert.equal(warn.mock.callCount(), 0);
});
