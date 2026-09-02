import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

process.env.TOVU_INTEGRATIONS_ROOT_KEY ??= randomBytes(32).toString("hex");

import { AesGcmSecretSealer } from "../../features/webhooks/secret-sealer.aesgcm.js";
import { EnvOrFileKeyring } from "../../features/webhooks/keyring.env.js";
import { buildExternalMcpOAuthAad } from "../external-mcp-aad.js";
import {
  EXTERNAL_MCP_OAUTH_PAYLOAD_VERSION,
  openExternalMcpOAuthPayload,
  sealExternalMcpOAuthPayload,
} from "../external-mcp-store.js";

/**
 * @file Proof that the sealed OAuth *payload* carries its own schema version.
 *
 * `oauth_aad_version` versions the AAD lineage — how the blob is bound to its row. It says nothing
 * about the shape of the plaintext inside. Without a version in the payload itself, a field can be
 * added but never renamed, changed, or removed: there is nothing to branch on at open time, and the
 * only way out later is a migration over live credentials. This is the cheap end of that trade.
 */

const keyring = new EnvOrFileKeyring({ allowFileFallback: false });
const sealer = new AesGcmSecretSealer(keyring);
const deps = { sealer, keyring };

const WORKSPACE = "workspace-1";
const SERVER = "server-a";
const IDENTITY = { workspaceId: WORKSPACE, serverId: SERVER };

const TOKENS = {
  accessToken: "at-1",
  refreshToken: "rt-1",
  tokenType: "Bearer",
  scopes: ["images:generate"],
  expiresAt: "2026-09-03T00:00:00.000Z" as const,
};

/** Seals a raw object the way a pre-versioning writer did — no `schemaVersion` in the plaintext. */
async function sealLegacy(payload: unknown) {
  return sealer.seal({
    plaintext: JSON.stringify(payload),
    key: await keyring.activeKey(),
    aad: buildExternalMcpOAuthAad(IDENTITY),
  });
}

test("the sealed plaintext carries a schemaVersion, not just the secret fields", async () => {
  const { sealedOAuth } = await sealExternalMcpOAuthPayload(deps, IDENTITY, { clientSecret: "s3cr3t", tokens: TOKENS });
  assert.ok(sealedOAuth);

  // Inspect the actual wire bytes, not the returned object.
  const raw = await sealer.open({ sealed: sealedOAuth, aad: buildExternalMcpOAuthAad(IDENTITY) });
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  assert.equal(parsed.schemaVersion, EXTERNAL_MCP_OAUTH_PAYLOAD_VERSION);
  assert.equal(EXTERNAL_MCP_OAUTH_PAYLOAD_VERSION, 1);
});

test("a round trip preserves the client secret and every token field", async () => {
  const { sealedOAuth, oauthAadVersion } = await sealExternalMcpOAuthPayload(deps, IDENTITY, {
    clientSecret: "s3cr3t",
    tokens: TOKENS,
  });

  const opened = await openExternalMcpOAuthPayload(sealer, { ...IDENTITY, sealedOAuth, oauthAadVersion });

  assert.equal(opened.clientSecret, "s3cr3t");
  assert.deepEqual(opened.tokens, TOKENS);
});

test("a legacy payload with NO schemaVersion still opens — upgraded on read, never rescued by a migration", async () => {
  const legacy = await sealLegacy({ clientSecret: "legacy-secret", tokens: TOKENS });

  const opened = await openExternalMcpOAuthPayload(sealer, {
    ...IDENTITY,
    sealedOAuth: legacy,
    oauthAadVersion: 1,
  });

  assert.equal(opened.clientSecret, "legacy-secret");
  assert.deepEqual(opened.tokens, TOKENS);
});

test("the version never leaks into the payload callers see", async () => {
  const { sealedOAuth, oauthAadVersion } = await sealExternalMcpOAuthPayload(deps, IDENTITY, { clientSecret: "s3cr3t" });
  const opened = await openExternalMcpOAuthPayload(sealer, { ...IDENTITY, sealedOAuth, oauthAadVersion });

  // `schemaVersion` is a wire concern. A caller that saw it could start persisting it back.
  assert.ok(!("schemaVersion" in opened), "schemaVersion must not surface in the opened payload");
});

test("a payload written by a NEWER build is refused loudly rather than silently misread", async () => {
  const future = await sealLegacy({ schemaVersion: 99, clientSecret: "from-the-future" });

  await assert.rejects(
    () => openExternalMcpOAuthPayload(sealer, { ...IDENTITY, sealedOAuth: future, oauthAadVersion: 1 }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(
        err.message,
        "external MCP OAuth payload was written at schema version 99, newer than this build understands (1) — upgrade rather than risk misreading a live credential",
      );
      return true;
    },
  );
});
