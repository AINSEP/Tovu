/**
 * Pins the share backend's host wiring across the move to `@jini-ai/devops/backup/site/share-backend`:
 * an EXISTING share password, sealed exactly as production sealed it (real AES-GCM sealer, the host's
 * historical AAD domain literal), must still be revealed to the owner only; a revoked row is gone; and
 * the host secret redactor (including the host API-key rule) still scrubs scope notes.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import { InMemoryKeyring } from "@jini-ai/platform/secrets/testing";
import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { SiteShareRefusal } from "@jini-ai/devops/backup/site/share-refusal";
import { composeSiteSavedKeys } from "#src/server/runtime/composition/site-portability";
import type { SiteSharePlanContent } from "../plan-content.js";
import { createSiteShareBackend } from "../share-backend.js";
import { createSiteShare } from "../share-service.js";
import { SiteShareRegistry } from "../share-registry.js";

const SHARE_ID = "00000000-0000-0000-0000-0000000000aa";

async function sealedShare(t: TestContext) {
  const directory = await mkdtemp(path.join(tmpdir(), "share-reveal-pin-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const registry = new SiteShareRegistry({ directory });
  const keyring = new InMemoryKeyring({ hkdfSalt: "share-reveal-pin" });
  const sealer = new AesGcmSecretSealer({ keyring });
  // Sealed the way existing exports were sealed: the historical host AAD tuple, byte for byte.
  const sealedPassword = await sealer.seal({ plaintext: "existing-export-password", key: await keyring.activeKey({}), aad: JSON.stringify(["tovu-share-password", 1, "ws", SHARE_ID]) });
  await registry.put({ record: { shareId: SHARE_ID, site: "ws", token: "ABCDEFGHIJKLMNOP", file: "site.tovu.zip", bytes: 12, sha256: "a".repeat(64), url: null,
    status: "active", createdAt: "2026-10-31T00:00:00Z", revokedAt: null, hasEncryptedKeys: true, sealedPassword } });
  const unexpected = async (): Promise<never> => { throw new Error("export must not run"); };
  const backend = createSiteShareBackend({ registry, site: "ws", zip: zipFolderFiles, prepare: unexpected, delivery: async () => undefined,
    ownerPrincipalId: Promise.resolve("owner"), savedKeys: composeSiteSavedKeys({ workspaceId: "ws", sealer }) });
  return { registry, backend, sealer, keyring };
}

const refusal = (code: string) => (error: unknown) => error instanceof SiteShareRefusal && error.code === code;

test("an existing sealed share password still decrypts for the owner", async t => {
  const { backend } = await sealedShare(t);
  assert.deepEqual(await backend.revealPassword({ principalId: "owner", shareId: SHARE_ID }), { password: "existing-export-password" });
});

test("a non-owner is refused FORBIDDEN before the sealed password is opened", async t => {
  const { backend } = await sealedShare(t);
  await assert.rejects(backend.revealPassword({ principalId: "admin", shareId: SHARE_ID }), refusal("FORBIDDEN"));
});

test("a revoked share's password is NOT_FOUND", async t => {
  const { registry, backend } = await sealedShare(t);
  await registry.disable({ shareId: SHARE_ID, site: "ws" });
  await assert.rejects(backend.revealPassword({ principalId: "owner", shareId: SHARE_ID }), refusal("NOT_FOUND"));
});

test("scope notes pass through the host redactor, including the host API-key shape", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "share-notes-pin-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const key = "tovu_ak_0123456789ab.abcdefghijklmnopqrstuvwxyz012345";
  const content = { profile: "share", target: { kind: "zip" }, include: { database: true, media: true, themes: true, plugins: true, settings: true },
    database: { bytes: Buffer.from("safe projected DB"), watermarkAtCapture: 5 }, files: [], bufferedFiles: [{ path: "settings.json", content: Buffer.from("{}") }], skipped: [],
    scopeNotes: { plugin: `Plugin left out; it held ${key}` }, totalBytes: 19,
    site: { name: "Site", folderName: "site" }, schema: { index: 1, tag: "one" }, tovuVersion: "test", createdAt: "2026-10-19T00:00:00Z" } as unknown as SiteSharePlanContent;
  const backend = createSiteShareBackend({ registry: new SiteShareRegistry({ directory }), site: "ws", prepare: async () => content as never, zip: zipFolderFiles, delivery: async () => undefined });
  const result = await backend.create({ principalId: "owner", signal: new AbortController().signal }, { waitMs: 10000 }) as { notes?: string[] };
  assert.equal(result.notes?.length, 1);
  assert.equal(result.notes![0]!.includes(key.split(".")[1]!), false, "secret tail must be redacted");
  assert.match(result.notes![0]!, /\[REDACTED:tovu_api_key\]/);
});

test("a share created through the share service stores its sealed password so the owner can still reveal it", async t => {
  const { registry, backend, sealer, keyring } = await sealedShare(t);
  const createdId = "00000000-0000-0000-0000-0000000000bb";
  const sealedPassword = await sealer.seal({ plaintext: "created-export-password", key: await keyring.activeKey({}), aad: JSON.stringify(["tovu-share-password", 1, "ws", createdId]) });
  const created = await createSiteShare({ registry, site: "ws", name: "Created Site", archive: Buffer.from("zip") }, { identity: { shareId: createdId, token: "QRSTUVWXYZABCDEF" }, sealedPassword });
  assert.equal(created.file, "created-site.tovu.zip");
  assert.equal(created.hasEncryptedKeys, true);
  assert.deepEqual((await registry.get({ shareId: createdId }))?.sealedPassword, sealedPassword);
  assert.deepEqual(await backend.revealPassword({ principalId: "owner", shareId: createdId }), { password: "created-export-password" });
});
