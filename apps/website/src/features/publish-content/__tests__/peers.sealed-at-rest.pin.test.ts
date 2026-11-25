import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer, FixedSiteKeyKeyring } from "@jini-ai/platform/secrets";
import type { VaultRecord } from "@jini-ai/core/contracts/vault";
import { PublishContentPeerNotFoundError } from "@jini-ai/cms/publish/content/peers";
import { HKDF_EXTRACTION_SALT } from "../../webhooks/keyring.env.js";
import { InMemoryPublishContentPeerRepo } from "../peers.js";
import { listPublishContentPeers, resolvePeerCredential, updatePublishContentPeer } from "@jini-ai/cms/publish/content/peer-registry";

/**
 * AT-REST COMPATIBILITY PIN for publish-peer credentials.
 *
 * `SEALED_AT_REST` was produced by the pre-extraction `features/publish-content/peers.ts`
 * (`createPublishContentPeer` over the real `AesGcmSecretSealer` and a fixed site key) and is
 * frozen here byte-for-byte. The vault binds `kind`/`ownerKey`/`workspaceId`/`id` into the AEAD
 * AAD, so a peer row an install already holds keeps opening only while the host injects the same
 * owner key and kind. If this test goes red, every saved peer API key on every install stops
 * resolving — do not "fix" the fixture.
 */
const SEALED_AT_REST: VaultRecord = {
  workspaceId: "ws-pin", kind: "publish-peer", ownerKey: "tovu", principalId: null, binding: null, id: "peer-pinned",
  provider: null, label: "Live", meta: { baseUrl: "https://live.example", remoteWorkspaceId: "ws-remote" },
  sealed: { keyId: "site-key-pin", ciphertext: "49fH9ibhmmTYm5DA58SQiIrF5UCtM8LfZznPdn8csrY2FiJrXuQ17zf4ZjRORvqPFkXnvdFc", nonce: "HYrXPmwoeMrEU9dx", alg: "aes-256-gcm" },
  isDefault: true, revision: 1, last4: "6789", tokenLength: 25, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
};
const API_KEY = "pinned-api-key-0123456789";

async function seeded(record: VaultRecord = SEALED_AT_REST) {
  const keyring = new FixedSiteKeyKeyring({ hex: "11".repeat(32), hkdfSalt: HKDF_EXTRACTION_SALT }, { keyId: "site-key-pin" });
  const repo = new InMemoryPublishContentPeerRepo();
  await repo.vault.put({ record, expectedRevision: null });
  return { repo, keyring, sealer: new AesGcmSecretSealer({ keyring }) };
}

test("a peer credential sealed before the extraction still resolves to its API key", async () => {
  const { repo, sealer } = await seeded();
  const resolved = await resolvePeerCredential({ deps: { repo, sealer }, input: { workspaceId: "ws-pin", id: "peer-pinned" } });
  assert.deepEqual(resolved, { id: "peer-pinned", label: "Live", baseUrl: "https://live.example", remoteWorkspaceId: "ws-remote", apiKey: API_KEY });
});

test("the pinned row projects to the same read model (masked hint, hasCredential)", async () => {
  const { repo } = await seeded();
  assert.deepEqual(await listPublishContentPeers({ deps: { repo }, input: { workspaceId: "ws-pin" } }), [
    { id: "peer-pinned", label: "Live", baseUrl: "https://live.example", remoteWorkspaceId: "ws-remote", masked: "••••6789", hasCredential: true },
  ]);
});

test("a metadata-only edit keeps the pinned envelope bytes and the key still opens", async () => {
  const { repo, sealer, keyring } = await seeded();
  await updatePublishContentPeer({ deps: { repo, sealer, keyring, clock: { nowMs: () => 0 }, idGen: { newId: () => "unused" } }, input: { workspaceId: "ws-pin", id: "peer-pinned", label: "Renamed" } });
  assert.deepEqual((await repo.vault.find({ workspaceId: "ws-pin", id: "peer-pinned" }))?.sealed, SEALED_AT_REST.sealed);
  assert.equal((await resolvePeerCredential({ deps: { repo, sealer }, input: { workspaceId: "ws-pin", id: "peer-pinned" } })).apiKey, API_KEY);
});

test("workspace scoping is unchanged: another workspace cannot resolve the pinned peer", async () => {
  const { repo, sealer } = await seeded();
  await assert.rejects(() => resolvePeerCredential({ deps: { repo, sealer }, input: { workspaceId: "ws-other", id: "peer-pinned" } }), PublishContentPeerNotFoundError);
});

test("owner scoping is unchanged: a row under another owner key is refused, never projected", async () => {
  const { repo } = await seeded({ ...SEALED_AT_REST, ownerKey: "someone-else" });
  await assert.rejects(() => repo.findById({ workspaceId: "ws-pin", id: "peer-pinned" }), (err: Error) => (err as { code?: string }).code === "context");
});
