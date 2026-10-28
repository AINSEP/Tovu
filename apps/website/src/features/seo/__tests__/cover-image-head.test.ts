/** @file featfallback public head contract: real SEO producer, injected owner ports, no module mocks. */
import assert from "node:assert/strict";
import test from "node:test";
import type { GetEntryMetaDeps, HeadElement, PageHeadContext, SeoSettings } from "@jini-ai/cms/seo";
import { InMemoryMediaRepo, type MediaRecord } from "../../media/index.js";
import { InMemoryMediaContentTypeStore } from "../../media/content-type-store.js";
import { buildPostRecord } from "../../post/__tests__/post-record.fixture.js";
import { createSeoFeaturedImagePort } from "../index.js";
import { createSeoPageHeadHook } from "../page-head-contributor.js";

const bodyJson = { type: "doc", content: [{ type: "media", attrs: { assetId: "body", alt: "Body alt" } }] };
const image = (id: string, status: "active" | "trashed" = "active"): MediaRecord => ({
  id, workspaceId: "workspace-1", title: id, slug: id, alt: "", caption: "", credit: "",
  source: { sha256: id.padEnd(64, "a") }, status, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
  version: 1, width: 1400, height: 800, cssClass: null, htmlAttributes: null,
});

async function head(post = buildPostRecord({ bodyJson }), optional: { defaultOgImage?: string; trashBody?: boolean } = {}) {
  const mediaRepo = new InMemoryMediaRepo({}, { initialRows: [image("body", optional.trashBody ? "trashed" : "active"), image("featured"), image("video")] });
  const mediaContentTypeStore = new InMemoryMediaContentTypeStore();
  await mediaContentTypeStore.set({ workspaceId: post.workspaceId, sha256: image("video").source.sha256, contentType: "video/mp4" });
  const before = structuredClone(post);
  const deps: GetEntryMetaDeps = {
    postRepo: { findById: async () => post, isTrashed: () => false, extractPlainText: ({ html }) => html.replace(/<[^>]*>/g, " ") },
    settings: {
      getSeoSettings: async () => ({ titleTemplate: "%s", defaultRobots: { noindex: false, nofollow: false }, sitemapEnabled: true, robotsRules: [], defaultOgImage: optional.defaultOgImage }) as SeoSettings,
      isDefaultRobotsNoindexExplicitlySet: async () => false,
    },
    media: { featuredImage: createSeoFeaturedImagePort({ deps: { mediaRepo, mediaContentTypeStore } }), transformDefinitionRepo: {
      listByName: async ({ name, workspaceId }) => [{ id: name, workspaceId, name, version: 2, params: { format: "jpeg", width: 1200, height: 630, fit: "cover" }, owner: "core", createdAt: "2026-10-01T00:00:00.000Z" }],
    } },
    originRegistry: { canonicalOrigin: async () => ({ scheme: "https", host: "site.example", source: "workspace-setting", verifiedAt: "2026-10-01T00:00:00.000Z" }), isAllowedRedirectTarget: async () => true, isAllowedEgressTarget: async () => true },
    shareImageTransform: "og", runtimeMode: "prod",
    urls: { postPublicPath: ({ slug }) => `/${slug}`, urlFor: async () => ({ canonicalUrl: `/${post.slug}` }) },
    liveness: { isScheduledAt: () => false, isLiveAt: () => true, postDisplayDateIso: ({ post }) => post.updatedAt },
    clock: { nowIso: () => "2026-10-10T00:00:00.000Z" },
  };
  const ctx: PageHeadContext = { workspaceId: post.workspaceId, route: "post", siteTitle: "Site", canonicalUrl: `https://site.example/${post.slug}`, entry: { id: post.id, type: post.kind, title: post.title, slug: post.slug, status: post.status, updatedAt: post.updatedAt, ext: {} } };
  const elements = await createSeoPageHeadHook({ deps, rootSlug: "root", siteTitle: async () => undefined }).handle(ctx);
  assert.deepEqual(post, before, "the head projection must never alter the stored row");
  return elements;
}

