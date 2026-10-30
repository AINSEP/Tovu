// openid-client validates token_type; successful provider fixtures include the required wire field.
import { createTovuOAuthGuard } from "../../../platform/oauth/endpoint-safety.js";
import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { type OAuthProviderDescriptor } from "../../../platform/oauth/index.js";
import { createDeviceAuthorizationStore, createExternalMcpOAuthService } from "../external-mcp-oauth.js";
import { InMemoryExternalMcpServerRepo } from "../external-mcp-store.memory.js";
import { openExternalMcpOAuthPayload, saveExternalMcpServer } from "../external-mcp-store.js";
import { EXTERNAL_MCP_VAULT_VERSION } from "../external-mcp-store.js";
import { sealExternalMcpVaultPayload } from "../external-mcp-vault.js";
import type { VaultMeta } from "@jini-ai/platform/secrets/credential-sets";

/**
 * @file Characterize every OAuth writer against normalized vault envelopes: callback, refresh,
 * disconnect, reauth, self-registration and device polling must retain the client secret.
 * Legacy AAD conversion is owned by the boot codec, not these ordinary feature writers.
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

function scriptedFetch(script: readonly unknown[]): typeof fetch {
  let calls = 0;
  return (async (): Promise<Response> => {
    const body = script[Math.min(calls, script.length - 1)] ?? {};
    calls += 1;
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

function makeClock() {
  let nowMs = Date.parse("2026-08-25T12:00:00.000Z");
  return { nowMs: () => nowMs,
    nowIso: () => new Date(nowMs).toISOString(), advance: (ms: number) => void (nowMs += ms) };
}

async function harness(fetchFn?: typeof fetch) {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const clock = makeClock();

  await saveExternalMcpServer(
    { repo, sealer, keyring, clock },
    {
      workspaceId: WORKSPACE, serverId: SERVER, label: "Higgs", transport: "stdio",
      authMode: "oauth", enabled: true, command: "npx", args: "-y higgs-mcp",
      allowedToolNames: "generate_image",
      writeAllowedToolNames: "",
      principalId: "principal-1",
      oauth: {
        providerId: PROVIDER.providerId, grant: "authorization_code", clientId: "tovu-client",
        clientSecret: "s3cr3t", scopes: "images:generate", tokenEnvName: "HIGGS_TOKEN",
      },
    },
  );

  const service = createExternalMcpOAuthService({
    workspaceId: WORKSPACE, repo, sealer, keyring, clock,
    devices: createDeviceAuthorizationStore(),
    httpPorts: { guard: createTovuOAuthGuard({}, { allowLoopbackHttp: true }),
      fetchFn: ({ url }, init) => (fetchFn ?? scriptedFetch([{ token_type: "Bearer", access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 }]))(url, init) },
    lookupProvider: () => PROVIDER,
  });

  return { repo, sealer, keyring, clock, service };
}

/** Seed a boot-normalized vault payload without changing the existing OAuth writer probes. */
async function seedVaultPayload(
  repo: InMemoryExternalMcpServerRepo,
  sealer: AesGcmSecretSealer,
  keyring: InMemoryKeyring,
  payload: VaultMeta = { clientSecret: "s3cr3t" },
): Promise<void> {
  const row = await repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });
  assert.ok(row);
  const sealedOAuth = await sealExternalMcpVaultPayload({ deps: { sealer, keyring }, identity: row, kind: "mcp-auth", payload });
  await repo.upsert({ ...row, sealedOAuth, oauthAadVersion: 1 });
}

async function connect(service: Awaited<ReturnType<typeof harness>>["service"]): Promise<void> {
  const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  assert.equal(started.kind, "redirect_required");
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state");
  await service.completeAuthorizationCallback({ serverId: SERVER, redirectUri: REDIRECT_URI, params: { state: state ?? "", code: "auth-code" } });
}

test("a normalized vault row survives a token persist — the writer must not carry the old version next to a re-sealed blob", async () => {
  const { repo, sealer, keyring, service } = await harness();
  await seedVaultPayload(repo, sealer, keyring);

  // Sanity: the vault row is readable BEFORE the write, so any failure after it is the write's fault.
  const before = await repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });
  assert.equal((await openExternalMcpOAuthPayload(sealer, before!)).clientSecret, "s3cr3t");

  await connect(service);

  const after = await repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });
  assert.ok(after);
  // The public compatibility lineage remains current while Jini authenticates the vault context.
  assert.equal(after.oauthAadVersion, EXTERNAL_MCP_VAULT_VERSION, "writer left the row's version behind its ciphertext");

  const payload = await openExternalMcpOAuthPayload(sealer, after);
  assert.equal(payload.tokens?.accessToken, "at-1");
  assert.equal(payload.clientSecret, "s3cr3t", "the client secret sharing the blob must survive too");
});

test("the desync is unopenable, not merely mislabelled — proving the data loss is real", async () => {
  const { repo, sealer, keyring } = await harness();
  await seedVaultPayload(repo, sealer, keyring);
  const row = await repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });

  // Hand-build the exact desynced row the buggy writer produced: AAD-bound ciphertext, version 0.
  const aadBound = await sealer.seal({
    plaintext: JSON.stringify({ clientSecret: "s3cr3t" }),
    key: await keyring.activeKey(),
    aad: `external-mcp-oauth:v1:${WORKSPACE}:${SERVER}`,
  });

  await assert.rejects(
    () => openExternalMcpOAuthPayload(sealer, { ...row!, sealedOAuth: aadBound, oauthAadVersion: 0 }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(err.message, "Stored OAuth credentials could not be decrypted.");
      return true;
    },
  );
});

