/**
 * @file `publish-files-plan-2026-09-24.md` §3 — {@link createCompositePeerBlobSource}: checks the
 * blob store first, falls back to the file index, and re-verifies bytes at read time.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createFileBlobIndex } from "../file-blob-index.js";
import { createCompositePeerBlobSource, FileBlobUnavailableError } from "../composite-blob-source.js";

function sha256Hex(bytes: string): string {
  return createHash("sha256").update(bytes, "utf8").digest("hex");
}

/** A minimal in-memory `CompositeBlobStoreRead` fake — only the read half this module needs. */
function fakeBlobStore(storageKeys: ReadonlySet<string>) {
  return {
    async exists({ storageKey }: { storageKey: string }): Promise<boolean> {
      return storageKeys.has(storageKey);
    },
    async get({ storageKey }: { storageKey: string }): Promise<Uint8Array> {
      if (!storageKeys.has(storageKey)) throw new Error(`unexpected get for '${storageKey}'`);
      return new TextEncoder().encode(`bytes-for-${storageKey}`);
    },
  };
}

test("checks the blob store first and never touches the file index when it has the blob", async () => {
  const store = fakeBlobStore(new Set(["key-a"]));
  const index = createFileBlobIndex();
  const source = createCompositePeerBlobSource({ blobStore: store, fileBlobIndex: index });
  assert.equal(await source.exists({ sha256: "sha-a", storageKey: "key-a" }), true);
  assert.deepEqual(await source.get({ sha256: "sha-a", storageKey: "key-a" }), new TextEncoder().encode("bytes-for-key-a"));
});

test("falls back to the file index and reads real bytes off disk when the store does not have it", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "composite-blob-source-"));
  try {
    const filePath = path.join(dir, "theme.css");
    const content = "body { color: red; }";
    writeFileSync(filePath, content);
    const sha256 = sha256Hex(content);

    const store = fakeBlobStore(new Set());
    const index = createFileBlobIndex();
    index.set(sha256, { absPath: filePath, size: content.length });
    const source = createCompositePeerBlobSource({ blobStore: store, fileBlobIndex: index });

    assert.equal(await source.exists({ sha256, storageKey: "irrelevant-key" }), true);
    const bytes = await source.get({ sha256, storageKey: "irrelevant-key" });
    assert.equal(Buffer.from(bytes).toString("utf8"), content);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("answers unavailable (exists -> false) when the sha is in neither the store nor the index", async () => {
  const source = createCompositePeerBlobSource({ blobStore: fakeBlobStore(new Set()), fileBlobIndex: createFileBlobIndex() });
  assert.equal(await source.exists({ sha256: "never-seen", storageKey: "k" }), false);
});

test("answers unavailable when the file at the indexed path changed since it was packed", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "composite-blob-source-"));
  try {
    const filePath = path.join(dir, "theme.css");
    const original = "body { color: red; }";
    writeFileSync(filePath, original);
    const sha256 = sha256Hex(original);

    const index = createFileBlobIndex();
    index.set(sha256, { absPath: filePath, size: original.length });
    const source = createCompositePeerBlobSource({ blobStore: fakeBlobStore(new Set()), fileBlobIndex: index });

    // The file changes after packing (an author editing the same theme) — bytes on disk no longer
    // hash to the sha the index recorded them under.
    writeFileSync(filePath, "body { color: blue; }");

    assert.equal(await source.exists({ sha256, storageKey: "k" }), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("answers unavailable when the indexed file was deleted since it was packed", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "composite-blob-source-"));
  try {
    const filePath = path.join(dir, "gone.css");
    const content = "body {}";
    writeFileSync(filePath, content);
    const sha256 = sha256Hex(content);

    const index = createFileBlobIndex();
    index.set(sha256, { absPath: filePath, size: content.length });
    rmSync(filePath);

    const source = createCompositePeerBlobSource({ blobStore: fakeBlobStore(new Set()), fileBlobIndex: index });
    assert.equal(await source.exists({ sha256, storageKey: "k" }), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("get() throws FileBlobUnavailableError for a sha in neither the store nor the index (the TOCTOU backstop)", async () => {
  const source = createCompositePeerBlobSource({ blobStore: fakeBlobStore(new Set()), fileBlobIndex: createFileBlobIndex() });
  await assert.rejects(() => source.get({ sha256: "never-seen", storageKey: "k" }), FileBlobUnavailableError);
});

test("get() throws FileBlobUnavailableError when a same-tick file mutation races past exists()", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "composite-blob-source-"));
  try {
    const filePath = path.join(dir, "theme.css");
    const original = "body { color: red; }";
    writeFileSync(filePath, original);
    const sha256 = sha256Hex(original);
    const index = createFileBlobIndex();
    index.set(sha256, { absPath: filePath, size: original.length });
    const source = createCompositePeerBlobSource({ blobStore: fakeBlobStore(new Set()), fileBlobIndex: index });

    writeFileSync(filePath, "body { color: green; }"); // mutate directly, skipping any exists() call
    await assert.rejects(() => source.get({ sha256, storageKey: "k" }), FileBlobUnavailableError);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
