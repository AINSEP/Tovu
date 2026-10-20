import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { buildVaultAad, type VaultRecord } from "@jini-ai/platform/secrets/credential-sets";
import { vaultRepo } from "#src/platform/db/__tests__/vault-credential.fixture";
import { FixedSiteKeyKeyring } from "#src/features/webhooks/keyring.env";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { installSiteKey, mintSiteKeyHex } from "#src/features/webhooks/site-key-ensure";
import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { seedPrincipals } from "#src/platform/db/kernel/__tests__/content-seeds";
import { openSqliteFileKernel } from "#src/platform/db/kernel/drivers/sqlite";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { CONTENT_DB_FILENAME } from "#src/platform/site-dir/layout";
import { buildMediaProviderCredentialAad } from "../vault-legacy-codecs.js";
import { siteKeyRecovery } from "../site-key-recovery.js";
import { readSealedConnectionString, writeSealedConnectionString } from "../storage-secret.js";

/**
 * @file The admin Site key route's recovery services (`site-key-recovery.ts`) against a real site
 * directory: a real `content.db` holding one sealed media key, and a real `.storage-secret.json`.
 * Covers the three store sources (the running site's kernel, the site's own file, no database yet),
 * the storage secret's absent/opens/locked states, and resealing both stores onto a new key.
 */

const WS = "ws-site-key";
const A = mintSiteKeyHex();
const B = mintSiteKeyHex();
const C = mintSiteKeyHex();

function keyed(hex: string) {
  const keyring = new FixedSiteKeyKeyring(hex);
  return { keyring, sealer: new AesGcmSecretSealer(keyring) };
}

