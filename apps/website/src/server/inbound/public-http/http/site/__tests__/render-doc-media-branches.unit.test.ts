import assert from "node:assert/strict";
import test from "node:test";

import type { JsonObject, JsonValue } from "@jini-ai/core/primitives";
import { renderDocNode, renderWidgetIr, type MediaAssetRenderMeta } from "../render.js";

// ---------------------------------------------------------------------------
// Branch coverage for `render.ts`'s TipTap doc walk and its media-tag attribute merge (L082b).
// Every test drives a public entry point (`renderDocNode` / `renderWidgetIr`) with the defensive
// shape it guards against and asserts the exact HTML a visitor would receive.
// ---------------------------------------------------------------------------

/** A full `MediaAssetRenderMeta` with every field "not set" (`null`), overridden by `fields`. */
function assetMeta(fields: Partial<MediaAssetRenderMeta>): MediaAssetRenderMeta {
  return { width: null, height: null, cssClass: null, htmlAttributes: null, contentType: null, slug: null, ...fields };
}

function paragraph(...content: JsonValue[]): JsonObject {
  return { type: "doc", content: [{ type: "paragraph", content }] };
}

/** A resolved `media-image` IR for asset `a1` at transform `public` v2, with extra `props`. */
function mediaImage(props: JsonObject): string {
  return renderWidgetIr({ componentId: "media-image", props: { assetId: "a1", transformName: "public", version: 2, ...props } });
}

/** A resolved video `media-image` IR for asset `v1`, with extra `props`. */
function mediaVideo(props: JsonObject): string {
  return renderWidgetIr({ componentId: "media-image", props: { assetId: "v1", contentType: "video/mp4", ...props } });
}

const IMG_SRC = 'src="/m/a1/public.v2/image.jpg"';

// --- marks ---------------------------------------------------------------------------------------

test("renderDocNode: a non-object mark entry is skipped and the text still renders", () => {
  assert.equal(renderDocNode(paragraph({ type: "text", text: "t", marks: ["bold"] })), "<p>t</p>");
});

test("renderDocNode: a mark object without a string type is skipped", () => {
  assert.equal(renderDocNode(paragraph({ type: "text", text: "t", marks: [{ type: 7 }] })), "<p>t</p>");
});

test("renderDocNode: an unknown mark type is skipped while a known sibling mark still applies", () => {
  assert.equal(renderDocNode(paragraph({ type: "text", text: "t", marks: [{ type: "sparkle" }, { type: "bold" }] })), "<p><strong>t</strong></p>");
});

test("renderDocNode: a text node with no string text and no marks array renders empty inside its parent", () => {
  assert.equal(renderDocNode(paragraph({ type: "text", text: 5, marks: "bold" })), "<p></p>");
});

// --- generic node walk ---------------------------------------------------------------------------

test("renderDocNode: a non-object root renders nothing", () => {
  assert.equal(renderDocNode("just a string"), "");
});

test("renderDocNode: a non-object child inside content renders nothing in its place", () => {
  assert.equal(renderDocNode(paragraph(null, { type: "text", text: "kept" })), "<p>kept</p>");
});

test("renderDocNode: a paragraph without a content array renders an empty paragraph", () => {
  assert.equal(renderDocNode({ type: "paragraph" }), "<p></p>");
});

test("renderDocNode: a node with an unknown type renders its children without a wrapper", () => {
  assert.equal(renderDocNode({ type: "callout", content: [{ type: "text", text: "inner" }] }), "inner");
});

test("renderDocNode: a node with a non-string type renders its children without a wrapper", () => {
  assert.equal(renderDocNode({ type: 3, content: [{ type: "text", text: "inner" }] }), "inner");
});

// --- headings -----------------------------------------------------------------------------------

test("renderDocNode: a heading with no numeric level renders as h2", () => {
  assert.equal(renderDocNode({ type: "heading", content: [{ type: "text", text: "Intro" }] }), '<h2 id="intro">Intro</h2>');
});

test("renderDocNode: a heading anchor ignores non-object children and leaf nodes without text", () => {
  const heading: JsonObject = { type: "heading", attrs: { level: 3 }, content: [null, { type: "hardBreak" }, { type: "text", text: "Plan" }] };
  assert.equal(renderDocNode(heading), '<h3 id="plan"><br/>Plan</h3>');
});

