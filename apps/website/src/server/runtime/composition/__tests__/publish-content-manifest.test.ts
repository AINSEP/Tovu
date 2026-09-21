/**
 * @file Task 2 of the publish-content (Publish Content) feature — proves
 * `installFirstPartyPublishContentTypes()` (`../publish-content-manifest.ts`) actually registers the
 * contributors it claims, and that it is idempotent (mirrors `tool-contribution-registry.test.ts`'s
 * identical "calling it twice leaves the registry in the same state as calling it once" check for
 * `installFirstPartyToolContributors`).
 *
 * `media` joined `post`/`page` here only once its `apply()` was a real write path. Registering a
 * type whose `apply()` throws would turn a correct refusal into a live bug — so the last test below
 * is not a spelling check on the registry list: it BUILDS the registered media contributor and
 * applies a real entity through it, which is the property that actually makes the registration safe.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { InMemoryAssetBlobRepo, InMemoryBlobStore, InMemoryVersionedMediaRepo, type MediaRecord } from "#src/features/media/index";
import { contentHash, CONTENT_HASH_VERSION } from "#src/features/publish-content/content-hash";
import {
  listPublishContentContributors,
  resetPublishContentContributorsForTests,
  type PublishContentDeps,
} from "#src/features/publish-content/type-registry";

import { installFirstPartyPublishContentTypes } from "../publish-content-manifest.js";

test.beforeEach(() => {
  resetPublishContentContributorsForTests();
});

test("installFirstPartyPublishContentTypes registers exactly post, page and media", () => {
  installFirstPartyPublishContentTypes();
  assert.deepEqual(
    listPublishContentContributors().map((c) => c.entityType),
    ["post", "page", "media"]
  );
});

test("installFirstPartyPublishContentTypes is idempotent — calling it twice leaves the registry in the same state as calling it once", () => {
  installFirstPartyPublishContentTypes();
  const once = listPublishContentContributors().map((c) => c.entityType);
  installFirstPartyPublishContentTypes();
  const twice = listPublishContentContributors().map((c) => c.entityType);
  assert.deepEqual(twice, once);
});

test("the registered media contributor's apply() is a real write path, not a throwing stub", async () => {
  installFirstPartyPublishContentTypes();
  const contributor = listPublishContentContributors().find((c) => c.entityType === "media");
  assert.ok(contributor, "media must be registered");

  const workspaceId = "11111111-1111-1111-1111-111111111111";
  const bytes = new TextEncoder().encode("a real imported photo's bytes");
  const sha256 = "86d9075d85c1cce55da0605a557dceaea6c27f18df8702ce86accccce8a41aa9";
  const record: MediaRecord = {
    id: "source-system-asset-42",
    workspaceId,
    title: "Team Photo",
    slug: "team-photo",
    alt: "",
    caption: "",
    credit: "",
    source: { sha256 },
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
    width: 800,
    height: 600,
    cssClass: null,
    htmlAttributes: null,
  };

  const mediaRepo = new InMemoryVersionedMediaRepo();
  const blobStore = new InMemoryBlobStore();
  await blobStore.putIfAbsent({ workspaceId, sha256, bytes });
  const outbox = new InMemoryOutbox();
  let n = 0;
  const deps: PublishContentDeps = {
    workspaceId,
    postRepo: undefined as unknown as PublishContentDeps["postRepo"],
    clock: { nowIso: () => "2026-09-18T12:00:00.000Z" },
    idGen: { newId: () => `generated-id-${++n}` },
    outbox,
    changeSets: new InMemoryChangeSetRepo([], [], outbox),
    authorize: async () => ({ allowed: true, reason: "test-always-allow" }),
    mediaRepo,
    assetBlobRepo: new InMemoryAssetBlobRepo(),
    blobStore,
  };

  const { changeSetId } = await contributor.build(deps).apply({
    entity: {
      entityType: "media",
      id: record.id,
      schemaVersion: 1,
      contentHash: contentHash("media", { ...record }),
      hashVersion: CONTENT_HASH_VERSION,
      requiredBlobs: [sha256],
      state: { ...record } as unknown as Record<string, unknown>,
    },
    expectedVersion: undefined,
    principalId: "operator-principal-1",
  });

  assert.ok(changeSetId);
  const landed = await mediaRepo.findById({ workspaceId, id: "source-system-asset-42" });
  assert.equal(landed?.id, "source-system-asset-42", "the registered contributor must write the row under the SOURCE id");
});
