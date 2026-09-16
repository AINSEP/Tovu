import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { eq } from "drizzle-orm";

import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { createPendingAuthorizationStore, isOAuthError, type OAuthClock } from "#src/platform/oauth/index";
import { oauthDeviceAuthorizations, oauthPendingAuthorizations, workspaces } from "../schema.js";
import { openContentDb, type ContentDb } from "../sqlite/content-db.js";
import { createSqliteDeviceAuthorizationStore, createSqlitePendingAuthorizationStore } from "../sqlite/oauth-pending-store.sqlite.js";

/**
 * @file Proves the defect `assistant/external-mcp-oauth.ts`'s header now documents, and that this
 * file's two adapters close it.
 *
 * The defect: `external_mcp_oauth_connect` runs inside the agent daemon; the public OAuth callback
 * that completes the same handshake runs inside the main web server. Two OS processes, each with its
 * own in-memory space — an in-memory `PendingAuthorizationStore`/`DeviceAuthorizationStore` minted in
 * one is invisible to the other.
 *
 * The first two tests below are a deliberate BEFORE/AFTER pair over the identical scenario:
 * "REGRESSION GUARD" reproduces the defect LIVE, today, against the in-memory adapter this codebase
 * still ships (as the correct choice for a single-process caller — see that adapter's own doc) by
 * constructing it twice, exactly as `composition/app.ts` and `composition/deps.ts` each independently
 * do per-process. "THE FIX" runs the byte-identical scenario against this file's SQLite adapter and
 * shows it succeeds. Neither test mocks the other away — both are real adapters, real behavior.
 *
 * Every test opens its own throw-away temp-file `content.db` (never `sites/tovu-com/content.db`) and
 * two SEPARATE `ContentDb` handles onto it where the scenario calls for one — `better-sqlite3` in
 * WAL mode onto the same file is the closest a single Node process can get to "two OS processes,"
 * short of an actual `child_process.fork`.
 */

function tmpDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oauth-pending-store-test-"));
  return path.join(dir, "content.db");
}

/** A clock the test moves by hand — same shape as `platform/oauth/__tests__/helpers.ts`'s, restated
 *  here rather than imported so this file has no test-only dependency on a sibling module's test
 *  helpers. */
