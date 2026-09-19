import assert from "node:assert/strict";
import { hkdfSync } from "node:crypto";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { buildChallengeMessage } from "#src/features/publish-trust/challenge";
import { PUBLISH_TRUST_GRANT_VERSION } from "#src/features/publish-trust/grant";
import { derivePublishSigningKey } from "#src/features/publish-trust/keys";
import { PUBLISH_TRUST_ENV_VAR } from "#src/features/publish-trust/provisioning";
import type { KeyringPort } from "#src/features/webhooks/index";

/**
 * @file The publishing gate, over real HTTP, through the real app.
 *
 * `features/publish-trust/__tests__/handshake.test.ts` already proves the eight security
 * properties against the verifiers themselves. This file exists because a correct primitive with
 * an unwired call site is the failure mode that actually ships: every assertion below goes through
 * `createApp()`, so it fails if the middleware is not mounted, is mounted in the wrong order,
 * answers authorization from RBAC instead of the grant, or lets a publishing token fall through to
 * whatever credential the request happens to carry.
 *
 * The source install is a FAKE with its own root key — which is the honest arrangement, since the
 * two installs have different root keys by design and the destination only ever sees a public key.
 */
const WORKSPACE = "workspace-local";
const SOURCE_ROOT = "1".repeat(64);
const ATTACKER_ROOT = "9".repeat(64);
const SOURCE_INSTALL = "test-source-install";
const TARGET_ORIGIN = "https://destination.test";
const CAPABILITIES = ["publish_content.read", "publish_content.apply"] as const;
const A_SHA = "a".repeat(64);

/** The same HKDF construction `keyring.env.ts` uses — a faithful double, not a friendlier one. */
function testKeyring(rootKeyHex: string): KeyringPort {
  const rootKey = Buffer.from(rootKeyHex, "hex");
  return {
    async activeKey() {
      return { keyId: "v1" };
    },
    async deriveSigningSecret() {
      throw new Error("not used by publish-trust");
    },
    async derive(input: { workspaceId: string; purpose: string; info: string }) {
      return new Uint8Array(
        hkdfSync("sha256", rootKey, Buffer.alloc(0), `${input.purpose}:${input.workspaceId}:${input.info}`, 32)
      );
    },
  } as unknown as KeyringPort;
}

async function sourceKey(rootKeyHex = SOURCE_ROOT) {
  return derivePublishSigningKey({
    keyring: testKeyring(rootKeyHex),
    workspaceId: WORKSPACE,
    sourceInstallationId: SOURCE_INSTALL,
    targetOrigin: TARGET_ORIGIN,
    generation: 1,
  });
}

function grantDocument(publicKeyB64u: string): string {
  return JSON.stringify([
    {
      version: PUBLISH_TRUST_GRANT_VERSION,
      sourceInstallationId: SOURCE_INSTALL,
      publicKeys: [{ publicKeyB64u, generation: 1 }],
      workspaceId: WORKSPACE,
      entityTypes: ["post", "media"],
      capabilities: [...CAPABILITIES],
      notAfter: "2099-01-01T00:00:00.000Z",
    },
  ]);
}

/**
 * Starts the real app with `TOVU_PUBLISH_TRUST` set to `grantJson`.
 *
 * The env var is set BEFORE the first request rather than before `createApp`, because the grant
 * resolver reads it lazily on first use — which is itself worth pinning: a resolver that read at
 * module load would make the destination's revocation channel depend on import order.
 */
async function startServer(grantJson: string | undefined) {
  if (grantJson === undefined) delete process.env[PUBLISH_TRUST_ENV_VAR];
  else process.env[PUBLISH_TRUST_ENV_VAR] = grantJson;

  const server = createServer(createApp(createRouteDeps()));
  server.listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function stop(server: Server): Promise<void> {
  server.close();
  await once(server, "close");
}

/** Drives the real three-route handshake and returns everything a test might want to bend. */
async function handshakeOver(
  baseUrl: string,
  options: { signWith?: Awaited<ReturnType<typeof sourceKey>>; omitSignature?: boolean } = {}
) {
  const key = options.signWith ?? (await sourceKey());

  const challengeRes = await fetch(`${baseUrl}/api/publish-trust/v1/challenge`, { method: "POST" });
  const challenge = (await challengeRes.json()) as { nonce: string; targetInstallationId: string };

  const message = buildChallengeMessage({
    nonce: challenge.nonce,
    targetInstallationId: challenge.targetInstallationId,
    sourceInstallationId: SOURCE_INSTALL,
    generation: 1,
    capabilities: CAPABILITIES,
  });

  const body = {
    nonce: challenge.nonce,
    sourceInstallationId: SOURCE_INSTALL,
    generation: 1,
    capabilities: [...CAPABILITIES],
    signatureB64u: options.omitSignature ? "" : key.sign(message),
  };

  const sessionRes = await fetch(`${baseUrl}/api/publish-trust/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { challenge, body, sessionRes };
}

/** Reads the body exactly once and asserts the status against that same read — a
 *  `assert.equal(res.status, N, await res.text())` followed by `res.json()` double-consumes even on
 *  the passing path, because the template argument always evaluates. */
async function tokenFor(baseUrl: string): Promise<string> {
  const { sessionRes } = await handshakeOver(baseUrl);
  const raw = await sessionRes.text();
  assert.equal(sessionRes.status, 200, raw);
  return (JSON.parse(raw) as { token: string }).token;
}

function probe(baseUrl: string, token: string | null): Promise<Response> {
  return fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/blobs/probe`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ shas: [A_SHA] }),
  });
}

