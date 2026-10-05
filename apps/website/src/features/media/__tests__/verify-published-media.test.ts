import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryAssetBlobRepo, InMemoryBlobStore, type MediaRecord } from "@jini-ai/cms/media";
import type { PackedEntity, PublishContentPorts } from "#src/features/publish-content/type-registry";
import { InMemoryMediaContentTypeStore } from "../content-type-store.js";
import { verifyPublishedMedia } from "../verify-published-media.js";
import { InMemoryVersionedMediaRepo } from "../versioned-media-repo.js";

const WS = "ws-b08";
const SHA = "4c4b6a3be1314ab86138bef4314dde022e600960d8689a2c8f8631802d20dab6";
const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
function media(overrides: Partial<MediaRecord> = {}): MediaRecord {
  return { id: "video", workspaceId: WS, title: "Video", slug: "intro", alt: "", caption: "", credit: "", source: { sha256: SHA }, status: "active", createdAt: "created", updatedAt: "updated", version: 1, width: null, height: null, cssClass: null, htmlAttributes: null, ...overrides };
}
function packed(record: MediaRecord): PackedEntity {
  return { entityType: "media", id: record.id, state: { ...record }, schemaVersion: 1, hashVersion: 1, contentHash: "unused", requiredBlobs: [record.source.sha256] };
}
function ports(records: MediaRecord[] = []): NonNullable<PublishContentPorts["media"]> {
  return { repo: new InMemoryVersionedMediaRepo(records), blobStore: new InMemoryBlobStore(), contentTypeStore: new InMemoryMediaContentTypeStore(), assetBlobRepo: new InMemoryAssetBlobRepo({}) };
}

test("a missing type is repaired from stored bytes and read back in the same workspace only", async () => {
  const p = ports([media()]);
  await p.blobStore.putIfAbsent({ workspaceId: WS, sha256: SHA, bytes: PNG });
  assert.deepEqual(await p.contentTypeStore.getMany({ workspaceId: WS, sha256s: [SHA] }), new Map());
  assert.deepEqual(await verifyPublishedMedia(p, WS, [packed(media())]), []);
  assert.deepEqual(await p.contentTypeStore.getMany({ workspaceId: WS, sha256s: [SHA] }), new Map([[SHA, "image/png"]]));
  assert.deepEqual(await p.contentTypeStore.getMany({ workspaceId: "other", sha256s: [SHA] }), new Map());
});

for (const fault of ["blob-read", "type-write"] as const) {
  test(`${fault} failure reports a missing type, continues to the next item and succeeds on a later verification`, async (t) => {
    const p = ports([media()]);
    await p.blobStore.putIfAbsent({ workspaceId: WS, sha256: SHA, bytes: PNG });
    const missing = media({ id: "missing", slug: "lost-photo" });
    const receiver = fault === "blob-read" ? p.blobStore : p.contentTypeStore;
    const method = fault === "blob-read" ? "get" : "set";
    // F3.4/F5.5: fake only the failing I/O boundary; verification stays real.
    const mock = t.mock.method(receiver, method, async () => { throw new Error("storage unavailable"); });
    assert.deepEqual(await verifyPublishedMedia(p, WS, [packed(media()), packed(missing)]), [
      "Media 'intro': the site could not read its file type, so a video may show as a broken image.",
      "Media 'lost-photo' was published but is not on the site.",
    ]);
    assert.deepEqual(await p.contentTypeStore.getMany({ workspaceId: WS, sha256s: [SHA] }), new Map());
    mock.mock.restore();
    assert.deepEqual(await verifyPublishedMedia(p, WS, [packed(media())]), []);
    assert.deepEqual(await p.contentTypeStore.getMany({ workspaceId: WS, sha256s: [SHA] }), new Map([[SHA, "image/png"]]));
  });
}

test("empty batches do not access storage, and inactive media need neither bytes nor a recorded type", async (t) => {
  const p = ports([media({ status: "trashed" })]);
  const typeRead = t.mock.method(p.contentTypeStore, "getMany");
  const blobRead = t.mock.method(p.blobStore, "get");
  const blobExists = t.mock.method(p.blobStore, "exists");
  assert.deepEqual(await verifyPublishedMedia(p, WS, []), []);
  assert.equal(typeRead.mock.callCount(), 0);
  assert.deepEqual(await verifyPublishedMedia(p, WS, [packed(media({ status: "trashed" }))]), []);
  assert.equal(typeRead.mock.callCount(), 1);
  assert.equal(blobRead.mock.callCount(), 0);
  assert.equal(blobExists.mock.callCount(), 0);
});

