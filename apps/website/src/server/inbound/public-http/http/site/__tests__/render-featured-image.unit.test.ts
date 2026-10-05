import assert from "node:assert/strict";
import test from "node:test";

import { buildPostRecord } from "#src/features/post/__tests__/post-record.fixture";

import { runHandlebarsRender } from "../handlebars-render.js";
import { runLiquidRender } from "../liquid-render.js";
import { buildTemplateRenderData, type MediaAssetRenderMeta, type SiteRenderContext } from "../render.js";

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

function post(overrides: Partial<Parameters<typeof buildPostRecord>[0]> = {}) {
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
