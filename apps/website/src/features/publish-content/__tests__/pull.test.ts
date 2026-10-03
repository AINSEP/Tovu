/** t09: verified bytes precede staging; mixed-invalid batches cannot produce a staged bundle. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { computeBlobStorageKey } from "@jini-ai/cms/media";
import { fixture, packed, OWNER } from "./pull-tool-fixture.js";

async function pull() {
  const module = await import("../pull.js");
  assert.equal(typeof module.pullAndStageFromPeer, "function");
  return module.pullAndStageFromPeer;
}
test("pull verifies and stores blobs before staging; the authenticated caller owns the bundle", async () => {
  const bytes = Buffer.from("verified live bytes");
  const sha = createHash("sha256").update(bytes).digest("hex");
  const f = await fixture([packed("image", "Live image", [sha, sha])]);
  f.remoteBlobs.set(sha, bytes);
  const save = f.bundleRepo.save.bind(f.bundleRepo);
  f.bundleRepo.save = async row => {
    assert.deepEqual(f.blobs.get(computeBlobStorageKey({ workspaceId: "local", sha256: sha })), bytes);
    return save(row);
  };
  const result = await (await pull())(f.deps, { peerId: "live", principalId: OWNER });
  assert.deepEqual(result, { peerId: "live", peerLabel: "Live site", bundleId: "pull-1", expiresAt: "2026-10-02T12:00:00.000Z", entityCount: 1, blobManifest: [sha, sha], blobsDownloaded: [sha], blobsAlreadyPresent: [], blobsUnavailable: [], blobsDeferred: [] });
  const row = await f.bundleRepo.findById({ workspaceId: "local", id: result.bundleId });
  assert.equal(row?.sourcePrincipalId, OWNER);
  assert.deepEqual(JSON.parse(row!.entitiesJson), f.entities);
  assert.equal(f.requests.length, 2, "a repeated sha is fetched once");
});
test("a valid blob followed by mismatched bytes aborts the whole pull without staging", async () => {
  const good = Buffer.from("good");
  const goodSha = createHash("sha256").update(good).digest("hex");
  const badSha = createHash("sha256").update("expected").digest("hex");
  const f = await fixture([packed("good", "Good", [goodSha]), packed("bad", "Bad", [badSha])]);
  f.remoteBlobs.set(goodSha, good);
  f.remoteBlobs.set(badSha, Buffer.from("impostor"));
  let stagedRows = 0;
  const save = f.bundleRepo.save.bind(f.bundleRepo);
  f.bundleRepo.save = async row => { stagedRows++; return save(row); };
  await assert.rejects(() => pull().then(fn => fn(f.deps, { peerId: "live", principalId: OWNER })), (err: any) => {
    assert.equal(err.code, "PEER_RESPONSE_INVALID");
    assert.equal(err.message, `the peer's bytes for blob '${badSha}' do not hash to it — refusing to store them under that sha256, because the hash IS the identity this feature addresses content by`);
    return true;
  });
  assert.equal(stagedRows, 0);
  assert.equal(await f.bundleRepo.findById({ workspaceId: "local", id: "pull-1" }), null);
  assert.equal(f.blobs.has(computeBlobStorageKey({ workspaceId: "local", sha256: badSha })), false);
});
