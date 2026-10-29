import type { JsonObject } from "@jini-ai/core/primitives";
import assert from "node:assert/strict";
import test from "node:test";

import { buildPostRecord } from "#src/features/post/__tests__/post-record.fixture";

import { runHandlebarsRender } from "../handlebars-render.js";
import { runLiquidRender } from "../liquid-render.js";
import { buildTemplateRenderData, renderHtmlPageBody, renderSite, type MediaAssetRenderMeta, type SiteRenderContext } from "../render.js";

/**
 * @file A post's featured image as theme data (2026-10-05): `post.featuredImage` (and each
 * `posts[]` row's) is `{ url, alt, width, height }` through the core "public" transform, or `null`
 * when the post has none or the asset/transform does not resolve. Pinned on the shared data
 * contract and through BOTH template tiers, since a tier's own allowlist could otherwise hide it.
 */

const ASSET_ID = "44444444-4444-4444-4444-444444444444";

function meta(overrides: Partial<MediaAssetRenderMeta> = {}): MediaAssetRenderMeta {
  return { width: 1200, height: 630, cssClass: null, htmlAttributes: null, contentType: "image/jpeg", slug: "launch-cover", ...overrides };
}

function post(overrides: Partial<import("#src/features/post/index").PublicPostRecord> = {}) {
  return buildPostRecord({
    id: "post-1",
    workspaceId: "ws-1",
    title: "Launch notes",
    slug: "launch-notes",
    bodyJson: { type: "doc", content: [] },
    status: "published",
    kind: "post",
    updatedAt: "2026-10-05T00:00:00.000Z",
    version: 1,
    seoExtJson: null,
    ...overrides,
  });
}

function context(overrides: Partial<SiteRenderContext> = {}): SiteRenderContext {
  const featured = post({ featuredMediaId: ASSET_ID });
  return {
    siteTitle: "Site",
    route: "post",
    posts: [featured],
    post: featured,
    products: [],
    themeName: "test",
    widgetRegions: {},
    widgetInlineResolved: new Map(),
    mediaAssetMetadata: new Map([[ASSET_ID, meta()]]),
    mediaTransformVersions: new Map([["public", 3]]),
    assignedTerms: [],
    ...overrides,
  };
}

const EXPECTED = { url: "/m/launch-cover/public.v3/image.jpg", alt: "Launch notes", width: 1200, height: 630 };

// Guards featuredImageView's canonical versioned URL for hero and post-card template data.
test("featured images and post cards use the current source hash in their public URLs", () => {
  const data = buildTemplateRenderData(context({ mediaAssetMetadata: new Map([[ASSET_ID, meta({ sha256: "0123456789abcdef".repeat(4) })]]) }));
  const expected = { ...EXPECTED, url: "/m/launch-cover/public.v3/image.jpg?v=0123456789ab" };
  assert.deepEqual((data.post as Record<string, unknown>).featuredImage, expected);
  assert.deepEqual((data.posts as Array<Record<string, unknown>>)[0]!.featuredImage, expected);
});

test("featfallback: body image supplies detail/list data, both template loops, and the generic list", async () => {
  const bodyOnly = post({ bodyJson: { type: "doc", content: [{ type: "image", attrs: { assetId: ASSET_ID, alt: "Body alt" } }] } });
  const ctx = context({ post: bodyOnly, posts: [bodyOnly] });
  const data = buildTemplateRenderData(ctx);
  assert.deepEqual((data.post as Record<string, unknown>).featuredImage, { ...EXPECTED, alt: "Body alt" });
  assert.deepEqual((data.posts as Array<Record<string, unknown>>)[0]?.featuredImage, { ...EXPECTED, alt: "Body alt" });
  const liquid = "{% for p in posts %}{% if p.featuredImage %}{{ p.featuredImage.url }}:{{ p.featuredImage.alt }}{% endif %}{% endfor %}";
  const handlebars = "{{#each posts}}{{#if featuredImage}}{{featuredImage.url}}:{{featuredImage.alt}}{{/if}}{{/each}}";
  assert.deepEqual(runLiquidRender({ workerData: { source: liquid, ctx } }), { ok: true, html: `${EXPECTED.url}:Body alt` });
  assert.deepEqual(runHandlebarsRender({ workerData: { source: handlebars, ctx } }), { ok: true, html: `${EXPECTED.url}:Body alt` });
  const html = await renderSite({ theme: null, route: "home", siteTitle: "Site", posts: [bodyOnly], mediaAssetMetadata: ctx.mediaAssetMetadata, mediaTransformVersions: ctx.mediaTransformVersions });
  assert.ok(html.includes('<img src="/m/launch-cover/public.v3/image.jpg" alt="Body alt" width="1200" height="630" decoding="async" loading="lazy">'));
});

