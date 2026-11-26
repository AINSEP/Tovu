import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { bytesMatchSha256, isValidSha256Hex } from "@jini-ai/cms/publish/transfer/blob-staging";

/**
 * @file The write-once source guard only ever throws `MediaSourceImmutableError`, which
 * `importMediaEntity` turns into a `blocked`/`precondition` result. Any OTHER failure from that
 * guard must surface unchanged rather than be disguised as an ordinary refusal. The real guard
 * cannot fail that way, so `@jini-ai/cms/media` is substituted — its real exports spread through —
 * before the media modules are imported (`mock.module()` cannot rebind an already-resolved
 * specifier). The substitute fails with a plain `Error` for one sentinel sha256 only.
 */

const SENTINEL_BYTES = new TextEncoder().encode("write-once sentinel");
const SENTINEL_SHA256 = createHash("sha256").update(SENTINEL_BYTES).digest("hex");
const unexpected = new Error("write-once guard crashed");
test("importMediaEntity rethrows an unexpected write-once guard failure unchanged and writes nothing", async t => {
  const real = await import("@jini-ai/cms/media");
  t.mock.module("@jini-ai/cms/media", { namedExports: { ...real,
    resolveWriteOnceSource: (required: Parameters<typeof real.resolveWriteOnceSource>[0]) => {
      if (required.requestedSha256 === SENTINEL_SHA256) throw unexpected;
      return real.resolveWriteOnceSource(required);
    },
  } });
  const { importMediaEntity } = await import("@jini-ai/cms/media/site/import-media-entity");
  const { createHostBlobWriteBindings } = await import("@jini-ai/cms/media/site/blob-write-bindings");
  const mediaRepo = new real.InMemoryVersionedMediaRepo({});
  const assetBlobRepo = new real.InMemoryAssetBlobRepo({});
  const blobStore = new real.InMemoryBlobStore();
  const deps = { mediaRepo, assetBlobRepo, blobStore, createHash, ...createHostBlobWriteBindings({ blobStore, bytesMatchSha256 }),
    clock: { nowIso: () => "2026-09-18T00:00:00.000Z" }, idGen: { newId: () => "blob-1" },
    sha256: { isValidSha256Hex, bytesMatchSha256 }, outwardErrorMessage: ({ error }: { error: Error }) => error.message };
  const record = { id: "m1", workspaceId: "w1", title: "t", slug: "s", alt: "", caption: "", credit: "",
    source: { sha256: SENTINEL_SHA256 }, status: "active" as const, createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z", version: 1, width: null, height: null, cssClass: null, htmlAttributes: null };
  await assert.rejects(importMediaEntity({ deps, input: { workspaceId: "w1", record, bytes: SENTINEL_BYTES,
    blobCreatedByPrincipal: "importer", baseVersion: null } }), (err: unknown) => err === unexpected);
  assert.equal(await mediaRepo.findById({ workspaceId: "w1", id: "m1" }), null);
  assert.equal(await assetBlobRepo.findByHash({ workspaceId: "w1", sha256: SENTINEL_SHA256 }), null);
});
