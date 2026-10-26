import assert from "node:assert/strict";
import test from "node:test";

import type { JsonObject } from "@jini-ai/core/primitives";
import type { WidgetRenderIR } from "@jini-ai/cms/widgets";
import type { ResolveHtmlPageEmbedsResult } from "@jini-ai/cms/widgets/html";
import { buildPostRecord } from "#src/features/post/__tests__/post-record.fixture";
import { renderDocNode, renderHtmlPageBody, renderWidgetIr, type MediaAssetRenderMeta } from "../render.js";

/**
 * @file Characterization pins for render.ts's URL-image guard, the `image`/`media`/`widgetEmbed` doc
 * nodes, `renderHtmlPageBody`'s per-marker resolution and the `media-image` widget IR. Every
 * expected string is the renderer's exact output, so a refactor that changes one byte fails here.
 */

const IMG = (attrs: JsonObject): string => renderDocNode({ type: "image", attrs });
const VERSIONS = new Map([["public", 3]]);
const meta = (fields: Partial<MediaAssetRenderMeta>): MediaAssetRenderMeta =>
  ({ width: null, height: null, cssClass: null, htmlAttributes: null, contentType: null, slug: null, ...fields });
const MEDIA = (attrs: JsonObject | undefined, metadata: ReadonlyMap<string, MediaAssetRenderMeta> = new Map()): string =>
  renderDocNode(attrs === undefined ? { type: "media" } : { type: "media", attrs }, undefined, VERSIONS, metadata);
const WIDGET_IR: WidgetRenderIR = { componentId: "text", props: { body: "Widget" } };
const labelled = (body: string): WidgetRenderIR => ({ componentId: "text", props: { body } });
const EMBED = (attrs?: JsonObject): string =>
  renderDocNode({ type: "widgetEmbed", ...(attrs ? { attrs } : {}) }, new Map([["p1", WIDGET_IR]]));
const marker = (config: JsonObject): string => `<div data-embed-config='${JSON.stringify(config)}'></div>`;
const byType = (entries: Array<[string, string, WidgetRenderIR]>): ResolveHtmlPageEmbedsResult => {
  const result = new Map<string, Map<string, WidgetRenderIR>>();
  for (const [type, key, ir] of entries) result.set(type, (result.get(type) ?? new Map()).set(key, ir));
  return result;
};
const postContent = (bodyJson: JsonObject): WidgetRenderIR => ({ componentId: "post-content", props: { title: "T", bodyJson, updatedAt: "" } });
const PARA = (text: string): JsonObject => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
// A post-content IR whose first body image is a known image asset: projecting it for the presented
// post moves that image out of the body (it becomes the cover), so projection is visible in the output.
const coverBody: JsonObject = { type: "doc", content: [{ type: "image", attrs: { assetId: "a1", transformName: "public", alt: "Cover" } }, { type: "paragraph", content: [{ type: "text", text: "After" }] }] };
const coverIr: WidgetRenderIR = { componentId: "post-content", props: { title: "T", updatedAt: "", mediaTransformVersions: { public: 3 }, mediaAssetMetadata: { a1: { width: 10, height: 20, cssClass: null, htmlAttributes: null, contentType: "image/png", slug: null } }, bodyJson: coverBody } };
const author = { id: "p-1", slug: "first", author: "Ada", showAuthor: true };
const MEDIA_IR = (props: JsonObject): string => renderWidgetIr({ componentId: "media-image", props });

