import assert from "node:assert/strict";
import test from "node:test";
import { createTovuOAuthGuard } from "../../../platform/oauth/endpoint-safety.js";
import { InMemoryKeyring } from "../../webhooks/keyring.env.js";
import type { SecretSealerPort } from "@jini-ai/integrations/secrets";
import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { createExternalMcpOAuthService, ExternalMcpReauthRequiredError } from "../external-mcp-oauth.js";
import { hostedMcpSignInLink } from "../../api-connections/browser-binding.js";
import { createDeviceAuthorizationStore } from "@jini-ai/integrations/api-connections/hosted-mcp";
import { OAuthError, type OAuthProviderDescriptor } from "@jini-ai/oauth";
import { InMemoryExternalMcpServerRepo } from "../external-mcp-store.memory.js";
import { openExternalMcpOAuthPayload, saveExternalMcpServer } from "../external-mcp-store.js";
import { applyExternalMcpAccess, externalMcpAccessSnapshot } from "@jini-ai/mcp/federation/hosted";

/**
 * @file Lost updates on the external-MCP row (design S1): a token refresh reads the row, calls the
 * provider, then writes. What it writes must be only the OAuth runtime columns, so an admin's
 * disable (or a replaced credential) that lands in the meantime is never restored or overwritten.
 *
 * The race is made deterministic by running the competing admin write from inside the refresh's own
 * seal step: after the refresh read the row, before it wrote.
 */

const WORKSPACE = "workspace-1";
const SERVER = "higgs";
const REDIRECT_URI = "https://tovu.example.com/api/mcp-servers/oauth/callback/higgs";
const PROVIDER: OAuthProviderDescriptor = {
  providerId: "test-provider", label: "Test Provider", supportedGrants: ["authorization_code"],
  authorizationEndpoint: "https://auth.example.com/authorize", tokenEndpoint: "https://auth.example.com/token",
  defaultScopes: [], usesPkce: true, clientAuth: "none",
};