const og = (elements: HeadElement[]) => elements.find((el) => el.kind === "og" && el.property === "og:image");
const twitter = (elements: HeadElement[]) => elements.find((el) => el.kind === "meta" && el.name === "twitter:image");
const url = (el: HeadElement | undefined) => el && "content" in el ? el.content : undefined;
const jsonImage = (elements: HeadElement[]) => elements.find((el) => el.kind === "jsonld" && el.data["@type"] !== "BreadcrumbList");

test("featfallback: body cover reaches OG/Twitter/JSON-LD, featured wins, empty posts emit no broken image", async () => {
  for (const featuredMediaId of [null, "featured"] as const) {
    const elements = await head(buildPostRecord({ bodyJson, featuredMediaId }));
    const selected = featuredMediaId ?? "body";
    const expected = `https://site.example/m/${selected}/og.v2/image.jpg?v=${selected.padEnd(12, "a")}`;
    assert.equal(url(og(elements)), expected);
    assert.equal(url(twitter(elements)), expected);
    const json = jsonImage(elements);
    assert.ok(json?.kind === "jsonld");
    assert.equal(json.data.image, expected);
  }
  const none = await head(buildPostRecord());
  assert.equal(og(none), undefined);
  assert.equal(twitter(none), undefined);
  const json = jsonImage(none);
  assert.ok(json?.kind === "jsonld");
  assert.equal(json.data.image, undefined);
});

test("featfallback: HTML media and img use the library, overrides win and body cover outranks site default", async () => {
  for (const bodyHtml of ["<img src='/m/body/public.v1/image.jpg' alt='HTML alt'>", `<figure data-embed-config='{"type":"media","id":"body"}'></figure>`]) {
    const elements = await head(buildPostRecord({ bodyFormat: "html", bodyJson: {}, bodyHtml }), { defaultOgImage: "https://site.example/default.jpg" });
    assert.equal(url(og(elements)), "https://site.example/m/body/og.v2/image.jpg?v=bodyaaaaaaaa");
    assert.equal(url(twitter(elements)), "https://site.example/m/body/og.v2/image.jpg?v=bodyaaaaaaaa");
  }
  const overridden = await head(buildPostRecord({ bodyJson, seoExtJson: JSON.stringify({ ogImage: "https://site.example/override.jpg", twitterImage: "https://site.example/twitter.jpg" }) }));
  assert.equal(url(og(overridden)), "https://site.example/override.jpg");
  assert.equal(url(twitter(overridden)), "https://site.example/twitter.jpg");
  const custom = await head(buildPostRecord({ bodyJson, seoExtJson: JSON.stringify({ schemaType: "BlogPosting" }) }));
  const json = jsonImage(custom);
  assert.ok(json?.kind === "jsonld");
  assert.equal(json.data["@type"], "BlogPosting");
  assert.equal(json.data.image, "https://site.example/m/body/og.v2/image.jpg?v=bodyaaaaaaaa");
});

test("featfallback: skip video/trashed media; absolute HTTPS external body URLs reach OG and Twitter but not JSON-LD", async () => {
  const elements = await head(buildPostRecord({ bodyJson: { type: "doc", content: [{ type: "media", attrs: { assetId: "video" } }, ...bodyJson.content] } }));
  assert.equal(url(og(elements)), "https://site.example/m/body/og.v2/image.jpg?v=bodyaaaaaaaa");
  assert.equal(og(await head(buildPostRecord({ bodyJson }), { trashBody: true })), undefined);
  for (const src of ["https://external.example/a.jpg", "http://external.example/a.jpg", "//external.example/a.jpg"]) {
    const external = await head(buildPostRecord({ bodyJson: { type: "doc", content: [{ type: "image", attrs: { src } }] } }));
    assert.equal(url(og(external)), src.startsWith("https:") ? src : undefined);
    // Jini 391560e8 deliberately reuses the resolved OG image for X without a Twitter override.
    assert.equal(url(twitter(external)), src.startsWith("https:") ? src : undefined);
    const json = jsonImage(external);
    assert.ok(json?.kind === "jsonld");
    assert.equal(json.data.image, undefined, "an external body URL is not a schema image fallback");
  }
});
