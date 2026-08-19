import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import type { PostRecord } from "#src/features/post/index";
import { loadTheme } from "#src/features/theme/index";
import type { ResolvePageWidgetsResult } from "#src/widgets/resolver-service";
import { renderSite } from "../render.js";

/**
 * @file ADR-020 §3 (C6), Handlebars tier — end-to-end `renderSite` through the
 * real `theme-archive/ledger` demonstrator, exercising the full path:
 * `loadTheme`'s lint, `renderHandlebarsInSandbox`'s worker isolation, the
 * `render_block` seam into the shared component registry, autoescaping, and the
 * one sanctioned `{{{post.content}}}` raw seam.
 *
 * Mirrors the Liquid-tier block in `render.test.ts` case for case, so the two
 * tiers are certified against the same contract rather than each against its
 * own.
 */

function ledgerTheme() {
  const theme = loadTheme({
    themeDir: path.join(process.cwd(), "src", "theme-archive", "ledger"),
    id: "ledger",
    source: "built-in",
  });
  assert.equal(theme.status, "valid", `expected ledger to load valid, got errors: ${JSON.stringify(theme.errors)}`);
  return theme;
}

function fakePost(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    workspaceId: "workspace-1",
    title: "<Hello> & Welcome",
    slug: "welcome",
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hi there." }] }] },
    status: "published",
    updatedAt: "2026-07-01T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

function widgetsResult(overrides: Partial<ResolvePageWidgetsResult> = {}): ResolvePageWidgetsResult {
  return { regions: {}, inlineResolved: new Map(), ...overrides };
}

test("renderSite renders the live themes/handlebars/ledger home page: header/footer components, entry rows, escaped titles, no leftover Handlebars syntax", async () => {
  const theme = ledgerTheme();
  const posts = [fakePost(), fakePost({ id: "2", slug: "second", title: "Second Post", updatedAt: "2026-06-01T00:00:00.000Z" })];
  const html = await renderSite({ theme, route: "home", siteTitle: "Ledger Demo", posts });

  assert.match(html, /site-header/);
  assert.match(html, /site-footer/);
  assert.match(html, /Ledger Demo/);
  // Both entries render, in a loop authored in Handlebars (not a fixed component).
  assert.match(html, /&lt;Hello&gt; &amp; Welcome/);
  assert.match(html, /Second Post/);
  // `{{#if @first}}` — loop data actually resolved, so only the first row is flagged.
  assert.equal(html.match(/class="row__flag">latest</g)?.length, 1);
  // The precomputed short date is used (the tier has no date filter/helper by design).
  assert.match(html, />2026-07-01</);
  // No unrendered Handlebars syntax leaked into the output.
  assert.doesNotMatch(html, /\{\{/);
});

test("renderSite renders the live ledger entry (post) page: content injected raw, title escaped in body and in the shell", async () => {
  const theme = ledgerTheme();
  const post = fakePost();
  const html = await renderSite({ theme, route: "post", siteTitle: "Ledger Demo", posts: [post], post });

  // `{{{post.content}}}` — the pre-sanitized TipTap body renders as real HTML, not escaped text.
  assert.match(html, /<p>Hi there\.<\/p>/);
  // The post title inside the Handlebars body is autoescaped (no triple-stash).
  assert.match(html, /&lt;Hello&gt; &amp; Welcome/);
  // The outer page shell's <title> is also escaped.
  assert.match(html, /<title>&lt;Hello&gt; &amp; Welcome — Ledger Demo<\/title>/);
  assert.doesNotMatch(html, /\{\{/);
});

test("renderSite escapes a hostile post title rather than emitting it as markup (autoescaping is on, mirroring Liquid's outputEscape)", async () => {
  const theme = ledgerTheme();
  const post = fakePost({ title: '<script>alert(1)</script>' });
  const html = await renderSite({ theme, route: "home", siteTitle: "Ledger Demo", posts: [post] });

  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});

test("renderSite falls back to the minimal built-in body (never 500s) when a handlebars theme's source is hostile at render time", async () => {
  const theme = ledgerTheme();
  // Simulate a template hot-edited on disk to smuggle a partial in after
  // `loadTheme` already validated it — the worker's defensive re-lint must
  // still catch it, and `renderSite` must degrade instead of throwing.
  theme.handlebarsTemplates.home = "{{> leak}}";

  const html = await renderSite({ theme, route: "home", siteTitle: "Ledger Demo", posts: [] });
  assert.match(html, /theme render error/);
  // The error message is HTML-escaped (it's injected into an HTML comment).
  assert.match(html, /disallowed partial &quot;leak&quot;/);
  // The fallback body still renders (never a 500/empty response).
  assert.match(html, /site-header/);
  assert.match(html, /site-footer/);
});

test("renderSite falls back rather than throwing when a handlebars template is a syntax error", async () => {
  const theme = ledgerTheme();
  theme.handlebarsTemplates.home = "{{#if unterminated}}";

  const html = await renderSite({ theme, route: "home", siteTitle: "Ledger Demo", posts: [] });
  assert.match(html, /theme render error/);
  assert.match(html, /site-header/);
});

test("renderSite falls back when a handlebars theme has no template for the requested route (partial theme never 500s)", async () => {
  const theme = ledgerTheme();
  const html = await renderSite({ theme, route: "products", siteTitle: "Ledger Demo", posts: [], products: [] });
  // `ledger` declares no products template, so the built-in fallback body renders.
  assert.match(html, /site-header/);
  assert.match(html, /entry-list/);
});

test("renderSite (Handlebars tier): {{render_block region=\"footer\"}} resolves the same widget list over the same seam the Liquid tier uses (ADR-047 §2a)", async () => {
  const theme = ledgerTheme();
  theme.handlebarsTemplates.home = '<div id="footer-region">{{render_block region="footer"}}</div>';

  const html = await renderSite({
    theme,
    route: "home",
    siteTitle: "Widgets Demo",
    posts: [],
    widgets: widgetsResult({
      regions: { footer: [{ componentId: "social-links", props: { links: [{ platform: "GitHub", url: "https://github.com/tovu" }] } }] },
    }),
  });
  assert.match(html, /<div id="footer-region">/);
  assert.match(html, /widget-social-links/);
  assert.match(html, /GitHub/);
});

test("renderSite (Handlebars tier): an unknown component id degrades to a comment, not a crash", async () => {
  const theme = ledgerTheme();
  theme.handlebarsTemplates.home = '{{render_block component="tovu/does-not-exist"}}';

  const html = await renderSite({ theme, route: "home", siteTitle: "Ledger Demo", posts: [] });
  assert.match(html, /<!-- unknown component: tovu\/does-not-exist -->/);
  assert.doesNotMatch(html, /theme render error/);
});

test("both logic tiers see the identical render-data contract — the same fields resolve in Liquid and in Handlebars", async () => {
  const post = fakePost();
  const posts = [post];

  // `theme.name` is deliberately excluded from the compared projection — it is the one field that
  // SHOULD differ (each tier is exercised through its own demonstrator theme). Everything else must
  // be byte-identical.
  const hbs = ledgerTheme();
  hbs.handlebarsTemplates.home = "@@{{site.title}}|{{route}}|{{#each posts}}{{title}}:{{slug}}:{{dateShort}}{{/each}}@@";
  const hbsHtml = await renderSite({ theme: hbs, route: "home", siteTitle: "Shared", posts });

  const liquid = loadTheme({ themeDir: path.join(process.cwd(), "src", "theme-archive", "dispatch"), id: "dispatch", source: "built-in" });
  assert.equal(liquid.status, "valid");
  liquid.liquidTemplates.home = "@@{{ site.title }}|{{ route }}|{% for p in posts %}{{ p.title }}:{{ p.slug }}:{{ p.dateShort }}{% endfor %}@@";
  const liquidHtml = await renderSite({ theme: liquid, route: "home", siteTitle: "Shared", posts });

  const extract = (html: string): string => html.slice(html.indexOf("@@") + 2, html.lastIndexOf("@@"));
  assert.equal(extract(hbsHtml), extract(liquidHtml));
  assert.equal(extract(hbsHtml), "Shared|home|&lt;Hello&gt; &amp; Welcome:welcome:2026-07-01");
});
