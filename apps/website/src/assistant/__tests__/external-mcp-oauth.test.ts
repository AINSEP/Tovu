import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryKeyring } from "../../features/webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../features/webhooks/secret-sealer.aesgcm.js";
import { createPendingAuthorizationStore, OAuthError, type OAuthFetch, type OAuthProviderDescriptor } from "../../platform/oauth/index.js";
import {
  createDeviceAuthorizationStore,
  createExternalMcpConnectionGate,
  createExternalMcpOAuthService,
  ExternalMcpReauthRequiredError,
  externalMcpSettingsDeepLink,
} from "../external-mcp-oauth.js";
import { InMemoryExternalMcpServerRepo } from "../external-mcp-store.memory.js";
import {
  listExternalMcpServerViews,
  openExternalMcpOAuthPayload,
  readEnabledExternalMcpConfigs,
  saveExternalMcpServer,
} from "../external-mcp-store.js";

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

function scriptedFetch(script: readonly ScriptStep[]): { fetchFn: OAuthFetch; callCount(): number } {
  let calls = 0;
  const fetchFn = (async (): Promise<Response> => {
    const step = script[Math.min(calls, script.length - 1)] ?? {};
    calls += 1;
    if (step.throws) throw step.throws;
    return new Response(JSON.stringify(step.json ?? {}), {
      status: step.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as OAuthFetch;
  return { fetchFn, callCount: () => calls };
}

function makeClock(startIso = "2026-08-25T12:00:00.000Z") {
  let nowMs = Date.parse(startIso);
  return {
    nowIso: () => new Date(nowMs).toISOString(),
    advance: (ms: number) => {
      nowMs += ms;
    },
  };
}

async function makeHarness(options: { script?: readonly ScriptStep[]; grant?: string } = {}) {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const clock = makeClock();
  const http = scriptedFetch(options.script ?? []);

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
    pending: createPendingAuthorizationStore({ clock }),
    devices: createDeviceAuthorizationStore(),
    fetchFn: http.fetchFn,
    lookupProvider: () => PROVIDER,
  });

  return { repo, sealer, keyring, clock, http, service };
}

async function readRow(repo: InMemoryExternalMcpServerRepo) {
  const row = await repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });
  assert.ok(row);
  return row;
}

/** Runs a full redirect handshake: start it, read the `state` back off the authorization URL the
 *  browser would have followed, and complete the callback with it. */
async function connect(service: ReturnType<typeof createExternalMcpOAuthService>, code = "auth-code"): Promise<void> {
  const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  assert.equal(started.kind, "redirect_required");
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state");
  await service.completeAuthorizationCallback({ serverId: SERVER, params: { state: state ?? "", code } });
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
    script: [{ json: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }],
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
    script: [{ json: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }],
  });

  const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  assert.equal(started.kind, "redirect_required");
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state");
  await service.completeAuthorizationCallback({ serverId: SERVER, params: { state: state ?? "", code: "auth-code" } });

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
    await service.completeAuthorizationCallback({ serverId: SERVER, params: { state: state ?? "", code: "c" } });
  } catch (error) {
    caught = error;
  }

  assert.ok(caught instanceof OAuthError);
  assert.equal(caught.code, "OAUTH_PROVIDER_UNREACHABLE");
  assert.equal(caught.retryable, false);
  assert.equal(http.callCount(), 1, "an authorization code is single-use — retrying can burn one that worked");
});

test("a replayed callback cannot re-exchange, and does not reach the provider", async () => {
  const { http, service } = await makeHarness({
    script: [{ json: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }],
  });
  const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state");
  const params = { state: state ?? "", code: "auth-code" };

  await service.completeAuthorizationCallback({ serverId: SERVER, params });

  await assert.rejects(
    () => service.completeAuthorizationCallback({ serverId: SERVER, params }),
    (error: unknown) => error instanceof OAuthError && error.code === "OAUTH_INVALID_STATE",
  );
  assert.equal(http.callCount(), 1);
});

