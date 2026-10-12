import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { and, eq } from "drizzle-orm";
import type { Clock } from "@jini-ai/core/primitives";

import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { oauthDeviceAuthorizations, workspaces } from "../schema.sqlite.js";
import { openContentDb, type ContentDb } from "../sqlite/content-db.js";
import { createSqliteDeviceAuthorizationStore } from "../sqlite/oauth-pending-store.sqlite.js";

/**
 * @file Device authorizations remain durable across independently opened content.db handles.
 * Step 0012 retires only the redirect pending table: redirect state is now sealed and stateless,
 * covered by the external-MCP stateless suites. Device secrets still need authenticated sealing,
 * workspace/server isolation, expiry and overwrite semantics. Every database here is disposable.
 */

function tmpDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oauth-pending-store-test-"));
  return path.join(dir, "content.db");
}

/** A clock the test moves by hand — same shape as `platform/oauth/__tests__/helpers.ts`'s, restated
 *  here rather than imported so this file has no test-only dependency on a sibling module's test
 *  helpers. */
function createTestClock(startIso = "2026-09-10T12:00:00.000Z"): Clock & { nowIso(): string; advance(ms: number): void } {
  let nowMs = Date.parse(startIso);
  return {
    nowMs: () => nowMs,
    nowIso: () => new Date(nowMs).toISOString(),
    advance: (ms) => {
      nowMs += ms;
    },
  };
}

/** Inserts the one workspace row `oauth_device_authorizations`' FK requires. Minimal by design —
 *  this suite exercises the OAuth handshake tables, not the workspace/post seed machinery. */
function insertWorkspace(db: ContentDb, id: string): void {
  db.insert(workspaces).values({ id, name: "Test Workspace", slug: `test-${id}`, createdAt: new Date().toISOString() }).run();
}

test("THE FIX (device grant) — a device authorization begun through one store instance is read through a SECOND, independently-constructed instance sharing the same content.db", async () => {
  const dbPath = tmpDbPath();
  const dbProcessA = openContentDb(dbPath);
  const dbProcessB = openContentDb(dbPath);
  const workspaceId = randomUUID();
  insertWorkspace(dbProcessA, workspaceId);
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const clock = createTestClock();

  const storeInProcessA = createSqliteDeviceAuthorizationStore({ db: dbProcessA, workspaceId, clock, sealer, keyring });
  const storeInProcessB = createSqliteDeviceAuthorizationStore({ db: dbProcessB, workspaceId, clock, sealer, keyring });

  const authorization = {
    deviceCode: "device-code-secret",
    userCode: "ABCD-1234",
    verificationUri: "https://provider.example.com/device",
    verificationUriComplete: "https://provider.example.com/device?user_code=ABCD-1234",
    expiresAt: "2026-09-10T12:10:00.000Z",
    intervalSeconds: 5,
  };
  await storeInProcessA.put("higgsfield", authorization);

  const readBack = await storeInProcessB.get("higgsfield");
  assert.ok(readBack);
  assert.deepEqual(readBack, authorization);
  assert.equal(readBack.deviceCode, "device-code-secret");
  assert.equal(readBack.userCode, "ABCD-1234");

  await storeInProcessB.delete("higgsfield");
  assert.equal(await storeInProcessA.get("higgsfield"), undefined);
});

test("deviceCode is sealed at rest — the raw row never carries the plaintext device code", async () => {
  const dbPath = tmpDbPath();
  const db = openContentDb(dbPath);
  const workspaceId = randomUUID();
  insertWorkspace(db, workspaceId);
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const store = createSqliteDeviceAuthorizationStore({ db, workspaceId, clock: createTestClock(), sealer, keyring });

  await store.put("higgsfield", {
    deviceCode: "plaintext-device-code-must-not-leak",
    userCode: "ABCD-1234",
    verificationUri: "https://provider.example.com/device",
    verificationUriComplete: null,
    expiresAt: "2026-09-10T12:10:00.000Z",
    intervalSeconds: 5,
  });

  const row = db
    .select()
    .from(oauthDeviceAuthorizations)
    .all()
    .find((candidate) => candidate.workspaceId === workspaceId && candidate.serverId === "higgsfield");
  assert.ok(row);
  assert.notEqual(row.sealedCiphertext, "plaintext-device-code-must-not-leak");
  assert.ok(!row.sealedCiphertext.includes("plaintext-device-code-must-not-leak"));
  // The non-secret fields stay in the clear, matching `DeviceAuthorization`'s own doc.
  assert.equal(row.userCode, "ABCD-1234");
});

