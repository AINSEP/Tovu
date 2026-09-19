import assert from "node:assert/strict";
import { hkdfSync } from "node:crypto";
import { once } from "node:events";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { createServer, request as requestOverSocket, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildChallengeMessage } from "#src/features/publish-trust/challenge";
import { PUBLISH_TRUST_GRANT_VERSION } from "#src/features/publish-trust/grant";
import { derivePublishSigningKey } from "#src/features/publish-trust/keys";
import { PUBLISH_TRUST_ENV_VAR } from "#src/features/publish-trust/provisioning";
import type { KeyringPort } from "#src/features/webhooks/index";
import { publishTrustRevocations } from "#src/platform/db/schema";
import { openContentDb, type ContentDb } from "#src/platform/db/sqlite/content-db";
import { SqlitePublishTrustRevocationStore } from "#src/platform/db/sqlite/publish-trust-revocations.sqlite";
import { createApp } from "#src/server/runtime/composition/app";
import { createSqliteRouteDeps } from "#src/server/runtime/composition/deps";

/**
 * @file End-to-end proof that the real, database-backed destination disconnect survives until the
 * next request. The token is minted before the disconnect; the source remains cryptographically
 * valid, so only the live request gate can make the second request fail.
 */
const WORKSPACE = "workspace-local";
const SOURCE_ROOT = "1".repeat(64);
const SOURCE_INSTALL = "test-source-install";
const TARGET_ORIGIN = "https://destination.test";
const CAPABILITIES = ["publish_content.read", "publish_content.apply"] as const;
const A_SHA = "a".repeat(64);
const NOW = "2026-09-19T12:00:00.000Z";
const SOURCE_DB = join(process.cwd(), "sites", "tovu-com", "content.db");

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

async function sourceKey() {
  return derivePublishSigningKey({
    keyring: testKeyring(SOURCE_ROOT),
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

async function copiedContentDb(): Promise<{ dir: string; db: ContentDb }> {
  const dir = await mkdtemp(join(tmpdir(), "tovu-publish-trust-db-"));
  const dbPath = join(dir, "content.db");
  await copyFile(SOURCE_DB, dbPath);
  return { dir, db: openContentDb(dbPath) };
}

interface SocketResponse {
  readonly status: number;
  readonly body: string;
}

function requestFromSocket(input: {
  readonly socketPath: string;
  readonly path: string;
  readonly method: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
}): Promise<SocketResponse> {
  return new Promise((resolve, reject) => {
    const request = requestOverSocket(
      { socketPath: input.socketPath, path: input.path, method: input.method, headers: input.headers },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          body += chunk;
        });
        response.on("end", () => resolve({ status: response.statusCode ?? 0, body }));
      }
    );
    request.on("error", reject);
    request.end(input.body);
  });
}

async function tokenFor(socketPath: string): Promise<string> {
  const key = await sourceKey();
  const challengeRes = await requestFromSocket({ socketPath, path: "/api/publish-trust/v1/challenge", method: "POST" });
  assert.equal(challengeRes.status, 200, challengeRes.body);
  const challenge = JSON.parse(challengeRes.body) as { nonce: string; targetInstallationId: string };
  const message = buildChallengeMessage({
    nonce: challenge.nonce,
    targetInstallationId: challenge.targetInstallationId,
    sourceInstallationId: SOURCE_INSTALL,
    generation: 1,
    capabilities: CAPABILITIES,
  });
  const sessionRes = await requestFromSocket({
    socketPath,
    path: "/api/publish-trust/v1/session",
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      nonce: challenge.nonce,
      sourceInstallationId: SOURCE_INSTALL,
      generation: 1,
      capabilities: [...CAPABILITIES],
      signatureB64u: key.sign(message),
    }),
  });
  assert.equal(sessionRes.status, 200, sessionRes.body);
  return (JSON.parse(sessionRes.body) as { token: string }).token;
}

function probe(socketPath: string, token: string): Promise<SocketResponse> {
  return requestFromSocket({
    socketPath,
    path: `/api/admin/v1/workspaces/${WORKSPACE}/publish-content/blobs/probe`,
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ shas: [A_SHA] }),
  });
}

async function stop(server: Server): Promise<void> {
  server.close();
  await once(server, "close");
  delete process.env[PUBLISH_TRUST_ENV_VAR];
}

test("a database disconnect refuses the next real publish request even with its already-minted valid token", async () => {
  const { dir, db } = await copiedContentDb();
  let server: Server | undefined;
  let deps: ReturnType<typeof createSqliteRouteDeps> | undefined;
  try {
    const key = await sourceKey();
    process.env[PUBLISH_TRUST_ENV_VAR] = grantDocument(key.publicKeyB64u);
    deps = createSqliteRouteDeps(join(dir, "content.db"), { db, workspaceId: WORKSPACE, themesDir: join(dir, "themes") });
    deps.siteAssistantSecretKeyring = testKeyring(SOURCE_ROOT);
    assert.ok(deps.publishTrustRevocations instanceof SqlitePublishTrustRevocationStore);

    server = createServer(createApp(deps));
    const socketPath = join(dir, "publish-trust.sock");
    server.listen(socketPath);
    await once(server, "listening");

    const token = await tokenFor(socketPath);
    const before = await probe(socketPath, token);
    assert.equal(before.status, 200, before.body);

    // This is the destination-owner disconnect write through the real SQLite adapter, not a
    // fabricated reader result. The request gate has received only `list`, never this writer.
    const disconnected = await deps.publishTrustRevocations.revoke({ sourceInstallationId: SOURCE_INSTALL, nowIso: NOW });
    assert.equal(disconnected.ok, true, disconnected.ok ? "" : disconnected.reason);
    assert.equal(disconnected.ok && disconnected.changed, true);
    assert.equal(db.select().from(publishTrustRevocations).all().length, 1, "the disconnect must be durable in content.db");

    const after = await probe(socketPath, token);
    assert.equal(after.status, 401, after.body);
    assert.deepEqual(JSON.parse(after.body), { error: "unauthenticated", code: "UNAUTHENTICATED" });
  } finally {
    if (server) await stop(server);
    if (deps) {
      await Promise.allSettled(
        Object.entries(deps)
          .filter(([key, value]) => key.endsWith("Ready") && value instanceof Promise)
          .map(([, value]) => value as Promise<unknown>)
      );
    }
    db.$client.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("the SQLite deny store fails loudly at boot when its migration table is unavailable", async () => {
  const { dir, db } = await copiedContentDb();
  try {
    db.$client.exec("DROP TABLE publish_trust_revocations");
    assert.throws(
      () => new SqlitePublishTrustRevocationStore(db),
      /publish trust revocation store is unavailable at boot/i
    );
  } finally {
    db.$client.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("a disconnect row survives reopening the copied site content database", async () => {
  const { dir, db } = await copiedContentDb();
  let reopened: ContentDb | undefined;
  try {
    const store = new SqlitePublishTrustRevocationStore(db);
    const written = await store.revoke({ sourceInstallationId: SOURCE_INSTALL, nowIso: NOW, note: "lost device" });
    assert.equal(written.ok, true, written.ok ? "" : written.reason);
    db.$client.close();

    reopened = openContentDb(join(dir, "content.db"));
    const reread = await new SqlitePublishTrustRevocationStore(reopened).list();
    assert.deepEqual(reread, {
      ok: true,
      revocations: [{ sourceInstallationId: SOURCE_INSTALL, revokedAt: NOW, note: "lost device" }],
    });
  } finally {
    if (reopened) reopened.$client.close();
    else db.$client.close();
    await rm(dir, { recursive: true, force: true });
  }
});
