import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import { listSealedCredentials, SealedCredentialInventoryLimitError } from "../sealed-credential-inventory.js";
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
      const inventory = await listSealedCredentials({ kernel: fx.kernel, ...fx.right, hasSiteKeySource: () => true });
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
      const inventory = await listSealedCredentials({ kernel: fx.kernel, ...fx.right, hasSiteKeySource: () => true });
      assert.deepEqual(inventory.totals, { sealed: 1, opens: 0, doesNotOpen: 0, unknown: 1 });
      assert.equal(inventory.columns.find(column => column.table === "inventory_unknown")?.coverage, "no-descriptor");
      assert.equal(inventory.entries[0]?.unknownReason, "incomplete-sealed-row");
      assert.equal(inventory.entries[0]?.rowId, null);
    } finally { await fx.kernel.execute(sql`DROP TABLE inventory_unknown`); }
  });

  test(`wrong key, unavailable key, absent source, unsupported alg and unknown lineage stay distinct [${each.name}]`, async () => {
    const fx = await fixture(each.make());
    const record = await fx.put({ id: "one" });
    const deps = { kernel: fx.kernel, ...fx.right, hasSiteKeySource: () => true };
    assert.equal((await listSealedCredentials({ ...deps, ...fx.wrong })).entries[0]?.opensUnderActiveKey, false);
    let derived = 0;
    const absent = await listSealedCredentials({ ...deps, hasSiteKeySource: () => false,
      keyring: { activeKey: async () => { derived += 1; throw new Error("must not mint"); } } });
    assert.equal(absent.entries[0]?.unknownReason, "no-site-key");
    assert.equal(derived, 0);
    const unavailable = await listSealedCredentials({ ...deps, sealer: { seal: async () => { throw new Error("LEAK-error"); }, open: fx.right.sealer.open.bind(fx.right.sealer) } });
    assert.equal(unavailable.entries[0]?.unknownReason, "active-key-unavailable");
    const unknown = await listSealedCredentials({ ...deps, aadFor: () => { throw new Error("LEAK-error"); } });
    assert.equal(unknown.entries[0]?.unknownReason, "unrecognized-aad-version");
    await fx.repo.put({ expectedRevision: record.revision, record: { ...record, revision: record.revision + 1,
      sealed: { ...record.sealed!, alg: "future-alg" } } });
    assert.equal((await listSealedCredentials(deps)).entries[0]?.unknownReason, "unsupported-alg");
    assert.equal(JSON.stringify(unknown).includes("LEAK-error"), false);
  });

  test(`inventory refuses understated limits and rechecks active key after a failed open [${each.name}]`, async () => {
    const fx = await fixture(each.make());
    await fx.put({ id: "one" }); await fx.put({ id: "two" });
    const deps = { kernel: fx.kernel, ...fx.right, hasSiteKeySource: () => true };
    await assert.rejects(listSealedCredentials(deps, { maxEntries: 1 }), error => error instanceof SealedCredentialInventoryLimitError && error.sealedRows === 2);
    await assert.rejects(listSealedCredentials(deps, { maxEntries: 0 }), RangeError);
    let probes = 0;
    const inventory = await listSealedCredentials({ ...deps, sealer: {
      seal: async input => { if (++probes > 1) throw new Error("key lost"); return fx.right.sealer.seal(input); },
      open: async (input, options) => {
        if (options?.aad === "sealed-credential-inventory-probe:v1") return fx.right.sealer.open(input, options);
        throw new Error("key lost");
      },
    } });
    assert.equal(inventory.totals.unknown, 2);
    assert.equal(inventory.totals.doesNotOpen, 0);
  });
}