test("featfallback: HTML library image supplies list data; featured overrides body and no image produces no tag", async () => {
  const htmlPost = post({ bodyFormat: "html", bodyJson: {}, bodyHtml: `<img src="/m/${ASSET_ID}/public.v1/image.jpg" alt="HTML alt">` });
  const data = buildTemplateRenderData(context({ post: htmlPost, posts: [htmlPost] }));
  assert.deepEqual((data.posts as Array<Record<string, unknown>>)[0]?.featuredImage, { ...EXPECTED, alt: "HTML alt" });
  const explicit = { ...htmlPost, featuredMediaId: ASSET_ID };
  const featured = buildTemplateRenderData(context({ post: explicit, posts: [explicit] }));
  assert.deepEqual((featured.post as Record<string, unknown>).featuredImage, EXPECTED);
  const none = await renderSite({ theme: null, route: "home", siteTitle: "Site", posts: [post()] });
  assert.doesNotMatch(none, /<img/);
});

test("buildTemplateRenderData: post.featuredImage and each posts[] row carry the public-transform URL, alt and size", () => {
  const data = buildTemplateRenderData(context());
  assert.deepEqual((data.post as Record<string, unknown>).featuredImage, EXPECTED);
  assert.deepEqual((data.posts as Array<Record<string, unknown>>)[0]?.featuredImage, EXPECTED);
});

test("buildTemplateRenderData: an asset without a usable slug is keyed by its id", () => {
  const data = buildTemplateRenderData(context({ mediaAssetMetadata: new Map([[ASSET_ID, meta({ slug: null })]]) }));
  assert.equal(((data.post as Record<string, unknown>).featuredImage as { url: string }).url, `/m/${ASSET_ID}/public.v3/image.jpg`);
});

test("buildTemplateRenderData: featuredImage is null when the post has none, the asset is unresolved, or the transform is unregistered", () => {
  const none = post();
  const cases: Array<[string, Partial<SiteRenderContext>]> = [
    ["no featured image", { post: none, posts: [none] }],
    ["asset not resolved (trashed/deleted)", { mediaAssetMetadata: new Map() }],
    ["public transform not registered", { mediaTransformVersions: new Map() }],
  ];
  for (const [label, overrides] of cases) {
    const data = buildTemplateRenderData(context(overrides));
    assert.equal((data.post as Record<string, unknown>).featuredImage, null, label);
    assert.equal((data.posts as Array<Record<string, unknown>>)[0]?.featuredImage, null, label);
  }
});

test("a Liquid theme renders the featured image, and nothing when there is none", () => {
  const source = '{% if post.featuredImage %}<img src="{{ post.featuredImage.url }}" alt="{{ post.featuredImage.alt }}" width="{{ post.featuredImage.width }}">{% endif %}';
  assert.deepEqual(runLiquidRender({ workerData: { source, ctx: context() } }), {
    ok: true,
    html: '<img src="/m/launch-cover/public.v3/image.jpg" alt="Launch notes" width="1200">',
  });
  const none = post();
  assert.deepEqual(runLiquidRender({ workerData: { source, ctx: context({ post: none, posts: [none] }) } }), { ok: true, html: "" });
});