test("a refresh reseals the token WITHOUT losing the client secret sharing its blob", async () => {
  const { repo, sealer, clock, service } = await makeHarness({
    script: [
      { json: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } },
      { json: { access_token: "at-2", refresh_token: "rt-2", expires_in: 3600 } },
    ],
  });
  const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state");
  await service.completeAuthorizationCallback({ serverId: SERVER, params: { state: state ?? "", code: "c" } });

  clock.advance(60 * 60 * 1000);
  assert.equal(await service.tokenResolver.resolveAccessToken({ serverId: SERVER }), "at-2");

  const payload = await openExternalMcpOAuthPayload(sealer, await readRow(repo));
  assert.equal(payload.tokens?.accessToken, "at-2");
  assert.equal(payload.tokens?.refreshToken, "rt-2");
  assert.equal(payload.clientSecret, "s3cr3t", "a writer that seals { tokens } alone deletes the client secret");
  assert.equal((await readRow(repo)).oauthExpiresAt, "2026-08-25T14:00:00.000Z");
});

test("a provider answering invalid_grant transitions to needs_reauth, clears the token, and surfaces a non-retryable error", async () => {
  const { repo, sealer, clock, service } = await makeHarness({
    script: [
      { json: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } },
      { status: 400, json: { error: "invalid_grant" } },
    ],
  });
  const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state");
  await service.completeAuthorizationCallback({ serverId: SERVER, params: { state: state ?? "", code: "c" } });
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
      { json: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } },
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
      { json: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } },
      { status: 400, json: { error: "invalid_grant" } },
    ],
  });
  const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state");
  await service.completeAuthorizationCallback({ serverId: SERVER, params: { state: state ?? "", code: "c" } });
  clock.advance(60 * 60 * 1000);

  await assert.rejects(() => service.tokenResolver.resolveAccessToken({ serverId: SERVER }));
  const callsAfterFirst = http.callCount();
  await assert.rejects(() => service.tokenResolver.resolveAccessToken({ serverId: SERVER }));

  assert.equal(http.callCount(), callsAfterFirst, "a durable state must not be re-tested on every tool call");
});

test("a TRANSIENT refresh failure does not mark the connection needs_reauth", async () => {
  const { repo, clock, service } = await makeHarness({
    script: [
      { json: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } },
      { throws: Object.assign(new Error("timed out"), { name: "TimeoutError" }) },
    ],
  });
  const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state");
  await service.completeAuthorizationCallback({ serverId: SERVER, params: { state: state ?? "", code: "c" } });
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
    script: [{ json: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }],
  });
  const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state");
  await service.completeAuthorizationCallback({ serverId: SERVER, params: { state: state ?? "", code: "c" } });

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
      { json: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } },
      { status: 400, json: { error: "invalid_grant" } },
    ],
  });
  const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state");
  await service.completeAuthorizationCallback({ serverId: SERVER, params: { state: state ?? "", code: "c" } });
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
    script: [{ json: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }],
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
      { json: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } },
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
    },
  );
  const original = new Error("mcp-federation: the server answered 'tools/call' with HTTP 500");

  await assert.rejects(() => service.reportAuthFailure("plain", original), (error: unknown) => error === original);
});

