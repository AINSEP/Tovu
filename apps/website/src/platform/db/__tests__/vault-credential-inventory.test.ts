import "../../site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "kysely";
import type { SealedSecret, SecretSealerPort } from "@jini-ai/platform/secrets";
import {
  discoverSealedColumns, inventoryVaultCredentials, isVaultRestoreArtifact, opensVaultCredential, SealedCredentialInventoryLimitError,
  siblingColumns, snapshotVaultCredentials, type SealedCredentialInventoryDeps, type VaultCredentialKeyDeps, type VaultCredentialValue,
} from "../vault-credential-inventory.js";
import { freshSqliteContentKernel } from "../kernel/__tests__/dialect-matrix.js";
import { createSqlDeviceAuthorizationStore, deviceAad } from "../repos/oauth-pending-store.js";
import { fixture, WS, NOW } from "./vault-credential.fixture.js";

/**
 * @file Branch pins for `vault-credential-inventory.ts` on a fresh in-memory SQLite content store:
 * catalog discovery, unknown/device column classification, vault AAD selection, limits and the
 * per-row verdict ladder. `sealed-credential-inventory.test.ts` holds the cross-dialect scenarios.
 */

type Fixture = Awaited<ReturnType<typeof fixture>>;

/** Runs `body` on a fresh fixture and closes its kernel afterwards. */
async function withFixture(body: (fx: Fixture) => Promise<void>): Promise<void> {
  const kernel = freshSqliteContentKernel();
  try { await body(await fixture(kernel)); } finally { await kernel.close(); }
}

function keyDeps(fx: Fixture): VaultCredentialKeyDeps {
  return { kernel: fx.kernel, ...fx.right };
}

function depsFor(fx: Fixture): SealedCredentialInventoryDeps {
  return { kernel: fx.kernel, ...fx.right, hasSiteKeySource: () => true };
}

/** A sealer that counts seals/opens around the fixture's real sealer. */
function countingSealer(fx: Fixture): SealedCredentialInventoryDeps["sealer"] & { seals: number; opens: number } {
  const counter = {
    seals: 0, opens: 0,
    seal: async (input: Parameters<SecretSealerPort["seal"]>[0]) => { counter.seals += 1; return fx.right.sealer.seal(input); },
    open: async (input: { sealed: SealedSecret }, optional?: { aad?: string }) => { counter.opens += 1; return fx.right.sealer.open(input, optional); },
  };
  return counter;
}

const SEALED: SealedSecret = { keyId: "k1", ciphertext: "c", nonce: "n", alg: "aes-256-gcm" };

function value(overrides: Partial<VaultCredentialValue> = {}): VaultCredentialValue {
  return {
    ref: { table: "t", column: "sealed_ciphertext", tableColumns: new Set(["sealed_ciphertext"]), notNull: false },
    sealed: SEALED, ciphertext: "c", aad: "aad-1", reason: null,
    entry: { table: "t", column: "sealed_ciphertext", workspaceId: null, rowId: null, label: "x", sealedKeyId: "k1" },
    ...overrides,
  };
}

function recordingOpen(result: () => Promise<string>) {
  const calls: Array<{ input: { sealed: SealedSecret }; optional: { aad?: string } | undefined }> = [];
  const sealer: Pick<SecretSealerPort, "open"> = {
    open: async (input, optional) => { calls.push({ input, optional }); return result(); },
  };
  return { sealer, calls };
}

// --- opensVaultCredential ---------------------------------------------------------------------

test("opensVaultCredential: a value already carrying an unknown reason is not opened", async () => {
  const { sealer, calls } = recordingOpen(async () => "plain");
  assert.equal(await opensVaultCredential({ value: value({ reason: "no-descriptor" }), sealer }), false);
  assert.equal(calls.length, 0);
});

test("opensVaultCredential: a value without a sealed envelope is not opened", async () => {
  const { sealer, calls } = recordingOpen(async () => "plain");
  assert.equal(await opensVaultCredential({ value: value({ sealed: null }), sealer }), false);
  assert.equal(calls.length, 0);
});

test("opensVaultCredential: an open that rejects is a safe false verdict", async () => {
  const { sealer } = recordingOpen(async () => { throw new Error("bad tag"); });
  assert.equal(await opensVaultCredential({ value: value(), sealer }), false);
});

test("opensVaultCredential: an open that resolves is true and uses exactly the selected AAD", async () => {
  const { sealer, calls } = recordingOpen(async () => "plain");
  assert.equal(await opensVaultCredential({ value: value({ aad: "aad-1" }), sealer }), true);
  assert.deepEqual(calls, [{ input: { sealed: SEALED }, optional: { aad: "aad-1" } }]);
});

