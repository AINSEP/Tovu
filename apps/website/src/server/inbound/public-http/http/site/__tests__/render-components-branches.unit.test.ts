import assert from "node:assert/strict";
import test from "node:test";

import type { JsonObject } from "@jini-ai/core/primitives";
import { COMPONENTS, renderWidgetIr, type SiteRenderContext } from "../render.js";

// ---------------------------------------------------------------------------
// Branch coverage for `render.ts`'s theme component registry (`COMPONENTS`) and the widget IR
// renderers (`renderWidgetIr`) — L082b. Theme props and widget IR are untrusted JSON at this
// boundary, so each test feeds one defensive shape and asserts the exact public markup.
// ---------------------------------------------------------------------------

function context(overrides: Partial<SiteRenderContext> = {}): SiteRenderContext {
  return {
    siteTitle: "Site",
    route: "home",
    posts: [],
    products: [],
    themeName: null,
    widgetRegions: {},
    widgetInlineResolved: new Map(),
    mediaTransformVersions: new Map(),
    mediaAssetMetadata: new Map(),
    assignedTerms: [],
    ...overrides,
  };
}

function component(id: string, props: JsonObject, ctx: SiteRenderContext = context()): string {
  const render = COMPONENTS[id];
  assert.ok(render, `component ${id} is registered`);
  return render(ctx, props);
}

// --- safeHref -----------------------------------------------------------------------------------

test("safeHref: a root-relative href the URL parser rejects degrades to '#'", () => {
  const html = renderWidgetIr({ componentId: "social-links", props: { links: [{ url: "//[", platform: "X" }] } });
  assert.equal(html, '<ul class="widget widget-social-links"><li><a class="widget-social-link" href="#">X</a></li></ul>');
});

// --- site header / entry list -------------------------------------------------------------------

test("tovu/site-header: a string tagline renders under the wordmark", () => {
  assert.ok(component("tovu/site-header", { tagline: "Notes & more" }).includes('<p class="tagline">Notes &amp; more</p>'));
});

test("tovu/site-header: compact mode drops the tagline", () => {
  assert.ok(!component("tovu/site-header", { compact: true, tagline: "Hidden" }).includes("tagline"));
});

test("tovu/entry-list: a string layout prop becomes the list's modifier class", () => {
  assert.ok(component("tovu/entry-list", { layout: "grid" }).startsWith('<section class="entry-list entry-list--grid">'));
});

test("tovu/entry-content: renders nothing when the context has no post", () => {
  assert.equal(component("tovu/entry-content", {}), "");
});

// --- actions / hero -----------------------------------------------------------------------------

test("tovu/hero: badge, eyebrow, subtitle and media render; the second action is a ghost button and non-object actions vanish", () => {
  const html = component("tovu/hero", {
    title: "Launch",
    badge: "New",
    eyebrow: "Spring",
    subtitle: "Fast",
    media: { label: "Shot" },
    actions: [{ label: "Go", href: "/go" }, "junk", { href: "/more" }],
  });
  assert.equal(
    html,
    '<section class="hero"><div class="wrap hero__inner"><div class="hero__text"><span class="hero__badge">New</span><p class="eyebrow">Spring</p><h1 class="hero__title">Launch</h1><p class="hero__sub">Fast</p><div class="actions"><a class="btn btn--primary" href="/go">Go</a><a class="btn btn--ghost" href="/more">Learn more</a></div></div><div class="hero__media"><figure class="media-ph" style="aspect-ratio:16 / 9"><span class="media-ph__label">Shot</span></figure></div></div></section>'
  );
});

// --- announcement -------------------------------------------------------------------------------

test("tovu/announcement: empty text renders nothing", () => {
  assert.equal(component("tovu/announcement", { text: "" }), "");
});

test("tovu/announcement: a link object renders the trailing link with its default label", () => {
  assert.equal(
    component("tovu/announcement", { text: "Sale", link: { href: "/sale" } }),
    '<div class="topbar"><div class="wrap"><p class="topbar__text">Sale <a class="topbar__link" href="/sale">Learn more →</a></p></div></div>'
  );
});

test("tovu/announcement: text without a link renders only the text", () => {
  assert.equal(component("tovu/announcement", { text: "Sale" }), '<div class="topbar"><div class="wrap"><p class="topbar__text">Sale</p></div></div>');
});