test("device store put() overwrites a connection's own previous attempt, matching the in-memory adapter's Map.set semantics", async () => {
  const dbPath = tmpDbPath();
  const db = openContentDb(dbPath);
  const workspaceId = randomUUID();
  insertWorkspace(db, workspaceId);
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const store = createSqliteDeviceAuthorizationStore({ db, workspaceId, clock: createTestClock(), sealer, keyring });

  await store.put("higgsfield", {
    deviceCode: "first-attempt",
    userCode: "AAAA-1111",
    verificationUri: "https://provider.example.com/device",
    verificationUriComplete: null,
    expiresAt: "2026-09-10T12:10:00.000Z",
    intervalSeconds: 5,
  });
  const updated = {
    deviceCode: "second-attempt",
    userCode: "BBBB-2222",
    verificationUri: "https://provider.example.com/device-v2",
    verificationUriComplete: "https://provider.example.com/device-v2?user_code=BBBB-2222",
    expiresAt: "2026-09-10T12:20:00.000Z",
    intervalSeconds: 10,
  };
  await store.put("higgsfield", updated);

  const readBack = await store.get("higgsfield");
  assert.ok(readBack);
  assert.deepEqual(readBack, updated);
  assert.equal(readBack.deviceCode, "second-attempt");
  assert.equal(readBack.userCode, "BBBB-2222");

  const rows = db
    .select()
    .from(oauthDeviceAuthorizations)
    .all()
    .filter((candidate) => candidate.workspaceId === workspaceId && candidate.serverId === "higgsfield");
  assert.equal(rows.length, 1, "put() must overwrite the existing row, not accumulate a second one");
});

test("device get/delete isolate the same server id in two workspaces", async () => {
  const db = openContentDb(":memory:");
  const workspaceA = randomUUID();
  const workspaceB = randomUUID();
  insertWorkspace(db, workspaceA);
  insertWorkspace(db, workspaceB);
  const keyring = new InMemoryKeyring();
  const deps = { db, clock: createTestClock(), sealer: new AesGcmSecretSealer(keyring), keyring };
  const storeA = createSqliteDeviceAuthorizationStore({ ...deps, workspaceId: workspaceA });
  const storeB = createSqliteDeviceAuthorizationStore({ ...deps, workspaceId: workspaceB });
  const first = {
    deviceCode: "workspace-a-device", userCode: "AAAA-1111",
    verificationUri: "https://provider.example/device", verificationUriComplete: null,
    expiresAt: "2026-09-10T12:10:00.000Z", intervalSeconds: 5,
  };
  const second = { ...first, deviceCode: "workspace-b-device", userCode: "BBBB-2222" };
  await storeA.put("same-server", first);
  assert.equal(await storeB.get("same-server"), undefined);
  await storeB.put("same-server", second);
  assert.deepEqual(await storeA.get("same-server"), first);
  assert.deepEqual(await storeB.get("same-server"), second);
  await storeA.delete("same-server");
  assert.equal(await storeA.get("same-server"), undefined);
  assert.deepEqual(await storeB.get("same-server"), second);
});

test("device ciphertext transplanted across workspace or server identity fails authentication", async () => {
  const db = openContentDb(":memory:");
  const workspaceA = randomUUID();
  const workspaceB = randomUUID();
  insertWorkspace(db, workspaceA);
  insertWorkspace(db, workspaceB);
  const keyring = new InMemoryKeyring();
  const deps = { db, clock: createTestClock(), sealer: new AesGcmSecretSealer(keyring), keyring };
  const storeA = createSqliteDeviceAuthorizationStore({ ...deps, workspaceId: workspaceA });
  const storeB = createSqliteDeviceAuthorizationStore({ ...deps, workspaceId: workspaceB });
  const authorization = {
    deviceCode: "victim-device", userCode: "AAAA-1111",
    verificationUri: "https://provider.example/device", verificationUriComplete: null,
    expiresAt: "2026-09-10T12:10:00.000Z", intervalSeconds: 5,
  };
  await storeA.put("victim", authorization);
  const victim = db.select().from(oauthDeviceAuthorizations).get();
  assert.ok(victim);
  for (const [store, workspaceId, serverId] of [
    [storeA, workspaceA, "other-server"], [storeB, workspaceB, "victim"],
  ] as const) {
    await store.put(serverId, { ...authorization, deviceCode: "attacker-device" });
    db.update(oauthDeviceAuthorizations).set({
      sealedKeyId: victim.sealedKeyId, sealedCiphertext: victim.sealedCiphertext,
      sealedNonce: victim.sealedNonce, sealedAlg: victim.sealedAlg,
    }).where(and(eq(oauthDeviceAuthorizations.workspaceId, workspaceId), eq(oauthDeviceAuthorizations.serverId, serverId))).run();
    await assert.rejects(() => store.get(serverId), /unable to authenticate data/);
  }
});
