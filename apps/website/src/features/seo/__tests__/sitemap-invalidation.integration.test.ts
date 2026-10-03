import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEventBus, InMemoryOutbox, processOutbox } from "#src/contracts/core/events/index";
import { InMemoryPostRepo, createPost, updatePost, type PostRecord } from "../../post/index.js";
import { InMemorySettingsRepo } from "../../settings/index.js";
import { InMemoryAssetRenditionRepo, InMemoryMediaRepo, InMemoryTransformDefinitionRepo } from "../../media/index.js";
import { OriginNotVerifiedError, type OriginRegistryPort } from "../../origin/index.js";
import { ensureSeoSettingDefinitions } from "../settings.js";
import { buildSitemap, createSeoEventSubscriptions, invalidateSitemapCache } from "../sitemap.js";
import { setEntrySeoOverrides } from "../write-service.js";

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

/** No verified origin registered — mirrors `seo.test.ts`'s own copy of this fake. */
function fakeOriginRegistry(): OriginRegistryPort {
  return {
    async canonicalOrigin() {
      throw new OriginNotVerifiedError({ message: "no verified origin registered for this workspace" });
    },
    async isAllowedRedirectTarget() {
      return false;
    },
    async isAllowedEgressTarget() {
      return false;
    },
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
      mediaRepo: new InMemoryMediaRepo({}, { initialRows: [] }),
      assetRenditionRepo: new InMemoryAssetRenditionRepo({}, { initialRows: [] }),
      transformDefinitionRepo: new InMemoryTransformDefinitionRepo({}, { initialRows: [] }),
    },
    originRegistry: fakeOriginRegistry(),
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

test("SEO writes rebuild the sitemap when noindex is disabled or cleared and canonical is changed or cleared", async () => {
  const harness = await makeHarness([seedPost({ status: "published" })]);
  assert.deepEqual((await buildSitemap(harness.deps, { workspaceId: WORKSPACE })).map((e) => e.loc), ["/hello"]);
  const cases = [
    { patch: { noindex: true }, locations: [] },
    { patch: { noindex: false }, locations: ["/hello"] },
    { patch: { noindex: true }, locations: [] },
    { patch: { noindex: null }, locations: ["/hello"] },
    { patch: { canonical: "https://example.com/preferred" }, locations: ["https://example.com/preferred"] },
    { patch: { canonical: null }, locations: ["/hello"] },
  ];
  for (const { patch, locations } of cases) {
    await setEntrySeoOverrides({ deps: { postRepo: harness.postRepo, authorize: alwaysAllow, invalidateSitemapCache, clock },
      input: { workspaceId: WORKSPACE, entryId: "post-1", callerPrincipalId: "editor", patch } });
    assert.deepEqual((await buildSitemap(harness.deps, { workspaceId: WORKSPACE })).map((e) => e.loc), locations);
  }
});

test("the production app registers sitemap invalidation for each entry lifecycle event independently", async () => {
  const { createApp, createRouteDeps } = await import("#src/server/runtime/composition/app");
  const runtime = createRouteDeps();
  await runtime.seoReady;
  createApp(runtime);
  const harness = await makeHarness([seedPost({ status: "published" })]);
  for (const name of ["entry.published", "entry.updated", "entry.unpublished"]) {
    invalidateSitemapCache({ workspaceId: WORKSPACE });
    await harness.postRepo.save(seedPost({ status: "published", slug: "before-event" }));
    assert.deepEqual((await buildSitemap(harness.deps, { workspaceId: WORKSPACE })).map((e) => e.loc), ["/before-event"]);
    await harness.postRepo.save(seedPost({ status: "published", slug: "after-event" }));
    await runtime.bus.publish({ id: `test-${name}`, name, workspaceId: WORKSPACE, aggregateId: "post-1",
      occurredAt: clock.nowIso(), payload: { workspaceId: WORKSPACE, entryId: "post-1" } });
    assert.deepEqual((await buildSitemap(harness.deps, { workspaceId: WORKSPACE })).map((e) => e.loc), ["/after-event"], name);
  }
});

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
  assert.deepEqual(entries.map((entry) => entry.loc), ["/second-entry"]);
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

/**
 * Regression for `ADS-memory/reports/2026-09-01-to-03-review-bugs.md` Finding 1: `createPost` used
 * to never call `emitStatusTransitionEvent`/enqueue anything at all, unlike `updatePost`/`deletePost`
 * above — so a post created DIRECTLY as `status: "published"` (a documented, first-class input, not
 * an edge case) never invalidated the sitemap cache and stayed permanently absent from `sitemap.xml`
 * until some unrelated post in the same workspace was later updated. Mirrors the publish test above
 * exactly, except the mutation under test is a fresh `createPost` rather than a `draft`->`published`
 * `updatePost` transition — the one case those existing tests never covered.
 */
test("create directly as published -> entry.published -> sitemap cache invalidated", async () => {
  const harness = await makeHarness([seedPost({ status: "draft" })]);
  // Warms the cache against the current (zero-published-posts) state — mirrors
  // `primeCacheThenMutateDirectly`'s own "prime the cache, then mutate" shape, except the mutation
  // under test here is the create path itself, not a direct repo write.
  const before = await buildSitemap(harness.deps, { workspaceId: WORKSPACE });
  assert.equal(before.length, 0, "sanity: no published post exists yet");

  await createPost({
    deps: { repo: harness.postRepo, clock, outbox: harness.outbox },
    input: { workspaceId: WORKSPACE, id: "post-2", title: "Published at creation", status: "published" },
  });
  await processOutbox({ outbox: harness.outbox, bus: harness.bus, clock });

  const entries = await buildSitemap(harness.deps, { workspaceId: WORKSPACE });
  assert.equal(entries.length, 1, "a post created directly as published must invalidate the sitemap cache so it appears immediately, not stay absent until an unrelated later update");
  assert.ok(
    entries.some((e) => e.loc.includes("published-at-creation")),
    `expected the newly-created published post's own slug in the rebuilt sitemap entries: ${JSON.stringify(entries)}`
  );
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