function siteDir(t: TestContext): string {
  const dir = mkdtempSync(path.join(tmpdir(), "tovu-site-key-recovery-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A site whose content.db holds one media provider key sealed under `hex`. */
async function siteWithSealedKey(t: TestContext, hex: string): Promise<string> {
  const dir = siteDir(t);
  const dbPath = path.join(dir, CONTENT_DB_FILENAME);
  openContentDb(dbPath).$client.close();
  const kernel = openSqliteFileKernel<ContentDatabase>(dbPath) as unknown as ContentKernel;
  try {
    await seedPrincipals(kernel, WS, ["principal-1"]);
    const { keyring, sealer } = keyed(hex);
    const record: VaultRecord = { workspaceId: WS, id: "media-fal", kind: "media-provider", ownerKey: "tovu",
      principalId: null, binding: null, provider: "fal", label: "fal", revision: 1, isDefault: true,
      meta: { baseUrl: null, model: null }, sealed: null, last4: null, tokenLength: null,
      createdAt: "2026-10-04T00:00:00.000Z", updatedAt: "2026-10-04T00:00:00.000Z" };
    record.sealed = await sealer.seal({ plaintext: JSON.stringify({ apiKey: "sk-media" }), key: await keyring.activeKey(), aad: buildVaultAad(record) });
    await vaultRepo(kernel).put({ record, expectedRevision: null });
  } finally {
    await (kernel as unknown as { close(): Promise<void> }).close();
  }
  return dir;
}

const writeStorageSecret = (dir: string, hex: string) => writeSealedConnectionString({ siteDir: dir, connectionString: "postgres://site" }, keyed(hex));

for (const normalization of ["invalid-meta", ["conflict"]]) {
  test(`plugin-state recovery validates annotations before rotation: ${JSON.stringify(normalization)}`, async t => {
    const dir = await siteWithSealedKey(t, A);
    const kernel = openSqliteFileKernel<ContentDatabase>(path.join(dir, CONTENT_DB_FILENAME));
    t.after(() => kernel.close());
    const repo = vaultRepo(kernel);
    const media = (await repo.find({ workspaceId: WS, id: "media-fal" }))!;
    const record: VaultRecord = { ...media, id: "plugin-state:acme-office:products", kind: "api-connection", provider: null,
      label: "Plugin settings", isDefault: false, meta: { credentialFormat: "agent-plugin-state", normalization } };
    const source = keyed(A);
    record.sealed = await source.sealer.seal({ plaintext: JSON.stringify({ value: ["files"] }), key: await source.keyring.activeKey(), aad: buildVaultAad(record) });
    await repo.put({ record, expectedRevision: null });
    const recover = () => siteKeyRecovery.resealFrom({ siteDir: dir, contentKernel: kernel, hex: B, previousHex: A });
    if (typeof normalization !== "string") {
      await assert.rejects(recover(), { code: "invalid-meta" });
      assert.deepEqual(await repo.find(record), record);
      assert.deepEqual(await repo.find(media), media, "failed recovery rolls back other rotations too");
      return;
    }
    assert.deepEqual(await recover(), { resealed: 2, unreadable: 0 });
    const recovered = (await repo.find(record))!;
    assert.deepEqual(recovered.meta, { credentialFormat: "agent-plugin-state" });
    assert.deepEqual(JSON.parse(await keyed(B).sealer.open({ sealed: recovered.sealed! }, { aad: buildVaultAad(recovered) })), { value: ["files"] });
    await assert.rejects(source.sealer.open({ sealed: recovered.sealed! }, { aad: buildVaultAad(recovered) }));
  });
}

test("a site with no database and no storage secret has nothing to check, discard or reseal", async t => {
  const dir = siteDir(t);
  assert.deepEqual(await siteKeyRecovery.checkKey({ siteDir: dir, hex: A }), { sealed: 0, opens: 0, storageSecret: "absent", metadataOnly: 0, legacy: 0 });
  assert.deepEqual(await siteKeyRecovery.discardNotOpening({ siteDir: dir, hex: A }), { discarded: 0, kept: 0 });
  assert.deepEqual(await siteKeyRecovery.resealFrom({ siteDir: dir, hex: B, previousHex: A }), { resealed: 0, unreadable: 0 });
});

test("checkKey opens the site's own content.db and counts what opens under the candidate key", async t => {
  const dir = await siteWithSealedKey(t, A);
  await writeStorageSecret(dir, A);
  assert.deepEqual(await siteKeyRecovery.checkKey({ siteDir: dir, hex: A }), { sealed: 1, opens: 1, storageSecret: "opens", metadataOnly: 0, legacy: 0 });
  assert.deepEqual(await siteKeyRecovery.checkKey({ siteDir: dir, hex: B }), { sealed: 1, opens: 0, storageSecret: "locked", metadataOnly: 0, legacy: 0 });
});

test("the running site's own kernel is used when there is one, instead of the file", async t => {
  const fileSite = await siteWithSealedKey(t, A);
  const kernel = openSqliteFileKernel<ContentDatabase>(path.join(fileSite, CONTENT_DB_FILENAME)) as unknown as ContentKernel;
  t.after(() => (kernel as unknown as { close(): Promise<void> }).close());
  const empty = siteDir(t);
  assert.deepEqual(await siteKeyRecovery.checkKey({ siteDir: empty, contentKernel: kernel, hex: A }), { sealed: 1, opens: 1, storageSecret: "absent", metadataOnly: 0, legacy: 0 });
});

test("discardNotOpening removes the value that does not open under the kept key", async t => {
  const dir = await siteWithSealedKey(t, A);
  assert.deepEqual(await siteKeyRecovery.discardNotOpening({ siteDir: dir, hex: B }), { discarded: 1, kept: 0 });
  assert.deepEqual(await siteKeyRecovery.checkKey({ siteDir: dir, hex: A }), { sealed: 0, opens: 0, storageSecret: "absent", metadataOnly: 1, legacy: 0 });
});

test("resealFrom moves the sealed row and the storage secret from the previous key onto the new one", async t => {
  const dir = await siteWithSealedKey(t, A);
  await writeStorageSecret(dir, A);
  assert.deepEqual(await siteKeyRecovery.resealFrom({ siteDir: dir, hex: B, previousHex: A }), { resealed: 2, unreadable: 0 });
  assert.deepEqual(await siteKeyRecovery.checkKey({ siteDir: dir, hex: B }), { sealed: 1, opens: 1, storageSecret: "opens", metadataOnly: 0, legacy: 0 });
  assert.equal(await readSealedConnectionString({ siteDir: dir }, { sealer: keyed(B).sealer }), "postgres://site");
});

test("a storage secret already under the new key is left alone", async t => {
  const dir = siteDir(t);
  await writeStorageSecret(dir, B);
  assert.deepEqual(await siteKeyRecovery.resealFrom({ siteDir: dir, hex: B, previousHex: A }), { resealed: 0, unreadable: 0 });
});

test("a storage secret that opens under neither key is counted unreadable and left in place", async t => {
  const dir = siteDir(t);
  await writeStorageSecret(dir, C);
  assert.deepEqual(await siteKeyRecovery.resealFrom({ siteDir: dir, hex: B, previousHex: A }), { resealed: 0, unreadable: 1 });
  assert.equal(await readSealedConnectionString({ siteDir: dir }, { sealer: keyed(C).sealer }), "postgres://site");
});

test("the recovery services hand the route the real key writer and minter", () => {
  assert.equal(siteKeyRecovery.installSiteKey, installSiteKey);
  assert.equal(siteKeyRecovery.mintSiteKeyHex, mintSiteKeyHex);
});


for (const target of [A, B]) {
  test(`legacy recovery normalizes through the boot codec, including the same-key case (${target === A ? "same" : "different"})`, async t => {
    const dir = await siteWithSealedKey(t, A);
    const kernel = openSqliteFileKernel<ContentDatabase>(path.join(dir, CONTENT_DB_FILENAME));
    t.after(() => kernel.close());
    const repo = vaultRepo(kernel);
    const record = (await repo.find({ workspaceId: WS, id: "media-fal" }))!;
    const legacy = { table: "media_provider_credentials", workspaceId: WS, id: "fal", principalId: null, provider: "fal", serverId: null, aadVersion: 1 };
    const keyedSource = keyed(A);
    const sealed = await keyedSource.sealer.seal({ plaintext: "legacy-media-key", key: await keyedSource.keyring.activeKey(),
      aad: buildMediaProviderCredentialAad({ workspaceId: WS, providerId: "fal" }) });
    await repo.put({ expectedRevision: record.revision, record: { ...record, sealed, revision: record.revision + 1,
      meta: { ...record.meta, legacyAad: legacy, migration: { ...legacy, mappedId: record.id } } } });
    assert.equal((await siteKeyRecovery.checkKey({ siteDir: dir, contentKernel: kernel, hex: A })).legacy, 1);
    assert.deepEqual(await siteKeyRecovery.resealFrom({ siteDir: dir, contentKernel: kernel, hex: target, previousHex: A }), { resealed: 1, unreadable: 0 });
    const recovered = (await repo.find(record))!;
    assert.equal(recovered.meta.legacyAad, undefined);
    assert.equal(recovered.meta.normalization, undefined);
    assert.deepEqual(JSON.parse(await keyed(target).sealer.open({ sealed: recovered.sealed! }, { aad: buildVaultAad(recovered) })), { apiKey: "legacy-media-key" });
    assert.equal((await siteKeyRecovery.checkKey({ siteDir: dir, contentKernel: kernel, hex: target })).legacy, 0);
  });
}
