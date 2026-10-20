import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { LISTING_SEE_MORE_SCRIPT } from "@jini-ai/cms/listing";
import { renderStaticPage, type StaticListingBatch, type StaticPostPreview } from "../static-render.js";
import type { DiscoveredTheme } from "../theme.js";

/**
 * @file `renderStaticPage`'s see-more listing paths (`data-jini-listing="<key>"`, assigned upstream by
 * `assignListingKeys`) for the `{"type":"post-previews"}` and `{"type":"collection"}` markers, plus a
 * post-preview card's cover image. Exercised only through `renderStaticPage`'s public surface, the
 * same convention `static-render-post-previews.test.ts` / `static-render-collection.test.ts` follow.
 *
 * I/O-free: every test hands in already-resolved batches / rendered lists, never a repo. Pages are
 * fragments with no token-stylesheet sentinel, so `console.warn` is silenced per test (the warning
 * itself is certified in `static-render-token-sentinel.test.ts`).
 */

const THEME: DiscoveredTheme = {
  manifest: { id: "listings-test", name: "Listings Test", version: "1.0.0", tier: "static", engine: 1 },
  dir: "/fake",
  tokens: {},
  tokensLight: {},
  templates: {},
  liquidTemplates: {},
  handlebarsTemplates: {},
  pages: {},
  partials: {},
  css: "",
  source: "site",
  status: "valid",
  errors: [],
};

const PREVIEW: StaticPostPreview = { title: "First", href: "/first", dateIso: "2026-09-01", dateLabel: "Sep 1" };
const PREVIEW_CARD =
  `<article class="post-card"><h3><a href="/first">First</a></h3>` +
  `<div class="post-meta"><time datetime="2026-09-01">Sep 1</time></div></article>`;

const LISTED_POST_PREVIEWS =
  `<body><div data-jini-listing="1" data-embed-config='{"type":"post-previews","limit":1}'>` +
  `<template data-jini-card><p>card</p></template>fallback</div></body>`;

const COLLECTION_CONFIG = '{"type":"collection","typeKey":"recipe"}';

function render(t: TestContext, required: Omit<Parameters<typeof renderStaticPage>[0], "theme" | "pageId">): string | null {
  t.mock.method(console, "warn", () => undefined);
  return renderStaticPage({ theme: THEME, pageId: "listing", ...required });
}

function batches(batch: StaticListingBatch<StaticPostPreview>): ReadonlyMap<number, StaticListingBatch<StaticPostPreview>> {
  return new Map([[1, batch]]);
}

test("post-previews: a card for a preview with a featured image leads with a lazy-loaded cover", (t) => {
  const html = render(t, {
    htmlOverride: `<div data-embed-config='{"type":"post-previews"}'></div>`,
    postPreviews: [{ ...PREVIEW, featuredImage: { url: "/cover.jpg", alt: "Cover", width: 10, height: 5 } }],
  });
  assert.equal(
    html,
    `<div data-embed-config='{"type":"post-previews"}'><article class="post-card">` +
      `<img src="/cover.jpg" alt="Cover" width="10" height="5" decoding="async" loading="lazy">` +
      `<h3><a href="/first">First</a></h3><div class="post-meta"><time datetime="2026-09-01">Sep 1</time></div></article></div>`
  );
});

test("post-previews see-more: a keyed batch with a next page keeps the card template, wraps its items and adds the button and script", (t) => {
  const html = render(t, {
    htmlOverride: LISTED_POST_PREVIEWS,
    postPreviews: [],
    postPreviewBatches: batches({ items: [PREVIEW], nextHref: "/listing/more" }),
  });
  assert.equal(
    html,
    `<body><div data-jini-listing="1" data-embed-config='{"type":"post-previews","limit":1}'>` +
      `<template data-jini-card><p>card</p></template><!--jini-listing:1-->${PREVIEW_CARD}<!--/jini-listing:1--></div>` +
      `<button type="button" class="jini-see-more" data-jini-more="1" data-jini-more-href="/listing/more" data-jini-loading="Loading…" hidden>See more</button>` +
      `<script data-jini-see-more-script>${LISTING_SEE_MORE_SCRIPT}</script></body>`
  );
});

test("post-previews see-more: the last keyed batch of a card-less listing renders its items with no button or script", (t) => {
  const html = render(t, {
    htmlOverride: LISTED_POST_PREVIEWS.replace("<template data-jini-card><p>card</p></template>", ""),
    postPreviewBatches: batches({ items: [PREVIEW] }),
  });
  assert.equal(
    html,
    `<body><div data-jini-listing="1" data-embed-config='{"type":"post-previews","limit":1}'>` +
      `<!--jini-listing:1-->${PREVIEW_CARD}<!--/jini-listing:1--></div></body>`
  );
});

test("post-previews see-more: an empty keyed batch leaves the marker's authored fallback untouched, even with previews supplied", (t) => {
  const html = render(t, {
    htmlOverride: LISTED_POST_PREVIEWS,
    postPreviews: [PREVIEW],
    postPreviewBatches: batches({ items: [] }),
  });
  assert.equal(html, LISTED_POST_PREVIEWS);
});

test("collection see-more: a built-in-layout listing resolves its listing-scoped key and drops the listing key from the marker element (the layout's own wrapper carries it)", (t) => {
  const html = render(t, {
    htmlOverride: `<div class="grid" data-jini-listing="1" data-embed-config='${COLLECTION_CONFIG}'>fallback</div>`,
    collectionLists: new Map([[`listing:1:${COLLECTION_CONFIG}`, "<ul>Chili</ul>"]]),
  });
  assert.equal(html, `<div class="grid"><ul>Chili</ul></div>`);
});

test("collection see-more: a templated listing keeps the listing key on the marker element its items sit in", (t) => {
  const template = "<b>{{title}}</b>";
  const html = render(t, {
    htmlOverride: `<div class="grid" data-jini-listing="1" data-embed-config='${COLLECTION_CONFIG}'><template>${template}</template>fallback</div>`,
    collectionLists: new Map([[`listing:1:${JSON.stringify([{ type: "collection", typeKey: "recipe" }, template])}`, "<b>Chili</b>"]]),
  });
  assert.equal(html, `<div class="grid" data-jini-listing="1"><b>Chili</b></div>`);
});
