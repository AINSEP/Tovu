import "../../site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import { discoverSealedColumns, inventoryVaultCredentials, SealedCredentialInventoryLimitError } from "../vault-credential-inventory.js";
import { resolveSiteAssistantApiKey, setSiteAssistantCredential } from "#src/assistant/site-credential-store";
import { createCustomCredential, resolveCustomCredentialByLabel } from "#src/features/custom-credentials/store";
import { SqlSiteAssistantCredentialRepo } from "../../../assistant/site-credential-repo.js";
import { SqlCustomCredentialSetRepo } from "../../../features/custom-credentials/custom-credential-repo.js";
import { eachDialect } from "../kernel/__tests__/dialect-matrix.js";
import { createSqlDeviceAuthorizationStore } from "../repos/oauth-pending-store.js";
import { fixture, WS, NOW } from "./vault-credential.fixture.js";

/** @file S5: catalog completeness, safe vault identity, metadata-only parity, key health and limits. */
for (const each of eachDialect({ tables: ["workspaces"], make: kernel => kernel })) {
  test(`vault inventory counts envelopes separately, retains device flow and never emits secrets [${each.name}]`, async () => {
    const fx = await fixture(each.make());
    const saved = await fx.put({ id: "sealed" });
    await fx.put({ id: "settings", key: null, kind: "media-provider", provider: "fal", meta: { baseUrl: null, model: null } });
    const device = createSqlDeviceAuthorizationStore({ kernel: fx.kernel, workspaceId: WS, ...fx.right, clock: { nowMs: () => Date.parse(NOW) } });
    await device.put("server", { deviceCode: "LEAK-device-code", userCode: "LEAK-user-code", verificationUri: "https://auth.example.test",
      verificationUriComplete: null, intervalSeconds: 5, expiresAt: "2026-10-11T01:00:00.000Z" });
    await fx.kernel.execute(sql`CREATE TABLE _vault_backup_inventory (sealed_ciphertext text)`);
    await fx.kernel.execute(sql`INSERT INTO _vault_backup_inventory VALUES ('LEAK-backup')`);
    try {
      const inventory = await inventoryVaultCredentials({ kernel: fx.kernel, ...fx.right, hasSiteKeySource: () => true });
      assert.deepEqual(inventory.totals, { sealed: 2, opens: 2, doesNotOpen: 0, unknown: 0 });
      assert.deepEqual(inventory.metadataOnly, [{ workspaceId: WS, rowId: "settings", label: "media-provider (settings)" }]);
      assert.equal(inventory.columns.some(column => column.table.startsWith("_vault_backup_")), false);
      const text = JSON.stringify(inventory);
      for (const secret of ["LEAK", saved.sealed!.ciphertext, saved.sealed!.nonce]) assert.equal(text.includes(secret), false);
    } finally { await fx.kernel.execute(sql`DROP TABLE _vault_backup_inventory`); }
  });

  test(`inventory covers unknown catalog columns and incomplete quads [${each.name}]`, async () => {
    const fx = await fixture(each.make());
    await fx.kernel.execute(sql`CREATE TABLE inventory_unknown (sealed_ciphertext text, sealed_key_id text)`);
    await fx.kernel.execute(sql`INSERT INTO inventory_unknown VALUES ('opaque','key')`);
    try {
      const inventory = await inventoryVaultCredentials({ kernel: fx.kernel, ...fx.right, hasSiteKeySource: () => true });
      assert.deepEqual(inventory.totals, { sealed: 1, opens: 0, doesNotOpen: 0, unknown: 1 });
      assert.equal(inventory.columns.find(column => column.table === "inventory_unknown")?.coverage, "no-descriptor");
      assert.equal(inventory.entries[0]?.unknownReason, "incomplete-sealed-row");
      assert.equal(inventory.entries[0]?.workspaceId, null);
      assert.equal(inventory.entries[0]?.rowId, null);
    } finally { await fx.kernel.execute(sql`DROP TABLE inventory_unknown`); }
  });

  test(`wrong key, unavailable key, absent source, unsupported alg and unknown lineage stay distinct [${each.name}]`, async () => {
    const fx = await fixture(each.make());
    const record = await fx.put({ id: "one" });
    const deps = { kernel: fx.kernel, ...fx.right, hasSiteKeySource: () => true };
    assert.equal((await inventoryVaultCredentials({ ...deps, ...fx.wrong })).entries[0]?.opensUnderActiveKey, false);
    let derived = 0;
    const absent = await inventoryVaultCredentials({ ...deps, hasSiteKeySource: () => false,
      keyring: { activeKey: async () => { derived += 1; throw new Error("must not mint"); } } });
    assert.equal(absent.entries[0]?.unknownReason, "no-site-key");
    assert.equal(derived, 0);
    const unavailable = await inventoryVaultCredentials({ ...deps, sealer: { seal: async () => { throw new Error("LEAK-error"); }, open: fx.right.sealer.open.bind(fx.right.sealer) } });
    assert.equal(unavailable.entries[0]?.unknownReason, "active-key-unavailable");
    const unknown = await inventoryVaultCredentials({ ...deps, aadFor: () => { throw new Error("LEAK-error"); } });
    assert.equal(unknown.entries[0]?.unknownReason, "unrecognized-aad-version");
    await fx.repo.put({ expectedRevision: record.revision, record: { ...record, revision: record.revision + 1,
      sealed: { ...record.sealed!, alg: "future-alg" } } });
    assert.equal((await inventoryVaultCredentials(deps)).entries[0]?.unknownReason, "unsupported-alg");
    assert.equal(JSON.stringify(unknown).includes("LEAK-error"), false);
  });

  test(`inventory refuses understated limits and rechecks active key after a failed open [${each.name}]`, async () => {
    const fx = await fixture(each.make());
    await fx.put({ id: "one" }); await fx.put({ id: "two" });
    const deps = { kernel: fx.kernel, ...fx.right, hasSiteKeySource: () => true };
    await assert.rejects(inventoryVaultCredentials(deps, { maxEntries: 1 }), error => error instanceof SealedCredentialInventoryLimitError && error.sealedRows === 2);
    await assert.rejects(inventoryVaultCredentials(deps, { maxEntries: 0 }), RangeError);
    let probes = 0;
    const inventory = await inventoryVaultCredentials({ ...deps, sealer: {
      seal: async input => { if (++probes > 1) throw new Error("key lost"); return fx.right.sealer.seal(input); },
      open: async (input, options) => {
        if (options?.aad === "sealed-credential-inventory-probe:v1") return fx.right.sealer.open(input, options);
        throw new Error("key lost");
      },
    } });
    assert.equal(inventory.totals.unknown, 2);
    assert.equal(inventory.totals.doesNotOpen, 0);
  });

  test(`inventory is read-only: vault, device and unknown sealed rows are unchanged across every verdict [${each.name}]`, async () => {
    const fx = await fixture(each.make());
    await fx.put({ id: "right" }); await fx.put({ id: "wrong", key: fx.wrong });
    await fx.put({ id: "settings", key: null, kind: "media-provider", provider: "fal", meta: { baseUrl: null, model: null } });
    const future = await fx.put({ id: "future" });
    await fx.repo.put({ expectedRevision: future.revision, record: { ...future, revision: future.revision + 1, sealed: { ...future.sealed!, alg: "future-alg" } } });
    const device = createSqlDeviceAuthorizationStore({ kernel: fx.kernel, workspaceId: WS, ...fx.right, clock: { nowMs: () => Date.parse(NOW) } });
    await device.put("server", { deviceCode: "device-code", userCode: "CODE", verificationUri: "https://auth.example.test",
      verificationUriComplete: null, intervalSeconds: 5, expiresAt: "2026-10-11T01:00:00.000Z" });
    await fx.kernel.execute(sql`CREATE TABLE inventory_readonly_unknown (sealed_ciphertext text, sealed_key_id text, sealed_nonce text, sealed_alg text)`);
    await fx.kernel.execute(sql`INSERT INTO inventory_readonly_unknown VALUES ('opaque','key','nonce','aes-256-gcm'), ('partial',NULL,NULL,NULL)`);
    try {
      const snapshot = async () => {
        const tables: Record<string, unknown[]> = {};
        for (const ref of await discoverSealedColumns(fx.kernel)) tables[ref.table] = await fx.kernel.query(sql`SELECT * FROM ${sql.id(ref.table)} ORDER BY 1, 2`);
        return tables;
      };
      // SQLite counts every change on the connection; the table snapshot is the dialect-neutral half.
      const changes = async () => each.dialect === "sqlite" ? await fx.kernel.query(sql`SELECT total_changes() AS n`) : null;
      const before = await snapshot();
      assert.deepEqual(Object.keys(before).sort(), ["inventory_readonly_unknown", "oauth_device_authorizations", "secrets_vault"]);
      const changesBefore = await changes();
      const deps = { kernel: fx.kernel, ...fx.right, hasSiteKeySource: () => true };
      const reasons = new Set<string | null>();
      for (const run of [deps, { ...deps, hasSiteKeySource: () => false }, { ...deps, aadFor: () => { throw new Error("no lineage"); } },
        { ...deps, keyring: { activeKey: async () => { throw new Error("key unavailable"); } } }, { ...deps, ...fx.wrong }]) {
        for (const entry of (await inventoryVaultCredentials(run)).entries) reasons.add(entry.unknownReason);
      }
      assert.deepEqual([...reasons].sort(), [null, "active-key-unavailable", "incomplete-sealed-row", "no-descriptor", "no-site-key",
        "unrecognized-aad-version", "unsupported-alg"].sort());
      assert.deepEqual(await changes(), changesBefore);
      assert.deepEqual(await snapshot(), before);
    } finally { await fx.kernel.execute(sql`DROP TABLE inventory_readonly_unknown`); }
  });

  test(`credentials saved through the real Tovu stores are reported as opening, agreeing with each store's read [${each.name}]`, async () => {
    const fx = await fixture(each.make());
    const store = { sealer: fx.right.sealer, keyring: fx.right.keyring, clock: { nowMs: () => Date.parse(NOW) } };
    const assistant = new SqlSiteAssistantCredentialRepo(fx.kernel);
    await setSiteAssistantCredential({ ...store, repo: assistant }, { workspaceId: WS, apiKey: "LEAK-real-store-api-key", provider: "anthropic" });
    const custom = new SqlCustomCredentialSetRepo(fx.kernel);
    await createCustomCredential({ ...store, repo: custom, idGen: { newId: () => "custom-real" } },
      { workspaceId: WS, label: "Mail", category: "general", baseUrl: "https://mail.example.test", connection: { token: "LEAK-real-store-token" } });
    const inventory = await inventoryVaultCredentials({ kernel: fx.kernel, ...fx.right, hasSiteKeySource: () => true });
    assert.equal((await resolveSiteAssistantApiKey({ repo: assistant, sealer: fx.right.sealer }, { workspaceId: WS }))?.apiKey, "LEAK-real-store-api-key");
    assert.equal((await resolveCustomCredentialByLabel({ repo: custom, sealer: fx.right.sealer }, { workspaceId: WS, label: "Mail" }))?.connection.token, "LEAK-real-store-token");
    assert.deepEqual(inventory.totals, { sealed: 2, opens: 2, doesNotOpen: 0, unknown: 0 });
    assert.equal(JSON.stringify(inventory).includes("LEAK"), false);
  });

  test(`an active key that cannot be read leaves every row unknown without sealing or opening anything [${each.name}]`, async () => {
    const fx = await fixture(each.make());
    await fx.put({ id: "one" }); await fx.put({ id: "two", key: fx.wrong });
    let crypto = 0;
    const inventory = await inventoryVaultCredentials({ kernel: fx.kernel, hasSiteKeySource: () => true,
      keyring: { activeKey: async () => { throw new Error("LEAK-key-error"); } },
      sealer: { seal: async () => { crypto += 1; throw new Error("unexpected seal"); }, open: async () => { crypto += 1; throw new Error("unexpected open"); } } });
    assert.equal(crypto, 0);
    assert.deepEqual(inventory.totals, { sealed: 2, opens: 0, doesNotOpen: 0, unknown: 2 });
    assert.ok(inventory.entries.every(entry => entry.opensUnderActiveKey === "unknown" && entry.unknownReason === "active-key-unavailable"));
    assert.equal(inventory.activeKeyId, null);
    assert.equal(JSON.stringify(inventory).includes("LEAK-key-error"), false);
  });

  test(`a probe that round-trips the wrong plaintext reports unknown, never "does not open" [${each.name}]`, async () => {
    const fx = await fixture(each.make());
    await fx.put({ id: "one" }); await fx.put({ id: "two", key: fx.wrong });
    const inventory = await inventoryVaultCredentials({ kernel: fx.kernel, keyring: fx.right.keyring, hasSiteKeySource: () => true,
      sealer: { seal: fx.right.sealer.seal.bind(fx.right.sealer), open: async () => "not-the-probe-plaintext" } });
    assert.deepEqual(inventory.totals, { sealed: 2, opens: 0, doesNotOpen: 0, unknown: 2 });
    assert.ok(inventory.entries.every(entry => entry.unknownReason === "active-key-unavailable"));
  });
}
