import assert from "node:assert/strict";
import test from "node:test";

import { renderStaticPage } from "../static-render.js";
import type { StaticPostPreview } from "../static-render.js";
import type { DiscoveredTheme } from "../theme.js";

/**
 * @file Certifies `renderStaticPage`'s own `{"type":"post-previews"}` substitution (2026-09-03)
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
  assert.ok(rendered?.includes('<time datetime="2026-09-01T00:00:00.000Z">Sep 1, 2026</time>'));
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
    postPreviews: [preview({ title: '<script>alert(1)</script>', href: "/xss", dateIso: 'date" onmouseover="bad&<', dateLabel: '<img src=x>&"' })],
  });
  assert.ok(!rendered?.includes("<script>alert(1)</script>"), "an unescaped title must never reach the output");
  assert.ok(rendered?.includes("&lt;script&gt;"));
  assert.ok(rendered?.includes('<time datetime="date&quot; onmouseover=&quot;bad&amp;&lt;">&lt;img src=x&gt;&amp;&quot;</time>'));

});

test("post-previews: positive fractional limits render at least one bounded preview", () => {
  for (const [limit, expected] of [[0.5, 1], [1.5, 1], [2.9, 2]]) {
    const html = `<div data-embed-config='{"type":"post-previews","limit":${limit}}'>fallback</div>`;
    const rendered = renderStaticPage({ theme: minimalTheme({ blog: html }), pageId: "blog",
      postPreviews: [preview({ title: "First" }), preview({ title: "Second" }), preview({ title: "Third" })] });
    assert.ok(rendered);
    assert.equal((rendered.match(/<article class="post-card">/g) ?? []).length, expected);
    assert.ok(rendered.includes("First"));
    assert.equal(rendered.includes("Second"), expected === 2);
    assert.equal(rendered.includes("Third"), false);
    assert.equal(rendered.includes("fallback"), false);
  }
});
