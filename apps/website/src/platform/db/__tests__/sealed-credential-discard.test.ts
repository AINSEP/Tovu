import "../../site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import { buildVaultAad, SecretsVaultService } from "@jini-ai/platform/secrets/credential-sets";
import { discardVaultCredentialsNotOpening, resealVaultCredentialsOpeningUnder, type SealedCredentialKeyDeps } from "../vault-credential-recovery.js";
import { opensVaultCredential, snapshotVaultCredentials } from "../vault-credential-inventory.js";
import { eachDialect } from "../kernel/__tests__/dialect-matrix.js";
import { createTovuVaultKinds } from "#src/platform/secrets/vault-kinds";
import { recoveryAad } from "#src/server/runtime/composition/site-key-recovery";
import { createSqlDeviceAuthorizationStore } from "../repos/oauth-pending-store.js";
import { fixture, keyPair, WS, NOW } from "./vault-credential.fixture.js";

/** Sealed counts exclude metadata-only configurations. */
async function countVaultCredentialsOpening(deps: SealedCredentialKeyDeps, _options = {}): Promise<{ sealed: number; opens: number }> {
  const { values } = await snapshotVaultCredentials(deps);
  let opens = 0;
  for (const value of values) if (await opensVaultCredential({ value, sealer: deps.sealer })) opens += 1;
  return { sealed: values.length, opens };
}

