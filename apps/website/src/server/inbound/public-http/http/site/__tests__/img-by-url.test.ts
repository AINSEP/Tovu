import assert from "node:assert/strict";
import test from "node:test";
import type { JsonObject } from "@jini-ai/core/primitives";
import { buildPostRecord } from "#src/features/post/__tests__/post-record.fixture";
import { projectPostBody, resolveCoverImage } from "#src/features/post/cover-image";
import { featuredImageView, renderDocNode, renderWidgetIr } from "../render.js";

test("Img by URL: public rendering preserves safe src-only images and refuses javascript URLs without broadening covers", () => {
  const mediaLookup = () => null;
  for (const src of ["https://example.com/cat.png?a=1&b=2", "http://example.com/cat.png", "/images/cat.png", "images/cat.png", "./cat.png", "../cat.png"]) {
    const doc: JsonObject = { type: "doc", content: [{ type: "image", attrs: { src, alt: 'Cat & "friend"', title: '<Cat>', width: 320, height: "200" } }] };
    const expected = `<img src="${src.replaceAll("&", "&amp;")}" alt="Cat &amp; &quot;friend&quot;" title="&lt;Cat&gt;" width="320" height="200" loading="lazy" />`;
    assert.equal(renderDocNode(doc), expected);
    assert.equal(renderWidgetIr({ componentId: "post-content", props: { title: "Cat", header: false, bodyJson: doc } }), `<div class="post-detail-body">${expected}</div>`);
    const post = buildPostRecord({ bodyJson: doc, featuredMediaId: null });
    assert.equal(featuredImageView({ mediaAssetMetadata: new Map(), mediaTransformVersions: new Map([["public", 1]]) }, post), null);
    assert.equal(projectPostBody({ post }, { mediaLookup, hasPublicTransform: true }), doc);
    assert.equal(resolveCoverImage({ post }, { mediaLookup, allowExternalHttps: true })?.url ?? null, src.startsWith("https://") ? src : null);
  }
  const placeholder = '<figure class="media-ph" style="aspect-ratio:16 / 9"><span class="media-ph__label">Cat</span></figure>';
  for (const src of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:image/png;base64,AAAA", "//example.com/cat.png", "/\\example.com/cat.png", "/api/admin/v1/workspaces/ws/media/id/./original", "https://user:pass@example.com/cat.png"]) {
    assert.equal(renderDocNode({ type: "image", attrs: { src, alt: "Cat" } }), placeholder);
  }
  assert.equal(renderDocNode({ type: "image", attrs: { src: "/cat.png" } }), '<img src="/cat.png" alt="" loading="lazy" />');
  assert.equal(renderDocNode({ type: "image", attrs: { src: "/cat.png", width: '320" onerror="x', height: null, title: null } }), '<img src="/cat.png" alt="" width="320&quot; onerror=&quot;x" loading="lazy" />');
  const ref: JsonObject = { type: "image", attrs: { assetId: "cat", transformName: "public", src: "https://example.com/preview.png", alt: "Cat" } };
  assert.equal(renderDocNode(ref, undefined, new Map([["public", 1]])), '<img src="/m/cat/public.v1/image.jpg" alt="Cat" loading="lazy">');
  assert.equal(renderDocNode(ref), placeholder);
});
