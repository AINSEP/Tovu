import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryKeyring } from "../../features/webhooks/keyring.memory.js";
import { AesGcmSecretSealer } from "../../features/webhooks/secret-sealer.aesgcm.js";
import { createPendingAuthorizationStore, type OAuthFetch, type OAuthProviderDescriptor } from "../../platform/oauth/index.js";
import { createDeviceAuthorizationStore, createExternalMcpOAuthService } from "../external-mcp-oauth.js";
import { InMemoryExternalMcpServerRepo } from "../external-mcp-store.memory.js";
import { openExternalMcpOAuthPayload, saveExternalMcpServer } from "../external-mcp-store.js";
import { EXTERNAL_MCP_AAD_VERSION } from "../external-mcp-aad.js";

/**
 * @file Regression proof for the write-path version desync.
 *
 * `sealExternalMcpOAuthPayload` binds AAD unconditionally, but `openExternalMcpOAuthPayload` only
 * passes AAD when the row's `oauthAadVersion` says to. `external-mcp-oauth.ts`'s writers rebuild
 * their row with `{ ...record, sealedOAuth }`, which carries the row's OLD version forward next to
 * a ciphertext that was just re-sealed WITH AAD. On a legacy row still at version 0 that leaves the
 * blob permanently unopenable — the read takes the no-AAD branch, the auth tag fails, and the
 * client secret and both tokens are gone with no error until the next read.
 */

const WORKSPACE = "workspace-1";
const SERVER = "higgs";
const REDIRECT_URI = "https://tovu.example.com/api/mcp-servers/oauth/callback/higgs";

const PROVIDER: OAuthProviderDescriptor = {
  providerId: "test-provider",
  label: "Test Provider",
  supportedGrants: ["authorization_code"],
  authorizationEndpoint: "https://auth.example.com/authorize",
  tokenEndpoint: "https://auth.example.com/token",
  deviceAuthorizationEndpoint: "https://auth.example.com/device",
  defaultScopes: [],
  usesPkce: true,
  clientAuth: "none",
};

function scriptedFetch(script: readonly unknown[]): OAuthFetch {
  let calls = 0;
  return (async (): Promise<Response> => {
    const body = script[Math.min(calls, script.length - 1)] ?? {};
    calls += 1;
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as OAuthFetch;
}

function makeClock() {
  let nowMs = Date.parse("2026-08-25T12:00:00.000Z");
  return { nowIso: () => new Date(nowMs).toISOString(), advance: (ms: number) => void (nowMs += ms) };
}

async function harness() {
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
      oauth: {
        providerId: PROVIDER.providerId, grant: "authorization_code", clientId: "tovu-client",
        clientSecret: "s3cr3t", scopes: "images:generate", tokenEnvName: "HIGGS_TOKEN",
      },
    },
  );

  const service = createExternalMcpOAuthService({
    workspaceId: WORKSPACE, repo, sealer, keyring, clock,
    pending: createPendingAuthorizationStore({ clock }),
    devices: createDeviceAuthorizationStore(),
    fetchFn: scriptedFetch([{ access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 }]),
    lookupProvider: () => PROVIDER,
  });

  return { repo, sealer, keyring, clock, service };
}

/** Rewrites the row into exactly the shape it had before AAD existed: blob sealed with no AAD, version 0. */
async function downgradeToLegacyRow(
  repo: InMemoryExternalMcpServerRepo,
  sealer: AesGcmSecretSealer,
  keyring: InMemoryKeyring,
): Promise<void> {
  const row = await repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });
  assert.ok(row);
  const legacy = await sealer.seal({
    plaintext: JSON.stringify({ clientSecret: "s3cr3t" }),
    key: await keyring.activeKey(),
  });
  await repo.upsert({ ...row, sealedOAuth: legacy, oauthAadVersion: 0 });
}

async function connect(service: Awaited<ReturnType<typeof harness>>["service"]): Promise<void> {
  const started = await service.beginConnect({ serverId: SERVER, redirectUri: REDIRECT_URI });
  assert.equal(started.kind, "redirect_required");
  const state = new URL(started.kind === "redirect_required" ? started.authorizationUrl : "").searchParams.get("state");
  await service.completeAuthorizationCallback({ serverId: SERVER, params: { state: state ?? "", code: "auth-code" } });
}

test("a legacy v0 row survives a token persist — the writer must not carry the old version next to a re-sealed blob", async () => {
  const { repo, sealer, keyring, service } = await harness();
  await downgradeToLegacyRow(repo, sealer, keyring);

  // Sanity: the legacy row is readable BEFORE the write, so any failure after it is the write's fault.
  const before = await repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });
  assert.equal((await openExternalMcpOAuthPayload(sealer, before!)).clientSecret, "s3cr3t");

  await connect(service);

  const after = await repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });
  assert.ok(after);
  // The blob was re-sealed WITH aad, so the row must now say so. Before the fix this stayed 0.
  assert.equal(after.oauthAadVersion, EXTERNAL_MCP_AAD_VERSION, "writer left the row's version behind its ciphertext");

  const payload = await openExternalMcpOAuthPayload(sealer, after);
  assert.equal(payload.tokens?.accessToken, "at-1");
  assert.equal(payload.clientSecret, "s3cr3t", "the client secret sharing the blob must survive too");
});

test("the desync is unopenable, not merely mislabelled — proving the data loss is real", async () => {
  const { repo, sealer, keyring } = await harness();
  await downgradeToLegacyRow(repo, sealer, keyring);
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
      assert.match(err.message, /^stored OAuth credentials could not be decrypted: /);
      return true;
    },
  );
});

test("every OAuth write leaves version and ciphertext in step", async () => {
  const { repo, sealer, keyring, service } = await harness();
  await downgradeToLegacyRow(repo, sealer, keyring);
  await connect(service);

  const row = await repo.findByServerId({ workspaceId: WORKSPACE, serverId: SERVER });
  assert.ok(row);
  // The standing invariant: a row holding a blob must never be behind the current AAD version.
  if (row.sealedOAuth !== null) {
    assert.equal(row.oauthAadVersion, EXTERNAL_MCP_AAD_VERSION);
  }
  await assert.doesNotReject(() => openExternalMcpOAuthPayload(sealer, row));
});
