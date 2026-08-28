import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPostRepo, type PostRecord } from "../../post/index.js";
import { InMemorySettingsRepo } from "../../settings/index.js";
import { InMemoryAssetRenditionRepo, InMemoryMediaRepo, InMemoryTransformDefinitionRepo } from "../../media/index.js";
import { SeoEntryNotFoundError } from "../errors.js";
import { ensureSeoSettingDefinitions, setSeoSettings } from "../settings.js";
import { getEntryMeta } from "../seo.js";

/**
 * @file T024 — failing-first unit certification of `getEntryMeta`
 * (ADR-PIPE-008 Decision, C-001; behavior.spec.md §1.1/§3/§7): per-field
 * precedence (override wins, site-default wins when no override,
 * derived-from-excerpt fallback when both absent), `title` never resolves
 * empty, canonical override accepted cross-domain as-is (EC-10), no-override
 * canonical falls back to routing, draft-safety `noindex` derivation (EC-11),
 * entry override beats a workspace default (EC-02).
 */

const WORKSPACE = "workspace-1";
const clock = { nowIso: () => "2026-07-13T00:00:00.000Z" };
let idCounter = 0;
const ids = { newId: () => `seo-test-id-${++idCounter}` };
const alwaysAllow = async () => ({ allowed: true, reason: "matched" });

function seedPost(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "post-1",
    workspaceId: WORKSPACE,
    title: "Hello World",
    slug: "hello-world",
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "An excerpt body." }] }] },
    status: "published",
    kind: "post",
    updatedAt: "2026-07-13T00:00:00.000Z",
    version: 1,
    seoExtJson: null,
    ...overrides,
  };
}

async function makeDeps(posts: PostRecord[]) {
  const postRepo = new InMemoryPostRepo(posts);
  const settingsRepo = new InMemorySettingsRepo();
  const settingsDeps = { settingsRepo, clock, ids, authorize: alwaysAllow, principals: { findById: async () => null } as never };
  await ensureSeoSettingDefinitions(settingsDeps, { workspaceId: WORKSPACE, systemPrincipalId: "system-seo" });

  return {
    postRepo,
    settingsRepo,
    settingsDeps,
    media: {
      mediaRepo: new InMemoryMediaRepo([]),
      assetRenditionRepo: new InMemoryAssetRenditionRepo([]),
      transformDefinitionRepo: new InMemoryTransformDefinitionRepo([]),
    },
  };
}

test("getEntryMeta: entry not found rejects SeoEntryNotFoundError", async () => {
  const deps = await makeDeps([]);
  await assert.rejects(
    () => getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "missing" }),
    SeoEntryNotFoundError
  );
});

test("getEntryMeta: no overrides and no site defaults resolves fully derived meta (AC-07)", async () => {
  const deps = await makeDeps([seedPost()]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });

  assert.equal(meta.title, "Hello World");
  assert.equal(meta.robots.noindex, false);
  assert.equal(meta.robots.nofollow, false);
  assert.ok(meta.canonical.includes("hello-world"));
});

test("getEntryMeta: title override wins over derived template (AC-06)", async () => {
  const deps = await makeDeps([seedPost({ seoExtJson: JSON.stringify({ title: "Override Title" }) })]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.title, "Override Title");
});

test("getEntryMeta: title is derived from titleTemplate applied to entry.title when no override", async () => {
  const deps = await makeDeps([seedPost()]);
  await setSeoSettings(deps.settingsDeps, {
    workspaceId: WORKSPACE,
    callerPrincipalId: "caller-1",
    patch: { titleTemplate: "%s — My Site" },
  });
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.title, "Hello World — My Site");
});

test("getEntryMeta: title never resolves empty even when override/default/derived all appear absent", async () => {
  const deps = await makeDeps([seedPost({ title: "X" })]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.ok(meta.title.length > 0);
});

test("getEntryMeta: description — site default wins when no override (behavior.spec.md example)", async () => {
  const deps = await makeDeps([seedPost()]);
  await setSeoSettings(deps.settingsDeps, {
    workspaceId: WORKSPACE,
    callerPrincipalId: "caller-1",
    patch: { defaultDescription: "A great site" },
  });
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.description, "A great site");
});

