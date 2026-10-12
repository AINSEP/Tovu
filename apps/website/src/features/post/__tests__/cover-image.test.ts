/** @file featfallback: read-only cover selection for public output, with injected media metadata. */
import assert from "node:assert/strict";
import test from "node:test";
import { buildPostRecord } from "./post-record.fixture.js";
import { collectCoverMediaRefs, projectPostBody, resolveCoverImage } from "../cover-image.js";

const photo = { id: "photo", width: 1200, height: 800, contentType: "image/jpeg" };
const mediaLookup = ({ ref }: { ref: string }) => ref === "photo" || ref === "photo-slug" ? photo : null;
const bodyJson = { type: "doc", content: [{ type: "paragraph", content: [{ type: "image", attrs: { assetId: "photo", alt: "Body credit" } }] }] };

test("featfallback: nested first body image supplies cover, featured wins, no image yields null, and storage is untouched", () => {
  const post = buildPostRecord({ bodyJson, featuredMediaId: null });
  const before = structuredClone(post);
  assert.deepEqual(resolveCoverImage({ post }, { mediaLookup }), { mediaId: "photo", alt: "Body credit", width: 1200, height: 800, bodyOccurrence: 0 });
  assert.deepEqual(post, before);
  assert.equal(resolveCoverImage({ post: { ...post, featuredMediaId: "missing" } }, { mediaLookup }), null);
  assert.deepEqual(resolveCoverImage({ post: { ...post, featuredMediaId: "photo" } }, { mediaLookup }), { mediaId: "photo", alt: post.title, width: 1200, height: 800 });
  assert.equal(resolveCoverImage({ post: buildPostRecord() }, { mediaLookup }), null);
});

test("featfallback: media nodes skip videos, select the first image, and default empty alt to the title", () => {
  const post = buildPostRecord({ bodyJson: { type: "doc", content: [
    { type: "media", attrs: { assetId: "video" } },
    { type: "media", attrs: { assetId: "photo", alt: "" } },
    { type: "image", attrs: { assetId: "later" } },
  ] } });
  const lookup = ({ ref }: { ref: string }) => ref === "video" ? { ...photo, id: "video", contentType: "video/mp4" } : mediaLookup({ ref });
  assert.equal(resolveCoverImage({ post }, { mediaLookup: lookup })?.mediaId, "photo");
  assert.equal(resolveCoverImage({ post }, { mediaLookup: lookup })?.alt, post.title);
  assert.deepEqual(collectCoverMediaRefs({ post }), ["video", "photo", "later"]);
});

test("featfallback: HTML uses real document order, entity-decoded alt, and the existing media marker parser", () => {
  const post = buildPostRecord({ bodyFormat: "html", bodyJson: {}, bodyHtml:
    `<!-- <img src="/m/later/public.v1/image.jpg"> --><script>"<img src='/m/later/public.v1/image.jpg'>"</script>` +
    `<template><img src="/m/later/public.v1/image.jpg"></template>` +
    `<figure data-embed-config='{"type":"media","slug":"photo-slug","alt":"First & second"}'></figure>` +
    `<img src="/m/later/public.v1/image.jpg">`,
  });
  assert.equal(resolveCoverImage({ post }, { mediaLookup })?.alt, "First & second");
  assert.equal(resolveCoverImage({ post }, { mediaLookup })?.mediaId, "photo");
  const htmlImage = { ...post, bodyHtml: `<IMG SRC='/m/photo-slug/public.v1/image.jpg' ALT='Body &amp; image'>` };
  assert.equal(resolveCoverImage({ post: htmlImage }, { mediaLookup })?.alt, "Body & image");
});

test("featfallback: external images are opt-in HTTPS OG candidates, never private previews or malformed schemes", () => {
  for (const src of ["https://images.example/first.jpg", "http://images.example/a.jpg", "//images.example/a.jpg", "/local.jpg", "data:image/png;base64,abc", "javascript:alert(1)", "https://user:pass@example.com/a.jpg", "https://site.example/api/admin/v1/workspaces/ws/media/id/original"]) {
    const post = buildPostRecord({ bodyJson: { type: "doc", content: [{ type: "image", attrs: { src } }] } });
    assert.equal(resolveCoverImage({ post }, { mediaLookup }), null);
    const cover = resolveCoverImage({ post }, { mediaLookup, allowExternalHttps: true });
    assert.equal(cover?.url ?? null, src === "https://images.example/first.jpg" ? src : null, src);
  }
});

test("featfallback: HTML external URL and deep documents work without recursive traversal", () => {
  const html = buildPostRecord({ bodyFormat: "html", bodyHtml: '<img src="https://images.example/a.jpg?x=1&amp;y=2" alt="HTML alt">' });
  assert.equal(resolveCoverImage({ post: html }, { mediaLookup, allowExternalHttps: true })?.url, "https://images.example/a.jpg?x=1&y=2");
  let body: unknown = { type: "image", attrs: { assetId: "photo" } };
  for (let i = 0; i < 6000; i++) body = { type: "blockquote", content: [body] };
  assert.equal(resolveCoverImage({ post: { ...html, bodyFormat: "doc", bodyJson: body } }, { mediaLookup })?.mediaId, "photo");
});

test("postpolish: omit exactly the selected nested occurrence, preserving repeats, captions and the stored tree", () => {
  const post = buildPostRecord({ bodyJson: { type: "doc", content: [
    { type: "media", attrs: { assetId: "missing" } },
    { type: "paragraph", content: [{ type: "image", attrs: { assetId: "photo" } }, { type: "text", text: "Caption" }] },
    { type: "image", attrs: { assetId: "photo" } },
  ] } });
  const before = structuredClone(post);
  const options = { mediaLookup, hasPublicTransform: true };
  assert.deepEqual(projectPostBody({ post }, options), { type: "doc", content: [
    { type: "media", attrs: { assetId: "missing" } },
    { type: "paragraph", content: [{ type: "text", text: "Caption" }] },
    { type: "image", attrs: { assetId: "photo" } },
  ] });
  assert.deepEqual(post, before);
  for (const variant of [
    { ...post, ext: { "post-presentation": { hideCoverImageInBody: false } } },
    { ...post, featuredMediaId: "photo" }, { ...post, featuredMediaId: "missing" },
    { ...post, kind: "page" as const }, { ...post, bodyFormat: "html" as const, bodyHtml: '<img src="/m/photo/public.v1/image.jpg">' },
  ]) assert.equal(projectPostBody({ post: variant }, options), post.bodyJson);
  assert.equal(projectPostBody({ post }, { ...options, hasPublicTransform: false }), post.bodyJson);
});

test("postpolish: repeating the same node object still removes exactly one occurrence", () => {
  const image = { type: "image", attrs: { assetId: "photo" } };
  const post = buildPostRecord({ bodyJson: { type: "doc", content: [image, image] } });
  assert.deepEqual(projectPostBody({ post }, { mediaLookup, hasPublicTransform: true }), { type: "doc", content: [image] });
  assert.deepEqual(post.bodyJson, { type: "doc", content: [image, image] });
});

test("postpolish: malformed nested arrays keep occurrence numbering aligned with selection", () => {
  const image = { type: "image", attrs: { assetId: "photo" } };
  const post = buildPostRecord({ bodyJson: { type: "doc", content: [[image], image] } });
  assert.deepEqual(projectPostBody({ post }, { mediaLookup, hasPublicTransform: true }), { type: "doc", content: [[], image] });
});
