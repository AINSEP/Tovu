import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { InMemoryAssetBlobRepo, InMemoryBlobStore, InMemoryMediaContentTypeStore, InMemoryVersionedMediaRepo, type MediaRecord } from "#src/features/media/index";
import type { PackedEntity, PublishContentDeps } from "#src/features/publish-content/type-registry";

import { MediaApplyBlockedError, MediaApplyConflictError, contributeMediaPublish } from "../publish-content.js";
import { createFakeClock } from "#src/__tests__/support/fake-clock";

/**
 * @file Branch pins for media's publish `validate`/`write`/`undo.summary` callbacks: the Library
 * isolation trust boundary (both the packed discriminant and the destination row), the staged-bytes
 * handoff into `importMediaEntity`, every refusal's exact class/code/message, and the sniffed
 * content type recorded on success.
 */

const WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const PNG_SHA = "1b56b50ac4e976f488f128cabdcdffb2fc9331d6974bb9968131a415d14ade24";
const DOCUMENT_MESSAGE = "Library documents cannot be published";

function photo(overrides: Partial<MediaRecord> = {}): MediaRecord {
  return { id: "m1", workspaceId: WORKSPACE_ID, title: "Photo", slug: "photo", alt: "", caption: "", credit: "",
    source: { sha256: PNG_SHA }, status: "active", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1, width: null, height: null, cssClass: null, htmlAttributes: null, ...overrides };
}

async function fixture(input: { rows?: MediaRecord[]; staged?: boolean; sha256?: string } = {}) {
  const repo = new InMemoryVersionedMediaRepo(input.rows ?? []);
  const assetBlobRepo = new InMemoryAssetBlobRepo({}, { initialRows: [] });
  const blobStore = new InMemoryBlobStore();
  const contentTypeStore = new InMemoryMediaContentTypeStore();
  if (input.staged ?? true) await blobStore.putIfAbsent({ workspaceId: WORKSPACE_ID, sha256: input.sha256 ?? PNG_SHA, bytes: PNG });
  const outbox = new InMemoryOutbox();
  let n = 0;
  const changeSets = new InMemoryChangeSetRepo([], [], outbox);
  const deps: PublishContentDeps = { workspaceId: WORKSPACE_ID, clock: createFakeClock({ startIso: "2026-09-18T12:00:00.000Z" }),
    idGen: { newId: () => `generated-${++n}` }, outbox, changeSets,
    authorize: async () => ({ allowed: true, reason: "test" }), ports: { media: { repo, assetBlobRepo, blobStore, contentTypeStore } } };
  return { handler: contributeMediaPublish().build(deps), repo, assetBlobRepo, blobStore, contentTypeStore, changeSets };
}

function entity(state: Record<string, unknown>, id = "m1"): PackedEntity {
  const source = state.source as { sha256?: string } | undefined;
  return { entityType: "media", id, schemaVersion: 1, contentHash: "unused", hashVersion: 1,
    requiredBlobs: source?.sha256 ? [source.sha256] : [], state };
}

function apply(handler: Awaited<ReturnType<typeof fixture>>["handler"], state: Record<string, unknown>, expectedVersion?: number) {
  return handler.apply({ entity: entity(state), expectedVersion, principalId: "op", idempotencyKey: `k-${Math.random()}` });
}

function blocked(code: MediaApplyBlockedError["code"], message: string) {
  return (err: unknown) => err instanceof MediaApplyBlockedError && err.code === code && err.rowOutcome === "blocked" && err.message === message;
}

test("sanity: the fixture sha256 is the real digest of the staged bytes", async () => {
  const digest = Buffer.from(await crypto.subtle.digest("SHA-256", PNG)).toString("hex");
  assert.equal(digest, PNG_SHA);
});

// --- write: Library isolation --------------------------------------------------------------------

test("write refuses a packed document discriminant before reading any bytes", async () => {
  const { handler, blobStore } = await fixture();
  let reads = 0;
  blobStore.get = async () => { reads++; throw new Error("document bytes must not be fetched"); };
  await assert.rejects(apply(handler, { ...photo(), kind: "document" }), blocked("blocked:precondition", DOCUMENT_MESSAGE));
  assert.equal(reads, 0);
});

test("write refuses to overwrite a destination document even when the packed state has no discriminant", async () => {
  const { handler } = await fixture({ rows: [photo({ kind: "document", source: { sha256: "f".repeat(64) } })] });
  await assert.rejects(apply(handler, { ...photo() }, 1), blocked("blocked:precondition", DOCUMENT_MESSAGE));
});

test("write refuses media whose bytes are owned only by a Library document", async () => {
  const { handler, assetBlobRepo } = await fixture();
  await assetBlobRepo.save({ id: "b", workspaceId: WORKSPACE_ID, sha256: PNG_SHA, storageKey: "k", createdByPrincipal: "owner",
    createdAt: "2026-01-01T00:00:00.000Z", status: "active", documentOwned: true });
  await assert.rejects(apply(handler, { ...photo(), kind: "media" }), blocked("blocked:precondition", DOCUMENT_MESSAGE));
});