test("a recorded type skips blob reads while multiple missing attribute references are all reported", async (t) => {
  const record = media({ htmlAttributes: '{"poster":"/m/missing-poster/original","data-thumb":"/m/missing-thumb/original"}' });
  const p = ports([record]);
  await p.blobStore.putIfAbsent({ workspaceId: WS, sha256: SHA, bytes: PNG });
  await p.contentTypeStore.set({ workspaceId: WS, sha256: SHA, contentType: "image/png" });
  const get = t.mock.method(p.blobStore, "get");
  assert.deepEqual(await verifyPublishedMedia(p, WS, [packed(record)]), [
    "Media 'intro' uses 'missing-poster' in its HTML attributes, but 'missing-poster' is not on the site, so it will not load.",
    "Media 'intro' uses 'missing-thumb' in its HTML attributes, but 'missing-thumb' is not on the site, so it will not load.",
  ]);
  assert.equal(get.mock.callCount(), 0);
});

for (const fault of ["row-lookup", "blob-exists"] as const) {
  test(`a per-item ${fault} failure reports the affected media and continues diagnostics for later media`, async (t) => {
    // F6.2: verifyPublishedMedia promises per-item faults never throw and items are independent.
    const p = ports([media()]);
    const requests: unknown[] = [];
    let failuresDelivered = 0;
    if (fault === "row-lookup") {
      const find = p.repo.findById.bind(p.repo);
      t.mock.method(p.repo, "findById", async (query) => {
        requests.push(query);
        if (query.workspaceId === WS && query.id === "video") { failuresDelivered++; throw new Error("row storage unavailable"); }
        return find(query);
      });
    } else {
      t.mock.method(p.blobStore, "exists", async (query) => { requests.push(query); failuresDelivered++; throw new Error("blob storage unavailable"); });
    }
    const missing = media({ id: "missing", slug: "lost-photo" });
    const problems = await verifyPublishedMedia(p, WS, [packed(media()), packed(missing)]);
    // F1.2/F6.2: swallowing the first item's failure while checking later items must fail.
    assert.deepEqual(problems, [
      "Media 'intro' could not be checked on the site, so it may not show.",
      "Media 'lost-photo' was published but is not on the site.",
    ]);
    assert.equal(failuresDelivered, 1, "the test must actually deliver the per-item fault");
    assert.deepEqual(requests, fault === "row-lookup"
      ? [{ workspaceId: "ws-b08", id: "video" }, { workspaceId: "ws-b08", id: "missing" }]
      : [{ storageKey: "ws/ws-b08/blobs/4c/4c4b6a3be1314ab86138bef4314dde022e600960d8689a2c8f8631802d20dab6" }]);
  });
}

test("an active row without bytes reports the missing file before attempting type repair or attribute lookups", async (t) => {
  // F4.4: the row is present and active; only the missing-byte guard can produce this result.
  const record = media({ htmlAttributes: 'poster="/m/missing-poster/original"' });
  const p = ports([record]);
  const reads = t.mock.method(p.blobStore, "get");
  const lookups = t.mock.method(p.repo, "findBySlug");
  assert.deepEqual(await verifyPublishedMedia(p, WS, [packed(record)]), [
    "Media 'intro' is on the site without its file, so it cannot be shown.",
  ]);
  assert.equal(reads.mock.callCount(), 0);
  assert.equal(lookups.mock.callCount(), 0);
  assert.deepEqual(await p.contentTypeStore.getMany({ workspaceId: WS, sha256s: [SHA] }), new Map());
});

test("missing media with an empty or absent slug is identified by its source id", async () => {
  // F4.3: an absent slug must not become undefined or an empty label in the operator's report.
  const p = ports();
  const empty = packed(media({ id: "empty-slug", slug: "" }));
  const absent = packed(media({ id: "absent-slug" }));
  delete absent.state.slug;
  assert.deepEqual(await verifyPublishedMedia(p, WS, [empty, absent]), [
    "Media 'empty-slug' was published but is not on the site.",
    "Media 'absent-slug' was published but is not on the site.",
  ]);
});
