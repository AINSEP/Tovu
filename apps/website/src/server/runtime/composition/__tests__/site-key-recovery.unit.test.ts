import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { sql } from "kysely";

import type { UUID } from "@jini-ai/core/primitives";

import { buildMediaProviderCredentialAad } from "#src/features/media/aad";
import { FixedSiteKeyKeyring } from "#src/features/webhooks/keyring.env";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { installSiteKey, mintSiteKeyHex } from "#src/features/webhooks/site-key-ensure";
import type { ContentDatabase } from "#src/platform/db/content-database.generated";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { seedPrincipals } from "#src/platform/db/kernel/__tests__/content-seeds";
import { openSqliteFileKernel } from "#src/platform/db/kernel/drivers/sqlite";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { CONTENT_DB_FILENAME } from "#src/platform/site-dir/layout";
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
    const sealed = await sealer.seal({ plaintext: "sk-media", key: await keyring.activeKey(), aad: buildMediaProviderCredentialAad({ workspaceId: WS as UUID, providerId: "fal" }) });
    await kernel.execute(sql`INSERT INTO media_provider_credentials (workspace_id, provider_id, key_tail, aad_version, created_at, updated_at, sealed_key_id, sealed_ciphertext, sealed_nonce, sealed_alg)
      VALUES (${WS}, ${"fal"}, ${"tail"}, ${1}, ${"2026-10-04T00:00:00.000Z"}, ${"2026-10-04T00:00:00.000Z"}, ${sealed.keyId}, ${sealed.ciphertext}, ${sealed.nonce}, ${sealed.alg})`);
  } finally {
    await (kernel as unknown as { close(): Promise<void> }).close();
  }
  return dir;
}

const writeStorageSecret = (dir: string, hex: string) => writeSealedConnectionString({ siteDir: dir, connectionString: "postgres://site" }, keyed(hex));

test("a site with no database and no storage secret has nothing to check, discard or reseal", async t => {
  const dir = siteDir(t);
  assert.deepEqual(await siteKeyRecovery.checkKey({ siteDir: dir, hex: A }), { sealed: 0, opens: 0, storageSecret: "absent" });
  assert.deepEqual(await siteKeyRecovery.discardNotOpening({ siteDir: dir, hex: A }), { discarded: 0, kept: 0 });
  assert.deepEqual(await siteKeyRecovery.resealFrom({ siteDir: dir, hex: B, previousHex: A }), { resealed: 0, unreadable: 0 });
});

test("checkKey opens the site's own content.db and counts what opens under the candidate key", async t => {
  const dir = await siteWithSealedKey(t, A);
  await writeStorageSecret(dir, A);
  assert.deepEqual(await siteKeyRecovery.checkKey({ siteDir: dir, hex: A }), { sealed: 1, opens: 1, storageSecret: "opens" });
  assert.deepEqual(await siteKeyRecovery.checkKey({ siteDir: dir, hex: B }), { sealed: 1, opens: 0, storageSecret: "locked" });
});

test("the running site's own kernel is used when there is one, instead of the file", async t => {
  const fileSite = await siteWithSealedKey(t, A);
  const kernel = openSqliteFileKernel<ContentDatabase>(path.join(fileSite, CONTENT_DB_FILENAME)) as unknown as ContentKernel;
  t.after(() => (kernel as unknown as { close(): Promise<void> }).close());
  const empty = siteDir(t);
  assert.deepEqual(await siteKeyRecovery.checkKey({ siteDir: empty, contentKernel: kernel, hex: A }), { sealed: 1, opens: 1, storageSecret: "absent" });
});

test("discardNotOpening removes the value that does not open under the kept key", async t => {
  const dir = await siteWithSealedKey(t, A);
  assert.deepEqual(await siteKeyRecovery.discardNotOpening({ siteDir: dir, hex: B }), { discarded: 1, kept: 0 });
  assert.deepEqual(await siteKeyRecovery.checkKey({ siteDir: dir, hex: A }), { sealed: 0, opens: 0, storageSecret: "absent" });
});

test("resealFrom moves the sealed row and the storage secret from the previous key onto the new one", async t => {
  const dir = await siteWithSealedKey(t, A);
  await writeStorageSecret(dir, A);
  assert.deepEqual(await siteKeyRecovery.resealFrom({ siteDir: dir, hex: B, previousHex: A }), { resealed: 2, unreadable: 0 });
  assert.deepEqual(await siteKeyRecovery.checkKey({ siteDir: dir, hex: B }), { sealed: 1, opens: 1, storageSecret: "opens" });
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
