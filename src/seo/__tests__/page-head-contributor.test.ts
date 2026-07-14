import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPostRepo } from "../../features/post";
import type { PostRecord } from "../../features/post/post";
import { InMemorySettingsRepo } from "../../features/settings/repo.memory";
import { InMemoryAssetRenditionRepo, InMemoryMediaRepo, InMemoryTransformDefinitionRepo } from "../../media";
import type { HeadElement, PageHeadContext } from "../../server/http/site/page-head";
import { ensureSeoSettingDefinitions } from "../settings";
import { createSeoPageHeadHook } from "../page-head-contributor";

/**
 * @file T030 — failing-first unit certification of `seoPageHeadHook`
 * (ADR-PIPE-008 Decision, C-003; behavior.spec.md §2.1): maps `SeoMeta` into
 * `HeadElement[]` per the fixed priority bands; `page`->`WebPage`,
 * `post`->`Article`; `schemaType` override changes `@type`; ancestor chain ->
 * `BreadcrumbList`; never throws for a normal case.
 */

const WORKSPACE = "workspace-1";
const clock = { nowIso: () => "2026-07-13T00:00:00.000Z" };
let idCounter = 0;
const ids = { newId: () => `head-contrib-id-${++idCounter}` };
const alwaysAllow = async () => ({ allowed: true, reason: "matched" });

function seedPost(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "post-1",
    workspaceId: WORKSPACE,
    title: "Hello World",
    slug: "hello-world",
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Body text." }] }] },
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
    media: {
      mediaRepo: new InMemoryMediaRepo([]),
      assetRenditionRepo: new InMemoryAssetRenditionRepo([]),
      transformDefinitionRepo: new InMemoryTransformDefinitionRepo([]),
    },
  };
}

function baseCtx(entryId: string): PageHeadContext {
  return {
    workspaceId: WORKSPACE,
    route: `/${entryId}`,
    canonicalUrl: `/${entryId}`,
    siteTitle: "Example Site",
    entry: {
      id: entryId,
      type: "post",
      slug: entryId,
      title: "Hello World",
      status: "published",
      updatedAt: "2026-07-13T00:00:00.000Z",
      ext: {},
    },
  };
}

test("seoPageHeadHook: maps SeoMeta into HeadElement[] per the fixed priority bands", async () => {
  const deps = await makeDeps([seedPost()]);
  const hook = createSeoPageHeadHook(deps);
  const elements = await hook.handle(baseCtx("post-1"));

  const byKindName = (kind: string, discriminator?: string) =>
    elements.find((e) => e.kind === kind && (!discriminator || (e as never as Record<string, unknown>).name === discriminator || (e as never as Record<string, unknown>).rel === discriminator));

  const title = elements.find((e) => e.kind === "title");
  assert.ok(title);
  assert.equal(title!.priority, 100);

  const description = byKindName("meta", "description");
  assert.ok(description);
  assert.equal(description!.priority, 110);

  const canonical = byKindName("link", "canonical");
  assert.ok(canonical);
  assert.equal(canonical!.priority, 120);

  const robots = byKindName("meta", "robots");
  assert.ok(robots);
  assert.equal(robots!.priority, 130);

  const og = elements.filter((e) => e.kind === "og");
  assert.ok(og.length > 0);
  assert.ok(og.every((e) => e.priority >= 140 && e.priority <= 149));

  const twitter = elements.filter((e) => e.kind === "meta" && (e as { name: string }).name.startsWith("twitter:"));
  assert.ok(twitter.length > 0);
  assert.ok(twitter.every((e) => e.priority >= 150 && e.priority <= 159));

  const jsonld = elements.filter((e) => e.kind === "jsonld");
  assert.ok(jsonld.length > 0);
  assert.ok(jsonld.every((e) => e.priority === 900));
});

test("seoPageHeadHook: a post-kind entry with no schemaType override emits @type: Article (AC-13)", async () => {
  const deps = await makeDeps([seedPost({ kind: "post" })]);
  const hook = createSeoPageHeadHook(deps);
  const elements = await hook.handle(baseCtx("post-1"));
  const jsonld = elements.find((e) => e.kind === "jsonld") as Extract<HeadElement, { kind: "jsonld" }>;
  assert.equal(jsonld.data["@type"], "Article");
});

test("seoPageHeadHook: a page-kind entry with no schemaType override emits @type: WebPage", async () => {
  const deps = await makeDeps([seedPost({ id: "page-1", kind: "page", slug: "about" })]);
  const hook = createSeoPageHeadHook(deps);
  const elements = await hook.handle(baseCtx("page-1"));
  const jsonld = elements.find((e) => e.kind === "jsonld") as Extract<HeadElement, { kind: "jsonld" }>;
  assert.equal(jsonld.data["@type"], "WebPage");
});

test("seoPageHeadHook: a schemaType override changes the emitted @type (AC-14)", async () => {
  const deps = await makeDeps([seedPost({ seoExtJson: JSON.stringify({ schemaType: "NewsArticle" }) })]);
  const hook = createSeoPageHeadHook(deps);
  const elements = await hook.handle(baseCtx("post-1"));
  const jsonld = elements.find((e) => e.kind === "jsonld") as Extract<HeadElement, { kind: "jsonld" }>;
  assert.equal(jsonld.data["@type"], "NewsArticle");
});

test("seoPageHeadHook: an ancestor chain in context is included as a BreadcrumbList", async () => {
  const deps = await makeDeps([seedPost()]);
  const hook = createSeoPageHeadHook(deps);
  const ctx = baseCtx("post-1");
  ctx.entry!.ancestors = [{ title: "Home", url: "/" }, { title: "Blog", url: "/blog" }];

  const elements = await hook.handle(ctx);
  const jsonldEntries = elements.filter((e) => e.kind === "jsonld") as Array<Extract<HeadElement, { kind: "jsonld" }>>;
  const breadcrumb = jsonldEntries.find((e) => e.data["@type"] === "BreadcrumbList");
  assert.ok(breadcrumb);
});

test("seoPageHeadHook: never throws for a normal case", async () => {
  const deps = await makeDeps([seedPost()]);
  const hook = createSeoPageHeadHook(deps);
  await assert.doesNotReject(() => hook.handle(baseCtx("post-1")));
});

test("seoPageHeadHook: a home/entry-less context still emits site-level tags", async () => {
  const deps = await makeDeps([seedPost()]);
  const hook = createSeoPageHeadHook(deps);
  const elements = await hook.handle({
    workspaceId: WORKSPACE,
    route: "/",
    canonicalUrl: "/",
    siteTitle: "Example Site",
  });
  assert.ok(elements.some((e) => e.kind === "title"));
});
