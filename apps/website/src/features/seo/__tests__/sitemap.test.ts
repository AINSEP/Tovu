import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPostRepo, type PostRecord } from "../../post/index.js";
import { InMemorySettingsRepo } from "../../settings/index.js";
import { InMemoryAssetRenditionRepo, InMemoryMediaRepo, InMemoryTransformDefinitionRepo } from "../../media/index.js";
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

test("buildSitemap: a members/paid/tiers-gated published post is excluded — a crawler must not be told a gated post's URL/existence exists (ADR-030 §4, 2026-09-03 sweep)", async () => {
  const deps = await makeDeps([
    post({ id: "a", slug: "public-post", status: "published" }),
    post({ id: "b", slug: "members-only-post", status: "published", memberAccessJson: JSON.stringify({ visibility: "members" }) }),
    post({ id: "c", slug: "paid-only-post", status: "published", memberAccessJson: JSON.stringify({ visibility: "paid" }) }),
    post({ id: "d", slug: "tiers-only-post", status: "published", memberAccessJson: JSON.stringify({ visibility: "tiers", tierIds: ["t-1"] }) }),
  ]);

  const entries = await buildSitemap(deps, { workspaceId: WORKSPACE });
  assert.equal(entries.length, 1, "only the ungated post may appear");
  assert.ok(entries[0]!.loc.includes("public-post"));
  for (const gatedSlug of ["members-only-post", "paid-only-post", "tiers-only-post"]) {
    assert.ok(
      !entries.some((e) => e.loc.includes(gatedSlug)),
      `${gatedSlug} must not appear in the sitemap`
    );
  }
});

test("buildSitemap: a post with malformed memberAccessJson fails CLOSED (excluded), same as resolvePostMemberAccess's own fail-closed contract", async () => {
  const deps = await makeDeps([post({ id: "a", slug: "malformed-access-post", status: "published", memberAccessJson: "{not json" })]);

  const entries = await buildSitemap(deps, { workspaceId: WORKSPACE });
  assert.deepEqual(entries, []);
});

test("buildSitemap: a post with a NULL memberAccessJson (every pre-existing row) is treated as public, unchanged from pre-gating behavior", async () => {
  const deps = await makeDeps([post({ id: "a", slug: "legacy-ungated-post", status: "published", memberAccessJson: null })]);

  const entries = await buildSitemap(deps, { workspaceId: WORKSPACE });
  assert.equal(entries.length, 1);
  assert.ok(entries[0]!.loc.includes("legacy-ungated-post"));
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