test("a Handlebars theme renders the featured image, and nothing when there is none", () => {
  const source = '{{#if post.featuredImage}}<img src="{{post.featuredImage.url}}" alt="{{post.featuredImage.alt}}" width="{{post.featuredImage.width}}">{{/if}}';
  assert.deepEqual(runHandlebarsRender({ workerData: { source, ctx: context() } }), {
    ok: true,
    html: '<img src="/m/launch-cover/public.v3/image.jpg" alt="Launch notes" width="1200">',
  });
  const none = post();
  assert.deepEqual(runHandlebarsRender({ workerData: { source, ctx: context({ post: none, posts: [none] }) } }), { ok: true, html: "" });
});

test("a theme's posts loop reads each row's featured image", () => {
  const liquid = "{% for p in posts %}{% if p.featuredImage %}{{ p.featuredImage.url }}{% endif %}{% endfor %}";
  assert.deepEqual(runLiquidRender({ workerData: { source: liquid, ctx: context() } }), { ok: true, html: EXPECTED.url });
  const handlebars = "{{#each posts}}{{#if featuredImage}}{{featuredImage.url}}{{/if}}{{/each}}";
  assert.deepEqual(runHandlebarsRender({ workerData: { source: handlebars, ctx: context() } }), { ok: true, html: EXPECTED.url });
});

test("postpolish: generic and static/public-preview render projections agree, scoped to the current post", async () => {
  const bodyJson: { type: string; content: (JsonObject & { attrs?: JsonObject })[] } = { type: "doc", content: [
    { type: "image", attrs: { assetId: ASSET_ID, transformName: "public", alt: "First" } },
    { type: "paragraph", content: [{ type: "text", text: "Caption" }] },
    { type: "image", attrs: { assetId: ASSET_ID, transformName: "public", alt: "Second" } },
  ] };
  const current = post({ bodyJson });
  const source = `<main data-embed-config='{"type":"content","id":"post-1","header":false}'></main>`;
  const savedProps = { title: current.title, bodyJson, mediaAssetMetadata: { [ASSET_ID]: { ...meta() } }, mediaTransformVersions: { public: 3 } };
  const resolved = new Map([["content" as const, new Map([[current.id, { componentId: "post-content", props: savedProps }]])]]);
  for (const fields of [{}, { ext: { "post-presentation": { hideCoverImageInBody: false } } }, { featuredMediaId: ASSET_ID }]) {
    const variant = { ...current, ...fields };
    const staticHtml = renderHtmlPageBody(source, resolved, { postPresentation: variant });
    const genericHtml = await renderSite({ theme: null, route: "post", siteTitle: "Site", posts: [], post: variant,
      mediaAssetMetadata: context().mediaAssetMetadata, mediaTransformVersions: context().mediaTransformVersions });
    const expected = fields.ext || fields.featuredMediaId ? 2 : 1;
    assert.equal((staticHtml.match(/<img /g) ?? []).length, expected);
    assert.equal((genericHtml.match(/<img /g) ?? []).length, expected);
    assert.ok(staticHtml.includes('alt="Second"') && genericHtml.includes('alt="Second"'));
    assert.ok(staticHtml.includes("Caption") && genericHtml.includes("Caption"));
  }
  const pending = structuredClone(bodyJson);
  pending.content[0].attrs!.alt = "Pending cover";
  const pendingResolved = new Map([["content" as const, new Map([[current.id, { componentId: "post-content", props: { ...savedProps, bodyJson: pending } }]])]]);
  assert.doesNotMatch(renderHtmlPageBody(source, pendingResolved, { postPresentation: current }), /Pending cover/);
  assert.equal((renderHtmlPageBody(source, resolved, { postPresentation: { ...current, id: "other" } }).match(/<img /g) ?? []).length, 2);
  assert.equal(bodyJson.content[0].attrs!.alt, "First");
  assert.equal(pending.content[0].attrs!.alt, "Pending cover");
});
