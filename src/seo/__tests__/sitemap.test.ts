import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPostRepo, type PostRecord } from "../../features/post/index.js";
import { InMemorySettingsRepo } from "../../features/settings/index.js";
import { InMemoryAssetRenditionRepo, InMemoryMediaRepo, InMemoryTransformDefinitionRepo } from "../../features/media/index.js";
import { ensureSeoSettingDefinitions } from "../settings.js";
import { buildSitemap, invalidateSitemapCache } from "../sitemap.js";

/**
 * @file T033 — failing-first unit certification of `buildSitemap`
 * (INV-04/05, AC-16/17, EC-04): excludes effective-`noindex` and non-
 * `published` entries; empty workspace -> valid empty array; entries ordered
 * by keyset `id` ascending (behavior.spec.md §2.2).
 */

const WORKSPACE = "workspace-sitemap-1";
const clock = { nowIso: () => "2026-07-13T00:00:00.000Z" };
let idCounter = 0;
const ids = { newId: () => `sitemap-test-id-${++idCounter}` };
const alwaysAllow = async () => ({ allowed: true, reason: "matched" });

function post(overrides: Partial<PostRecord>): PostRecord {
  return {
    id: "a",
    workspaceId: WORKSPACE,
    title: "Post",
    slug: "post",
    bodyJson: { type: "doc", content: [] },
    status: "published",
    kind: "post",
    updatedAt: "2026-07-13T00:00:00.000Z",
    version: 1,
    seoExtJson: null,
    ...overrides,
  };
}

async function makeDeps(posts: PostRecord[]) {
  invalidateSitemapCache({ workspaceId: WORKSPACE });
  const postRepo = new InMemoryPostRepo(posts);
  const settingsRepo = new InMemorySettingsRepo();
  const settingsDeps = { settingsRepo, clock, ids, authorize: alwaysAllow, principals: { findById: async () => null } as never };
  await ensureSeoSettingDefinitions(settingsDeps, { workspaceId: WORKSPACE, systemPrincipalId: "system-seo" });

  return {
    postRepo,
    settingsRepo,
    media: {
      mediaRepo: new InMemoryMediaRepo([]),
      assetRenditionRepo: new InMemoryAssetRenditionRepo([]),
      transformDefinitionRepo: new InMemoryTransformDefinitionRepo([]),
    },
  };
}

test("buildSitemap: an empty workspace resolves a valid empty array, never null", async () => {
  const deps = await makeDeps([]);
  const entries = await buildSitemap(deps, { workspaceId: WORKSPACE });
  assert.deepEqual(entries, []);
});

test("buildSitemap: excludes drafts and effective-noindex entries, includes only eligible published entries (AC-16/17)", async () => {
  const deps = await makeDeps([
    post({ id: "a", slug: "published-visible", status: "published" }),
    post({ id: "b", slug: "draft-post", status: "draft" }),
    post({ id: "c", slug: "noindex-post", status: "published", seoExtJson: JSON.stringify({ noindex: true }) }),
  ]);

  const entries = await buildSitemap(deps, { workspaceId: WORKSPACE });
  assert.equal(entries.length, 1);
  assert.ok(entries[0]!.loc.includes("published-visible"));
});

test("buildSitemap: entries are ordered by keyset id ascending (behavior.spec.md §2.2)", async () => {
  const deps = await makeDeps([
    post({ id: "c", slug: "c-post" }),
    post({ id: "a", slug: "a-post" }),
    post({ id: "b", slug: "b-post" }),
  ]);

  const entries = await buildSitemap(deps, { workspaceId: WORKSPACE });
  assert.deepEqual(
    entries.map((e) => e.loc),
    entries.map((e) => e.loc).slice().sort()
  );
  assert.ok(entries[0]!.loc.includes("a-post"));
  assert.ok(entries[2]!.loc.includes("c-post"));
});