test("the identity route states this install's identity and nothing about who may publish to it", async () => {
  const key = await sourceKey();
  const { server, baseUrl } = await startServer(grantDocument(key.publicKeyB64u));
  try {
    const res = await fetch(`${baseUrl}/api/publish-trust/v1/identity`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;

    assert.deepEqual(Object.keys(body).sort(), ["installationId", "origin", "workspaceId"]);
    assert.equal(body.workspaceId, WORKSPACE);
    assert.equal(typeof body.installationId, "string");
    assert.ok((body.installationId as string).length > 0);

    // The grant is provisioned and must still be invisible here: no source id, no public key, and
    // nothing that distinguishes a paired site from an unpaired one.
    const serialized = JSON.stringify(body);
    assert.ok(!serialized.includes(SOURCE_INSTALL), "the identity route must not name who may publish here");
    assert.ok(!serialized.includes(key.publicKeyB64u), "the identity route must not disclose grant key material");
  } finally {
    await stop(server);
  }
});

test("a source that was never given a secret publishes end to end, over HTTP", async () => {
  const key = await sourceKey();
  const { server, baseUrl } = await startServer(grantDocument(key.publicKeyB64u));
  try {
    const token = await tokenFor(baseUrl);
    const res = await probe(baseUrl, token);
    const raw = await res.text();
    assert.equal(res.status, 200, raw);
    assert.deepEqual((JSON.parse(raw) as { missing: string[] }).missing, [A_SHA]);
  } finally {
    await stop(server);
  }
});

test("an UNSIGNED handshake is refused by the live route", async () => {
  const key = await sourceKey();
  const { server, baseUrl } = await startServer(grantDocument(key.publicKeyB64u));
  try {
    const { sessionRes } = await handshakeOver(baseUrl, { omitSignature: true });
    assert.equal(sessionRes.status, 401);
  } finally {
    await stop(server);
  }
});

test("a signature from the WRONG KEY is refused by the live route", async () => {
  const key = await sourceKey();
  const { server, baseUrl } = await startServer(grantDocument(key.publicKeyB64u));
  try {
    const { sessionRes } = await handshakeOver(baseUrl, { signWith: await sourceKey(ATTACKER_ROOT) });
    assert.equal(sessionRes.status, 401);
  } finally {
    await stop(server);
  }
});

test("a REPLAYED nonce is refused by the live route — single use is real, not documented", async () => {
  const key = await sourceKey();
  const { server, baseUrl } = await startServer(grantDocument(key.publicKeyB64u));
  try {
    const { body, sessionRes } = await handshakeOver(baseUrl);
    assert.equal(sessionRes.status, 200, "the first exchange must succeed, or the replay proves nothing");

    const replay = await fetch(`${baseUrl}/api/publish-trust/v1/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(replay.status, 401);
  } finally {
    await stop(server);
  }
});

test("a valid publish token cannot reach an ordinary content.write route", async () => {
  const key = await sourceKey();
  const { server, baseUrl } = await startServer(grantDocument(key.publicKeyB64u));
  try {
    const token = await tokenFor(baseUrl);
    const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/posts`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: "hostile", slug: "hostile" }),
    });
    assert.equal(res.status, 401, await res.text());
  } finally {
    await stop(server);
  }
});

test("a valid publish token cannot reach an admin route outside the publishing surface", async () => {
  const key = await sourceKey();
  const { server, baseUrl } = await startServer(grantDocument(key.publicKeyB64u));
  try {
    const token = await tokenFor(baseUrl);
    const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${WORKSPACE}/publish-content/peers`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 401, await res.text());
  } finally {
    await stop(server);
  }
});

test("a publish-trust route with NO token resolves to no credential", async () => {
  const key = await sourceKey();
  const { server, baseUrl } = await startServer(grantDocument(key.publicKeyB64u));
  try {
    const res = await probe(baseUrl, null);
    assert.equal(res.status, 401);
    assert.equal(((await res.json()) as { code: string }).code, "UNAUTHENTICATED");
  } finally {
    await stop(server);
  }
});

test("dropping the grant revokes publishing within one session, not at the end of one", async () => {
  const key = await sourceKey();
  const first = await startServer(grantDocument(key.publicKeyB64u));
  let token: string;
  try {
    token = await tokenFor(first.baseUrl);
    assert.equal((await probe(first.baseUrl, token)).status, 200);
  } finally {
    await stop(first.server);
  }

  // The same still-unexpired token, against an install whose operator emptied the kill switch.
  const revoked = await startServer("");
  try {
    assert.equal((await probe(revoked.baseUrl, token)).status, 401);
  } finally {
    await stop(revoked.server);
    delete process.env[PUBLISH_TRUST_ENV_VAR];
  }
});

test("an install that has never provisioned refuses the handshake without saying so", async () => {
  const { server, baseUrl } = await startServer(undefined);
  try {
    const { sessionRes } = await handshakeOver(baseUrl);
    assert.equal(sessionRes.status, 401);
    // Byte-identical to a bad-signature refusal: an unpaired site must not be distinguishable.
    assert.deepEqual(await sessionRes.json(), {
      error: "the publishing handshake was refused",
      code: "UNAUTHENTICATED",
    });
  } finally {
    await stop(server);
  }
});