async function harness() {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const inner = new AesGcmSecretSealer({ keyring });
  const hooks: { beforeSeal?: () => Promise<void>; exchange?: () => Promise<Response> } = {};
  const sealer: SecretSealerPort = {
    open: inner.open.bind(inner),
    seal: async (input) => {
      const run = hooks.beforeSeal;
      hooks.beforeSeal = undefined;
      if (run) await run();
      return inner.seal(input);
    },
  };
  let nowMs = Date.parse("2026-11-17T12:00:00.000Z");
  const clock = { nowMs: () => nowMs, nowIso: () => new Date(nowMs).toISOString(), advance: (ms: number) => { nowMs += ms; } };
  let tokens = 0;
  const fetchFn = (async () => hooks.exchange ? hooks.exchange() : new Response(JSON.stringify({ token_type: "Bearer", access_token: `at-${++tokens}`, refresh_token: `rt-${tokens}`, expires_in: 3600 }),
    { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  const save = (overrides: Record<string, unknown> = {}, oauth: Record<string, unknown> = {}) => saveExternalMcpServer({ repo, sealer, keyring, clock }, {
    workspaceId: WORKSPACE, serverId: SERVER, label: "Higgs", transport: "stdio", authMode: "oauth", enabled: true, command: "npx", args: "-y higgs-mcp",
    allowedToolNames: "generate_image", writeAllowedToolNames: "generate_image", principalId: "principal-1",
    oauth: { providerId: PROVIDER.providerId, grant: "authorization_code", clientId: "tovu-client", clientSecret: "s3cr3t", scopes: "images:generate", tokenEnvName: "HIGGS_TOKEN", ...oauth },
    ...overrides,
  } as never);
  await save();
  const connected: string[] = [];
  const service = createExternalMcpOAuthService({ signInLink: hostedMcpSignInLink, workspaceId: WORKSPACE, repo, sealer, keyring, clock, devices: createDeviceAuthorizationStore(),
    httpPorts: { guard: createTovuOAuthGuard({}, { allowLoopbackHttp: true }), fetchFn: ({ url }, init) => fetchFn(url, init) },
    lookupProvider: () => PROVIDER, onConnected: async serverId => { connected.push(serverId); } });
  const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state");
  await service.completeAuthorizationCallback({ serverId: SERVER, redirectUri: REDIRECT_URI, params: { state: state ?? "", code: "c" } });
  clock.advance(60 * 60 * 1000);
  const row = async () => (await repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER }))!;
  const disable = async () => {
    const current = await row();
    await applyExternalMcpAccess({ repo, clock, workspaceId: WORKSPACE, serverId: SERVER, expected: externalMcpAccessSnapshot({ record: current }),
      access: { enabled: false, allowedToolNames: [], writeAllowedToolNames: [] }, principalId: "admin" });
  };
  return { repo, sealer, hooks, service, row, disable, save, connected };
}

test("refresh-vs-disable: a refresh in flight does not re-enable a server an admin just disabled", async () => {
  const h = await harness();
  const before = await h.row();
  h.hooks.beforeSeal = h.disable;
  assert.equal(await h.service.tokenResolver.resolveAccessToken({ serverId: SERVER }), "at-2");
  const after = await h.row();
  assert.equal(after.enabled, false, "the refresh restored the enabled flag it read before the admin's disable");
  assert.equal(after.allowedToolNames, "[]", "the refresh restored the tool grants it read before the admin's change");
  assert.equal(after.version, before.version + 1, "only the admin's edit advances the version; the refresh does not");
  assert.equal((await openExternalMcpOAuthPayload(h.sealer, after)).tokens?.accessToken, "at-2", "the refreshed token is still stored");
});

test("refresh-after-credential-replaced: tokens for a credential an admin just replaced are dropped, and the refresh says it needs re-authorization", async () => {
  const h = await harness();
  h.hooks.beforeSeal = async () => { await h.save({}, { clientSecret: "rotated" }); };
  await assert.rejects(h.service.tokenResolver.resolveAccessToken({ serverId: SERVER }), ExternalMcpReauthRequiredError);
  const payload = await openExternalMcpOAuthPayload(h.sealer, await h.row());
  assert.equal(payload.clientSecret, "rotated", "the admin's new client secret survives");
  assert.notEqual(payload.tokens?.accessToken, "at-2", "the late refresh token was written onto the replacement credential");
});

for (const envelopes of [false, true]) test(`A callback cannot commit tokens after its OAuth configuration changes (${envelopes ? "present" : "absent"} envelopes)`, async () => {
  const h = await harness();
  h.connected.length = 0;
  if (!envelopes) await h.save({}, { clientId: "pending-client", clientSecret: undefined });
  const started = await h.service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  assert.equal(started.kind, "redirect_required");
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state")!;
  const original = await h.row();
  let release!: (response: Response) => void;
  const response = new Promise<Response>(resolve => { release = resolve; });
  let entered!: () => void;
  const exchanging = new Promise<void>(resolve => { entered = resolve; });
  h.hooks.exchange = async () => { entered(); return response; };
  const pending = h.service.completeAuthorizationCallback({ serverId: SERVER, redirectUri: REDIRECT_URI, params: { state, code: "held-code" } });
  await exchanging;
  await h.save({}, { clientId: "replacement-client", clientSecret: envelopes ? "replacement-secret" : undefined });
  const replacement = await h.row();
  if (envelopes) {
    assert.notEqual(original.sealedOAuth, null);
    assert.notEqual(replacement.sealedOAuth, null);
  } else {
    assert.equal(original.sealedOAuth, null);
    assert.equal(replacement.sealedOAuth, null);
  }
  assert.notEqual(replacement.version, original.version);
  release(new Response(JSON.stringify({ token_type: "Bearer", access_token: "late-token", refresh_token: "late-refresh", expires_in: 3600 }),
    { status: 200, headers: { "content-type": "application/json" } }));
  await assert.rejects(pending, ExternalMcpReauthRequiredError);
  assert.deepEqual(await h.row(), replacement);
  assert.equal((await openExternalMcpOAuthPayload(h.sealer, await h.row())).tokens, undefined);
  assert.deepEqual(h.connected, []);
});

for (const selfRegistered of [false, true]) test(`A late invalid-client response cannot clear the replacement (${selfRegistered ? "self-registered" : "typed"} client)`, async () => {
  const h = await harness();
  h.connected.length = 0;
  if (selfRegistered) {
    const current = await h.row();
    await h.repo.upsert({ ...current, oauthEndpointsJson: JSON.stringify({ dynamicClientId: current.oauthClientId, registeredRedirectUri: REDIRECT_URI }) });
  }
  const started = await h.service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  assert.equal(started.kind, "redirect_required");
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state")!;
  let release!: (response: Response) => void;
  const response = new Promise<Response>(resolve => { release = resolve; });
  let entered!: () => void;
  const exchanging = new Promise<void>(resolve => { entered = resolve; });
  h.hooks.exchange = async () => { entered(); return response; };
  const pending = h.service.completeAuthorizationCallback({ serverId: SERVER, redirectUri: REDIRECT_URI, params: { state, code: "held-code" } });
  await exchanging;
  await h.save({}, { clientId: "replacement-client", clientSecret: "replacement-secret" });
  const replacement = await h.row();
  release(new Response(JSON.stringify({ error: "invalid_client" }), { status: 401, headers: { "content-type": "application/json" } }));
  await assert.rejects(pending, (error: unknown) => {
    assert.ok(error instanceof OAuthError);
    assert.equal(error.code, "OAUTH_PROVIDER_REJECTED");
    assert.equal(error.providerErrorCode, "invalid_client");
    assert.equal(error.message, "the authorization server refused the request (HTTP 401, invalid_client)");
    return true;
  });
  const current = await h.row();
  assert.deepEqual(current, replacement);
  assert.equal(current.oauthClientId, "replacement-client");
  assert.equal(current.oauthStatus, replacement.oauthStatus);
  assert.deepEqual(current.sealedOAuth, replacement.sealedOAuth);
  assert.deepEqual(h.connected, []);
});