// --- siblingColumns / isVaultRestoreArtifact ----------------------------------------------------

test("siblingColumns: derives the quad siblings from the column's prefix", () => {
  assert.deepEqual(siblingColumns("oauth_sealed_ciphertext"),
    { keyId: "oauth_sealed_key_id", nonce: "oauth_sealed_nonce", alg: "oauth_sealed_alg" });
  assert.deepEqual(siblingColumns("sealed_ciphertext"), { keyId: "sealed_key_id", nonce: "sealed_nonce", alg: "sealed_alg" });
});

test("isVaultRestoreArtifact: only tables starting with _vault_backup_ are restore artifacts", () => {
  assert.equal(isVaultRestoreArtifact({ table: "_vault_backup_20261011" }), true);
  assert.equal(isVaultRestoreArtifact({ table: "vault_backup_x" }), false);
  assert.equal(isVaultRestoreArtifact({ table: "x_vault_backup_" }), false);
});

// --- discoverSealedColumns ----------------------------------------------------------------------

test("discoverSealedColumns: suffix-matched columns in code-unit table order, restore artifacts excluded", async () => {
  await withFixture(async fx => {
    await fx.kernel.execute(sql`CREATE TABLE "Zplugin" (oauth_sealed_ciphertext text NOT NULL, sealed_ciphertext_hint text)`);
    await fx.kernel.execute(sql`CREATE TABLE _vault_backup_x (sealed_ciphertext text)`);
    const refs = await discoverSealedColumns(fx.kernel);
    assert.deepEqual(refs.map(ref => ({ table: ref.table, column: ref.column, notNull: ref.notNull })), [
      { table: "Zplugin", column: "oauth_sealed_ciphertext", notNull: true },
      { table: "oauth_device_authorizations", column: "sealed_ciphertext", notNull: true },
      { table: "secrets_vault", column: "sealed_ciphertext", notNull: false },
    ]);
    assert.deepEqual([...refs[0]!.tableColumns], ["oauth_sealed_ciphertext", "sealed_ciphertext_hint"]);
  });
});

// --- unknown and device columns -----------------------------------------------------------------

test("an unknown column with a full prefixed quad is unclassified, keeps its key id and a guard over present columns", async () => {
  await withFixture(async fx => {
    await fx.kernel.execute(sql`CREATE TABLE plugin_tokens (id text, oauth_sealed_ciphertext text, oauth_sealed_key_id text,
      oauth_sealed_nonce text, oauth_sealed_alg text)`);
    await fx.kernel.execute(sql`INSERT INTO plugin_tokens VALUES ('r1','opaque','key-a','nonce-a','aes-256-gcm'), ('r2',NULL,'k',NULL,NULL)`);
    const snapshot = await snapshotVaultCredentials(keyDeps(fx));
    assert.equal(snapshot.values.length, 1);
    const [only] = snapshot.values;
    assert.deepEqual(only!.sealed, { keyId: "key-a", ciphertext: "opaque", nonce: "nonce-a", alg: "aes-256-gcm" });
    assert.deepEqual(only!.guard, { oauth_sealed_ciphertext: "opaque", oauth_sealed_key_id: "key-a",
      oauth_sealed_nonce: "nonce-a", oauth_sealed_alg: "aes-256-gcm" });
    assert.equal(only!.aad, undefined);
    assert.equal("device" in only!, false);
    const inventory = await inventoryVaultCredentials(depsFor(fx));
    assert.deepEqual(inventory.entries, [{ table: "plugin_tokens", column: "oauth_sealed_ciphertext", workspaceId: null, rowId: null,
      label: "Unclassified plugin_tokens.oauth_sealed_ciphertext", sealedKeyId: "key-a", opensUnderActiveKey: "unknown", unknownReason: "no-descriptor" }]);
    assert.deepEqual(inventory.columns, [
      { table: "oauth_device_authorizations", column: "sealed_ciphertext", coverage: "classified", sealedRows: 0 },
      { table: "plugin_tokens", column: "oauth_sealed_ciphertext", coverage: "no-descriptor", sealedRows: 1 },
      { table: "secrets_vault", column: "sealed_ciphertext", coverage: "classified", sealedRows: 0 },
    ]);
  });
});

