import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { InMemoryAssetBlobRepo, InMemoryBlobStore, InMemoryMediaContentTypeStore, InMemoryVersionedMediaRepo, type MediaRecord } from "#src/features/media/index";
import { PublishContentApplyRowError } from "#src/features/publish-content/apply-errors";
import type { PackedEntity, PublishContentDeps } from "#src/features/publish-content/type-registry";

import { contributeMediaPublish } from "../publish-content.js";

/**
 * @file Characterization pin for M-MED (`plan-publish-all-types-2026-09-25.md` §5, §7): the live site
 * holds a baseline `contentHash` for every published media row, so moving the handler onto
 * `createRepoPublishHandler` must keep every hash, packed state and exact reason byte-identical.
 * Written against the hand-written handler and kept green across the migration.
 */

const WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";
const BYTES = new TextEncoder().encode("a real imported photo's bytes");
const SHA = "86d9075d85c1cce55da0605a557dceaea6c27f18df8702ce86accccce8a41aa9";
const OTHER_SHA = "0".repeat(64);

const PHOTO: MediaRecord = {
  id: "media-photo",
  workspaceId: WORKSPACE_ID,
  title: "Team Photo",
  slug: "team-photo",
  alt: "The whole team",
  caption: "Offsite",
  credit: "Ana",
  source: { sha256: SHA },
  status: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  version: 4,
  width: 800,
  height: 600,
  cssClass: "rounded",
  htmlAttributes: '{"loading":"lazy"}',
};
const BARE: MediaRecord = {
  ...PHOTO,
  id: "media-bare",
  slug: "bare",
  title: "Bare",
  alt: "",
  caption: "",
  credit: "",
  source: { sha256: OTHER_SHA },
  width: null,
  height: null,
  cssClass: null,
  htmlAttributes: null,
  version: 1,
};

const PINNED_HASHES: Record<string, string> = {
  "media-photo": "7c0f0cf15b136ae7d8496a4ac8e4c8ae36e5017b91283d0eb0102935b4f50495",
  "media-bare": "d10861fee117fa10e455f9562e54084e69d97aa68d5f2afb0cb5966d03b21b93",
};

async function deps(opts: { wired?: boolean; staged?: boolean } = {}): Promise<PublishContentDeps> {
  const blobStore = new InMemoryBlobStore();
  if (opts.staged ?? true) await blobStore.putIfAbsent({ workspaceId: WORKSPACE_ID, sha256: SHA, bytes: BYTES });
  const outbox = new InMemoryOutbox();
  let n = 0;
  return {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => "2026-09-18T12:00:00.000Z", nowMs() { return Date.parse(this.nowIso()); } },
    idGen: { newId: () => `generated-${++n}` },
    outbox,
    changeSets: new InMemoryChangeSetRepo([], [], outbox),
    authorize: async () => ({ allowed: true, reason: "test" }),
    ports:
      opts.wired === false
        ? {}
        : { media: { repo: new InMemoryVersionedMediaRepo([structuredClone(PHOTO), structuredClone(BARE)]), assetBlobRepo: new InMemoryAssetBlobRepo({}, { initialRows: [] }), blobStore, contentTypeStore: new InMemoryMediaContentTypeStore() } },
  };
}

const entity = (record: MediaRecord): PackedEntity => ({
  entityType: "media",
  id: record.id,
  schemaVersion: 1,
  contentHash: "unused",
  hashVersion: 1,
  requiredBlobs: [record.source.sha256],
  state: { ...record } as unknown as Record<string, unknown>,
});

test("pack(): pinned contentHash, required blob and packed state per media row", async () => {
  const packed: PackedEntity[] = [];
  for await (const e of contributeMediaPublish().build(await deps()).pack()) packed.push(e);
  assert.deepEqual(
    packed.map((e) => [e.id, e.contentHash, e.schemaVersion, e.hashVersion, e.requiredBlobs]),
    [
      ["media-photo", PINNED_HASHES["media-photo"], 1, 1, [SHA]],
      ["media-bare", PINNED_HASHES["media-bare"], 1, 1, [OTHER_SHA]],
    ]
  );
  assert.deepEqual(packed[0].state, PHOTO);
  assert.deepEqual(packed[1].state, BARE);
});

