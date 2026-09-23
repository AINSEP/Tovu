/**
 * @file Task 12 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 12.
 *
 * Direct unit tests for `importMediaEntity()` (`../import-media-entity.ts`) — the host-owned write
 * path that PRESERVES a media row's SOURCE `id` (see that file's own header for the bug this exists
 * to prevent: `uploadMedia` always mints a fresh id, which silently breaks every embed referencing
 * the original id).
 *
 * Six tests correspond to the dispatch's required list, in order, with one deliberate substitution
 * (see #6's own comment for why: the dispatch's stated fact about `createdByPrincipalId`/`createdAt`
 * surviving the trip describes `posts`, not `media` — `MediaRecord` has no author field at all, only
 * `AssetBlobRecord.createdByPrincipal`, which is what #6 actually exercises). #2 ("a post importing
 * alongside it renders its embed") lives in `import-media-entity.render.test.ts`, not here — it
 * exercises the real site render path (`server/inbound/public-http/http/site/render.ts`), a
 * different module boundary than this file's other five tests.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  computeBlobStorageKey,
  InMemoryAssetBlobRepo,
  InMemoryBlobStore,
  InMemoryVersionedMediaRepo,
  type AssetBlobRecord,
  type MediaRecord,
} from "#src/features/media/index";

import { importMediaEntity, type ImportMediaEntityDeps } from "../import-media-entity.js";

const WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";

/** Real sha256 of the literal bytes `"hello world"` — used wherever a test needs bytes that
 *  actually hash to their claimed sha (every "imported" happy-path case). Computed once, pinned
 *  here as a literal rather than recomputed at test time, so a regression in the hashing itself
 *  can't quietly rubber-stamp its own assertion. */
const HELLO_BYTES = new TextEncoder().encode("hello world");
const HELLO_SHA256 = "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";

function makeClock(iso = "2026-09-18T00:00:00.000Z") {
  return { nowIso: () => iso };
}

function makeIdGen(prefix = "generated") {
  let n = 0;
  return { newId: () => `${prefix}-${++n}` };
}

