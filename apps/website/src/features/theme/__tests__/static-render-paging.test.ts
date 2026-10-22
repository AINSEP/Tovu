import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { renderStaticPage, type StaticPostPreview } from "../static-render.js";
import type { DiscoveredTheme } from "../theme.js";

/**
 * @file Bug C (2026-10-22) — a `{"type":"post-previews","paged":true}` marker renders the route's
 * resolved page of posts plus its "Newer/Older posts" nav, so a list is never capped at one batch.
 * I/O-free: the route resolves the page ({@link renderStaticPage}'s `postPreviewsPage`).
 */

const THEME: DiscoveredTheme = {
  manifest: { id: "paging-test", name: "Paging Test", version: "1.0.0", tier: "static", engine: 1 },
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

const PREVIEW: StaticPostPreview = { title: "Older", href: "/older", dateIso: "2026-01-01", dateLabel: "Jan 1" };
const CARD = `<article class="post-card"><h3><a href="/older">Older</a></h3><div class="post-meta"><time datetime="2026-01-01">Jan 1</time></div></article>`;
const NAV = `<nav class="jini-pagination" aria-label="Pagination"><a rel="prev" href="/">Newer posts</a></nav>`;
const PAGED = `<section data-embed-config='{"type":"post-previews","limit":1,"paged":true}'>No posts yet.</section>`;

function render(t: TestContext, required: Omit<Parameters<typeof renderStaticPage>[0], "theme" | "pageId">): string | null {
  t.mock.method(console, "warn", () => undefined);
  return renderStaticPage({ theme: THEME, pageId: "listing", ...required });
}

test("paged post-previews: renders the resolved page's items followed by its nav", (t) => {
  const html = render(t, { htmlOverride: PAGED, postPreviews: [{ ...PREVIEW, title: "Newest", href: "/newest" }], postPreviewsPage: { items: [PREVIEW], nav: NAV } });
  assert.equal(html, `<section data-embed-config='{"type":"post-previews","limit":1,"paged":true}'>${CARD}</section>${NAV}`);
});

test("paged post-previews: a single page renders no nav (the route hands an empty one)", (t) => {
  const html = render(t, { htmlOverride: PAGED, postPreviewsPage: { items: [PREVIEW], nav: "" } });
  assert.equal(html, `<section data-embed-config='{"type":"post-previews","limit":1,"paged":true}'>${CARD}</section>`);
});

test("paged post-previews: zero posts keeps the authored fallback and no nav", (t) => {
  const html = render(t, { htmlOverride: PAGED, postPreviewsPage: { items: [], nav: NAV } });
  assert.equal(html, PAGED);
});

test("paged post-previews: with no page resolved, a paged marker falls back to the plain first slice", (t) => {
  const html = render(t, { htmlOverride: PAGED, postPreviews: [PREVIEW] });
  assert.equal(html, `<section data-embed-config='{"type":"post-previews","limit":1,"paged":true}'>${CARD}</section>`);
});

test("paged post-previews: a marker without paged ignores the page and slices postPreviews", (t) => {
  const plain = `<div data-embed-config='{"type":"post-previews","limit":1}'></div>`;
  const html = render(t, { htmlOverride: plain, postPreviews: [PREVIEW], postPreviewsPage: { items: [{ ...PREVIEW, title: "x" }], nav: NAV } });
  assert.equal(html, `<div data-embed-config='{"type":"post-previews","limit":1}'>${CARD}</div>`);
});
