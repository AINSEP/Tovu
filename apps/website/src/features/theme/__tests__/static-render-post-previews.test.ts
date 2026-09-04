import assert from "node:assert/strict";
import test from "node:test";

import { renderStaticPage, scanPostPreviewsLimit, DEFAULT_POST_PREVIEWS_LIMIT, MAX_POST_PREVIEWS_LIMIT } from "../static-render.js";
import type { DiscoveredTheme, StaticPostPreview } from "../static-render.js";

/**
 * @file Certifies the post-previews marker (2026-09-03) — `scanPostPreviewsLimit` (the route layer's
 * "should I even query" gate) and `renderStaticPage`'s own `{"type":"post-previews"}` substitution
 * (`injectPostPreviewsEmbeds`, private to `static-render.ts`, exercised here only through
 * `renderStaticPage`'s public surface — the same convention `menu-tree-render.test.ts` follows for
 * `injectMenuEmbeds`).
 *
 * This file is I/O-free by design (matches `static-render.ts`'s own header): every test hands in an
 * already-resolved `StaticPostPreview[]`, never a `PostRecord` or a repo. The route-layer wiring that
 * fetches/filters real posts is covered separately in
 * `server/inbound/public-http/routes/site/__tests__/static-post-previews-resolution.test.ts`.
 */

function minimalTheme(pages: Record<string, string>): DiscoveredTheme {
  return {
    manifest: { id: "post-previews-test-theme", name: "Post Previews Test Theme", version: "1.0.0", tier: "static", engine: 1, templates: [] },
    dir: "/nonexistent/post-previews-test-theme",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages,
    partials: {},
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  } as unknown as DiscoveredTheme;
}

function preview(overrides: Partial<StaticPostPreview> = {}): StaticPostPreview {
  return {
    title: "A real post",
    href: "/a-real-post",
    dateIso: "2026-09-01T00:00:00.000Z",
    dateLabel: "Sep 1, 2026",
    ...overrides,
  };
}

test("scanPostPreviewsLimit: undefined when the page carries no post-previews marker at all", () => {
  const html = "<html><body><main>no marker here</main></body></html>";
  assert.equal(scanPostPreviewsLimit(html), undefined);
});

test("scanPostPreviewsLimit: the marker's own configured limit", () => {
  const html = "<div data-embed-config='{\"type\":\"post-previews\",\"limit\":3}'></div>";
  assert.equal(scanPostPreviewsLimit(html), 3);
});

test("scanPostPreviewsLimit: defaults when limit is absent", () => {
  const html = "<div data-embed-config='{\"type\":\"post-previews\"}'></div>";
  assert.equal(scanPostPreviewsLimit(html), DEFAULT_POST_PREVIEWS_LIMIT);
});

test("scanPostPreviewsLimit: clamps an adversarially large limit to the ceiling", () => {
  const html = "<div data-embed-config='{\"type\":\"post-previews\",\"limit\":999999}'></div>";
  assert.equal(scanPostPreviewsLimit(html), MAX_POST_PREVIEWS_LIMIT);
});

test("scanPostPreviewsLimit: a non-positive/invalid limit degrades to the default rather than 0 or negative", () => {
  assert.equal(scanPostPreviewsLimit("<div data-embed-config='{\"type\":\"post-previews\",\"limit\":0}'></div>"), DEFAULT_POST_PREVIEWS_LIMIT);
  assert.equal(scanPostPreviewsLimit("<div data-embed-config='{\"type\":\"post-previews\",\"limit\":-5}'></div>"), DEFAULT_POST_PREVIEWS_LIMIT);
  assert.equal(scanPostPreviewsLimit("<div data-embed-config='{\"type\":\"post-previews\",\"limit\":\"six\"}'></div>"), DEFAULT_POST_PREVIEWS_LIMIT);
});

test("scanPostPreviewsLimit: multiple markers on one page report the WIDEST clamped limit", () => {
  const html =
    "<div data-embed-config='{\"type\":\"post-previews\",\"limit\":3}'></div>" +
    "<div data-embed-config='{\"type\":\"post-previews\",\"limit\":10}'></div>";
  assert.equal(scanPostPreviewsLimit(html), 10);
});

test("renderStaticPage: a page WITHOUT the marker renders byte-identically whether or not postPreviews is supplied", () => {
  const theme = minimalTheme({ index: "<html><body><main>home, no marker</main></body></html>" });
  const withoutPreviews = renderStaticPage({ theme, pageId: "index" });
  const withUnusedPreviews = renderStaticPage({ theme, pageId: "index", postPreviews: [preview()] });
  assert.equal(withoutPreviews, withUnusedPreviews, "a page carrying no marker must be unaffected by postPreviews being supplied");
  assert.ok(withoutPreviews?.includes("home, no marker"));
});

test("renderStaticPage: omitting postPreviews (or an empty array) leaves the marker's authored fallback untouched", () => {
  const html =
    '<div class="grid" data-embed-config=\'{"type":"post-previews","limit":6}\'>' +
    "<article>fallback card</article>" +
    "</div>";
  const theme = minimalTheme({ blog: html });

  const omitted = renderStaticPage({ theme, pageId: "blog" });
  assert.ok(omitted?.includes("fallback card"), "no postPreviews at all -> fallback content survives");

  const empty = renderStaticPage({ theme, pageId: "blog", postPreviews: [] });
  assert.ok(empty?.includes("fallback card"), "an empty postPreviews array -> fallback content survives (mirrors the menu marker's own contract)");
});

test("renderStaticPage: real previews replace the marker's inner content, preserving the marker element's own tag/attrs", () => {
  const html =
    '<section class="blog-grid" data-embed-config=\'{"type":"post-previews","limit":6}\'>' +
    "<article>fallback card</article>" +
    "</section>";
  const theme = minimalTheme({ blog: html });

  const rendered = renderStaticPage({
    theme,
    pageId: "blog",
    postPreviews: [preview({ title: "Hello World", href: "/hello-world" })],
  });
  assert.ok(rendered?.startsWith('<section class="blog-grid" data-embed-config='), "the marker's own tag/attrs survive the substitution");
  assert.ok(rendered?.includes("Hello World"));
  assert.ok(rendered?.includes('href="/hello-world"'));
  assert.ok(!rendered?.includes("fallback card"), "real data replaces the authored fallback");
});

test("renderStaticPage: a marker's own limit bounds how many previews it shows, even when more are supplied", () => {
  const html = '<div data-embed-config=\'{"type":"post-previews","limit":2}\'>fallback</div>';
  const theme = minimalTheme({ blog: html });

  const rendered = renderStaticPage({
    theme,
    pageId: "blog",
    postPreviews: [
      preview({ title: "Post One", href: "/post-one" }),
      preview({ title: "Post Two", href: "/post-two" }),
      preview({ title: "Post Three", href: "/post-three" }),
    ],
  });
  assert.ok(rendered?.includes("Post One"));
  assert.ok(rendered?.includes("Post Two"));
  assert.ok(!rendered?.includes("Post Three"), "the marker's own limit=2 must exclude the third preview even though it was supplied");
});

test("renderStaticPage: title/date values are HTML-escaped", () => {
  const html = '<div data-embed-config=\'{"type":"post-previews"}\'>fallback</div>';
  const theme = minimalTheme({ blog: html });

  const rendered = renderStaticPage({
    theme,
    pageId: "blog",
    postPreviews: [preview({ title: '<script>alert(1)</script>', href: "/xss" })],
  });
  assert.ok(!rendered?.includes("<script>alert(1)</script>"), "an unescaped title must never reach the output");
  assert.ok(rendered?.includes("&lt;script&gt;"));
});
