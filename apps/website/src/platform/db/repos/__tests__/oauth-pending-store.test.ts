import type { Clock } from "@jini-ai/core/primitives";
import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { OAuthError } from "#src/platform/oauth/index";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { createSqlDeviceAuthorizationStore, createSqlPendingAuthorizationStore } from "../oauth-pending-store.js";

/**
 * @file The OAuth handshake stores' one Kysely body on SQLite and PGlite (storage plan §4): the
 * security properties `repos/oauth-pending-store.ts`'s header promises — single-use `state`,
 * expiry, owner binding that still burns the row, the cap, sealing at rest and AAD binding — proven
 * on both dialects. The SQLite-only cross-handle scenarios (two connections on one file standing in
 * for two processes) stay in `platform/db/__tests__/oauth-pending-store.sqlite.test.ts`.
 */

const WORKSPACE = "ws-oauth";

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

function pendingInput(ownerKey = "ws-1:higgs", codeVerifier = "v".repeat(43)) {
  return { ownerKey, providerId: "test-provider", codeVerifier, redirectUri: "https://tovu.example.com/cb", scopes: ["images:generate"] };
}

interface Fixture {
  kernel: ContentKernel;
  clock: ReturnType<typeof createTestClock>;
  keyring: InMemoryKeyring;
  sealer: AesGcmSecretSealer;
}

/** A fixture on `kernel`, every call held until the workspace the device table's FK needs exists. */
function makeFixture(base: ContentKernel): Fixture {
  const seeded = base.run((db) =>
    db.insertInto("workspaces").values({ id: WORKSPACE, name: "Test Workspace", slug: "test-oauth", created_at: "2026-09-10T00:00:00.000Z" }).execute()
  );
  const kernel: ContentKernel = { ...base, run: async (fn) => (await seeded, base.run(fn)), transaction: async (fn) => (await seeded, base.transaction(fn)) };
  const keyring = new InMemoryKeyring();
  return { kernel, clock: createTestClock(), keyring, sealer: new AesGcmSecretSealer(keyring) };
}

async function rejectsInvalidState(promise: Promise<unknown>): Promise<void> {
  await assert.rejects(promise, (error: unknown) => error instanceof OAuthError && error.code === "OAUTH_INVALID_STATE");
}