test("an unknown column without sibling columns selects NULL siblings: incomplete row, no key id, guard over the ciphertext only", async () => {
  await withFixture(async fx => {
    await fx.kernel.execute(sql`CREATE TABLE plugin_bare (sealed_ciphertext text)`);
    await fx.kernel.execute(sql`INSERT INTO plugin_bare VALUES ('opaque')`);
    const [only] = (await snapshotVaultCredentials(keyDeps(fx))).values;
    assert.equal(only!.sealed, null);
    assert.deepEqual(only!.guard, { sealed_ciphertext: "opaque" });
    assert.equal(only!.reason, "incomplete-sealed-row");
    assert.equal(only!.entry.sealedKeyId, null);
  });
});

test("a retained device code is classified with its workspace/server identity and device AAD, and opens", async () => {
  await withFixture(async fx => {
    const device = createSqlDeviceAuthorizationStore({ kernel: fx.kernel, workspaceId: WS, ...fx.right, clock: { nowMs: () => Date.parse(NOW) } });
    await device.put("server-1", { deviceCode: "dc", userCode: "UC", verificationUri: "https://auth.example.test",
      verificationUriComplete: null, intervalSeconds: 5, expiresAt: "2026-10-11T01:00:00.000Z" });
    const [only] = (await snapshotVaultCredentials(keyDeps(fx))).values;
    assert.deepEqual(only!.device, { workspaceId: WS, serverId: "server-1" });
    assert.equal(only!.aad, deviceAad(WS, "server-1"));
    const inventory = await inventoryVaultCredentials(depsFor(fx));
    assert.deepEqual(inventory.entries, [{ table: "oauth_device_authorizations", column: "sealed_ciphertext", workspaceId: WS,
      rowId: "server-1", label: "Pending device sign-in (server-1)", sealedKeyId: only!.sealed!.keyId, opensUnderActiveKey: true, unknownReason: null }]);
  });
});

test("a device-table row without a string workspace id falls back to an unclassified entry under classified coverage", async () => {
  await withFixture(async fx => {
    await fx.kernel.execute(sql`DROP TABLE oauth_device_authorizations`);
    await fx.kernel.execute(sql`CREATE TABLE oauth_device_authorizations (workspace_id text, server_id text, sealed_ciphertext text,
      sealed_key_id text, sealed_nonce text, sealed_alg text)`);
    await fx.kernel.execute(sql`INSERT INTO oauth_device_authorizations VALUES (NULL,'s1','c','k','n','aes-256-gcm')`);
    const inventory = await inventoryVaultCredentials(depsFor(fx));
    assert.deepEqual(inventory.entries.map(entry => [entry.label, entry.workspaceId, entry.rowId, entry.unknownReason]),
      [["Unclassified oauth_device_authorizations.sealed_ciphertext", null, null, "no-descriptor"]]);
    assert.equal(inventory.columns.find(column => column.table === "oauth_device_authorizations")?.coverage, "classified");
  });
});

test("a device table missing server_id, or a prefixed column in it, is not read as a device code", async () => {
  await withFixture(async fx => {
    await fx.kernel.execute(sql`DROP TABLE oauth_device_authorizations`);
    await fx.kernel.execute(sql`CREATE TABLE oauth_device_authorizations (workspace_id text, sealed_ciphertext text,
      sealed_key_id text, sealed_nonce text, sealed_alg text, extra_sealed_ciphertext text, extra_sealed_key_id text,
      extra_sealed_nonce text, extra_sealed_alg text, server_id_x text)`);
    await fx.kernel.execute(sql`INSERT INTO oauth_device_authorizations VALUES ('w','c','k','n','a','c2','k2','n2','a2','s')`);
    const values = (await snapshotVaultCredentials(keyDeps(fx))).values;
    assert.deepEqual(values.map(entry => [entry.ref.column, entry.device, entry.reason, entry.entry.workspaceId]),
      [["sealed_ciphertext", undefined, "no-descriptor", null], ["extra_sealed_ciphertext", undefined, "no-descriptor", null]]);
  });
});

test("a prefixed column in a table with workspace_id and server_id is not read as a device code", async () => {
  await withFixture(async fx => {
    await fx.kernel.execute(sql`DROP TABLE oauth_device_authorizations`);
    await fx.kernel.execute(sql`CREATE TABLE oauth_device_authorizations (workspace_id text, server_id text, extra_sealed_ciphertext text,
      extra_sealed_key_id text, extra_sealed_nonce text, extra_sealed_alg text)`);
    await fx.kernel.execute(sql`INSERT INTO oauth_device_authorizations VALUES ('w','s','c','k','n','a')`);
    const [only] = (await snapshotVaultCredentials(keyDeps(fx))).values;
    assert.equal(only!.device, undefined);
    assert.equal(only!.entry.label, "Unclassified oauth_device_authorizations.extra_sealed_ciphertext");
  });
});

