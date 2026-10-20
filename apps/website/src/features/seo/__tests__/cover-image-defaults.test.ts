/** @file TW2-L302: pin the existing detached SEO cover projection before refactoring. */
import assert from "node:assert/strict";
import test from "node:test";
import type { CoverImage } from "../../post/cover-image.js";
import { buildPostRecord } from "../../post/__tests__/post-record.fixture.js";
import { withCoverSeoDefaults } from "../cover-image.js";

const externalCover: CoverImage = { url: "https://images.example/cover.jpg", alt: "Cover", width: null, height: null };

test("TW2-L302: featured media and absent covers preserve the original post identity", () => {
  const featured = buildPostRecord({ featuredMediaId: "featured", seoExtJson: "invalid" });
  assert.equal(withCoverSeoDefaults({ post: featured, cover: externalCover }), featured);
  assert.equal(withCoverSeoDefaults({ post: featured, cover: null }), featured);
  const post = buildPostRecord();
  assert.equal(withCoverSeoDefaults({ post, cover: null }), post);
});

test("TW2-L302: library cover projects only featuredMediaId, preserving stored SEO and the raw row", () => {
  const post = buildPostRecord({ featuredMediaId: "", seoExtJson: "invalid" });
  const before = structuredClone(post);
  const cover: CoverImage = { ...externalCover, mediaId: "body-media" };
  const result = withCoverSeoDefaults({ post, cover });
  assert.notEqual(result, post);
  assert.deepEqual(result, { ...post, featuredMediaId: "body-media" });
  assert.deepEqual(post, before);
});

test("TW2-L302: external cover treats missing, malformed, scalar, null and array SEO as empty overrides", () => {
  for (const seoExtJson of [undefined, null, "", "invalid", "null", "false", "true", "0", '"text"', "[]", '[{"ogImage":"ignored"}]', "{}"] ) {
    const post = buildPostRecord({ seoExtJson });
    const before = structuredClone(post);
    const result = withCoverSeoDefaults({ post, cover: externalCover });
    assert.deepEqual(result, { ...post, seoExtJson: JSON.stringify({ ogImage: externalCover.url }) });
    assert.deepEqual(post, before);
  }
});

test("TW2-L302: truthy OG overrides win; falsy overrides use the external cover and retain other keys", () => {
  for (const ogImage of ["https://images.example/explicit.jpg", true, 42, {}, [], "", false, 0, null]) {
    const overrides = { title: "Retained", twitterImage: "https://images.example/twitter.jpg", ogImage };
    const post = buildPostRecord({ seoExtJson: JSON.stringify(overrides) });
    const result = withCoverSeoDefaults({ post, cover: externalCover });
    assert.equal(result.seoExtJson, JSON.stringify({ ...overrides, ogImage: ogImage || externalCover.url }));
    assert.equal(post.seoExtJson, JSON.stringify(overrides));
  }
});

test("TW2-L302: empty media id uses URL fallback; missing URL omits a falsy OG override", () => {
  const post = buildPostRecord({ seoExtJson: '{"title":"Retained","ogImage":""}' });
  assert.equal(withCoverSeoDefaults({ post, cover: { ...externalCover, mediaId: "" } }).seoExtJson,
    JSON.stringify({ title: "Retained", ogImage: externalCover.url }));
  const cover: CoverImage = { alt: "Cover", width: null, height: null };
  assert.equal(withCoverSeoDefaults({ post, cover }).seoExtJson, '{"title":"Retained"}');
});