// --- images, video embeds, mentions --------------------------------------------------------------

test("renderDocNode: a managed image with no alt and no resolvable transform renders the 'Image' placeholder", () => {
  assert.equal(
    renderDocNode({ type: "image", attrs: { assetId: "a1" } }),
    '<figure class="media-ph" style="aspect-ratio:16 / 9"><span class="media-ph__label">Image</span></figure>'
  );
});

test("renderDocNode: a youtube node without attrs renders the unavailable-video placeholder", () => {
  assert.equal(
    renderDocNode({ type: "youtube" }),
    '<figure class="media-ph" style="aspect-ratio:16 / 9"><span class="media-ph__label">Video unavailable</span></figure>'
  );
});

test("renderDocNode: a mention without attrs renders nothing", () => {
  assert.equal(renderDocNode({ type: "mention" }), "");
});

test("renderDocNode: a mention whose id is not a string renders nothing", () => {
  assert.equal(renderDocNode({ type: "mention", attrs: { id: 42, label: "Post" } }), "");
});

// --- media attribute merge: <img> ---------------------------------------------------------------

test("media image: an htmlAttributes class is folded into the asset's own class attribute", () => {
  assert.equal(mediaImage({ cssClass: "base", htmlAttributes: 'class="extra"' }), `<img ${IMG_SRC} alt="" class="base extra" loading="lazy">`);
});

test("media image: an htmlAttributes class becomes the whole class attribute when the asset has none", () => {
  assert.equal(mediaImage({ htmlAttributes: 'class="extra"' }), `<img ${IMG_SRC} alt="" class="extra" loading="lazy">`);
});

test("media image: a bare marker alt replaces the asset alt with an empty alt", () => {
  assert.equal(mediaImage({ alt: "Asset alt", markerAttributes: [{ name: "alt", value: null }] }), `<img ${IMG_SRC} alt="" loading="lazy">`);
});

test("media image: a bare marker width suppresses the asset's own width", () => {
  assert.equal(mediaImage({ width: 640, markerAttributes: [{ name: "width", value: null }] }), `<img ${IMG_SRC} alt="" loading="lazy">`);
});

test("media image: a bare marker loading falls back to lazy", () => {
  assert.equal(mediaImage({ htmlAttributes: 'loading="eager"', markerAttributes: [{ name: "loading", value: null }] }), `<img ${IMG_SRC} alt="" loading="lazy">`);
});

test("media image: malformed marker attribute entries are dropped and well-formed ones still apply", () => {
  const markerAttributes: JsonValue[] = [1, { name: 2, value: "x" }, { name: "title", value: 3 }, { name: "title", value: "kept" }];
  assert.equal(mediaImage({ markerAttributes }), `<img ${IMG_SRC} alt="" title="kept" loading="lazy">`);
});

// --- media attribute merge: <video> -------------------------------------------------------------

test("media video: a marker alt replaces the fallback text node verbatim", () => {
  assert.equal(mediaVideo({ alt: "Asset alt", markerAttributes: [{ name: "alt", value: "Marker text" }] }), '<video src="/m/v1/original.mp4" controls>Marker text</video>');
});

test("media video: a bare marker alt empties the fallback text node", () => {
  assert.equal(mediaVideo({ markerAttributes: [{ name: "alt", value: null }] }), '<video src="/m/v1/original.mp4" controls></video>');
});

test("media video: the asset alt becomes the escaped fallback text when no marker alt is present", () => {
  assert.equal(mediaVideo({ alt: "A & B" }), '<video src="/m/v1/original.mp4" controls>A &amp; B</video>');
});

test("renderDocNode: a managed image's asset htmlAttributes class reaches the rendered <img>", () => {
  const html = renderDocNode(
    { type: "image", attrs: { assetId: "a1", transformName: "public", alt: "A" } },
    new Map(),
    new Map([["public", 4]]),
    new Map([["a1", assetMeta({ htmlAttributes: 'class="wide"' })]])
  );
  assert.ok(html.includes('class="wide"'), html);
});
