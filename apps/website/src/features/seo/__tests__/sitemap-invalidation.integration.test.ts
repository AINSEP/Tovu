import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEventBus, InMemoryOutbox, processOutbox } from "#src/contracts/core/events/index";
import { InMemoryPostRepo, updatePost, type PostRecord } from "../../post/index.js";
import { InMemorySettingsRepo } from "../../settings/index.js";
import { InMemoryAssetRenditionRepo, InMemoryMediaRepo, InMemoryTransformDefinitionRepo } from "../../media/index.js";
import { ensureSeoSettingDefinitions } from "../settings.js";
import { buildSitemap, createSeoEventSubscriptions, invalidateSitemapCache } from "../sitemap.js";

/**
 * @file T036 — failing-first integration certification: publish ->
 * `entry.published` -> sitemap cache invalidated; unpublish ->
 * `entry.unpublished` -> sitemap cache invalidated; draft->draft edit emits
 * no event and the cache stays untouched (ADR-PIPE-008 Decision §5, W-003/
 * W-004, EC-05).
 */

const WORKSPACE = "workspace-invalidation-1";
const clock = { nowIso: () => "2026-07-13T00:00:00.000Z" };
let idCounter = 0;
const ids = { newId: () => `invalidation-test-id-${++idCounter}` };
const alwaysAllow = async () => ({ allowed: true, reason: "matched" });

function seedPost(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "post-1",
    workspaceId: WORKSPACE,
    title: "Hello",
    slug: "hello",
    bodyJson: { type: "doc", content: [] },
    status: "draft",
    kind: "post",
    updatedAt: "2026-07-13T00:00:00.000Z",
    version: 1,
    seoExtJson: null,
    ...overrides,
  };
}

async function makeHarness(posts: PostRecord[]) {
  invalidateSitemapCache({ workspaceId: WORKSPACE });
  const postRepo = new InMemoryPostRepo(posts);
  const settingsRepo = new InMemorySettingsRepo();
  const settingsDeps = { settingsRepo, clock, ids, authorize: alwaysAllow, principals: { findById: async () => null } as never };
  await ensureSeoSettingDefinitions(settingsDeps, { workspaceId: WORKSPACE, systemPrincipalId: "system-seo" });

  const deps = {
    postRepo,
    settingsRepo,
    media: {
      mediaRepo: new InMemoryMediaRepo([]),
      assetRenditionRepo: new InMemoryAssetRenditionRepo([]),
      transformDefinitionRepo: new InMemoryTransformDefinitionRepo([]),
    },
  };

  const outbox = new InMemoryOutbox();
  const bus = new InMemoryEventBus();
  const subscriptions = createSeoEventSubscriptions();
  await bus.subscribe("entry.published", (event) => subscriptions.onEntryPublished(event as never));
  await bus.subscribe("entry.updated", (event) => subscriptions.onEntryUpdated(event as never));
  await bus.subscribe("entry.unpublished", (event) => subscriptions.onEntryUnpublished(event as never));

  return { deps, postRepo, outbox, bus };
}

/** Primes the sitemap cache, then mutates the underlying repo directly (bypassing any chokepoint)
 * so a subsequent `buildSitemap` call only reflects the mutation if the cache was truly cleared. */
async function primeCacheThenMutateDirectly(harness: Awaited<ReturnType<typeof makeHarness>>) {
  await buildSitemap(harness.deps, { workspaceId: WORKSPACE });
  const existing = await harness.postRepo.findById({ workspaceId: WORKSPACE, id: "post-1" });
  await harness.postRepo.save({ ...existing!, id: "post-2", slug: "second-entry", status: "published" });
}

test("publish -> entry.published -> sitemap cache invalidated", async () => {
  const harness = await makeHarness([seedPost({ status: "draft" })]);
  await primeCacheThenMutateDirectly(harness);

  await updatePost({
    deps: { repo: harness.postRepo, clock, outbox: harness.outbox },
    input: { workspaceId: WORKSPACE, id: "post-1", title: "Hello", slug: "hello", bodyJson: {}, status: "published" },
  });
  await processOutbox({ outbox: harness.outbox, bus: harness.bus, clock });

  const entries = await buildSitemap(harness.deps, { workspaceId: WORKSPACE });
  assert.equal(entries.length, 2, "cache must have been invalidated and rebuilt to include the directly-mutated second entry");
});

test("unpublish -> entry.unpublished -> sitemap cache invalidated", async () => {
  const harness = await makeHarness([seedPost({ status: "published" })]);
  await primeCacheThenMutateDirectly(harness);

  await updatePost({
    deps: { repo: harness.postRepo, clock, outbox: harness.outbox },
    input: { workspaceId: WORKSPACE, id: "post-1", title: "Hello", slug: "hello", bodyJson: {}, status: "draft" },
  });
  await processOutbox({ outbox: harness.outbox, bus: harness.bus, clock });

  const entries = await buildSitemap(harness.deps, { workspaceId: WORKSPACE });
  assert.equal(entries.length, 1, "cache must have been invalidated and rebuilt (post-1 unpublished, post-2 published-and-visible)");
});

test("published -> published edit -> entry.updated -> sitemap cache invalidated", async () => {
  const harness = await makeHarness([seedPost({ status: "published" })]);
  await primeCacheThenMutateDirectly(harness);

  await updatePost({
    deps: { repo: harness.postRepo, clock, outbox: harness.outbox },
    input: { workspaceId: WORKSPACE, id: "post-1", title: "Hello (retitled)", slug: "hello", bodyJson: {}, status: "published" },
  });
  await processOutbox({ outbox: harness.outbox, bus: harness.bus, clock });

  const entries = await buildSitemap(harness.deps, { workspaceId: WORKSPACE });
  assert.equal(entries.length, 2, "an entry.updated delivery (published -> published) must invalidate the cache too, not only the published/unpublished transitions");
});

test("draft -> draft edit emits no event and the cache stays untouched", async () => {
  const harness = await makeHarness([seedPost({ status: "draft" })]);
  await primeCacheThenMutateDirectly(harness);

  await updatePost({
    deps: { repo: harness.postRepo, clock, outbox: harness.outbox },
    input: { workspaceId: WORKSPACE, id: "post-1", title: "Hello (edited)", slug: "hello", bodyJson: {}, status: "draft" },
  });
  await processOutbox({ outbox: harness.outbox, bus: harness.bus, clock });

  const entries = await buildSitemap(harness.deps, { workspaceId: WORKSPACE });
  assert.equal(entries.length, 0, "cache must still be the stale primed value (empty) — no event, no invalidation");
});