function createTestClock(startIso = "2026-09-10T12:00:00.000Z"): OAuthClock & { advance(ms: number): void } {
  let nowMs = Date.parse(startIso);
  return {
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

function samplePendingInput(overrides: Partial<{ ownerKey: string; providerId: string; codeVerifier: string; redirectUri: string; scopes: readonly string[] }> = {}) {
  return {
    ownerKey: "ws-1:higgs",
    providerId: "test-provider",
    codeVerifier: "v".repeat(43),
    redirectUri: "https://tovu.example.com/cb",
    scopes: ["images:generate"],
    ...overrides,
  };
}

test("THE FIX — a pending authorization begun through one SQLite-backed store instance is redeemed through a SECOND, independently-constructed instance sharing the same content.db", async () => {
  const dbPath = tmpDbPath();
  const dbProcessA = openContentDb(dbPath);
  const dbProcessB = openContentDb(dbPath);
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const clock = createTestClock();

  const storeInProcessA = createSqlitePendingAuthorizationStore({ db: dbProcessA, clock, sealer, keyring });
  const storeInProcessB = createSqlitePendingAuthorizationStore({ db: dbProcessB, clock, sealer, keyring });

  const minted = await storeInProcessA.put(samplePendingInput());

  // The whole point: process B's independently-constructed store redeems what process A minted.
  const redeemed = await storeInProcessB.take({ state: minted.state, ownerKey: "ws-1:higgs" });
  assert.equal(redeemed.codeVerifier, "v".repeat(43));
  assert.equal(redeemed.providerId, "test-provider");
  assert.equal(redeemed.redirectUri, "https://tovu.example.com/cb");
  assert.deepEqual(redeemed.scopes, ["images:generate"]);
});

test("REGRESSION GUARD — two independently-constructed IN-MEMORY stores do NOT share state (this is the exact defect the SQLite adapter above fixes)", async () => {
  const clock = createTestClock();
  const storeInProcessA = createPendingAuthorizationStore({ clock });
  const storeInProcessB = createPendingAuthorizationStore({ clock });

  const minted = await storeInProcessA.put(samplePendingInput());

  // Process B never saw process A's `Map` — its own store has no entry for this `state` at all.
  let caught: unknown;
  try {
    await storeInProcessB.take({ state: minted.state, ownerKey: "ws-1:higgs" });
  } catch (error) {
    caught = error;
  }
  assert.ok(isOAuthError(caught) && caught.code === "OAUTH_INVALID_STATE", "expected the second in-memory instance to have no record of the first's entry");
});

test("an expired pending state is refused, even though the row briefly existed", async () => {
  const dbPath = tmpDbPath();
  const db = openContentDb(dbPath);
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const clock = createTestClock();
  const store = createSqlitePendingAuthorizationStore({ db, clock, sealer, keyring, ttlMs: 60_000 });

  const minted = await store.put(samplePendingInput());
  clock.advance(60_001);

  let caught: unknown;
  try {
    await store.take({ state: minted.state, ownerKey: "ws-1:higgs" });
  } catch (error) {
    caught = error;
  }
  assert.ok(isOAuthError(caught) && caught.code === "OAUTH_INVALID_STATE");
});

test("a state cannot be consumed twice, even across two store instances racing for the same row", async () => {
  const dbPath = tmpDbPath();
  const dbProcessA = openContentDb(dbPath);
  const dbProcessB = openContentDb(dbPath);
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const clock = createTestClock();
  const storeA = createSqlitePendingAuthorizationStore({ db: dbProcessA, clock, sealer, keyring });
  const storeB = createSqlitePendingAuthorizationStore({ db: dbProcessB, clock, sealer, keyring });

  const minted = await storeA.put(samplePendingInput());

  // First redemption, from process B, succeeds...
  await storeB.take({ state: minted.state, ownerKey: "ws-1:higgs" });

  // ...and a second attempt from EITHER process — including the one that minted it — finds nothing:
  // the DELETE already ran, so this is not a timing-dependent race, it is a physically absent row.
  for (const store of [storeA, storeB]) {
    let caught: unknown;
    try {
      await store.take({ state: minted.state, ownerKey: "ws-1:higgs" });
    } catch (error) {
      caught = error;
    }
    assert.ok(isOAuthError(caught) && caught.code === "OAUTH_INVALID_STATE");
  }
});

test("a failed owner check still consumes the row, matching the in-memory adapter's anti-oracle ordering", async () => {
  const dbPath = tmpDbPath();
  const db = openContentDb(dbPath);
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const store = createSqlitePendingAuthorizationStore({ db, clock: createTestClock(), sealer, keyring });

  const minted = await store.put(samplePendingInput({ ownerKey: "ws-1:server-a" }));

  await assert.rejects(() => store.take({ state: minted.state, ownerKey: "ws-1:server-b" }), (error: unknown) => isOAuthError(error) && error.code === "OAUTH_INVALID_STATE");
  // The CORRECT owner must now also fail: the row is gone.
  await assert.rejects(() => store.take({ state: minted.state, ownerKey: "ws-1:server-a" }), (error: unknown) => isOAuthError(error) && error.code === "OAUTH_INVALID_STATE");
});

test("the store is bounded — at the cap the oldest row is evicted, never the newest refused", async () => {
  const dbPath = tmpDbPath();
  const db = openContentDb(dbPath);
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const store = createSqlitePendingAuthorizationStore({ db, clock: createTestClock(), sealer, keyring, maxEntries: 3 });

  const minted: Array<Awaited<ReturnType<typeof store.put>>> = [];
  for (let index = 0; index < 4; index += 1) {
    minted.push(await store.put(samplePendingInput({ ownerKey: `ws-1:server-${index}` })));
  }

  assert.equal(await store.size(), 3);
  const [oldest, , , newest] = minted;
  assert.ok(oldest && newest);
  await assert.rejects(() => store.take({ state: oldest.state, ownerKey: "ws-1:server-0" }));
  assert.equal((await store.take({ state: newest.state, ownerKey: "ws-1:server-3" })).ownerKey, "ws-1:server-3");
});

test("the cap holds when two store instances sharing one content.db put concurrently, so eviction is atomic with the insert rather than a read-then-insert race", async () => {
  const dbPath = tmpDbPath();
  const dbProcessA = openContentDb(dbPath);
  const dbProcessB = openContentDb(dbPath);
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const clock = createTestClock();

  const storeInProcessA = createSqlitePendingAuthorizationStore({ db: dbProcessA, clock, sealer, keyring, maxEntries: 3 });
  const storeInProcessB = createSqlitePendingAuthorizationStore({ db: dbProcessB, clock, sealer, keyring, maxEntries: 3 });

  // One row below the cap: BOTH concurrent puts would observe spare capacity if the cap test ran
  // before an await, so each would skip eviction and insert — leaving four rows for a cap of three.
  await storeInProcessA.put(samplePendingInput({ ownerKey: "ws-1:seed-0" }));
  await storeInProcessA.put(samplePendingInput({ ownerKey: "ws-1:seed-1" }));

  // Fire both without awaiting in between. Each `put` suspends at `sealer.seal`, which is the only
  // interleaving point in a single-threaded process; an unchained read-then-insert loses the race
  // across the two handles that stand in for two OS processes.
  await Promise.all([
    storeInProcessA.put(samplePendingInput({ ownerKey: "ws-1:concurrent-a" })),
    storeInProcessB.put(samplePendingInput({ ownerKey: "ws-1:concurrent-b" })),
  ]);

  assert.equal(await storeInProcessA.size(), 3);
});

test("codeVerifier is sealed at rest — the raw row never carries the plaintext verifier", async () => {
  const dbPath = tmpDbPath();
  const db = openContentDb(dbPath);
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const store = createSqlitePendingAuthorizationStore({ db, clock: createTestClock(), sealer, keyring });
  const verifier = "super-secret-verifier-value-that-must-not-leak-1234567890";

  const minted = await store.put(samplePendingInput({ codeVerifier: verifier }));

  const row = db.select().from(oauthPendingAuthorizations).all().find((candidate) => candidate.state === minted.state);
  assert.ok(row);
  assert.notEqual(row.sealedCiphertext, verifier);
  assert.ok(!row.sealedCiphertext.includes(verifier));
  assert.ok(row.sealedKeyId.length > 0 && row.sealedNonce.length > 0 && row.sealedAlg.length > 0);
});

test("a sealed row copied onto a different owner's identity fails to open — AAD binding is load-bearing, not decorative", async () => {
  const dbPath = tmpDbPath();
  const db = openContentDb(dbPath);
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const store = createSqlitePendingAuthorizationStore({ db, clock: createTestClock(), sealer, keyring });

  const victim = await store.put(samplePendingInput({ ownerKey: "ws-1:victim" }));
  const attacker = await store.put(samplePendingInput({ ownerKey: "ws-1:attacker", codeVerifier: "a".repeat(43) }));

  // Simulate raw table tampering: copy the victim's sealed ciphertext onto the attacker's own row,
  // which the attacker legitimately owns and can therefore pass the plaintext owner-key check for.
  const victimRow = db.select().from(oauthPendingAuthorizations).all().find((candidate) => candidate.state === victim.state);
  assert.ok(victimRow);
  db.update(oauthPendingAuthorizations)
    .set({
      sealedKeyId: victimRow.sealedKeyId,
      sealedCiphertext: victimRow.sealedCiphertext,
      sealedNonce: victimRow.sealedNonce,
      sealedAlg: victimRow.sealedAlg,
    })
    .where(eq(oauthPendingAuthorizations.state, attacker.state))
    .run();

  // The plaintext owner-key check passes (it is still the attacker's own row) — the exchange
  // therefore turns on the AAD-bound auth tag, which was sealed under the VICTIM's owner key.
  await assert.rejects(() => store.take({ state: attacker.state, ownerKey: "ws-1:attacker" }));
});

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

  await storeInProcessA.put("higgsfield", {
    deviceCode: "device-code-secret",
    userCode: "ABCD-1234",
    verificationUri: "https://provider.example.com/device",
    verificationUriComplete: "https://provider.example.com/device?user_code=ABCD-1234",
    expiresAt: "2026-09-10T12:10:00.000Z",
    intervalSeconds: 5,
  });

  const readBack = await storeInProcessB.get("higgsfield");
  assert.ok(readBack);
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
  await store.put("higgsfield", {
    deviceCode: "second-attempt",
    userCode: "BBBB-2222",
    verificationUri: "https://provider.example.com/device",
    verificationUriComplete: null,
    expiresAt: "2026-09-10T12:20:00.000Z",
    intervalSeconds: 5,
  });

  const readBack = await store.get("higgsfield");
  assert.ok(readBack);
  assert.equal(readBack.deviceCode, "second-attempt");
  assert.equal(readBack.userCode, "BBBB-2222");

  const rows = db
    .select()
    .from(oauthDeviceAuthorizations)
    .all()
    .filter((candidate) => candidate.workspaceId === workspaceId && candidate.serverId === "higgsfield");
  assert.equal(rows.length, 1, "put() must overwrite the existing row, not accumulate a second one");
});