// --- write: import outcomes ----------------------------------------------------------------------

test("write imports an explicit media discriminant and records the sniffed content type", async () => {
  const { handler, repo, contentTypeStore } = await fixture();
  const result = await apply(handler, { ...photo(), kind: "media" }) as { blobWritten?: boolean };
  assert.equal(result.blobWritten, true);
  assert.equal((await repo.findById({ workspaceId: WORKSPACE_ID, id: "m1" }))?.version, 1);
  assert.deepEqual(await contentTypeStore.getMany({ workspaceId: WORKSPACE_ID, sha256s: [PNG_SHA] }), new Map([[PNG_SHA, "image/png"]]));
});

test("write reports an unstaged blob as blocked:missing-blob naming the sha", async () => {
  const { handler } = await fixture({ staged: false });
  await assert.rejects(apply(handler, { ...photo() }), blocked("blocked:missing-blob",
    `media 'm1' cannot be applied — required blob '${PNG_SHA}' was never received by this destination`));
});

test("write reports a slug held by another id as blocked:slug-taken", async () => {
  const { handler } = await fixture({ rows: [photo({ id: "other", slug: "photo" })] });
  await assert.rejects(apply(handler, { ...photo() }), blocked("blocked:slug-taken",
    "media 'm1' cannot be applied — slug 'photo' is already held by a different media ('other')"));
});

test("write reports a moved destination row as a conflict", async () => {
  const { handler } = await fixture({ rows: [photo({ version: 3 })] });
  await assert.rejects(apply(handler, { ...photo() }, 2), (err: unknown) => err instanceof MediaApplyConflictError &&
    err.rowOutcome === "conflict" && err.message === "media 'm1' changed on the destination during apply: expected version 2, found version 3");
});

test("write returns a typed block on forged packed state with no source", async () => {
  const { handler } = await fixture({ staged: false });
  const { source: _source, ...sourceless } = photo();
  await assert.rejects(apply(handler, sourceless), blocked("blocked:precondition",
    "media 'm1' cannot be applied — missing or malformed media source"));
});

// --- validate (precheck) -------------------------------------------------------------------------

test("precheck refuses a packed document discriminant", async () => {
  const { handler } = await fixture();
  assert.equal(await handler.precheck(entity({ ...photo(), kind: "document" })), DOCUMENT_MESSAGE);
});

test("precheck refuses to overwrite a destination document", async () => {
  const { handler } = await fixture({ rows: [photo({ kind: "document", source: { sha256: "f".repeat(64) } })] });
  assert.equal(await handler.precheck(entity({ ...photo() })), DOCUMENT_MESSAGE);
});

test("precheck skips the document-blob probe for state with no sha256 and passes with nothing required", async () => {
  const { handler, repo } = await fixture();
  let lists = 0;
  const list = repo.list.bind(repo);
  repo.list = async (input) => { lists++; return list(input); };
  const { source: _source, ...sourceless } = photo();
  assert.equal(await handler.precheck(entity(sourceless)), null);
  assert.equal(lists, 0);
});

test("precheck passes an explicit media discriminant with its blob staged", async () => {
  const { handler } = await fixture();
  assert.equal(await handler.precheck(entity({ ...photo(), kind: "media" })), null);
});

// --- undo summary --------------------------------------------------------------------------------

async function summaryOf(f: Awaited<ReturnType<typeof fixture>>, state: Record<string, unknown>, expectedVersion?: number) {
  const result = await apply(f.handler, state, expectedVersion) as { changeSetId: string };
  return (await f.changeSets.findById({ workspaceId: WORKSPACE_ID, id: result.changeSetId }))?.changeSet.summary;
}

test("the change-set summary names a new blob when the import created it", async () => {
  const f = await fixture();
  assert.equal(await summaryOf(f, { ...photo() }), `Import media 'm1' via publish-content (new blob ${PNG_SHA})`);
});

test("the change-set summary names a reused blob when the bytes were already there", async () => {
  const f = await fixture();
  await f.assetBlobRepo.save({ id: "b", workspaceId: WORKSPACE_ID, sha256: PNG_SHA, storageKey: "k", createdByPrincipal: "owner",
    createdAt: "2026-01-01T00:00:00.000Z", status: "active" });
  assert.equal(await summaryOf(f, { ...photo() }),
    `Import media 'm1' via publish-content (existing blob ${PNG_SHA} reused; attribution preserved)`);
});

test("verifyApplied reports nothing when no media port is wired", async () => {
  const outbox = new InMemoryOutbox();
  const handler = contributeMediaPublish().build({ workspaceId: WORKSPACE_ID, clock: createFakeClock({ startIso: "2026-09-18T12:00:00.000Z" }),
    idGen: { newId: () => "id" }, outbox, changeSets: new InMemoryChangeSetRepo([], [], outbox),
    authorize: async () => ({ allowed: true, reason: "test" }), ports: {} });
  assert.deepEqual(await handler.verifyApplied!({ entities: [entity({ ...photo() })] }), []);
});
