import assert from "node:assert/strict";
import test from "node:test";

import { collectReferencedMediaKeys } from "../media-references.js";

/**
 * @file `collectReferencedMediaKeys` — which media a packed post/page state points at, so a scoped
 * "Publish pages"/"Publish posts" run can carry those images along (owner decision, 2026-09-25).
 *
 * Every shape here is one the real content DB holds today: a ref-based TipTap `image`/`media` node
 * (`attrs.assetId`), a legacy `image` node whose `attrs.src` is an admin media URL, a `/m/{key}/…`
 * public URL, an `"html"` Page's `data-embed-config` media marker (by `id` or `slug`), and an SEO
 * share-image ref (`"{assetId}:{transformName}"`).
 */

function keys(state: Record<string, unknown>): string[] {
  return [...collectReferencedMediaKeys(state)].sort();
}

test("a ref-based image or media node contributes its assetId", () => {
  const bodyJson = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "before" }] },
      { type: "image", attrs: { assetId: "asset-1", transformName: "public" } },
      { type: "blockquote", content: [{ type: "media", attrs: { assetId: "asset-2" } }] },
    ],
  };
  assert.deepEqual(keys({ bodyJson }), ["asset-1", "asset-2"]);
});

test("a legacy image node's admin media URL and a /m/ public URL both contribute their key", () => {
  const bodyJson = {
    type: "doc",
    content: [
      { type: "image", attrs: { src: "http://localhost:3000/api/admin/v1/workspaces/w/media/asset-3/original" } },
      { type: "image", attrs: { src: "/m/blue-circle/public.v2/image.webp" } },
    ],
  };
  assert.deepEqual(keys({ bodyJson }), ["asset-3", "blue-circle"]);
});

test("an html body contributes media markers by id or slug, and /m/ URLs", () => {
  const bodyHtml =
    `<div data-embed-config='{"type":"media","id":"asset-4"}'></div>` +
    `<div data-embed-config='{"type":"media","slug":"hero-shot"}'></div>` +
    `<div data-embed-config='{"type":"widget","id":"not-media"}'></div>` +
    `<img src="/m/asset-5/original">`;
  assert.deepEqual(keys({ bodyHtml }), ["asset-4", "asset-5", "hero-shot"]);
});

test("an SEO share image ref contributes its asset id (seoExtJson is stored as a JSON string)", () => {
  assert.deepEqual(keys({ seoExtJson: JSON.stringify({ ogImage: "asset-6:public", twitterImage: "asset-7:public" }) }), [
    "asset-6",
    "asset-7",
  ]);
});

test("a state with no media reference contributes nothing", () => {
  assert.deepEqual(
    keys({
      bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "/m/ is just text" }] }] },
      bodyHtml: null,
      seoExtJson: JSON.stringify({ schemaType: "TechArticle" }),
    }),
    []
  );
});

test("a link mark pointing at a media file contributes its key (a copied /m/ public URL pasted as a link)", () => {
  const bodyJson = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Download the brochure", marks: [{ type: "link", attrs: { href: "/m/brochure-pdf/original" } }] },
          { type: "text", text: " or the old one", marks: [{ type: "link", attrs: { href: "https://example.test/api/admin/v1/workspaces/w/media/asset-9/original" } }] },
        ],
      },
    ],
  };
  assert.deepEqual(keys({ bodyJson }), ["asset-9", "brochure-pdf"]);
});

test("an html media marker is matched case-insensitively, the way the embed resolver reads it", () => {
  const bodyHtml = `<div data-embed-config='{"type":"Media","slug":"hand-typed"}'></div>`;
  assert.deepEqual(keys({ bodyHtml }), ["hand-typed"]);
});

test("an SEO share image given as an absolute /m/ URL contributes its key, not the URL scheme", () => {
  assert.deepEqual(keys({ seoExtJson: JSON.stringify({ ogImage: "https://tovu.example/m/og-card/public.v3/image.webp" }) }), [
    "og-card",
  ]);
});
