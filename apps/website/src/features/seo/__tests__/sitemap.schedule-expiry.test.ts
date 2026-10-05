import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { InMemoryPostRepo, type PostRecord } from "../../post/index.js";
import { InMemorySettingsRepo } from "../../settings/index.js";
import { InMemoryAssetRenditionRepo, InMemoryMediaRepo, InMemoryTransformDefinitionRepo } from "../../media/index.js";
import { OriginNotVerifiedError, type OriginRegistryPort } from "../../origin/index.js";
import { ensureSeoSettingDefinitions } from "../settings.js";
import { buildSitemap, invalidateSitemapCache } from "../sitemap.js";
import { buildPostRecord } from "#src/features/post/__tests__/post-record.fixture";

/**
 * @file Scheduled publishing (2026-10-05): nothing emits an event when a scheduled post goes live,
 * so the cached sitemap carries an expiry at the earliest future `publishAt` and is rebuilt on the
 * first read at or after it. The wall clock is faked with `mock.timers` (Date only), because
 * `currentIso()` reads `new Date()`.
 */

const WORKSPACE = "workspace-sitemap-expiry";
const T0 = Date.parse("2026-10-05T12:00:00.000Z");
const GO_LIVE = "2026-10-05T13:00:00.000Z";
const clock = { nowIso: () => new Date(T0).toISOString() };
let idCounter = 0;
const ids = { newId: () => `sitemap-expiry-id-${++idCounter}` };
const alwaysAllow = async () => ({ allowed: true, reason: "matched" });

function post(overrides: Partial<PostRecord>): PostRecord {
  return buildPostRecord({
    workspaceId: WORKSPACE,
    title: "Post",
    bodyJson: { type: "doc", content: [] },
    status: "published",
    kind: "post",
    updatedAt: "2026-10-01T00:00:00.000Z",
    version: 1,
    seoExtJson: null,
    ...overrides,
  });
}

function originRegistry(): OriginRegistryPort {
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

async function makeDeps(posts: PostRecord[]) {
  invalidateSitemapCache({ workspaceId: WORKSPACE });
  const settingsRepo = new InMemorySettingsRepo();
  const settingsDeps = { settingsRepo, clock, ids, authorize: alwaysAllow, principals: { findById: async () => null } as never };
  await ensureSeoSettingDefinitions(settingsDeps, { workspaceId: WORKSPACE, systemPrincipalId: "system-seo" });
  return {
    postRepo: new InMemoryPostRepo(posts),
    settingsRepo,
    media: {
      mediaRepo: new InMemoryMediaRepo({}, { initialRows: [] }),
      assetRenditionRepo: new InMemoryAssetRenditionRepo({}, { initialRows: [] }),
      transformDefinitionRepo: new InMemoryTransformDefinitionRepo({}, { initialRows: [] }),
    },
    originRegistry: originRegistry(),
  };
}

const locs = (entries: ReadonlyArray<{ loc: string }>) => entries.map((entry) => entry.loc).sort();

test("buildSitemap: the cached sitemap expires at a scheduled post's go-live time, and the post appears", async (t) => {
  mock.timers.enable({ apis: ["Date"], now: T0 });
  t.after(() => mock.timers.reset());
  const deps = await makeDeps([post({ id: "live", slug: "live" }), post({ id: "later", slug: "later", publishAt: GO_LIVE })]);

  assert.deepEqual(locs(await buildSitemap(deps, { workspaceId: WORKSPACE })), ["/live"], "a scheduled post is not in the sitemap before it goes live");

  // A row written without any invalidation proves the next read is still the cache, not a rebuild.
  await deps.postRepo.save(post({ id: "silent", slug: "silent" }));
  mock.timers.tick(Date.parse(GO_LIVE) - T0 - 1);
  assert.deepEqual(locs(await buildSitemap(deps, { workspaceId: WORKSPACE })), ["/live"], "the cache holds until the go-live instant");

  mock.timers.tick(1);
  assert.deepEqual(locs(await buildSitemap(deps, { workspaceId: WORKSPACE })), ["/later", "/live", "/silent"], "the cache is rebuilt at go-live");
});

test("buildSitemap: with nothing scheduled the cache has no expiry", async (t) => {
  mock.timers.enable({ apis: ["Date"], now: T0 });
  t.after(() => mock.timers.reset());
  const deps = await makeDeps([post({ id: "live", slug: "live" })]);

  assert.deepEqual(locs(await buildSitemap(deps, { workspaceId: WORKSPACE })), ["/live"]);
  await deps.postRepo.save(post({ id: "silent", slug: "silent" }));
  mock.timers.tick(365 * 24 * 60 * 60 * 1000);
  assert.deepEqual(locs(await buildSitemap(deps, { workspaceId: WORKSPACE })), ["/live"]);
});

test("buildSitemap: the expiry tracks the EARLIEST future go-live, and a past publishAt sets none", async (t) => {
  mock.timers.enable({ apis: ["Date"], now: T0 });
  t.after(() => mock.timers.reset());
  const deps = await makeDeps([
    post({ id: "past", slug: "past", publishAt: "2026-10-01T00:00:00.000Z" }),
    post({ id: "late", slug: "late", publishAt: "2026-10-05T15:00:00.000Z" }),
    post({ id: "soon", slug: "soon", publishAt: GO_LIVE }),
  ]);

  assert.deepEqual(locs(await buildSitemap(deps, { workspaceId: WORKSPACE })), ["/past"]);
  mock.timers.tick(Date.parse(GO_LIVE) - T0);
  assert.deepEqual(locs(await buildSitemap(deps, { workspaceId: WORKSPACE })), ["/past", "/soon"]);
  mock.timers.tick(2 * 60 * 60 * 1000);
  assert.deepEqual(locs(await buildSitemap(deps, { workspaceId: WORKSPACE })), ["/late", "/past", "/soon"]);
});