test("every OAuth write leaves version and ciphertext in step", async () => {
  const { repo, sealer, keyring, service } = await harness();
  await seedVaultPayload(repo, sealer, keyring);
  await connect(service);

  const row = await repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });
  assert.ok(row);
  // The standing invariant: a row holding a blob must never be behind the current AAD version.
  if (row.sealedOAuth !== null) {
    assert.equal(row.oauthAadVersion, EXTERNAL_MCP_VAULT_VERSION);
  }
  await assert.doesNotReject(() => openExternalMcpOAuthPayload(sealer, row));
});

for (const operation of ["disconnect", "reportAuthFailure"] as const) {
  test(`a normalized vault row survives ${operation}'s independent clear-token writer`, async () => {
    const { repo, sealer, keyring, service } = await harness();
    await seedVaultPayload(repo, sealer, keyring, {
      clientSecret: "s3cr3t", tokens: { accessToken: "legacy-at", refreshToken: "legacy-rt", tokenType: "Bearer" },
    });
    const before = await repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });
    assert.equal((await openExternalMcpOAuthPayload(sealer, before!)).tokens?.accessToken, "legacy-at");
    if (operation === "disconnect") await service.disconnect({ serverId: SERVER });
    else await assert.rejects(service.reportAuthFailure(SERVER, new Error("remote rejected token")), /authorization expired or was revoked/);
    const after = await repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });
    assert.ok(after);
    assert.equal(after.oauthAadVersion, EXTERNAL_MCP_VAULT_VERSION);
    assert.equal(after.oauthStatus, operation === "disconnect" ? "disconnected" : "needs_reauth");
    const payload = await openExternalMcpOAuthPayload(sealer, after);
    assert.equal(payload.clientSecret, "s3cr3t");
    assert.equal(payload.tokens, undefined);
  });
}

for (const registerClient of [false, true]) {
  test(`a normalized vault row survives self-configuration ${registerClient ? "with DCR" : "keeping the operator client"}`, async () => {
    const { repo, sealer, keyring, service } = await harness(scriptedFetch([
      { resource: "https://mcp.example.com/mcp", authorization_servers: ["https://auth.example.com"] },
      {
        issuer: "https://auth.example.com", authorization_endpoint: PROVIDER.authorizationEndpoint,
        token_endpoint: PROVIDER.tokenEndpoint, registration_endpoint: "https://auth.example.com/register",
        grant_types_supported: ["authorization_code"], token_endpoint_auth_methods_supported: ["client_secret_post"],
      },
      // RFC 7591 requires an expiry when a client secret is issued; zero means no expiry.
      { client_id: "dcr-client", client_secret: "dcr-secret", client_secret_expires_at: 0, token_endpoint_auth_method: "client_secret_post" },
    ]));
    const tokens = { accessToken: "legacy-at", refreshToken: "legacy-rt", tokenType: "Bearer" };
    await seedVaultPayload(repo, sealer, keyring, { clientSecret: "s3cr3t", tokens });
    const before = await repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });
    assert.ok(before);
    assert.equal((await openExternalMcpOAuthPayload(sealer, before)).clientSecret, "s3cr3t");
    await repo.upsert({ ...before, transport: "streamable_http", url: "https://mcp.example.com/mcp",
      oauthProviderId: null, oauthGrant: null, oauthEndpointsJson: null,
      oauthClientId: registerClient ? null : before.oauthClientId });
    assert.equal((await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI })).kind, "redirect_required");
    const after = await repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });
    assert.ok(after);
    assert.equal(after.oauthAadVersion, EXTERNAL_MCP_VAULT_VERSION);
    assert.equal(after.oauthStatus, "pending");
    const payload = await openExternalMcpOAuthPayload(sealer, after);
    assert.equal(payload.clientSecret, registerClient ? "dcr-secret" : "s3cr3t");
    assert.deepEqual(payload.tokens, tokens);
  });
}

test("a normalized vault row survives device-code token persistence", async () => {
  const { repo, sealer, keyring, service, clock } = await harness(scriptedFetch([
    { device_code: "dc-1", user_code: "UC-1", verification_uri: "https://auth.example.com/device", expires_in: 600, interval: 1 },
    { token_type: "Bearer", access_token: "device-at", refresh_token: "device-rt", expires_in: 3600 },
  ]));
  await seedVaultPayload(repo, sealer, keyring);
  const before = await repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });
  assert.ok(before);
  assert.equal((await openExternalMcpOAuthPayload(sealer, before)).clientSecret, "s3cr3t");
  await repo.upsert({ ...before, oauthGrant: "device_code" });
  assert.equal((await service.beginConnect({ serverId: SERVER })).kind, "device_code");
  clock.advance(1000);
  assert.deepEqual(await service.pollDeviceAuthorization({ serverId: SERVER }), { status: "connected" });
  const after = await repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });
  assert.ok(after);
  assert.equal(after.oauthAadVersion, EXTERNAL_MCP_VAULT_VERSION);
  const payload = await openExternalMcpOAuthPayload(sealer, after);
  assert.equal(payload.clientSecret, "s3cr3t");
  assert.equal(payload.tokens?.accessToken, "device-at");
});