// --- vault rows ---------------------------------------------------------------------------------

test("vault rows: safe kind/id identity, envelope key id, scope order, metadata-only split and column count", async () => {
  await withFixture(async fx => {
    const b = await fx.put({ id: "b-one", kind: "mcp-env", ownerKey: "b-owner" });
    const a = await fx.put({ id: "a-one", kind: "mcp-env", ownerKey: "a-owner" });
    await fx.put({ id: "settings", key: null, kind: "media-provider", provider: "fal", meta: { baseUrl: null, model: null } });
    const inventory = await inventoryVaultCredentials(depsFor(fx));
    assert.deepEqual(inventory.entries, [
      { workspaceId: WS, rowId: "a-one", label: "mcp-env (a-one)", table: "secrets_vault", column: "sealed_ciphertext",
        sealedKeyId: a.sealed!.keyId, opensUnderActiveKey: true, unknownReason: null },
      { workspaceId: WS, rowId: "b-one", label: "mcp-env (b-one)", table: "secrets_vault", column: "sealed_ciphertext",
        sealedKeyId: b.sealed!.keyId, opensUnderActiveKey: true, unknownReason: null },
    ]);
    assert.deepEqual(inventory.metadataOnly, [{ workspaceId: WS, rowId: "settings", label: "media-provider (settings)" }]);
    assert.equal(inventory.columns.find(column => column.table === "secrets_vault")?.sealedRows, 2);
    assert.equal(inventory.activeKeyId, (await fx.right.keyring.activeKey()).keyId);
    assert.equal(inventory.legacySealed, 0);
  });
});

test("vault rows: a legacy AAD without the host codec is an unrecognized lineage and counts as legacy", async () => {
  await withFixture(async fx => {
    const record = await fx.put({ id: "legacy" });
    await fx.repo.put({ expectedRevision: record.revision, record: { ...record, revision: record.revision + 1,
      meta: { ...record.meta, legacyAad: { aadVersion: 0 } } } });
    const sealer = countingSealer(fx);
    const inventory = await inventoryVaultCredentials({ ...depsFor(fx), sealer });
    assert.equal(inventory.entries[0]?.unknownReason, "unrecognized-aad-version");
    assert.equal(inventory.entries[0]?.opensUnderActiveKey, "unknown");
    assert.equal(inventory.legacySealed, 1);
    assert.equal(sealer.opens, 1, "only the key probe opens; the legacy row is never opened");
  });
});

test("vault rows: the host codec chooses the AAD for every row, legacy or not", async () => {
  await withFixture(async fx => {
    const record = await fx.put({ id: "legacy" });
    await fx.repo.put({ expectedRevision: record.revision, record: { ...record, revision: record.revision + 1,
      meta: { ...record.meta, legacyAad: { aadVersion: 0 } } } });
    const seen: string[] = [];
    const chosen = await snapshotVaultCredentials({ ...fx.right, kernel: fx.kernel, aadFor: ({ record: row }) => { seen.push(row.id); return "host-aad"; } });
    assert.deepEqual(seen, ["legacy"]);
    assert.equal(chosen.values[0]?.aad, "host-aad");
    assert.equal(chosen.values[0]?.reason, null);
    const none = await inventoryVaultCredentials({ ...depsFor(fx), aadFor: () => undefined });
    assert.equal(none.entries[0]?.opensUnderActiveKey, false, "a codec returning no AAD opens without one, and the envelope refuses");
    assert.equal(none.entries[0]?.unknownReason, null);
    assert.equal(none.legacySealed, 1);
  });
});

// --- limits ------------------------------------------------------------------------------------

test("limits: a non-integer maxEntries is refused before any read", async () => {
  await withFixture(async fx => {
    await assert.rejects(snapshotVaultCredentials(keyDeps(fx), { maxEntries: 1.5 }), { name: "RangeError", message: "maxEntries must be a positive integer" });
    await assert.rejects(snapshotVaultCredentials(keyDeps(fx), { maxEntries: Number.NaN }), { name: "RangeError", message: "maxEntries must be a positive integer" });
  });
});

test("limits: exactly maxEntries sealed rows pass, and metadata-only rows do not count", async () => {
  await withFixture(async fx => {
    await fx.put({ id: "one" });
    await fx.put({ id: "settings", key: null, kind: "media-provider", provider: "fal", meta: { baseUrl: null, model: null } });
    assert.equal((await snapshotVaultCredentials(keyDeps(fx), { maxEntries: 1 })).values.length, 1);
  });
});

