/** k1 Job 1: orchestration contracts; crypto/vault round trips belong to the Job 2 adapter. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { createSiteShareBackend } from "../../share-backend.js";
import { SiteShareRegistry } from "../../share-registry.js";
import type { SiteSharePlanContent } from "../../plan-store.js";
import type { SiteSavedKeysPort } from "../../saved-keys-port.js";
import { ENCRYPTED_KEYS_DESCRIPTOR, SAVED_KEYS_PATH } from "../../saved-keys-port.js";

const sealedPassword = { keyId: "source", ciphertext: "ciphertext", nonce: "nonce", alg: "aes-256-gcm" };
test("export persists only sealed password and notices; list/job views cannot disclose its envelope", { timeout: 120000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "saved-keys-orchestration-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const registry = new SiteShareRegistry({ directory: root });
  let prepared: unknown;
  const content: SiteSharePlanContent = {
    target: { kind: "zip" }, profile: "share", database: { bytes: Buffer.from("fresh DB"), watermarkAtCapture: 0 }, files: [], skipped: [], scopeNotes: {}, totalBytes: 8,
    include: { database: true, media: true, themes: true, plugins: true, settings: true }, site: { name: "Site", folderName: "site" }, schema: { index: 1, tag: "one" }, createdAt: "now", tovuVersion: "test",
    notices: ["A private value was left out."], encryptedKeys: ENCRYPTED_KEYS_DESCRIPTOR, sealedPassword,
    bufferedFiles: [{ path: "settings.json", content: Buffer.from("{}") }, { path: SAVED_KEYS_PATH, content: Buffer.from('{"encrypted":"payload"}') }],
  };
  const savedKeys: Pick<SiteSavedKeysPort, "reveal"> = { reveal: async input => {
    assert.deepEqual(input.sealedPassword, sealedPassword); assert.equal(input.workspaceId, "ws");
    return { password: "owner-secret-password" };
  } };
  const backend = createSiteShareBackend({ registry, site: "ws", ownerPrincipalId: Promise.resolve("owner"), savedKeys,
    prepare: async input => { prepared = input; return content; }, zip: zipFolderFiles, delivery: async () => undefined });
  const result = await backend.create({ principalId: "owner", signal: new AbortController().signal, includeSavedKeys: true }, { waitMs: 60000 }) as any;
  assert.equal((prepared as any).includeSavedKeys, true);
  assert.equal((prepared as any).shareId, result.shareId);
  assert.equal(result.hasEncryptedKeys, true); assert.deepEqual(result.notices, content.notices);
  const stored = await registry.get({ site: "ws", shareId: result.shareId });
  assert.deepEqual(stored!.sealedPassword, sealedPassword);
  assert.equal(JSON.stringify(result).includes("ciphertext"), false);
  assert.equal(JSON.stringify(await backend.list({})).includes("ciphertext"), false);
  await assert.rejects(backend.revealPassword({ principalId: "other", shareId: result.shareId }), { code: "FORBIDDEN" });
  assert.deepEqual(await backend.revealPassword({ principalId: "owner", shareId: result.shareId }), { password: "owner-secret-password" });
});
test("opt-in export denies non-owner before preparation", { timeout: 120000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "saved-keys-owner-")); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const backend = createSiteShareBackend({ registry: new SiteShareRegistry({ directory: root }), site: "ws", ownerPrincipalId: Promise.resolve("owner"),
    prepare: async () => assert.fail("non-owner must not capture secrets"), zip: zipFolderFiles, delivery: async () => undefined });
  await assert.rejects(backend.create({ principalId: "other", signal: new AbortController().signal, includeSavedKeys: true }), { code: "FORBIDDEN" });
});
