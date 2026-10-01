import assert from "node:assert/strict";
import test from "node:test";

import type { MediaRecord } from "#src/features/media/index";
import { readRecordedContentType, resolveContentTypes } from "../content-type.js";

/**
 * @file Direct tests for `content-type.ts`. `media-content-type.test.ts` covers the list route's
 * happy backfill over HTTP; this file covers what it cannot easily stage: one unreadable blob must
 * be skipped (left unrecorded, so a later list retries) without blanking the rest of the library, a
 * hash with no blob row is skipped, an already-recorded hash is never re-read, and duplicate hashes
 * are sniffed once.
 *
 * The three ports are in-memory doubles; `sniffContentType` is the real one, fed real PNG magic.
 */

const WS = "workspace-local";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);

function media(sha256: string): MediaRecord {
  return { source: { sha256 } } as unknown as MediaRecord;
}

function buildDeps(options: {
  recorded?: Record<string, string>;
  blobs: Record<string, string | null>;
  bytes: Record<string, Uint8Array | Error>;
}) {
  const store = new Map(Object.entries(options.recorded ?? {}));
  const reads: string[] = [];
  const sets: Array<{ workspaceId: string; sha256: string; contentType: string }> = [];
  const deps = {
    workspaceId: WS,
    mediaContentTypeStore: {
      async getMany(input: { workspaceId: string; sha256s: readonly string[] }) {
        assert.equal(input.workspaceId, WS);
        return new Map(input.sha256s.filter((s) => store.has(s)).map((s) => [s, store.get(s) as string]));
      },
      async set(input: { workspaceId: string; sha256: string; contentType: string }) {
        sets.push(input);
        store.set(input.sha256, input.contentType);
      },
    },
    assetBlobRepo: {
      async findByHash(input: { workspaceId: string; sha256: string }) {
        const key = options.blobs[input.sha256];
        return key ? { storageKey: key } : null;
      },
    },
    blobStore: {
      async get(input: { storageKey: string }) {
        reads.push(input.storageKey);
        const bytes = options.bytes[input.storageKey];
        if (bytes instanceof Error) throw bytes;
        return bytes;
      },
    },
  };
  return { deps: deps as unknown as Parameters<typeof resolveContentTypes>[0], reads, sets, store };
}

test("resolveContentTypes: an unreadable blob is skipped and left unrecorded; the other rows are still sniffed and persisted", async () => {
  const { deps, sets } = buildDeps({
    blobs: { "sha-broken": "key-broken", "sha-png": "key-png" },
    bytes: { "key-broken": new Error("ENOENT"), "key-png": PNG },
  });

  const result = await resolveContentTypes(deps, [media("sha-broken"), media("sha-png")]);

  assert.deepEqual([...result.entries()], [["sha-png", "image/png"]]);
  assert.deepEqual(sets, [{ workspaceId: WS, sha256: "sha-png", contentType: "image/png" }]);
});

test("resolveContentTypes: a hash with no blob row is skipped, not an error", async () => {
  const { deps, reads, sets } = buildDeps({ blobs: {}, bytes: {} });

  const result = await resolveContentTypes(deps, [media("sha-orphan")]);

  assert.equal(result.size, 0);
  assert.deepEqual(reads, []);
  assert.deepEqual(sets, []);
});

test("resolveContentTypes: an already-recorded type is returned as recorded and its bytes are never read", async () => {
  const { deps, reads, sets } = buildDeps({
    recorded: { "sha-known": "video/mp4" },
    blobs: { "sha-known": "key-known" },
    bytes: { "key-known": PNG },
  });

  const result = await resolveContentTypes(deps, [media("sha-known")]);

  assert.equal(result.get("sha-known"), "video/mp4");
  assert.deepEqual(reads, []);
  assert.deepEqual(sets, []);
});

test("resolveContentTypes: two assets sharing one blob are sniffed and persisted once", async () => {
  const { deps, reads, sets } = buildDeps({ blobs: { "sha-dup": "key-dup" }, bytes: { "key-dup": PNG } });

  const result = await resolveContentTypes(deps, [media("sha-dup"), media("sha-dup")]);

  assert.equal(result.get("sha-dup"), "image/png");
  assert.deepEqual(reads, ["key-dup"]);
  assert.equal(sets.length, 1);
});

test("readRecordedContentType: returns the recorded type, or null without backfilling when none is recorded", async () => {
  const { deps, reads, sets } = buildDeps({
    recorded: { "sha-known": "image/webp" },
    blobs: { "sha-new": "key-new" },
    bytes: { "key-new": PNG },
  });

  assert.equal(await readRecordedContentType(deps, "sha-known"), "image/webp");
  assert.equal(await readRecordedContentType(deps, "sha-new"), null);
  assert.deepEqual(reads, [], "the write-path reader must never touch blob bytes");
  assert.deepEqual(sets, []);
});
