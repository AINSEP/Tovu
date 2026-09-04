import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPostRepo, type PostRecord } from "../../post/index.js";
import { InMemorySettingsRepo } from "../../settings/index.js";
import { InMemoryAssetRenditionRepo, InMemoryMediaRepo, InMemoryTransformDefinitionRepo } from "../../media/index.js";
import { OriginNotVerifiedError, type OriginRegistryPort } from "../../origin/index.js";
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

/** Mirrors `seo.test.ts`'s own copy of this fake — `origin` undefined (the default, and every
 *  pre-existing test's implicit behavior) means no verified origin registered, which keeps every
 *  `loc` assertion below unchanged (still relative). */
function fakeOriginRegistry(origin?: import("../../origin/index.js").VerifiedOrigin): OriginRegistryPort {
  return {
    async canonicalOrigin() {
      if (!origin) throw new OriginNotVerifiedError("no verified origin registered for this workspace");
      return origin;
    },
    async isAllowedRedirectTarget() {
      return false;
    },
    async isAllowedEgressTarget() {
      return false;
    },
  };
}

async function makeDeps(posts: PostRecord[], origin?: import("../../origin/index.js").VerifiedOrigin) {
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
    originRegistry: fakeOriginRegistry(origin),
  };
}

test("buildSitemap: an empty workspace resolves a valid empty array, never null", async () => {
  const deps = await makeDeps([]);
  const entries = await buildSitemap(deps, { workspaceId: WORKSPACE });
  assert.deepEqual(entries, []);
});

// 2026-09-03 absolute-URL fix side effect: `computeSitemapEntries` builds `loc` from
// `getEntryMeta`'s own `meta.canonical` — once that became absolute, sitemap entries did too, for
// free. The sitemap protocol requires `loc` to be absolute, the same requirement `og:url` has.
test("buildSitemap: with a verified origin, entries' loc is absolute (2026-09-03 fix side effect)", async () => {
  const deps = await makeDeps([post({ id: "a", slug: "published-visible", status: "published" })], {
    scheme: "https",
    host: "example.test",
    verifiedAt: "2026-09-03T00:00:00.000Z",
    source: "workspace-setting",
  });
  const entries = await buildSitemap(deps, { workspaceId: WORKSPACE });
  assert.equal(entries.length, 1);
  assert.equal(entries[0]!.loc, "https://example.test/published-visible");
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