test("image src: a non-string src renders the image placeholder", () => {
  assert.equal(IMG({ src: 7, alt: "Seven" }), "<figure class=\"media-ph\" style=\"aspect-ratio:16 / 9\"><span class=\"media-ph__label\">Seven</span></figure>");
});
test("image src: a root-relative path is trimmed and kept", () => {
  assert.equal(IMG({ src: "  /img/a.png  ", alt: "A" }), "<img src=\"/img/a.png\" alt=\"A\" loading=\"lazy\" />");
});
test("image src: a page-relative path is kept", () => {
  assert.equal(IMG({ src: "img/a.png" }), "<img src=\"img/a.png\" alt=\"\" loading=\"lazy\" />");
});
test("image src: an empty src renders the placeholder", () => {
  assert.equal(IMG({ src: "   " }), "<figure class=\"media-ph\" style=\"aspect-ratio:16 / 9\"><span class=\"media-ph__label\">Image</span></figure>");
});
test("image src: whitespace inside a relative src renders the placeholder", () => {
  assert.equal(IMG({ src: "/a b.png" }), "<figure class=\"media-ph\" style=\"aspect-ratio:16 / 9\"><span class=\"media-ph__label\">Image</span></figure>");
});
test("image src: a backslash in a relative src renders the placeholder", () => {
  assert.equal(IMG({ src: "/a\\b.png" }), "<figure class=\"media-ph\" style=\"aspect-ratio:16 / 9\"><span class=\"media-ph__label\">Image</span></figure>");
});
test("image src: a non-http scheme renders the placeholder", () => {
  assert.equal(IMG({ src: "javascript:alert(1)" }), "<figure class=\"media-ph\" style=\"aspect-ratio:16 / 9\"><span class=\"media-ph__label\">Image</span></figure>");
});
test("image src: a protocol-relative src renders the placeholder", () => {
  assert.equal(IMG({ src: "//evil.example/a.png" }), "<figure class=\"media-ph\" style=\"aspect-ratio:16 / 9\"><span class=\"media-ph__label\">Image</span></figure>");
});
test("image src: a relative src the URL parser resolves off-site renders the placeholder", () => {
  assert.equal(IMG({ src: "\u0001//evil.example/a.png" }), "<figure class=\"media-ph\" style=\"aspect-ratio:16 / 9\"><span class=\"media-ph__label\">Image</span></figure>");
});
test("image src: an absolute URL the URL parser rejects renders the placeholder", () => {
  assert.equal(IMG({ src: "http://[bad" }), "<figure class=\"media-ph\" style=\"aspect-ratio:16 / 9\"><span class=\"media-ph__label\">Image</span></figure>");
});
test("image src: the admin original-media route renders the placeholder", () => {
  assert.equal(IMG({ src: "https://cdn.example/workspaces/w1/media/a1/original" }), "<figure class=\"media-ph\" style=\"aspect-ratio:16 / 9\"><span class=\"media-ph__label\">Image</span></figure>");
});
test("image src: an absolute URL with a username renders the placeholder", () => {
  assert.equal(IMG({ src: "https://user@cdn.example/a.png" }), "<figure class=\"media-ph\" style=\"aspect-ratio:16 / 9\"><span class=\"media-ph__label\">Image</span></figure>");
});
test("image src: an absolute URL with only a password renders the placeholder", () => {
  assert.equal(IMG({ src: "https://:pw@cdn.example/a.png" }), "<figure class=\"media-ph\" style=\"aspect-ratio:16 / 9\"><span class=\"media-ph__label\">Image</span></figure>");
});
test("image src: a plain https URL is kept", () => {
  assert.equal(IMG({ src: "https://cdn.example/a.png?x=1&y=2", alt: "Q" }), "<img src=\"https://cdn.example/a.png?x=1&amp;y=2\" alt=\"Q\" loading=\"lazy\" />");
});
test("image node: no attrs renders the default placeholder label", () => {
  assert.equal(renderDocNode({ type: "image" }), "<figure class=\"media-ph\" style=\"aspect-ratio:16 / 9\"><span class=\"media-ph__label\">Image</span></figure>");
});
test("image node: an unresolvable managed asset never falls back to its src", () => {
  assert.equal(IMG({ assetId: "asset-1", transformName: "public", src: "/img/a.png", alt: "Managed" }), "<figure class=\"media-ph\" style=\"aspect-ratio:16 / 9\"><span class=\"media-ph__label\">Managed</span></figure>");
});
test("image node: string and number title/width/height are emitted, other types are not", () => {
  assert.equal(IMG({ src: "/a.png", title: "T", width: 640, height: true }), "<img src=\"/a.png\" alt=\"\" title=\"T\" width=\"640\" loading=\"lazy\" />");
});
test("image node: a resolvable managed asset renders the ref image", () => {
  assert.equal(renderDocNode({ type: "image", attrs: { assetId: "asset-1", transformName: "public" } }, undefined, VERSIONS), "<img src=\"/m/asset-1/public.v3/image.jpg\" alt=\"\" loading=\"lazy\">");
});
test("media node: no attrs renders the media placeholder", () => {
  assert.equal(MEDIA(undefined), "<figure class=\"media-ph\" style=\"aspect-ratio:16 / 9\"><span class=\"media-ph__label\">Media</span></figure>");
});
test("media node: a non-string assetId renders the placeholder with its alt", () => {
  assert.equal(MEDIA({ assetId: 5, alt: "Five" }), "<figure class=\"media-ph\" style=\"aspect-ratio:16 / 9\"><span class=\"media-ph__label\">Five</span></figure>");
});
test("media node: an implausible assetId renders the placeholder", () => {
  assert.equal(MEDIA({ assetId: "a/b" }), "<figure class=\"media-ph\" style=\"aspect-ratio:16 / 9\"><span class=\"media-ph__label\">Media</span></figure>");
});
test("media node: a video asset renders a video tag with asset style", () => {
  assert.equal(MEDIA({ assetId: "v1", alt: "Clip" }, new Map([["v1", meta({ contentType: "video/mp4", width: 640, height: 360, cssClass: "asset-c", htmlAttributes: 'data-a="1"', slug: "clip" })]])), "<video src=\"/m/clip/original.mp4\" controls width=\"640\" height=\"360\" class=\"asset-c\" data-a=\"1\">Clip</video>");
});
test("media node: node cssClass and htmlAttributes override the asset's on video", () => {
  assert.equal(MEDIA({ assetId: "v1", cssClass: "node-c", htmlAttributes: 'data-n="2"' }, new Map([["v1", meta({ contentType: "video/webm", cssClass: "asset-c", htmlAttributes: 'data-a="1"' })]])), "<video src=\"/m/v1/original.webm\" controls class=\"node-c\" data-n=\"2\">Your browser does not support the video tag.</video>");
});
test("media node: an audio asset renders an audio tag without dimensions", () => {
  assert.equal(MEDIA({ assetId: "s1", alt: "Song" }, new Map([["s1", meta({ contentType: "audio/mpeg", width: 1, height: 2, cssClass: "asset-c", slug: "song" })]])), "<audio src=\"/m/song/original.mp3\" controls class=\"asset-c\">Song</audio>");
});
test("media node: node style overrides the asset's on audio", () => {
  assert.equal(MEDIA({ assetId: "s1", cssClass: "node-c", htmlAttributes: 'data-n="2"' }, new Map([["s1", meta({ contentType: "audio/ogg", cssClass: "asset-c", htmlAttributes: 'data-a="1"' })]])), "<audio src=\"/m/s1/original.ogg\" controls class=\"node-c\" data-n=\"2\">Your browser does not support the audio tag.</audio>");
});
test("media node: an image asset renders the ref image with node style", () => {
  assert.equal(MEDIA({ assetId: "i1", transformName: "public", alt: "Pic", cssClass: "node-c" }, new Map([["i1", meta({ contentType: "image/png", width: 10, height: 20 })]])), "<img src=\"/m/i1/public.v3/image.jpg\" alt=\"Pic\" width=\"10\" height=\"20\" class=\"node-c\" loading=\"lazy\">");
});
test("media node: an asset missing from metadata still renders as a ref image", () => {
  assert.equal(MEDIA({ assetId: "i1", transformName: "public" }), "<img src=\"/m/i1/public.v3/image.jpg\" alt=\"\" loading=\"lazy\">");
});
test("media node: an image whose transform cannot resolve renders the placeholder", () => {
  assert.equal(MEDIA({ assetId: "i1", transformName: "missing", alt: "Gone" }), "<figure class=\"media-ph\" style=\"aspect-ratio:16 / 9\"><span class=\"media-ph__label\">Gone</span></figure>");
});
test("widgetEmbed: no attrs renders the widget placeholder", () => {
  assert.equal(EMBED(), "<div class=\"widget widget-placeholder\" aria-hidden=\"true\"></div>");
});
test("widgetEmbed: a non-string placementId renders the widget placeholder", () => {
  assert.equal(EMBED({ placementId: 3 }), "<div class=\"widget widget-placeholder\" aria-hidden=\"true\"></div>");
});
test("widgetEmbed: a resolved bare node renders the widget alone", () => {
  assert.equal(EMBED({ placementId: "p1" }), "<div class=\"widget widget-text\">Widget</div>");
});
test("widgetEmbed: empty cssClass and htmlAttributes still render the widget alone", () => {
  assert.equal(EMBED({ placementId: "p1", cssClass: "", htmlAttributes: "" }), "<div class=\"widget widget-text\">Widget</div>");
});
test("widgetEmbed: cssClass alone wraps the widget", () => {
  assert.equal(EMBED({ placementId: "p1", cssClass: "hero" }), "<div class=\"widget-embed hero\"><div class=\"widget widget-text\">Widget</div></div>");
});
test("widgetEmbed: htmlAttributes alone wraps the widget and folds its class", () => {
  assert.equal(EMBED({ placementId: "p1", htmlAttributes: 'class="x" data-k="v"' }), "<div class=\"widget-embed x\" data-k=\"v\"><div class=\"widget widget-text\">Widget</div></div>");
});
test("widgetEmbed: cssClass then the htmlAttributes class, with other attributes", () => {
  assert.equal(EMBED({ placementId: "p1", cssClass: "hero", htmlAttributes: 'id="w" class="x"' }), "<div class=\"widget-embed hero x\" id=\"w\"><div class=\"widget widget-text\">Widget</div></div>");
});
test("page body: an unowned marker type is left exactly as authored", () => {
  assert.equal(renderHtmlPageBody(marker({ type: "menu", name: "main" }), undefined), "<div data-embed-config='{\"type\":\"menu\",\"name\":\"main\"}'></div>");
});
test("page body: a content marker naming no entity is left as authored", () => {
  assert.equal(renderHtmlPageBody(marker({ type: "content", header: false }), undefined), "<div data-embed-config='{\"type\":\"content\",\"header\":false}'></div>");
});
test("page body: a post marker naming no entity is left as authored", () => {
  assert.equal(renderHtmlPageBody(marker({ type: "post" }), undefined), "<div data-embed-config='{\"type\":\"post\"}'></div>");
});
test("page body: a content marker with an unresolved id renders the placeholder", () => {
  assert.equal(renderHtmlPageBody(marker({ type: "content", id: "nope" }), undefined), "<div><div class=\"widget widget-placeholder\" aria-hidden=\"true\"></div></div>");
});
test("page body: an unresolved widget renders nothing", () => {
  assert.equal(renderHtmlPageBody(`<p>a</p>${marker({ type: "widget", id: "w9" })}<p>b</p>`, byType([])), "<p>a</p><p>b</p>");
});
test("page body: a widget resolves by id", () => {
  assert.equal(renderHtmlPageBody(marker({ type: "widget", id: "w1" }), byType([["widget", "w1", WIDGET_IR]])), "<div class=\"widget widget-text\">Widget</div>");
});
test("page body: a widget resolves by slug when it has no id", () => {
  assert.equal(renderHtmlPageBody(marker({ type: "widget", slug: "hello" }), byType([["widget", "hello", WIDGET_IR]])), "<div class=\"widget widget-text\">Widget</div>");
});
test("page body: a widget with inline content resolves by its placement key", () => {
  assert.equal(renderHtmlPageBody(marker({ type: "widget", slug: "hello", content: { html: "x" } }), byType([["widget", "placement:0", labelled("Zero")], ["widget", "placement:1", labelled("One")], ["widget", "hello", labelled("Slug")]])), "<div class=\"widget widget-text\">One</div>");
});
test("page body: a media marker with nothing resolved renders the placeholder", () => {
  assert.equal(renderHtmlPageBody(marker({ type: "media", id: "m1" }), undefined), "<div><div class=\"widget widget-placeholder\" aria-hidden=\"true\"></div></div>");
});
test("page body: a contact form marker in html mode renders the html-mode form", () => {
  assert.ok(renderHtmlPageBody(marker({ type: "widget", id: "f1", mode: "html" }), byType([["widget", "f1", { componentId: "contact-form", props: { slug: "contact", fields: [{ id: "email", label: "Email", type: "email", required: true }] } }]])).includes("data-tovu-form=\"contact\""));
});
test("page body: a contact form marker without html mode keeps the builder form", () => {
  assert.ok(renderHtmlPageBody(marker({ type: "widget", id: "f1" }), byType([["widget", "f1", { componentId: "contact-form", props: { slug: "contact", fields: [{ id: "email", label: "Email", type: "email", required: true }] } }]])).includes("class=\"widget tovu-form widget-contact-form\""));
});
test("page body: html mode on a non-form widget changes nothing", () => {
  assert.equal(renderHtmlPageBody(marker({ type: "widget", id: "w1", mode: "html" }), byType([["widget", "w1", WIDGET_IR]])), "<div class=\"widget widget-text\">Widget</div>");
});
test("page body: the current post's content marker (by id) carries its byline", () => {
  assert.equal(renderHtmlPageBody(marker({ type: "content", id: "p-1" }), byType([["content", "p-1", postContent(PARA("Body"))]]), { postAuthor: author }), "<div><div class=\"post-detail-header\"><h1>T</h1><div class=\"post-meta\"><span class=\"post-author\" data-embed-config='{\"type\":\"post-author\"}'></span></div></div><div class=\"post-detail-body\"><p>Body</p></div></div>");
});
test("page body: the current post's content marker (by slug) carries its byline", () => {
  assert.equal(renderHtmlPageBody(marker({ type: "content", slug: "first" }), byType([["content", "first", postContent(PARA("Body"))]]), { postAuthor: author }), "<div><div class=\"post-detail-header\"><h1>T</h1><div class=\"post-meta\"><span class=\"post-author\" data-embed-config='{\"type\":\"post-author\"}'></span></div></div><div class=\"post-detail-body\"><p>Body</p></div></div>");
});
test("page body: another post's content marker gets no byline", () => {
  assert.equal(renderHtmlPageBody(marker({ type: "content", id: "p-2" }), byType([["content", "p-2", postContent(PARA("Body"))]]), { postAuthor: author }), "<div><div class=\"post-detail-header\"><h1>T</h1></div><div class=\"post-detail-body\"><p>Body</p></div></div>");
});
test("page body: a post marker for the current post gets no byline", () => {
  assert.equal(renderHtmlPageBody(marker({ type: "post", id: "p-1" }), byType([["post", "p-1", postContent(PARA("Body"))]]), { postAuthor: author }), "<div><div class=\"post-detail-header\"><h1>T</h1></div><div class=\"post-detail-body\"><p>Body</p></div></div>");
});
test("page body: a content marker resolving to a non post-content IR gets no byline", () => {
  assert.equal(renderHtmlPageBody(marker({ type: "content", id: "p-1" }), byType([["content", "p-1", WIDGET_IR]]), { postAuthor: author }), "<div><div class=\"widget widget-text\">Widget</div></div>");
});
test("page body: the presented post (by id) has its body projected", () => {
  assert.equal(renderHtmlPageBody(marker({ type: "content", id: "p-1", header: false }), byType([["content", "p-1", coverIr]]), { postPresentation: buildPostRecord({ id: "p-1", slug: "first" }) }), "<div><div class=\"post-detail-body\"><p>After</p></div></div>");
});
test("page body: a post marker for the presented post (by slug) has its body projected", () => {
  assert.equal(renderHtmlPageBody(marker({ type: "post", slug: "first", header: false }), byType([["post", "first", coverIr]]), { postPresentation: buildPostRecord({ id: "p-1", slug: "first" }) }), "<div><div class=\"post-detail-header\"><h1>T</h1></div><div class=\"post-detail-body\"><p>After</p></div></div>");
});
test("page body: a marker for a different post is not projected", () => {
  assert.equal(renderHtmlPageBody(marker({ type: "content", id: "p-2", header: false }), byType([["content", "p-2", coverIr]]), { postPresentation: buildPostRecord({ id: "p-1", slug: "first" }) }), "<div><div class=\"post-detail-body\"><img src=\"/m/a1/public.v3/image.jpg\" alt=\"Cover\" width=\"10\" height=\"20\" loading=\"lazy\"><p>After</p></div></div>");
});
test("page body: a different slug is not projected", () => {
  assert.equal(renderHtmlPageBody(marker({ type: "content", slug: "other", header: false }), byType([["content", "other", coverIr]]), { postPresentation: buildPostRecord({ id: "p-1", slug: "first" }) }), "<div><div class=\"post-detail-body\"><img src=\"/m/a1/public.v3/image.jpg\" alt=\"Cover\" width=\"10\" height=\"20\" loading=\"lazy\"><p>After</p></div></div>");
});
test("page body: a presented post's widget marker is not projected", () => {
  assert.equal(renderHtmlPageBody(marker({ type: "widget", id: "p-1" }), byType([["widget", "p-1", WIDGET_IR]]), { postPresentation: buildPostRecord({ id: "p-1", slug: "first" }) }), "<div class=\"widget widget-text\">Widget</div>");
});
test("page body: a presented post's non post-content IR is not projected", () => {
  assert.equal(renderHtmlPageBody(marker({ type: "content", id: "p-1" }), byType([["content", "p-1", WIDGET_IR]]), { postPresentation: buildPostRecord({ id: "p-1", slug: "first" }) }), "<div><div class=\"widget widget-text\">Widget</div></div>");
});
test("media-image IR: a missing assetId renders the widget placeholder", () => {
  assert.equal(MEDIA_IR({}), "<div class=\"widget widget-placeholder\" aria-hidden=\"true\"></div>");
});
test("media-image IR: an implausible assetId renders the widget placeholder", () => {
  assert.equal(MEDIA_IR({ assetId: "a b" }), "<div class=\"widget widget-placeholder\" aria-hidden=\"true\"></div>");
});
test("media-image IR: an audio asset renders an audio tag without dimensions", () => {
  assert.equal(MEDIA_IR({ assetId: "s1", contentType: "audio/mpeg", alt: "Song", width: 5, height: 6, slug: "song", controls: false }), "<audio src=\"/m/song/original.mp3\">Song</audio>");
});
test("media-image IR: a video asset renders a sized video tag", () => {
  assert.equal(MEDIA_IR({ assetId: "v1", contentType: "video/mp4", width: 5, height: 6, cssClass: "c" }), "<video src=\"/m/v1/original.mp4\" controls width=\"5\" height=\"6\" class=\"c\">Your browser does not support the video tag.</video>");
});
test("media-image IR: an image needs a string transform name", () => {
  assert.equal(MEDIA_IR({ assetId: "i1", contentType: "image/png", version: 2 }), "<div class=\"widget widget-placeholder\" aria-hidden=\"true\"></div>");
});
test("media-image IR: an image needs a numeric version", () => {
  assert.equal(MEDIA_IR({ assetId: "i1", transformName: "public", version: "2" }), "<div class=\"widget widget-placeholder\" aria-hidden=\"true\"></div>");
});
test("media-image IR: an image needs a plausible transform name", () => {
  assert.equal(MEDIA_IR({ assetId: "i1", transformName: "a/b", version: 2 }), "<div class=\"widget widget-placeholder\" aria-hidden=\"true\"></div>");
});
test("media-image IR: a non-string content type renders as an image", () => {
  assert.equal(MEDIA_IR({ assetId: "i1", contentType: 7, transformName: "public", version: 2, alt: "Pic", galleryResponsive: true }), "<img src=\"/m/i1/public.v2/image.jpg\" srcset=\"/m/i1/public.v2/image.jpg 1x\" alt=\"Pic\" loading=\"lazy\">");
});
test("media-image IR: an image renders a responsive-off img tag", () => {
  assert.equal(MEDIA_IR({ assetId: "i1", contentType: "image/png", transformName: "public", version: 2, slug: "pic" }), "<img src=\"/m/pic/public.v2/image.jpg\" alt=\"\" loading=\"lazy\">");
});
test("media node: an unresolvable image without alt uses the default placeholder label", () => {
  assert.equal(MEDIA({ assetId: "i1", transformName: "missing" }), "<figure class=\"media-ph\" style=\"aspect-ratio:16 / 9\"><span class=\"media-ph__label\">Media</span></figure>");
});
test("page body: a media marker naming no id or slug renders the placeholder", () => {
  assert.equal(renderHtmlPageBody(marker({ type: "media" }), byType([["media", "m1", WIDGET_IR]])), "<div><div class=\"widget widget-placeholder\" aria-hidden=\"true\"></div></div>");
});
test("page body: a presented post whose cover asset has no metadata keeps that image in its body", () => {
  assert.equal(renderHtmlPageBody(marker({ type: "content", id: "p-1", header: false }), byType([["content", "p-1", { componentId: "post-content", props: { title: "T", updatedAt: "", mediaTransformVersions: { public: 3 }, bodyJson: { type: "doc", content: [{ type: "image", attrs: { assetId: "a1", transformName: "public", alt: "Cover" } }, { type: "paragraph", content: [{ type: "text", text: "After" }] }] } } }]]), { postPresentation: buildPostRecord({ id: "p-1", slug: "first", featuredMediaId: "a1" }) }), "<div><div class=\"post-detail-body\"><img src=\"/m/a1/public.v3/image.jpg\" alt=\"Cover\" loading=\"lazy\"><p>After</p></div></div>");
});