// --- nav ----------------------------------------------------------------------------------------

test("tovu/nav: non-object items and non-object dropdown children render nothing in their place", () => {
  const html = component("tovu/nav", { items: ["junk", { label: "Docs", href: "/docs", children: [7, { label: "API", href: "/api" }] }] });
  assert.ok(
    html.includes('<ul class="nav-list"><li class="nav-item has-children"><a class="nav-link" href="/docs">Docs<svg'),
    html
  );
  assert.ok(html.includes('<ul class="nav-dropdown"><li><a href="/api">API</a></li></ul>'), html);
});

// --- cta ----------------------------------------------------------------------------------------

test("tovu/cta: eyebrow and subtitle render around the title", () => {
  assert.equal(
    component("tovu/cta", { eyebrow: "Ready?", title: "Start", subtitle: "Today" }),
    '<section class="cta"><div class="wrap"><div class="cta__inner"><p class="eyebrow eyebrow--on-dark">Ready?</p><h2 class="cta__title">Start</h2><p class="cta__sub">Today</p></div></div></section>'
  );
});

// --- rich footer --------------------------------------------------------------------------------

test("tovu/footer: blurb renders and non-object socials, columns and column links vanish", () => {
  const html = component("tovu/footer", {
    brand: "Acme",
    blurb: "We build.",
    legal: "Legal",
    social: [1, { label: "Mastodon", href: "https://m.example" }],
    columns: [null, { title: "Docs", links: ["junk", { label: "Guide", href: "/guide" }] }],
  });
  assert.equal(
    html,
    '<footer class="site-footer site-footer--rich"><div class="wrap footer__top"><div class="footer__brandcol"><a class="brand" href="/">Acme</a><p class="footer__blurb">We build.</p><div class="footer__socials"><a class="footer__social" href="https://m.example">Mastodon</a></div></div><div class="footer__cols"><div class="footer__col"><h4>Docs</h4><ul><li><a href="/guide">Guide</a></li></ul></div></div></div><div class="wrap footer__bottom"><span>Legal</span></div></footer>'
  );
});

// --- section ------------------------------------------------------------------------------------

test("tovu/section: id, eyebrow, title, lead, bullets and left-side media all render", () => {
  assert.equal(
    component("tovu/section", { id: "why", side: "left", eyebrow: "E", title: "T", lead: "L", bullets: ["b1"], media: { label: "M" } }),
    '<section class="section section--media-left" id="why"><div class="wrap section__inner"><div class="section__text"><p class="eyebrow">E</p><h2 class="section__title">T</h2><p class="section__lead">L</p><ul class="ticks"><li>b1</li></ul></div><div class="section__media"><figure class="media-ph" style="aspect-ratio:16 / 9"><span class="media-ph__label">M</span></figure></div></div></section>'
  );
});

test("tovu/section: media defaults to the right side", () => {
  assert.ok(component("tovu/section", { media: { label: "M" } }).startsWith('<section class="section section--media-right">'));
});

test("tovu/section: with no media, no bullets and no headings the section is plain text", () => {
  assert.equal(
    component("tovu/section", { body: ["p1"] }),
    '<section class="section section--plain"><div class="wrap section__inner"><div class="section__text"><p>p1</p></div></div></section>'
  );
});

// --- feature grid -------------------------------------------------------------------------------

test("tovu/feature-grid: eyebrow, title and a card tag render; non-object items vanish", () => {
  assert.equal(
    component("tovu/feature-grid", { eyebrow: "E", title: "T", items: [false, { tag: "New", title: "F", body: "B" }] }),
    '<section class="feature-grid"><div class="wrap"><header class="feature-grid__head"><p class="eyebrow">E</p><h2 class="section__title">T</h2></header><div class="features"><article class="feature"><div class="feature__head"><span class="feature__tag">New</span><h3 class="feature__title">F</h3></div><p class="feature__body">B</p></article></div></div></section>'
  );
});

test("tovu/feature-grid: no eyebrow, title or card tag renders a bare head and card", () => {
  assert.equal(
    component("tovu/feature-grid", { items: [{ title: "F", body: "B" }] }),
    '<section class="feature-grid"><div class="wrap"><header class="feature-grid__head"></header><div class="features"><article class="feature"><div class="feature__head"><h3 class="feature__title">F</h3></div><p class="feature__body">B</p></article></div></div></section>'
  );
});

