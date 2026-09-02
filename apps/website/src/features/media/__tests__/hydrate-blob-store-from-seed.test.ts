import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { computeBlobStorageKey, InMemoryBlobStore } from "@jini-ai/cms/media";

import { hydrateBlobStoreFromSeed } from "../hydrate-blob-store-from-seed.js";

/**
 * @file Proves `hydrateBlobStoreFromSeed()` — the fix for the production incident this pair of
 * files exists to close: `content.seed.db` ships real `media`/`asset_blobs` ROWS on first boot
 * (`hydrate-content-db-from-seed.ts`), but nothing ever shipped the BYTES those rows'
 * `storage_key`s point at, so every admin-media preview 500'd against a real row and a missing
 * file. See `hydrate-blob-store-from-seed.ts`'s own file header for the full incident writeup and
 * design rationale (per-key gate vs. whole-directory gate, `BlobStorePort` vs. raw filesystem).
 *
 * The first test below is deliberately written to assert the FAILURE state first —
 * `blobStore.exists()` returning `false` for a seeded key is exactly the condition that makes the
 * real admin route (`server/inbound/admin-http/routes/media/original.ts`) 500 — before hydrating,
 * so the fix this function provides is visible in the test itself, not just asserted by name.
 */

/** One seed blob file, written under `ws/{workspaceId}/blobs/{sha256[0..1]}/{sha256}`. */
async function writeSeedBlob(
  seedUploadsDir: string,
  input: { workspaceId: string; bytes: Uint8Array }
): Promise<{ workspaceId: string; sha256: string; storageKey: string }> {
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const storageKey = computeBlobStorageKey({ workspaceId: input.workspaceId, sha256 });
  const filePath = join(seedUploadsDir, ...storageKey.split("/"));
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, input.bytes);
  return { workspaceId: input.workspaceId, sha256, storageKey };
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "tovu-hydrate-blob-seed-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("hydrateBlobStoreFromSeed: no-op when the seed payload does not exist", async () => {
  await withTempDir(async (dir) => {
    const store = new InMemoryBlobStore();
    const result = await hydrateBlobStoreFromSeed({
      seedUploadsDir: join(dir, "absent-uploads"),
      blobStore: store,
    });
    assert.equal(result.status, "no-seed-source");
    assert.equal(result.copied, 0);
    assert.equal(result.skipped, 0);
    assert.deepEqual(result.failed, []);
  });
});

test("hydrateBlobStoreFromSeed: fills in a missing blob — reproduces the failure, then the fix", async () => {
  await withTempDir(async (dir) => {
    const workspaceId = `ws-${randomUUID()}`;
    const bytes = new TextEncoder().encode("stock seed image bytes");
    const seeded = await writeSeedBlob(dir, { workspaceId, bytes });

    const store = new InMemoryBlobStore();

    // FAILURE STATE — this is exactly what makes `original.ts` throw and turn into the admin
    // preview's 500: the row's storage key resolves to nothing in the live store.
    assert.equal(
      await store.exists({ storageKey: seeded.storageKey }),
      false,
      "precondition: the live store must NOT have this blob yet — otherwise this test would not be exercising the bug"
    );

    const result = await hydrateBlobStoreFromSeed({ seedUploadsDir: dir, blobStore: store });

    assert.equal(result.status, "seeded");
    assert.equal(result.copied, 1);
    assert.equal(result.skipped, 0);
    assert.deepEqual(result.failed, []);

    // THE FIX — the exact same lookup the admin route performs now succeeds, with the exact bytes.
    assert.equal(await store.exists({ storageKey: seeded.storageKey }), true);
    // `Buffer.from(...)` on both sides: `readFile` returns a `Buffer` (a `Uint8Array` subclass),
    // and strict `deepEqual` treats a differing constructor as unequal even with identical bytes.
    assert.deepEqual(Buffer.from(await store.get({ storageKey: seeded.storageKey })), Buffer.from(bytes));
  });
});

test("hydrateBlobStoreFromSeed: never overwrites a key that already exists in the live store", async () => {
  await withTempDir(async (dir) => {
    const workspaceId = `ws-${randomUUID()}`;
    const seedBytes = new TextEncoder().encode("stock seed bytes — must never land here");
    const seeded = await writeSeedBlob(dir, { workspaceId, bytes: seedBytes });

    const store = new InMemoryBlobStore();
    const realBytes = new TextEncoder().encode("real bytes already in the live store");
    // Same sha256 the seed file was written under, but pre-populated with DIFFERENT bytes — this
    // can only happen if content differs from what its own hash implies, which is exactly why the
    // gate must be "does this key already exist", not "do the bytes match" — the function has no
    // way to know which content is the "right" one for a given key, so it must never guess.
    await store.put({ workspaceId, sha256: seeded.sha256, bytes: realBytes });

    const result = await hydrateBlobStoreFromSeed({ seedUploadsDir: dir, blobStore: store });

    assert.equal(result.status, "already-present");
    assert.equal(result.copied, 0);
    assert.equal(result.skipped, 1);
    assert.deepEqual(
      await store.get({ storageKey: seeded.storageKey }),
      realBytes,
      "the pre-existing bytes must be left exactly as they were — not clobbered by the seed"
    );
  });
});

test("hydrateBlobStoreFromSeed: is a no-op on a second run once the store already caught up", async () => {
  await withTempDir(async (dir) => {
    const workspaceId = `ws-${randomUUID()}`;
    const bytes = new TextEncoder().encode("only copied once");
    await writeSeedBlob(dir, { workspaceId, bytes });

    const store = new InMemoryBlobStore();

    const first = await hydrateBlobStoreFromSeed({ seedUploadsDir: dir, blobStore: store });
    assert.equal(first.status, "seeded");
    assert.equal(first.copied, 1);

    // Simulates a later redeploy against the SAME (already-populated) volume — this must never
    // re-copy, matching `hydrateContentDbFromSeed`'s own "never touch it again" guarantee applied
    // per-key instead of per-file.
    const second = await hydrateBlobStoreFromSeed({ seedUploadsDir: dir, blobStore: store });
    assert.equal(second.status, "already-present");
    assert.equal(second.copied, 0);
    assert.equal(second.skipped, 1);
  });
});

test("hydrateBlobStoreFromSeed: a malformed seed entry is reported, not thrown, and does not block a valid sibling", async () => {
  await withTempDir(async (dir) => {
    const workspaceId = `ws-${randomUUID()}`;
    const goodBytes = new TextEncoder().encode("this one is well-formed");
    const seeded = await writeSeedBlob(dir, { workspaceId, bytes: goodBytes });

    // A stray file that does not match `ws/{workspaceId}/blobs/{shard}/{sha256}` — e.g. a
    // README or a leftover from an unrelated tool. Must not crash the whole hydration run.
    await mkdir(join(dir, "ws", workspaceId), { recursive: true });
    await writeFile(join(dir, "ws", workspaceId, "not-a-blob.txt"), "unrelated file");

    const store = new InMemoryBlobStore();
    const result = await hydrateBlobStoreFromSeed({ seedUploadsDir: dir, blobStore: store });

    assert.equal(result.status, "partial");
    assert.equal(result.copied, 1);
    assert.equal(result.failed.length, 1);
    const [failure] = result.failed;
    assert.ok(failure);
    assert.match(failure.relativePath, /not-a-blob\.txt$/);
    assert.deepEqual(Buffer.from(await store.get({ storageKey: seeded.storageKey })), Buffer.from(goodBytes));
  });
});
