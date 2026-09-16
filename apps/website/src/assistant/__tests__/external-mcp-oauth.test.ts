import assert from "node:assert/strict";
import test from "node:test";

import { ToolInputError } from "@jini-ai/core";

import { InMemoryKeyring } from "../../features/webhooks/keyring.memory.js";
import type { KeyringPort, SecretSealerPort } from "../../features/webhooks/ports.js";
import { AesGcmSecretSealer } from "../../features/webhooks/secret-sealer.aesgcm.js";
import { createPendingAuthorizationStore, OAuthError, type OAuthFetch, type OAuthProviderDescriptor } from "../../platform/oauth/index.js";
import {
  createDeviceAuthorizationStore,
  createExternalMcpConnectionGate,
  createExternalMcpOAuthService,
  ExternalMcpReauthRequiredError,
  externalMcpSettingsDeepLink,
} from "../external-mcp-oauth.js";
import { ExternalMcpConnectionRevokedError } from "../external-mcp-revocation.js";
import { InMemoryExternalMcpServerRepo } from "../external-mcp-store.memory.js";
import {
  ExternalMcpSecretStoreUnconfiguredError,
  externalMcpAdmissionRevision,
  type ExternalMcpServerRepoPort,
  listExternalMcpServerViews,
  openExternalMcpOAuthPayload,
  readEnabledExternalMcpConfigs,
  saveExternalMcpServer,
} from "../external-mcp-store.js";
import type { FederatedCallTarget } from "../mcp-federation/ports.js";

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

test("disconnect stops the read model claiming a stored token — even though the sealed blob survives", async () => {
  const { repo, service } = await makeHarness({
    script: [{ json: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }],
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
    script: [{ json: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }],
  });
  await connect(service);
  const gate = createExternalMcpConnectionGate({ workspaceId: WORKSPACE, repo });

  await gate(SERVER, await rosterCallTarget(repo, SERVER, "generate_image"));
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
      { json: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } },
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
      { json: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } },
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
    script: [{ json: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }],
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
    script: [{ json: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }],
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

/** A sealer that cannot open anything — a rotated `TOVU_INTEGRATIONS_ROOT_KEY`, a changed AAD, or a
 *  corrupt row. `openExternalMcpOAuthPayload` converts any `open` failure into
 *  `ExternalMcpSecretStoreUnconfiguredError`; sealing is left working so the failure is unambiguously
 *  the read leg. */
function sealerThatCannotOpen(inner: SecretSealerPort): SecretSealerPort {
  return {
    seal: (input) => inner.seal(input),
    open: () => Promise.reject(new Error("Unsupported state or unable to authenticate data")),
  };
}

/** Opens `healthyOpens` times and then stops — a root key that goes away BETWEEN a boot-time read
 *  and the write that follows it, which is how a live session discovers the problem rather than a
 *  process that was broken from the start. */
function sealerThatStopsOpeningAfter(inner: SecretSealerPort, healthyOpens: number): SecretSealerPort {
  let opens = 0;
  return {
    seal: (input) => inner.seal(input),
    open: async (input) => {
      opens += 1;
      if (opens > healthyOpens) throw new Error("Unsupported state or unable to authenticate data");
      return inner.open(input);
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
    activeKey: () => Promise.reject(new Error("TOVU_INTEGRATIONS_ROOT_KEY is not set")),
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
      if (calls <= failures) return Promise.reject(new Error("TOVU_INTEGRATIONS_ROOT_KEY is not set"));
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
  overrides: { sealer?: SecretSealerPort; keyring?: KeyringPort; repo?: ExternalMcpServerRepoPort },
): ReturnType<typeof createExternalMcpOAuthService> {
  return createExternalMcpOAuthService({
    workspaceId: WORKSPACE,
    repo: overrides.repo ?? base.repo,
    sealer: overrides.sealer ?? base.sealer,
    keyring: overrides.keyring ?? base.keyring,
    clock: base.clock,
    pending: createPendingAuthorizationStore({ clock: base.clock }),
    devices: createDeviceAuthorizationStore(),
    fetchFn: base.http.fetchFn,
    lookupProvider: () => PROVIDER,
  });
}

const CONNECTED_SCRIPT: readonly ScriptStep[] = [{ json: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }];

test("disconnect still clears an UNOPENABLE blob and reaches disconnected — a rotated root key must not wedge the escape hatch", async () => {
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
    script: [{ json: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 } }, { status: 400, json: { error: "invalid_grant" } }],
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
