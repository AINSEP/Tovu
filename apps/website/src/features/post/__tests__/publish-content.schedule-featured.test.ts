/**
 * @file Publishing carries a post's schedule (`publishAt`) and featured image (`featuredMediaId`).
 *
 * The defect (2026-10-05): both fields were classified `"local"`, so a post scheduled for later
 * published to production as plain `published` and went live at once, and its featured image never
 * arrived. They are now `"transferred"` but packed only WHEN SET, so a row without them keeps the
 * exact state and hash it had before these fields existed (`publish-content.characterization.test.ts`
 * pins those hashes).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { contentHash } from "#src/features/publish-content/content-hash";
import type { PackedEntity } from "#src/features/publish-content/type-registry";

import { InMemoryPostRepo } from "../repo.memory.js";
import type { PostRecord } from "../post.js";
import { contributePostPublish, toPublishableState } from "../publish-content.js";

const WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";
const IMPORTING_OPERATOR = "operator-running-the-import";
const PUBLISH_AT = "2099-01-01T09:00:00.000Z";
const FEATURED_MEDIA_ID = "33333333-3333-3333-3333-333333333333";

function makeDeps(rows: PostRecord[]) {
  const outbox = new InMemoryOutbox();
  const postRepo = new InMemoryPostRepo(rows);
  return {
    workspaceId: WORKSPACE_ID,
    postRepo,
    clock: { nowMs: () => Date.parse("2026-10-05T12:00:00.000Z") },
    idGen: (() => {
      let n = 0;
      return { newId: () => `generated-id-${++n}` };
    })(),
    outbox,
    changeSets: new InMemoryChangeSetRepo([], [], outbox),
    authorize: async () => ({ allowed: true, reason: "test-always-allow" }),
    ports: { post: { repo: postRepo, forgetRemoved: async () => {} } },
  };
}

function post(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "22222222-2222-2222-2222-222222222222",
    workspaceId: WORKSPACE_ID,
    title: "Launch notes",
    slug: "launch-notes",
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "body" }] }] },
    status: "published",
    kind: "post",
    bodyFormat: "doc",
    bodyHtml: null,
    updatedAt: "2026-10-01T00:00:00.000Z",
    version: 4,
    seoExtJson: null,
    deletedAt: null,
    templateChoice: null,
    overridesThemePage: null,
    memberAccessJson: null,
    createdByPrincipalId: "author",
    createdAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

async function packAll(rows: PostRecord[]): Promise<PackedEntity[]> {
  const handler = contributePostPublish().build(makeDeps(rows));
  const packed: PackedEntity[] = [];
  for await (const entity of handler.pack()) packed.push(entity);
  return packed;
}

/** Packs `source`, applies it into a destination seeded with `destinationRows`, returns what landed. */
async function roundTrip(source: PostRecord, destinationRows: PostRecord[] = []) {
  const [sourceEntity] = await packAll([source]);
  assert.ok(sourceEntity, "the source row must pack");
  const destinationDeps = makeDeps(destinationRows);
  const handler = contributePostPublish().build(destinationDeps);
  const existing = destinationRows.find((row) => row.id === source.id);
  await handler.apply({
    entity: sourceEntity,
    expectedVersion: existing ? existing.version : undefined,
    principalId: IMPORTING_OPERATOR,
    idempotencyKey: "schedule-round-trip",
  });
  const repacked: PackedEntity[] = [];
  for await (const entity of handler.pack()) repacked.push(entity);
  return {
    sourceEntity,
    repacked: repacked.find((entity) => entity.id === source.id),
    landed: await destinationDeps.postRepo.findById({ workspaceId: WORKSPACE_ID, id: source.id }),
  };
}

test("a scheduled post lands at the destination with its publishAt, so it does not go live early", async () => {
  const { sourceEntity, repacked, landed } = await roundTrip(post({ publishAt: PUBLISH_AT }));
  assert.equal(sourceEntity.state.publishAt, PUBLISH_AT);
  assert.equal(landed?.publishAt, PUBLISH_AT);
  assert.equal(repacked?.contentHash, sourceEntity.contentHash);
});

test("a featured image lands at the destination", async () => {
  const { sourceEntity, repacked, landed } = await roundTrip(post({ featuredMediaId: FEATURED_MEDIA_ID }));
  assert.equal(sourceEntity.state.featuredMediaId, FEATURED_MEDIA_ID);
  assert.equal(landed?.featuredMediaId, FEATURED_MEDIA_ID);
  assert.equal(repacked?.contentHash, sourceEntity.contentHash);
});

test("scheduling a post changes its content hash, so a newly scheduled post is offered for publish", async () => {
  const [plain] = await packAll([post()]);
  const [scheduled] = await packAll([post({ publishAt: PUBLISH_AT })]);
  assert.notEqual(scheduled?.contentHash, plain?.contentHash);
});

test("a source without a schedule clears the destination's schedule and featured image", async () => {
  const destination = post({ publishAt: PUBLISH_AT, featuredMediaId: FEATURED_MEDIA_ID, version: 2 });
  const { sourceEntity, repacked, landed } = await roundTrip(post(), [destination]);
  assert.ok(landed);
  assert.equal("publishAt" in landed, false, "the destination kept a schedule the source no longer has");
  assert.equal("featuredMediaId" in landed, false, "the destination kept a featured image the source no longer has");
  assert.equal(repacked?.contentHash, sourceEntity.contentHash);
});

test("a row without a schedule or featured image packs without either key", async () => {
  const [entity] = await packAll([post()]);
  assert.ok(entity);
  assert.equal("publishAt" in entity.state, false);
  assert.equal("featuredMediaId" in entity.state, false);
});

test("toPublishableState agrees with the packed hash for a scheduled row (planRetire/retire hash it)", async () => {
  for (const row of [post(), post({ publishAt: PUBLISH_AT, featuredMediaId: FEATURED_MEDIA_ID })]) {
    const [entity] = await packAll([row]);
    assert.equal(contentHash("post", toPublishableState(row)), entity?.contentHash);
  }
});

test("the featured image is a reference, so a scoped publish carries the media along", async () => {
  const [entity] = await packAll([post({ featuredMediaId: FEATURED_MEDIA_ID })]);
  assert.ok(entity);
  const handler = contributePostPublish().build(makeDeps([]));
  const refs = handler.references?.(entity) ?? [];
  assert.deepEqual(
    refs.filter((ref) => ref.entityType === "media"),
    [{ entityType: "media", key: FEATURED_MEDIA_ID }]
  );
});