test("disconnect clears the token, preserves the client secret, and returns the row to disconnected", async () => {
  const { repo, sealer, service } = await makeHarness({
    script: [{ json: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }],
  });
  const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state");
  await service.completeAuthorizationCallback({ serverId: SERVER, params: { state: state ?? "", code: "c" } });

  await service.disconnect({ serverId: SERVER });

  const row = await readRow(repo);
  assert.equal(row.oauthStatus, "disconnected");
  assert.equal(row.oauthExpiresAt, null);
  const payload = await openExternalMcpOAuthPayload(sealer, row);
  assert.equal(payload.tokens, undefined);
  assert.equal(payload.clientSecret, "s3cr3t", "disconnecting must not destroy a client secret the operator may never see again");
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

test("polling a device authorization reports pending, then connects, and stores the token", async () => {
  const { repo, service } = await makeHarness({
    grant: "device_code",
    script: [
      { json: { device_code: "device-secret", user_code: "WDJB-MJHT", verification_uri: "https://auth.example.com/activate", expires_in: 900, interval: 5 } },
      { status: 400, json: { error: "authorization_pending" } },
      { json: { access_token: "at-device", refresh_token: "rt-device", expires_in: 3600 } },
    ],
  });
  await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });

  assert.deepEqual(await service.pollDeviceAuthorization({ serverId: SERVER }), { status: "pending", retryAfterSeconds: 5 });
  assert.deepEqual(await service.pollDeviceAuthorization({ serverId: SERVER }), { status: "connected" });

  const row = await readRow(repo);
  assert.equal(row.oauthStatus, "connected");
  assert.equal(row.oauthExpiresAt, "2026-08-25T13:00:00.000Z");
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
    script: [{ json: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }],
  });
  const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state");
  await service.completeAuthorizationCallback({ serverId: SERVER, params: { state: state ?? "", code: "c" } });
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
    script: [{ json: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }],
  });
  const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state");
  await service.completeAuthorizationCallback({ serverId: SERVER, params: { state: state ?? "", code: "c" } });

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
// The federation liveness gate
//
// Federated tools are registered once and never unregistered — `buildToolCatalogQuery` snapshots the
// registry into a one-shot FTS index, so removal would leave a tool discoverable but unexecutable.
// This gate is what makes a dead connection refuse at the call instead of the model looping on it.
// ---------------------------------------------------------------------------

test("the connection gate lets a healthy OAuth connection through", async () => {
  const { repo, service } = await makeHarness({
    script: [{ json: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }],
  });
  await connect(service);
  const gate = createExternalMcpConnectionGate({ workspaceId: WORKSPACE, repo });

  await gate(SERVER);
});

test("the connection gate refuses a needs_reauth connection with the terminal, model-legible error", async () => {
  const { repo, clock, service } = await makeHarness({
    script: [
      { json: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } },
      { status: 400, json: { error: "invalid_grant" } },
    ],
  });
  await connect(service);
  clock.advance(60 * 60 * 1000);
  await assert.rejects(() => service.tokenResolver.resolveAccessToken({ serverId: SERVER }));
  const gate = createExternalMcpConnectionGate({ workspaceId: WORKSPACE, repo });

  let caught: unknown;
  try {
    await gate(SERVER);
  } catch (error) {
    caught = error;
  }

  assert.ok(caught instanceof ExternalMcpReauthRequiredError);
  assert.equal(caught.retryable, false);
  assert.match(caught.message, /Do not retry this tool\.$/);
});

test("the connection gate reads the ROW, so the daemon sees a state the web server discovered", async () => {
  // Two independent gates over the same repo — the shape the two processes actually have. No
  // in-memory flag is shared; only the row is.
  const { repo, clock, service } = await makeHarness({
    script: [
      { json: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } },
      { status: 400, json: { error: "invalid_grant" } },
    ],
  });
  await connect(service);
  const daemonGate = createExternalMcpConnectionGate({ workspaceId: WORKSPACE, repo });
  await daemonGate(SERVER);

  // The "web server" discovers the dead grant.
  clock.advance(60 * 60 * 1000);
  await assert.rejects(() => service.tokenResolver.resolveAccessToken({ serverId: SERVER }));

  // The "daemon"'s gate, built before that happened, now refuses.
  await assert.rejects(() => daemonGate(SERVER), (error: unknown) => error instanceof ExternalMcpReauthRequiredError);
});

test("the connection gate passes through a connection id it has no row for — presets have none", async () => {
  const { repo } = await makeHarness();
  const gate = createExternalMcpConnectionGate({ workspaceId: WORKSPACE, repo });

  await gate("supabase");
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
      allowedToolNames: "",
    },
  );
  const gate = createExternalMcpConnectionGate({ workspaceId: WORKSPACE, repo });

  await gate("plain");
});