test("inspect(): the destination's hash equals the pinned pack hash", async () => {
  const handler = contributeMediaPublish().build(await deps());
  assert.deepEqual(await handler.inspect("media-photo"), { version: 4, hash: PINNED_HASHES["media-photo"] });
  assert.deepEqual(await handler.inspect("media-bare"), { version: 1, hash: PINNED_HASHES["media-bare"] });
  assert.equal(await handler.inspect("nope"), null);
});

test("precheck(): exact reason strings", async () => {
  const incoming = { ...PHOTO, id: "media-new", slug: "fresh" };
  assert.equal(
    await contributeMediaPublish().build(await deps({ wired: false })).precheck(entity(incoming)),
    "media entity 'media-new' cannot be prechecked — no media port wired for this deps bag"
  );
  const handler = contributeMediaPublish().build(await deps());
  assert.equal(await handler.precheck(entity(incoming)), null);
  assert.equal(await handler.precheck(entity(PHOTO)), null);
  assert.equal(
    await handler.precheck(entity({ ...incoming, slug: "team-photo" })),
    "slug 'team-photo' is already held by a different media ('media-photo')"
  );
  assert.equal(await handler.precheck(entity({ ...incoming, slug: "" })), null);
  assert.equal(
    await contributeMediaPublish().build(await deps({ staged: false })).precheck(entity(incoming)),
    `required blob '${SHA}' is not available on this destination`
  );
});

test("apply(): exact conflict and blocked texts; the result carries blobWritten", async () => {
  const handler = contributeMediaPublish().build(await deps());
  const rejects = (record: MediaRecord, expectedVersion: number | undefined, outcome: string, message: string) =>
    assert.rejects(
      () => handler.apply({ entity: entity(record), expectedVersion, principalId: "op", idempotencyKey: `k-${message}` }),
      (err: unknown) => err instanceof PublishContentApplyRowError && err.rowOutcome === outcome && err.message === message
    );
  await rejects(PHOTO, undefined, "conflict", "media 'media-photo' changed on the destination during apply: expected no existing row, found version 4");
  await rejects(PHOTO, 3, "conflict", "media 'media-photo' changed on the destination during apply: expected version 3, found version 4");
  await rejects({ ...PHOTO, id: "media-gone" }, 2, "conflict", "media 'media-gone' changed on the destination during apply: expected version 2, but the row is gone");
  const unstaged = contributeMediaPublish().build(await deps({ staged: false }));
  await assert.rejects(
    () => unstaged.apply({ entity: entity({ ...PHOTO, id: "media-new", slug: "fresh" }), expectedVersion: undefined, principalId: "op", idempotencyKey: "k-blob" }),
    (err: unknown) => err instanceof PublishContentApplyRowError && err.rowOutcome === "blocked" && /^media 'media-new' cannot be applied — /.test(err.message)
  );

  const result = (await handler.apply({ entity: entity({ ...PHOTO, title: "New" }), expectedVersion: 4, principalId: "op", idempotencyKey: "k-ok" })) as {
    changeSetId: string;
    blobWritten?: boolean;
  };
  assert.ok(result.changeSetId);
  assert.equal(result.blobWritten, true);
});

test("verifyApplied reports a missing published media row", async () => {
  const d = await deps();
  const handler = contributeMediaPublish().build(d);
  assert.ok(handler.verifyApplied);
  assert.deepEqual(await handler.verifyApplied({ entities: [entity({ ...PHOTO, id: "missing-row", slug: "missing-photo" })] }),
    ["Media 'missing-photo' was published but is not on the site."]);
});

test("verifyApplied reports a missing poster and clears the diagnostic once that poster exists", async () => {
  const d = await deps();
  const media = d.ports.media!;
  const video = { ...PHOTO, htmlAttributes: 'poster="/m/missing-poster/public.v1/image.webp"' };
  await media.repo.save(video);
  const handler = contributeMediaPublish().build(d);
  assert.ok(handler.verifyApplied);
  assert.deepEqual(await handler.verifyApplied({ entities: [entity(video)] }),
    ["Media 'team-photo' uses 'missing-poster' in its HTML attributes, but 'missing-poster' is not on the site, so it will not load."]);
  await media.repo.save({ ...BARE, slug: "missing-poster" });
  assert.deepEqual(await handler.verifyApplied({ entities: [entity(video)] }), []);
});