describeEachDialect(
  "OAuth pending/device stores",
  { tables: ["workspaces", "oauth_pending_authorizations", "oauth_device_authorizations"], make: makeFixture },
  (makeFx) => {
    test("a resource binding is refused before minting state because this SQL format cannot retain it", async () => {
      const store = createSqlPendingAuthorizationStore(makeFx());
      await assert.rejects(() => store.put(pendingInput(), { resource: "https://resource.example.com" }),
        { name: "TypeError", message: "OAuth resource binding is not supported by this pending store" });
      assert.equal(await store.size({}), 0);
    });

    test("put then take returns the entry with the verifier unsealed; the state is single-use", async () => {
      const fx = makeFx();
      const store = createSqlPendingAuthorizationStore(fx);
      const minted = await store.put(pendingInput());
      const taken = await store.take({ state: minted.state, ownerKey: "ws-1:higgs" });
      assert.deepEqual(taken, minted);
      await rejectsInvalidState(store.take({ state: minted.state, ownerKey: "ws-1:higgs" }));
    });

    test("concurrent takes of one state: exactly one wins", async () => {
      const fx = makeFx();
      const store = createSqlPendingAuthorizationStore(fx);
      const minted = await store.put(pendingInput());
      const results = await Promise.allSettled(Array.from({ length: 8 }, () => store.take({ state: minted.state, ownerKey: "ws-1:higgs" })));
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    });

    test("an expired state is refused and pruned", async () => {
      const fx = makeFx();
      const store = createSqlPendingAuthorizationStore({ ...fx }, { ttlMs: 60_000 });
      const minted = await store.put(pendingInput());
      fx.clock.advance(60_000);
      await rejectsInvalidState(store.take({ state: minted.state, ownerKey: "ws-1:higgs" }));
      assert.equal(await store.size({}), 0);
    });

    test("a failed owner check still consumes the row", async () => {
      const fx = makeFx();
      const store = createSqlPendingAuthorizationStore(fx);
      const minted = await store.put(pendingInput());
      await rejectsInvalidState(store.take({ state: minted.state, ownerKey: "ws-1:attacker" }));
      await rejectsInvalidState(store.take({ state: minted.state, ownerKey: "ws-1:higgs" }));
    });

    test("the cap evicts the oldest, never refuses the newest, and holds under concurrent puts", async () => {
      const fx = makeFx();
      const store = createSqlPendingAuthorizationStore({ ...fx }, { maxEntries: 3 });
      const minted = [];
      for (let index = 0; index < 4; index += 1) {
        fx.clock.advance(1);
        minted.push(await store.put(pendingInput(`ws-1:server-${index}`)));
      }
      assert.equal(await store.size({}), 3);
      await rejectsInvalidState(store.take({ state: minted[0]!.state, ownerKey: "ws-1:server-0" }));
      assert.equal((await store.take({ state: minted[3]!.state, ownerKey: "ws-1:server-3" })).ownerKey, "ws-1:server-3");

      await Promise.all(Array.from({ length: 5 }, (_, index) => store.put(pendingInput(`ws-1:concurrent-${index}`))));
      assert.equal(await store.size({}), 3);
    });

    test("the verifier is sealed at rest and AAD-bound to its owner", async () => {
      const fx = makeFx();
      const store = createSqlPendingAuthorizationStore(fx);
      const verifier = "super-secret-verifier-value-that-must-not-leak-1234567890";
      const victim = await store.put(pendingInput("ws-1:victim", verifier));
      const attacker = await store.put(pendingInput("ws-1:attacker", "a".repeat(43)));

      const rows = await fx.kernel.run((db) => db.selectFrom("oauth_pending_authorizations").selectAll().execute());
      const victimRow = rows.find((row) => row.state === victim.state);
      assert.ok(victimRow && !victimRow.sealed_ciphertext.includes(verifier));

      // Copy the victim's sealed verifier onto the attacker's own row: opening it must fail.
      await fx.kernel.run((db) =>
        db
          .updateTable("oauth_pending_authorizations")
          .set({ sealed_ciphertext: victimRow.sealed_ciphertext, sealed_nonce: victimRow.sealed_nonce, sealed_key_id: victimRow.sealed_key_id })
          .where("state", "=", attacker.state)
          .execute()
      );
        await assert.rejects(
          store.take({ state: attacker.state, ownerKey: "ws-1:attacker" }),
          (error: unknown) => error instanceof Error && !(error instanceof OAuthError) &&
            error.message === "Unsupported state or unable to authenticate data",
        );
        await rejectsInvalidState(store.take({ state: attacker.state, ownerKey: "ws-1:attacker" }));
    });

      test("device ciphertext is bound independently to workspace and connection", async () => {
        const fx = makeFx();
        const otherWorkspace = "ws-oauth-other";
        await fx.kernel.run((db) => db.insertInto("workspaces").values({
          id: otherWorkspace, name: otherWorkspace, slug: otherWorkspace, created_at: fx.clock.nowIso(),
        }).execute());
        const local = createSqlDeviceAuthorizationStore({ ...fx, workspaceId: WORKSPACE });
        const foreign = createSqlDeviceAuthorizationStore({ ...fx, workspaceId: otherWorkspace });
        const authorization = {
          deviceCode: "victim-device-secret",
          userCode: "VICT-1234",
          verificationUri: "https://provider.example.com/device",
          verificationUriComplete: null,
          expiresAt: "2026-09-10T12:10:00.000Z",
          intervalSeconds: 5,
        };
        await local.put("victim", authorization);
        await local.put("attacker", { ...authorization, deviceCode: "local-attacker-secret" });
        await foreign.put("victim", { ...authorization, deviceCode: "foreign-attacker-secret" });
        assert.deepEqual(await local.get("victim"), authorization);
        const victim = await fx.kernel.run((db) => db.selectFrom("oauth_device_authorizations").selectAll()
          .where("workspace_id", "=", WORKSPACE).where("server_id", "=", "victim").executeTakeFirstOrThrow());
        const copied = {
          sealed_key_id: victim.sealed_key_id,
          sealed_ciphertext: victim.sealed_ciphertext,
          sealed_nonce: victim.sealed_nonce,
          sealed_alg: victim.sealed_alg,
        };
        for (const [workspaceId, serverId, store] of [
          [WORKSPACE, "attacker", local],
          [otherWorkspace, "victim", foreign],
        ] as const) {
          await fx.kernel.run((db) => db.updateTable("oauth_device_authorizations").set(copied)
            .where("workspace_id", "=", workspaceId).where("server_id", "=", serverId).execute());
          await assert.rejects(
            store.get(serverId),
            (error: unknown) => error instanceof Error && !(error instanceof OAuthError) &&
              error.message === "Unsupported state or unable to authenticate data",
          );
        }
        assert.deepEqual(await local.get("victim"), authorization);
      });

      test("device store: put/get round-trips, put overwrites the connection's attempt, delete removes it, the code is sealed", async () => {
      const fx = makeFx();
      const store = createSqlDeviceAuthorizationStore({ ...fx, workspaceId: WORKSPACE });
      const first = {
        deviceCode: "device-code-secret",
        userCode: "ABCD-1234",
        verificationUri: "https://provider.example.com/device",
        verificationUriComplete: "https://provider.example.com/device?user_code=ABCD-1234",
        expiresAt: "2026-09-10T12:10:00.000Z",
        intervalSeconds: 5,
      };
      assert.equal(await store.get("higgsfield"), undefined);
      await store.put("higgsfield", first);
      assert.deepEqual(await store.get("higgsfield"), first);

      const second = { ...first, deviceCode: "device-code-2", userCode: "WXYZ-9876", verificationUriComplete: null, intervalSeconds: 10 };
      await store.put("higgsfield", second);
      assert.deepEqual(await store.get("higgsfield"), second);
      const rows = await fx.kernel.run((db) => db.selectFrom("oauth_device_authorizations").selectAll().execute());
      assert.equal(rows.length, 1);
      assert.ok(!rows[0]!.sealed_ciphertext.includes("device-code-2"));

      await store.delete("higgsfield");
      assert.equal(await store.get("higgsfield"), undefined);
    });
  }
);
