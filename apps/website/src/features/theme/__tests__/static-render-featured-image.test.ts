import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { FEATURED_IMAGE_MARKER_TYPE, markersOfType } from "@jini-ai/cms/widgets/markers";
import { injectFeaturedImage, type StaticFeaturedImage } from "../static-render.js";

/**
 * @file A post's featured image on a STATIC-tier post template (2026-10-05). The templated tiers
 * got `post.featuredImage` as theme data, but a static theme (`tovu-theme`) has no template
 * language — it gets the image through a `{"type":"featured-image"}` marker the route fills
 * (`injectFeaturedImage`). Before this, no tovu-theme post template referenced the featured image
 * at all; it only reached `og:image`.
 */

const IMAGE: StaticFeaturedImage = { url: "/m/launch-cover/public.v3/image.jpg", alt: "Launch <notes>", width: 1200, height: 630 };

test("a featured-image marker becomes the image, keeping the authored wrapper and dropping the marker", () => {
  const html = `<main><figure class="post-featured" data-embed-config='{"type":"featured-image"}'></figure><p>body</p></main>`;
  const out = injectFeaturedImage(html, IMAGE);
  assert.equal(
    out,
    `<main><figure class="post-featured"><img src="/m/launch-cover/public.v3/image.jpg" alt="Launch &lt;notes&gt;" width="1200" height="630" decoding="async" fetchpriority="high"></figure><p>body</p></main>`
  );
});

test("unknown dimensions are omitted rather than written as empty attributes", () => {
  const out = injectFeaturedImage(`<figure data-embed-config='{"type":"featured-image"}'></figure>`, { ...IMAGE, width: null, height: null });
  assert.ok(!out.includes("width="), out);
  assert.ok(!out.includes("height="), out);
});

test("no featured image removes the whole marker element, fallback included", () => {
  const html = `<main><figure class="post-featured" data-embed-config='{"type":"featured-image"}'><span>fallback</span></figure><p>body</p></main>`;
  assert.equal(injectFeaturedImage(html, null), "<main><p>body</p></main>");
});

test("other markers are left alone", () => {
  const html = `<div data-embed-config='{"type":"content"}'></div>`;
  assert.equal(injectFeaturedImage(html, IMAGE), html);
  assert.equal(injectFeaturedImage(html, null), html);
});

const STATIC_THEMES_DIR = path.resolve(import.meta.dirname, "../../../../../../content/themes/static");

for (const themeId of ["tovu-theme", "tovu-starter"]) test(`canary: every ${themeId} post template carries one featured-image marker, ahead of the content marker`, () => {
  const themeDir = path.join(STATIC_THEMES_DIR, themeId);
  const manifest = JSON.parse(fs.readFileSync(path.join(themeDir, "theme.json"), "utf8")) as { templates?: string[] };
  const postTemplates = (manifest.templates ?? []).filter((name) => name.startsWith("posts-"));
  assert.ok(postTemplates.length > 0, `${themeId} must declare at least one posts-* template`);
  for (const name of postTemplates) {
    const html = fs.readFileSync(path.join(themeDir, "render/pages", name.endsWith(".html") ? name : `${name}.html`), "utf8");
    assert.equal(markersOfType({ html: html, type: FEATURED_IMAGE_MARKER_TYPE }).length, 1, `${name} must carry exactly one featured-image marker`);
    const featuredAt = html.indexOf(`'{"type":"${FEATURED_IMAGE_MARKER_TYPE}"}'`);
    const contentAt = html.indexOf(`'{"type":"content"}'`);
    assert.ok(featuredAt !== -1 && featuredAt < contentAt, `${name}: the featured image must sit above the post body`);
    const rendered = injectFeaturedImage(html, IMAGE);
    assert.ok(rendered.includes(`<img src="${IMAGE.url}"`), `${name} must render the image`);
    assert.equal(markersOfType({ html: injectFeaturedImage(html, null), type: FEATURED_IMAGE_MARKER_TYPE }).length, 0, `${name}: no image must leave no marker`);
  }
});