test("getEntryMeta: description override wins over site default", async () => {
  const deps = await makeDeps([seedPost({ seoExtJson: JSON.stringify({ description: "Override description" }) })]);
  await setSeoSettings(deps.settingsDeps, {
    workspaceId: WORKSPACE,
    callerPrincipalId: "caller-1",
    patch: { defaultDescription: "Site default" },
  });
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.description, "Override description");
});

test("getEntryMeta: description derives from excerpt when override and site default are both absent", async () => {
  const deps = await makeDeps([seedPost()]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.description, "An excerpt body.");
});

test("getEntryMeta: all precedence sources absent for description resolves undefined (EC, behavior.spec.md §7)", async () => {
  const deps = await makeDeps([seedPost({ bodyJson: { type: "doc", content: [] } })]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.description, undefined);
});

test("getEntryMeta: canonical override is accepted cross-domain as-is (EC-10)", async () => {
  const deps = await makeDeps([
    seedPost({ seoExtJson: JSON.stringify({ canonical: "https://other-domain.example/elsewhere" }) }),
  ]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.canonical, "https://other-domain.example/elsewhere");
});

test("getEntryMeta: no canonical override falls back to the routing-resolved canonical, never a seo setting", async () => {
  const deps = await makeDeps([seedPost()]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.ok(meta.canonical.endsWith("/hello-world"));
});

test("getEntryMeta: a draft with no explicit noindex override and no site default defaults to noindex:true (EC-11)", async () => {
  const deps = await makeDeps([seedPost({ status: "draft" })]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.robots.noindex, true);
});

test("getEntryMeta: a draft with an explicit noindex:false override still wins over the draft-safety default", async () => {
  const deps = await makeDeps([seedPost({ status: "draft", seoExtJson: JSON.stringify({ noindex: false }) })]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.robots.noindex, false);
});

test("getEntryMeta: entry override noindex:false beats a workspace default noindex:true (EC-02)", async () => {
  const deps = await makeDeps([seedPost({ seoExtJson: JSON.stringify({ noindex: false }) })]);
  await setSeoSettings(deps.settingsDeps, {
    workspaceId: WORKSPACE,
    callerPrincipalId: "caller-1",
    patch: { defaultRobots: { noindex: true, nofollow: false } },
  });
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.robots.noindex, false);
});

test("getEntryMeta: a published entry's noindex derives false when nothing else is set", async () => {
  const deps = await makeDeps([seedPost({ status: "published" })]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.robots.noindex, false);
});

test("getEntryMeta: openGraph.image is omitted when no override and no site default exist", async () => {
  const deps = await makeDeps([seedPost()]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.openGraph.image, undefined);
});

test("getEntryMeta: openGraph.image resolves from the entry override (absolute URL passthrough)", async () => {
  const deps = await makeDeps([seedPost({ seoExtJson: JSON.stringify({ ogImage: "https://cdn.example.com/x.jpg" }) })]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.openGraph.image, "https://cdn.example.com/x.jpg");
});

test("getEntryMeta: twitter.site comes only from the site default (no per-entry override field exists)", async () => {
  const deps = await makeDeps([seedPost()]);
  await setSeoSettings(deps.settingsDeps, {
    workspaceId: WORKSPACE,
    callerPrincipalId: "caller-1",
    patch: { twitterSite: "@example" },
  });
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.twitter.site, "@example");
});

test("getEntryMeta: jsonLd @type derives from content type — post -> Article, page -> WebPage", async () => {
  const deps = await makeDeps([seedPost({ kind: "post" }), seedPost({ id: "page-1", kind: "page", slug: "about" })]);
  const postMeta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  const pageMeta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "page-1" });
  assert.equal(postMeta.jsonLd[0]!["@type"], "Article");
  assert.equal(pageMeta.jsonLd[0]!["@type"], "WebPage");
});

test("getEntryMeta: schemaType override changes the emitted jsonLd @type", async () => {
  const deps = await makeDeps([seedPost({ seoExtJson: JSON.stringify({ schemaType: "NewsArticle" }) })]);
  const meta = await getEntryMeta(deps, { workspaceId: WORKSPACE, entryId: "post-1" });
  assert.equal(meta.jsonLd[0]!["@type"], "NewsArticle");
});
