import assert from "node:assert/strict";
import test from "node:test";
import { createTovuOAuthGuard } from "../../../platform/oauth/endpoint-safety.js";
import { type OAuthProviderDescriptor } from "../../../platform/oauth/index.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import type { SecretSealerPort } from "@jini-ai/integrations/webhooks";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { createDeviceAuthorizationStore, createExternalMcpOAuthService, ExternalMcpReauthRequiredError } from "../external-mcp-oauth.js";
import { InMemoryExternalMcpServerRepo } from "../external-mcp-store.memory.js";
import { applyExternalMcpAccess, externalMcpAccessSnapshot, openExternalMcpOAuthPayload, saveExternalMcpServer } from "../external-mcp-store.js";

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
  const inner = new AesGcmSecretSealer(keyring);
  const hooks: { beforeSeal?: () => Promise<void> } = {};
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
  const fetchFn = (async () => new Response(JSON.stringify({ token_type: "Bearer", access_token: `at-${++tokens}`, refresh_token: `rt-${tokens}`, expires_in: 3600 }),
    { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  const save = (overrides: Record<string, unknown> = {}, oauth: Record<string, unknown> = {}) => saveExternalMcpServer({ repo, sealer, keyring, clock }, {
    workspaceId: WORKSPACE, serverId: SERVER, label: "Higgs", transport: "stdio", authMode: "oauth", enabled: true, command: "npx", args: "-y higgs-mcp",
    allowedToolNames: "generate_image", writeAllowedToolNames: "generate_image", principalId: "principal-1",
    oauth: { providerId: PROVIDER.providerId, grant: "authorization_code", clientId: "tovu-client", clientSecret: "s3cr3t", scopes: "images:generate", tokenEnvName: "HIGGS_TOKEN", ...oauth },
    ...overrides,
  } as never);
  await save();
  const service = createExternalMcpOAuthService({ workspaceId: WORKSPACE, repo, sealer, keyring, clock, devices: createDeviceAuthorizationStore(),
    httpPorts: { guard: createTovuOAuthGuard({}, { allowLoopbackHttp: true }), fetchFn: ({ url }, init) => fetchFn(url, init) },
    lookupProvider: () => PROVIDER });
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
  return { repo, sealer, hooks, service, row, disable, save };
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
