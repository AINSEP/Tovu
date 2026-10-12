import type { Clock } from "@jini-ai/core/primitives";
import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { OAuthError } from "#src/platform/oauth/index";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { createSqlDeviceAuthorizationStore } from "../oauth-pending-store.js";

/**
 * @file Durable device authorization contracts on SQLite and PGlite: sealed values, expiry,
 * workspace/server binding and replacement. Redirect state is stateless after step 0012 and
 * is covered by the external-MCP stateless authorization suites instead of a removed SQL table.
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

describeEachDialect(
  "OAuth device store",
  { tables: ["workspaces", "oauth_device_authorizations"], make: makeFixture },
  (makeFx) => {
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