function makeMediaRecord(overrides: Partial<MediaRecord> = {}): MediaRecord {
  return {
    id: "source-asset-1",
    workspaceId: WORKSPACE_ID,
    title: "A Photo",
    slug: "a-photo",
    alt: "",
    caption: "",
    credit: "",
    source: { sha256: HELLO_SHA256 },
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
    width: null,
    height: null,
    cssClass: null,
    htmlAttributes: null,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ImportMediaEntityDeps> = {}): ImportMediaEntityDeps & {
  mediaRepo: InMemoryVersionedMediaRepo;
  assetBlobRepo: InMemoryAssetBlobRepo;
  blobStore: InMemoryBlobStore;
} {
  return {
    mediaRepo: new InMemoryVersionedMediaRepo(),
    assetBlobRepo: new InMemoryAssetBlobRepo(),
    blobStore: new InMemoryBlobStore(),
    clock: makeClock(),
    idGen: makeIdGen(),
    ...overrides,
  } as ImportMediaEntityDeps & { mediaRepo: InMemoryVersionedMediaRepo; assetBlobRepo: InMemoryAssetBlobRepo; blobStore: InMemoryBlobStore };
}

// ---------------------------------------------------------------------------
// 1. Imported media keeps its source id
// ---------------------------------------------------------------------------

test("importMediaEntity: the imported row is saved under the SOURCE id, never a freshly minted one", async () => {
  const deps = makeDeps();
  const record = makeMediaRecord({ id: "source-asset-1" });

  const result = await importMediaEntity({
    deps,
    input: { workspaceId: WORKSPACE_ID, record, bytes: HELLO_BYTES, blobCreatedByPrincipal: "importer-1", baseVersion: null },
  });

  assert.deepEqual(result, { status: "imported", id: "source-asset-1", blobWritten: true });
  const saved = await deps.mediaRepo.findById({ workspaceId: WORKSPACE_ID, id: "source-asset-1" });
  assert.ok(saved, "media row must exist under the source id");
  assert.equal(saved?.id, "source-asset-1");
  // idGen is never consulted for the MEDIA row's own id — only for the new asset_blobs row (see
  // test 6's setup) — proving id preservation isn't accidental (a generated id happening to match).
});

// ---------------------------------------------------------------------------
// 2. (a post importing alongside it renders its embed) — see
//    `import-media-entity.render.test.ts`, a different module boundary.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 3. A media.slug already held by a DIFFERENT id blocks the import and writes NOTHING
// ---------------------------------------------------------------------------

test("importMediaEntity: a slug already held by a different id is blocked and writes nothing — no blob bytes, no blob row, no media row", async () => {
  const deps = makeDeps();
  const holder = makeMediaRecord({ id: "existing-holder", slug: "taken-slug", source: { sha256: "a".repeat(64) } });
  await deps.mediaRepo.save(holder);

  const incoming = makeMediaRecord({ id: "incoming-asset", slug: "taken-slug" });

  const result = await importMediaEntity({
    deps,
    input: { workspaceId: WORKSPACE_ID, record: incoming, bytes: HELLO_BYTES, blobCreatedByPrincipal: "importer-1", baseVersion: null },
  });

  assert.equal(result.status, "blocked");
  assert.match((result as { reason: string }).reason, /slug 'taken-slug' is already held by a different media \('existing-holder'\)/);

  // No partial write: the incoming media row was never saved...
  assert.equal(await deps.mediaRepo.findById({ workspaceId: WORKSPACE_ID, id: "incoming-asset" }), null);
  // ...and the blob (bytes + asset_blobs row) was never written either, even though its sha256
  // never collided with anything — the slug check must run BEFORE any blob write, not after.
  assert.equal(await deps.assetBlobRepo.findByHash({ workspaceId: WORKSPACE_ID, sha256: HELLO_SHA256 }), null);
  const storageKey = computeBlobStorageKey({ workspaceId: WORKSPACE_ID, sha256: HELLO_SHA256 });
  assert.equal(await deps.blobStore.exists({ storageKey }), false, "the blocked call must never have written blob bytes");
});

// ---------------------------------------------------------------------------
// 4. sourceSha256 of an EXISTING row is never rewritten
// ---------------------------------------------------------------------------

test("importMediaEntity: re-importing an existing id with a DIFFERENT claimed sha256 is blocked — source.sha256 is write-once, never silently rewritten", async () => {
  const deps = makeDeps();
  const original = makeMediaRecord({ id: "asset-1", source: { sha256: HELLO_SHA256 } });
  await deps.mediaRepo.save(original);

  const differentBytes = new TextEncoder().encode("a different payload entirely");
  const differentSha = createHash("sha256").update(differentBytes).digest("hex");
  const incoming = makeMediaRecord({ id: "asset-1", source: { sha256: differentSha } });

  const result = await importMediaEntity({
    deps,
    input: { workspaceId: WORKSPACE_ID, record: incoming, bytes: differentBytes, blobCreatedByPrincipal: "importer-1", baseVersion: 1 },
  });

  assert.equal(result.status, "blocked");
  assert.match((result as { reason: string }).reason, /source\.sha256 is write-once/);

  const stillOriginal = await deps.mediaRepo.findById({ workspaceId: WORKSPACE_ID, id: "asset-1" });
  assert.equal(stillOriginal?.source.sha256, HELLO_SHA256, "the existing row's sha256 must be untouched");
});

test("importMediaEntity: re-importing an existing id with the SAME claimed sha256 is idempotent and succeeds", async () => {
  const deps = makeDeps();
  const original = makeMediaRecord({ id: "asset-1", source: { sha256: HELLO_SHA256 }, version: 3, title: "Old Title" });
  await deps.mediaRepo.save(original);
  await deps.assetBlobRepo.save({
    id: "blob-1",
    workspaceId: WORKSPACE_ID,
    sha256: HELLO_SHA256,
    storageKey: (await deps.blobStore.putIfAbsent({ workspaceId: WORKSPACE_ID, sha256: HELLO_SHA256, bytes: HELLO_BYTES })).storageKey,
    createdByPrincipal: "original-author",
    createdAt: "2026-01-01T00:00:00.000Z",
    status: "active",
  });

  const incoming = makeMediaRecord({ id: "asset-1", source: { sha256: HELLO_SHA256 }, title: "New Title" });
  const result = await importMediaEntity({
    deps,
    input: { workspaceId: WORKSPACE_ID, record: incoming, bytes: HELLO_BYTES, blobCreatedByPrincipal: "importer-1", baseVersion: 3 },
  });

  assert.deepEqual(result, { status: "imported", id: "asset-1", blobWritten: false });
  const updated = await deps.mediaRepo.findById({ workspaceId: WORKSPACE_ID, id: "asset-1" });
  assert.equal(updated?.source.sha256, HELLO_SHA256);
  assert.equal(updated?.title, "New Title");
  assert.equal(updated?.version, 4, "version bumps on re-import like any other save");
});

// ---------------------------------------------------------------------------
// 5. Bytes that do not hash to the claimed sha are refused BEFORE putIfAbsent
// ---------------------------------------------------------------------------

test("importMediaEntity: a missing staged byte payload is an authoritative typed block and writes nothing", async () => {
  const deps = makeDeps();
  const record = makeMediaRecord({ id: "asset-missing" });

  const result = await importMediaEntity({
    deps,
    input: { workspaceId: WORKSPACE_ID, record, bytes: null, blobCreatedByPrincipal: "importer-1", baseVersion: null },
  });

  assert.deepEqual(result, {
    status: "blocked",
    code: "missing-blob",
    reason: `required blob '${HELLO_SHA256}' was never received by this destination`,
  });
  assert.equal(await deps.mediaRepo.findById({ workspaceId: WORKSPACE_ID, id: record.id }), null);
  assert.equal(await deps.assetBlobRepo.findByHash({ workspaceId: WORKSPACE_ID, sha256: HELLO_SHA256 }), null);
});

test("importMediaEntity: bytes that do not hash to the claimed sha256 are refused before putIfAbsent is ever called", async () => {
  const deps = makeDeps();
  let putIfAbsentCalls = 0;
  const realPutIfAbsent = deps.blobStore.putIfAbsent.bind(deps.blobStore);
  deps.blobStore.putIfAbsent = (input) => {
    putIfAbsentCalls += 1;
    return realPutIfAbsent(input);
  };

  const wrongBytes = new TextEncoder().encode("this is not hello world");
  const record = makeMediaRecord({ id: "asset-mismatch", source: { sha256: HELLO_SHA256 } });

  const result = await importMediaEntity({
    deps,
    input: { workspaceId: WORKSPACE_ID, record, bytes: wrongBytes, blobCreatedByPrincipal: "importer-1", baseVersion: null },
  });

  assert.equal(result.status, "blocked");
  assert.match((result as { reason: string }).reason, /do not hash to the claimed sha256/);
  assert.equal(putIfAbsentCalls, 0, "putIfAbsent must never be called when the sha check fails");
  assert.equal(await deps.mediaRepo.findById({ workspaceId: WORKSPACE_ID, id: "asset-mismatch" }), null);
});

test("importMediaEntity: a malformed (non-hex-64) claimed sha256 is refused before putIfAbsent, same as a real mismatch", async () => {
  const deps = makeDeps();
  const record = makeMediaRecord({ id: "asset-bad-sha", source: { sha256: "not-a-real-sha" } });

  const result = await importMediaEntity({
    deps,
    input: { workspaceId: WORKSPACE_ID, record, bytes: HELLO_BYTES, blobCreatedByPrincipal: "importer-1", baseVersion: null },
  });

  assert.equal(result.status, "blocked");
  assert.match((result as { reason: string }).reason, /malformed source sha256/);
});

// ---------------------------------------------------------------------------
// 6. SUBSTITUTED per the header comment above: an existing blob's authorship
//    (AssetBlobRecord.createdByPrincipal) is never re-stamped with the importing operator's id.
// ---------------------------------------------------------------------------

test("importMediaEntity: a blob that already exists at the destination is never re-saved — its original createdByPrincipal survives a re-import by a DIFFERENT operator", async () => {
  const deps = makeDeps();
  const { storageKey } = await deps.blobStore.putIfAbsent({ workspaceId: WORKSPACE_ID, sha256: HELLO_SHA256, bytes: HELLO_BYTES });
  const originalBlob: AssetBlobRecord = {
    id: "blob-original",
    workspaceId: WORKSPACE_ID,
    sha256: HELLO_SHA256,
    storageKey,
    createdByPrincipal: "original-author",
    createdAt: "2026-01-01T00:00:00.000Z",
    status: "active",
  };
  await deps.assetBlobRepo.save(originalBlob);

  // A SECOND, different media row dedups onto the SAME bytes (a real scenario: two source assets
  // that happen to be byte-identical) — imported by a DIFFERENT operator than whoever originally
  // wrote the blob.
  const secondRecord = makeMediaRecord({ id: "second-asset", slug: "second-asset-slug", source: { sha256: HELLO_SHA256 } });
  const result = await importMediaEntity({
    deps,
    input: { workspaceId: WORKSPACE_ID, record: secondRecord, bytes: HELLO_BYTES, blobCreatedByPrincipal: "importing-operator", baseVersion: null },
  });

  assert.deepEqual(result, { status: "imported", id: "second-asset", blobWritten: false });
  const blobAfter = await deps.assetBlobRepo.findByHash({ workspaceId: WORKSPACE_ID, sha256: HELLO_SHA256 });
  assert.equal(blobAfter?.createdByPrincipal, "original-author", "the operator importing a SECOND row must never overwrite the FIRST row's blob attribution");
  assert.equal(blobAfter?.id, "blob-original");
});

test("importMediaEntity: a brand-new blob IS stamped with the supplied blobCreatedByPrincipal", async () => {
  const deps = makeDeps();
  const record = makeMediaRecord({ id: "asset-fresh", source: { sha256: HELLO_SHA256 } });

  const result = await importMediaEntity({
    deps,
    input: { workspaceId: WORKSPACE_ID, record, bytes: HELLO_BYTES, blobCreatedByPrincipal: "importing-operator", baseVersion: null },
  });

  assert.deepEqual(result, { status: "imported", id: "asset-fresh", blobWritten: true });
  const blob = await deps.assetBlobRepo.findByHash({ workspaceId: WORKSPACE_ID, sha256: HELLO_SHA256 });
  assert.equal(blob?.createdByPrincipal, "importing-operator");
});