// --- widget IR ----------------------------------------------------------------------------------

test("social-links widget: a non-object link entry renders nothing in its place", () => {
  assert.equal(renderWidgetIr({ componentId: "social-links", props: { links: ["junk"] } }), '<ul class="widget widget-social-links"></ul>');
});

test("entry-summary widget: a valid slug links to the post", () => {
  assert.equal(
    renderWidgetIr({ componentId: "entry-summary", props: { slug: "hello-world", title: "Hello" } }),
    '<li class="widget-entry-summary"><a href="/hello-world">Hello</a></li>'
  );
});

test("recent-entries widget: no children renders the empty-state list", () => {
  assert.equal(
    renderWidgetIr({ componentId: "recent-entries", props: {} }),
    '<ul class="widget widget-recent-entries"><li class="widget-empty">No entries yet.</li></ul>'
  );
});

test("recent-entries widget: a cards layout with no children renders the empty-state list", () => {
  assert.equal(
    renderWidgetIr({ componentId: "recent-entries", props: { layout: "cards" } }),
    '<ul class="widget widget-recent-entries"><li class="widget-empty">No entries yet.</li></ul>'
  );
});

test("recent-entries widget: a cards layout honours a numeric columns prop", () => {
  const html = renderWidgetIr({ componentId: "recent-entries", props: { layout: "cards", columns: 2 }, children: [{ componentId: "entry", props: { title: "One" } }] });
  assert.ok(html.includes("--entry-list-columns:2"), html);
});

test("recent-entries widget: a non-object field entry and a field without a value still render the item", () => {
  const html = renderWidgetIr({
    componentId: "recent-entries",
    props: { layout: "cards" },
    children: [{ componentId: "entry", props: { title: "One", fields: ["junk", { name: "price", label: "Price", kind: "text" }] } }],
  });
  assert.ok(html.includes("One"), html);
});

test("menu widget: a non-object item renders nothing in its place", () => {
  assert.equal(
    renderWidgetIr({ componentId: "menu", props: { items: [3, { label: "Home", href: "/", available: true }] } }),
    '<nav class="widget widget-menu"><ul><li><a href="/">Home</a></li></ul></nav>'
  );
});

test("contact-form widget: a missing slug renders the widget placeholder", () => {
  assert.equal(renderWidgetIr({ componentId: "contact-form", props: {} }), '<div class="widget widget-placeholder" aria-hidden="true"></div>');
});

test("contact-form widget: HTML mode passes the authored form HTML to the shared form renderer", () => {
  const html = renderWidgetIr({
    componentId: "contact-form",
    props: { slug: "contact", mode: "html", html: '<p class="authored-intro">Write to us</p>', fields: [] },
  });
  assert.ok(html.includes('<p class="authored-intro">Write to us</p>'), html);
});

test("contact-form widget: a null field entry is skipped when deciding the multipart encoding", () => {
  const html = renderWidgetIr({ componentId: "contact-form", props: { slug: "c", fields: [null, { name: "upload", type: "file", label: "Upload" }] } });
  assert.ok(html.includes(' method="post" enctype="multipart/form-data" action="/forms/c/submit"'), html);
});

test("taxonomy-list widget: renders a nested term tree and ignores non-object terms", () => {
  const html = renderWidgetIr({
    componentId: "taxonomy-list",
    props: {
      id: "topics",
      name: "Topics",
      hierarchical: true,
      terms: ["junk", { id: "t1", name: "Root", parentId: 9 }, { id: "t2", name: "Leaf", parentId: "t1" }],
    },
  });
  assert.ok(html.includes('<li data-tovu-term="t1" data-depth="0"><span data-tovu-term-label>Root</span><ul data-tovu-taxonomy-list data-depth="1"><li data-tovu-term="t2" data-depth="1">'), html);
});

test("taxonomy-list widget: a missing terms array renders no term", () => {
  assert.ok(!renderWidgetIr({ componentId: "taxonomy-list", props: { id: "topics", name: "Topics" } }).includes("data-tovu-term="));
});