test("limits: one row over maxEntries refuses with the counted rows, the limit and a fixed message", async () => {
  await withFixture(async fx => {
    await fx.put({ id: "one" }); await fx.put({ id: "two" });
    await assert.rejects(snapshotVaultCredentials(keyDeps(fx), { maxEntries: 1 }), (error: unknown) => {
      assert.ok(error instanceof SealedCredentialInventoryLimitError);
      assert.equal(error.name, "SealedCredentialInventoryLimitError");
      assert.equal(error.message, "Sealed credential inventory exceeds its limit; refusing an understated count");
      assert.equal(error.sealedRows, 2);
      assert.equal(error.maxEntries, 1);
      return true;
    });
  });
});

test("limits: sealed rows are summed across every discovered column before the limit check", async () => {
  await withFixture(async fx => {
    await fx.put({ id: "one" });
    await fx.kernel.execute(sql`CREATE TABLE plugin_bare (sealed_ciphertext text)`);
    await fx.kernel.execute(sql`INSERT INTO plugin_bare VALUES ('opaque')`);
    await assert.rejects(snapshotVaultCredentials(keyDeps(fx), { maxEntries: 1 }),
      (error: unknown) => error instanceof SealedCredentialInventoryLimitError && error.sealedRows === 2 && error.maxEntries === 1);
  });
});

test("limits: a count query that returns no row counts as zero", async () => {
  await withFixture(async fx => {
    await fx.put({ id: "one" });
    // Drop only the single-`count` result rows the limit pre-count reads; every other read is real.
    const kernel: typeof fx.kernel = { ...fx.kernel, query: async statement => {
      const rows = await fx.kernel.query(statement);
      return rows.length === 1 && Object.keys(rows[0] as object).join() === "count" ? [] : rows;
    } };
    assert.equal((await snapshotVaultCredentials({ ...fx.right, kernel }, { maxEntries: 1 })).values.length, 1);
  });
});

// --- verdict ladder ----------------------------------------------------------------------------

test("verdicts: the key is probed once up front and re-probed only after a failed open", async () => {
  await withFixture(async fx => {
    await fx.put({ id: "right" }); await fx.put({ id: "wrong", key: fx.wrong });
    const sealer = countingSealer(fx);
    const inventory = await inventoryVaultCredentials({ ...depsFor(fx), sealer });
    assert.deepEqual(inventory.totals, { sealed: 2, opens: 1, doesNotOpen: 1, unknown: 0 });
    assert.equal(sealer.seals, 2);
  });
});

test("verdicts: an absent key source reads no key, probes nothing and reports no-site-key with a null key id", async () => {
  await withFixture(async fx => {
    await fx.put({ id: "one" });
    const sealer = countingSealer(fx);
    const inventory = await inventoryVaultCredentials({ ...depsFor(fx), sealer, hasSiteKeySource: () => false });
    assert.equal(sealer.seals + sealer.opens, 0);
    assert.equal(inventory.activeKeyId, null);
    assert.deepEqual(inventory.entries.map(entry => [entry.opensUnderActiveKey, entry.unknownReason]), [["unknown", "no-site-key"]]);
  });
});

test("verdicts: a key whose probe fails keeps its key id but leaves rows unknown", async () => {
  await withFixture(async fx => {
    await fx.put({ id: "one" });
    const inventory = await inventoryVaultCredentials({ ...depsFor(fx), sealer: { seal: async () => { throw new Error("probe failed"); },
      open: fx.right.sealer.open.bind(fx.right.sealer) } });
    assert.equal(inventory.activeKeyId, (await fx.right.keyring.activeKey()).keyId);
    assert.deepEqual(inventory.entries.map(entry => [entry.opensUnderActiveKey, entry.unknownReason]), [["unknown", "active-key-unavailable"]]);
  });
});

test("verdicts: an envelope under another algorithm is never opened", async () => {
  await withFixture(async fx => {
    const record = await fx.put({ id: "future" });
    await fx.repo.put({ expectedRevision: record.revision, record: { ...record, revision: record.revision + 1, sealed: { ...record.sealed!, alg: "future-alg" } } });
    const sealer = countingSealer(fx);
    const inventory = await inventoryVaultCredentials({ ...depsFor(fx), sealer });
    assert.equal(inventory.entries[0]?.unknownReason, "unsupported-alg");
    assert.equal(sealer.opens, 1, "only the up-front probe opens");
  });
});