/** @file S5 recovery contracts: clear/delete policy, PK+revision races, unlinking, defaults and rollback. */
for (const each of eachDialect({ tables: ["workspaces"], make: kernel => kernel })) {
  test(`discard preserves settings/metadata-only rows, deletes required kinds and promotes defaults [${each.name}]`, async () => {
    const fx = await fixture(each.make());
    await fx.put({ id: "custom-right" });
    await fx.put({ id: "custom-wrong", key: fx.wrong });
    const peerMeta = { baseUrl: "https://peer.example.test", remoteWorkspaceId: "ws-peer" };
    for (const kind of ["site-assistant", "personal-execution", "media-provider", "publish-peer"] as const) {
      const record = await fx.put({ id: kind, kind, key: fx.wrong, provider: kind === "publish-peer" ? null : "fal",
        principalId: kind === "personal-execution" ? "principal-1" : null,
        meta: kind === "publish-peer" ? peerMeta : { model: "keep-settings" } });
      assert.ok(record.sealed);
    }
    await fx.put({ id: "empty", key: null, kind: "media-provider", provider: "other", meta: { model: "keep-empty" } });
    await fx.put({ id: "vendor-default", kind: "vendor", provider: "host", isDefault: true, key: fx.wrong });
    await fx.put({ id: "vendor-next", kind: "vendor", provider: "host", key: fx.wrong });
    await fx.put({ id: "vendor-readable", kind: "vendor", provider: "host" });
    const common = { kernel: fx.kernel, sealer: fx.right.sealer };
    assert.deepEqual(await countVaultCredentialsOpening(common), { sealed: 9, opens: 2 });
    assert.deepEqual(await discardVaultCredentialsNotOpening(common), { discarded: 7, kept: 2 });
    assert.equal(await fx.repo.find({ workspaceId: WS, id: "custom-wrong" }), null);
    for (const id of ["site-assistant", "personal-execution", "media-provider", "publish-peer"]) {
      const record = await fx.repo.find({ workspaceId: WS, id });
      assert.equal(record?.sealed, null); assert.equal(record?.last4, null); assert.equal(record?.tokenLength, null);
      assert.deepEqual(record?.meta, id === "publish-peer" ? peerMeta : { model: "keep-settings" });
    }
    assert.equal((await fx.repo.find({ workspaceId: WS, id: "empty" }))?.meta.model, "keep-empty");
    assert.equal(await fx.repo.find({ workspaceId: WS, id: "vendor-default" }), null);
    assert.equal(await fx.repo.find({ workspaceId: WS, id: "vendor-next" }), null, "promotion's revision must not skip another unreadable row");
    assert.equal((await fx.repo.find({ workspaceId: WS, id: "vendor-readable" }))?.isDefault, true, "the readable sibling is promoted to default");
  });

  test(`AAD selection: a throwing codec counts as unreadable without opening; a legacy row the recovery codec opens is kept [${each.name}]`, async () => {
    const fx = await fixture(each.make());
    await fx.put({ id: "ordinary" });
    let opens = 0;
    const sealer = { open: async () => { opens += 1; return "unexpected"; } };
    assert.deepEqual(await countVaultCredentialsOpening({ kernel: fx.kernel, sealer, aadFor: () => { throw new Error("no lineage"); } }), { sealed: 1, opens: 0 });
    assert.equal(opens, 0);

    // Migrated before boot normalization: still sealed under its original table's AAD.
    const lineage = { table: "custom_credential_sets", workspaceId: WS, id: "legacy", principalId: null, provider: null, serverId: null, aadVersion: 1 };
    const scaffold = await fx.put({ id: "legacy" });
    const legacy = await fx.repo.put({ expectedRevision: scaffold.revision, record: { ...scaffold, revision: scaffold.revision + 1,
      meta: { ...scaffold.meta, legacyAad: lineage, migration: { ...lineage, mappedId: "legacy" } },
      sealed: await fx.right.sealer.seal({ plaintext: JSON.stringify({ token: "legacy-token" }), key: await fx.right.keyring.activeKey(),
        aad: `custom-credential-set:v1:${WS}:legacy` }) } });
    assert.deepEqual(await countVaultCredentialsOpening({ kernel: fx.kernel, sealer: fx.right.sealer }), { sealed: 2, opens: 1 },
      "ordinary reads have no legacy fallback");
    const recovery = { kernel: fx.kernel, sealer: fx.right.sealer, aadFor: recoveryAad };
    assert.deepEqual(await countVaultCredentialsOpening(recovery), { sealed: 2, opens: 2 });
    assert.deepEqual(await discardVaultCredentialsNotOpening(recovery), { discarded: 0, kept: 2 });
    assert.deepEqual(await fx.repo.find(legacy), legacy);
  });

  test(`MCP discard unlinks only its matching pointer before deletion and retains the roster [${each.name}]`, async () => {
    const fx = await fixture(each.make());
    await fx.put({ id: "env", kind: "mcp-env", ownerKey: "server" });
    await fx.put({ id: "auth", kind: "mcp-auth", ownerKey: "server", key: fx.wrong });
    await fx.kernel.execute(sql`INSERT INTO external_mcp_servers (workspace_id,server_id,transport,auth_mode,enabled,url,
      created_at,updated_at,env_secret_id,oauth_secret_id,oauth_status) VALUES (${WS},'server','streamable_http','oauth',
      ${fx.kernel.dialect === "sqlite" ? 1 : true},'https://mcp.example.test',${NOW},${NOW},'env','auth','connected')`);
    assert.deepEqual(await discardVaultCredentialsNotOpening({ kernel: fx.kernel, sealer: fx.right.sealer }), { discarded: 1, kept: 1 });
    const [server] = await fx.kernel.query<{ env_secret_id: string; oauth_secret_id: null; oauth_status: string }>(sql`SELECT env_secret_id,oauth_secret_id,oauth_status FROM external_mcp_servers`);
    assert.deepEqual(server, { env_secret_id: "env", oauth_secret_id: null, oauth_status: "needs_reauth" });
    assert.equal(await fx.repo.find({ workspaceId: WS, id: "auth" }), null);
  });

  test(`MCP env discard clears only the env pointer before deleting the unreadable env secret [${each.name}]`, async () => {
    const fx = await fixture(each.make());
    await fx.put({ id: "env", kind: "mcp-env", ownerKey: "server", key: fx.wrong });
    await fx.put({ id: "auth", kind: "mcp-auth", ownerKey: "server" });
    await fx.kernel.execute(sql`INSERT INTO external_mcp_servers (workspace_id,server_id,transport,auth_mode,enabled,url,
      created_at,updated_at,env_secret_id,oauth_secret_id,oauth_status) VALUES (${WS},'server','streamable_http','oauth',
      ${fx.kernel.dialect === "sqlite" ? 1 : true},'https://mcp.example.test',${NOW},${NOW},'env','auth','connected')`);
    assert.deepEqual(await discardVaultCredentialsNotOpening({ kernel: fx.kernel, sealer: fx.right.sealer }), { discarded: 1, kept: 1 });
    const [server] = await fx.kernel.query<{ env_secret_id: null; oauth_secret_id: string; oauth_status: string }>(sql`SELECT env_secret_id,oauth_secret_id,oauth_status FROM external_mcp_servers`);
    assert.deepEqual(server, { env_secret_id: null, oauth_secret_id: "auth", oauth_status: "connected" });
    assert.equal(await fx.repo.find({ workspaceId: WS, id: "env" }), null);
  });

  test(`reseal normalizes a legacy row that already opens under the recovered key, reading it with that key [${each.name}]`, async () => {
    const fx = await fixture(each.make());
    const lineage = { table: "custom_credential_sets", workspaceId: WS, id: "legacy", principalId: null, provider: null, serverId: null, aadVersion: 1 };
    const scaffold = await fx.put({ id: "legacy" });
    const legacy = await fx.repo.put({ expectedRevision: scaffold.revision, record: { ...scaffold, revision: scaffold.revision + 1,
      meta: { ...scaffold.meta, legacyAad: lineage, migration: { ...lineage, mappedId: "legacy" } },
      sealed: await fx.right.sealer.seal({ plaintext: JSON.stringify({ token: "legacy-token" }), key: await fx.right.keyring.activeKey(),
        aad: `custom-credential-set:v1:${WS}:legacy` }) } });
    await fx.put({ id: "ordinary" });
    const calls: Array<{ id: string; previousIsRecovered: boolean }> = [];
    const result = await resealVaultCredentialsOpeningUnder({ kernel: fx.kernel, sealer: fx.right.sealer, aadFor: recoveryAad,
      key: await fx.right.keyring.activeKey(), previous: fx.wrong.sealer,
      resealRecord: async ({ record, previous }) => { calls.push({ id: record.id, previousIsRecovered: previous === fx.right.sealer }); } });
    assert.deepEqual(result, { resealed: 1, unreadable: 0 });
    assert.deepEqual(calls, [{ id: "legacy", previousIsRecovered: true }], "the ordinary row already opens and needs no move");
    assert.deepEqual(await fx.repo.find(legacy), legacy);
  });

  for (const action of ["discard", "reseal"] as const) {
    test(`a metadata revision change after snapshot survives ${action} [${each.name}]`, async () => {
      const fx = await fixture(each.make());
      const record = await fx.put({ id: "stale", key: fx.wrong });
      let changed = false;
      const sealer = { seal: fx.right.sealer.seal.bind(fx.right.sealer), open: async (...args: Parameters<typeof fx.right.sealer.open>) => {
        if (!changed) { changed = true; await fx.repo.put({ expectedRevision: record.revision,
          record: { ...record, meta: { ...record.meta, username: "new-settings" }, revision: record.revision + 1 } }); }
        return fx.right.sealer.open(...args);
      } };
      const deps = { kernel: fx.kernel, sealer };
      if (action === "discard") assert.deepEqual(await discardVaultCredentialsNotOpening(deps), { discarded: 0, kept: 1 });
      else assert.deepEqual(await resealVaultCredentialsOpeningUnder({ ...deps, key: await fx.right.keyring.activeKey(), previous: fx.wrong.sealer,
        resealRecord: async () => { throw new Error("stale callback must not run"); } }), { resealed: 0, unreadable: 0 });
      assert.equal((await fx.repo.find(record))?.meta.username, "new-settings");
      assert.deepEqual((await fx.repo.find(record))?.sealed, record.sealed);
    });
  }

  test(`reseal uses Jini lifecycle, moves device codes and keeps a third key's envelope [${each.name}]`, async () => {
    const fx = await fixture(each.make());
    const previous = fx.wrong;
    await fx.put({ id: "right" }); await fx.put({ id: "move", key: previous });
    const stranded = await fx.put({ id: "stranded", key: keyPair() });
    const device = createSqlDeviceAuthorizationStore({ kernel: fx.kernel, workspaceId: WS, ...previous, clock: { nowMs: () => Date.parse(NOW) } });
    await device.put("server", { deviceCode: "device-secret", userCode: "CODE", verificationUri: "https://auth.example.test",
      verificationUriComplete: null, expiresAt: "2026-10-11T01:00:00.000Z", intervalSeconds: 5 });
    const registry = createTovuVaultKinds({ policy: { validateMeta: ({ meta }) => meta, legacyPublishCredential: () => undefined, tokenField: () => undefined } });
    const result = await resealVaultCredentialsOpeningUnder({ kernel: fx.kernel, sealer: fx.right.sealer, key: await fx.right.keyring.activeKey(), previous: previous.sealer,
      resealRecord: async ({ record, previous }) => {
        const service = new SecretsVaultService({ repo: fx.repo, keyring: fx.right.keyring, metaParsers: registry.metaParsers,
          sealer: { seal: fx.right.sealer.seal.bind(fx.right.sealer), open: previous.open.bind(previous) },
          authorize: async () => {}, newId: () => "unused", now: () => NOW });
        await service.rotate({ ...record, expectedRevision: record.revision });
      } });
    assert.deepEqual(result, { resealed: 2, unreadable: 1 });
    assert.deepEqual(await countVaultCredentialsOpening({ kernel: fx.kernel, sealer: fx.right.sealer }), { sealed: 4, opens: 3 });
    assert.deepEqual(await fx.repo.find(stranded), stranded);
    const moved = await fx.repo.find({ workspaceId: WS, id: "move" });
    assert.equal(await fx.right.sealer.open({ sealed: moved!.sealed! }, { aad: buildVaultAad(moved!) }), JSON.stringify({ token: "LEAK-token-move" }));
  });

  test(`reseal refuses changed plaintext and preserves the original device credential [${each.name}]`, async () => {
    const fx = await fixture(each.make());
    const device = createSqlDeviceAuthorizationStore({ kernel: fx.kernel, workspaceId: WS, ...fx.wrong,
      clock: { nowMs: () => Date.parse(NOW) } });
    const authorization = { deviceCode: "device-secret", userCode: "CODE", verificationUri: "https://auth.example.test",
      verificationUriComplete: null, expiresAt: "2026-10-11T01:00:00.000Z", intervalSeconds: 5 };
    await device.put("server", authorization);
    const before = await fx.kernel.query(sql`SELECT * FROM oauth_device_authorizations`);
    const sealer = {
      open: fx.right.sealer.open.bind(fx.right.sealer),
      seal: (input: Parameters<typeof fx.right.sealer.seal>[0]) => fx.right.sealer.seal({ ...input, plaintext: "changed-device-secret" }),
    };
    await assert.rejects(resealVaultCredentialsOpeningUnder({ kernel: fx.kernel, sealer,
      key: await fx.right.keyring.activeKey(), previous: fx.wrong.sealer,
      resealRecord: async () => assert.fail("device credentials do not use the vault record lifecycle"),
    }), { message: "Credential recovery verification failed" });
    assert.deepEqual(await fx.kernel.query(sql`SELECT * FROM oauth_device_authorizations`), before);
    assert.deepEqual(await device.get("server"), authorization);
  });

  test(`a later reseal failure rolls back the earlier vault write [${each.name}]`, async () => {
    const fx = await fixture(each.make());
    const before = [await fx.put({ id: "a", key: fx.wrong }), await fx.put({ id: "b", key: fx.wrong })];
    let writes = 0;
    await assert.rejects(resealVaultCredentialsOpeningUnder({ kernel: fx.kernel, sealer: fx.right.sealer,
      key: await fx.right.keyring.activeKey(), previous: fx.wrong.sealer, resealRecord: async ({ record }) => {
        if (++writes === 2) throw new Error("second write failed");
        await fx.repo.put({ expectedRevision: record.revision, record: { ...record, revision: record.revision + 1, sealed: null } });
      } }), /second write failed/);
    for (const record of before) assert.deepEqual(await fx.repo.find(record), record);
  });

  test(`discard failure rolls back earlier deletes and default promotion [${each.name}]`, async () => {
    const fx = await fixture(each.make());
    const before = [await fx.put({ id: "a", key: fx.wrong }), await fx.put({ id: "b", key: fx.wrong })];
    let deletes = 0;
    const kernel: typeof fx.kernel = { ...fx.kernel, run: fn => fx.kernel.run(db => fn(new Proxy(db, {
      get(target, property) {
        if (property === "deleteFrom") return (...args: Parameters<typeof db.deleteFrom>) => {
          if (++deletes === 2) throw new Error("second delete failed");
          return target.deleteFrom(...args);
        };
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }))) };
    await assert.rejects(discardVaultCredentialsNotOpening({ kernel, sealer: fx.right.sealer }), /second delete failed/);
    for (const record of before) assert.deepEqual(await fx.repo.find(record), record);
  });

  test(`an unknown row with a NULL envelope column is matched by IS NULL and cleared [${each.name}]`, async () => {
    const fx = await fixture(each.make());
    await fx.kernel.execute(sql`CREATE TABLE recovery_unknown_partial (sealed_ciphertext text, sealed_nonce text, setting text)`);
    try {
      await fx.kernel.execute(sql`INSERT INTO recovery_unknown_partial VALUES ('opaque', NULL, 'keep')`);
      assert.deepEqual(await discardVaultCredentialsNotOpening({ kernel: fx.kernel, sealer: fx.right.sealer }), { discarded: 1, kept: 0 });
      assert.deepEqual(await fx.kernel.query(sql`SELECT * FROM recovery_unknown_partial`), [{ sealed_ciphertext: null, sealed_nonce: null, setting: "keep" }]);
    } finally {
      await fx.kernel.execute(sql`DROP TABLE recovery_unknown_partial`);
    }
  });

  test(`unknown columns remain in discard coverage while restore artifacts stay untouched [${each.name}]`, async () => {
    const fx = await fixture(each.make());
    await fx.kernel.execute(sql`CREATE TABLE recovery_unknown_required (sealed_ciphertext text NOT NULL)`);
    await fx.kernel.execute(sql`CREATE TABLE recovery_unknown_optional (sealed_ciphertext text, sealed_nonce text, masked text, setting text)`);
    await fx.kernel.execute(sql`CREATE TABLE _vault_backup_recovery (sealed_ciphertext text NOT NULL)`);
    try {
      await fx.kernel.execute(sql`INSERT INTO recovery_unknown_required VALUES ('opaque')`);
      await fx.kernel.execute(sql`INSERT INTO recovery_unknown_optional VALUES ('opaque','nonce','hint','keep')`);
      await fx.kernel.execute(sql`INSERT INTO _vault_backup_recovery VALUES ('backup')`);
      assert.deepEqual(await discardVaultCredentialsNotOpening({ kernel: fx.kernel, sealer: fx.right.sealer }), { discarded: 2, kept: 0 });
      assert.deepEqual(await fx.kernel.query(sql`SELECT * FROM recovery_unknown_required`), []);
      assert.deepEqual(await fx.kernel.query(sql`SELECT * FROM recovery_unknown_optional`), [{ sealed_ciphertext: null, sealed_nonce: null, masked: null, setting: "keep" }]);
      assert.deepEqual(await fx.kernel.query(sql`SELECT * FROM _vault_backup_recovery`), [{ sealed_ciphertext: "backup" }]);
    } finally {
      for (const table of ["recovery_unknown_required", "recovery_unknown_optional", "_vault_backup_recovery"]) await fx.kernel.execute(sql`DROP TABLE ${sql.id(table)}`);
    }
  });
}
