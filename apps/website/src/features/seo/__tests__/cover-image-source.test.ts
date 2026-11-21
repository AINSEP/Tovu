/**
 * @file `withContentImageSource` — the admin SEO read routes (`routes/seo/get-entry.ts`,
 * `put-entry.ts`) report where the OG image came from. A cover projected by `withCoverSeoDefaults`
 * looks like an operator override to the evaluator; this re-labels it "content" unless the stored
 * row really carries an `ogImage` override.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { SeoMeta } from "@jini-ai/cms/seo";
import { buildPostRecord } from "../../post/__tests__/post-record.fixture.js";
import { withContentImageSource, withCoverSeoDefaults } from "@jini-ai/cms/seo/cover-image";

function meta(openGraph: Partial<SeoMeta["openGraph"]> = {}): SeoMeta {
  return {
    title: "Post",
    canonical: "https://site.example/post",
    robots: { noindex: false, nofollow: false },
    openGraph: { title: "Post", type: "article", url: "https://site.example/post", image: "https://images.example/cover.jpg",
      imageSource: "override", imageOverridden: true, ...openGraph },
    twitter: { card: "summary_large_image", title: "Post" },
    jsonLd: [],
  };
}

test("no raw row, or an image that is not an override, leaves the meta as evaluated", () => {
  const overridden = meta();
  assert.equal(withContentImageSource({ meta: overridden, rawPost: null }), overridden);
  const fromDefault = meta({ imageSource: "default", imageOverridden: undefined });
  assert.equal(withContentImageSource({ meta: fromDefault, rawPost: buildPostRecord() }), fromDefault);
});

test("a stored ogImage override keeps the override label", () => {
  const overridden = meta();
  const rawPost = buildPostRecord({ seoExtJson: JSON.stringify({ ogImage: "https://site.example/explicit.jpg" }) });
  assert.equal(withContentImageSource({ meta: overridden, rawPost }), overridden);
});

test("a projected cover with no stored override (absent, empty or malformed SEO) is relabelled content", () => {
  for (const seoExtJson of [null, "{}", '{"ogImage":""}', "not json"]) {
    const overridden = meta();
    const result = withContentImageSource({ meta: overridden, rawPost: buildPostRecord({ seoExtJson }) });
    assert.equal(result.openGraph.imageSource, "content", String(seoExtJson));
    assert.equal("imageOverridden" in result.openGraph, false, "the override flag is dropped");
    assert.equal(result.openGraph.image, "https://images.example/cover.jpg");
    assert.equal(overridden.openGraph.imageSource, "override", "the evaluated meta is not mutated");
  }
});

test("malformed stored SEO uses body defaults while an explicit matching override stays authoritative", () => {
  const cover = { url: "https://images.example/cover.jpg", alt: "Cover", width: null, height: null };
  const malformed = buildPostRecord({ seoExtJson: "{broken", featuredMediaId: null });
  const projected = withCoverSeoDefaults({ post: malformed, cover });
  assert.equal(JSON.parse(projected.seoExtJson!).ogImage, cover.url);
  assert.equal(withContentImageSource({ meta: meta(), rawPost: malformed }).openGraph.imageSource, "content");
  const explicit = buildPostRecord({ seoExtJson: JSON.stringify({ ogImage: cover.url }), featuredMediaId: null });
  assert.equal(withContentImageSource({ meta: meta(), rawPost: explicit }).openGraph.imageSource, "override");
  assert.equal(JSON.parse(withCoverSeoDefaults({ post: explicit, cover }).seoExtJson!).ogImage, cover.url);
});
