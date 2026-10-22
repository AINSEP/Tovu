import assert from "node:assert/strict";
import test from "node:test";

import type { JsonObject, JsonValue } from "@jini-ai/core/primitives";
import type { DiscoveredTheme, TemplateNode } from "#src/features/theme/index";
import { resolveAppDistDir } from "#src/platform/site-dir/product-root";
import { buildPostRecord } from "#src/features/post/__tests__/post-record.fixture";
import {
  injectExtraHeadIntoStaticPage,
  injectSiteAssistantIntoStaticPage,
  pageShell,
  renderBlockSeam,
  renderSite,
  renderWidgetIr,
  type RenderSiteRequired,
  type SiteRenderContext,
} from "../render.js";
import { useSiteChatBuild } from "./site-chat.fixture.js";

// ---------------------------------------------------------------------------
// Branch coverage for `render.ts`'s declarative block tree, tier dispatch, page shell, gallery/media
// widgets and post-content widget (L082b). Each test renders through a public entry point and
// asserts on the HTML a visitor would receive.
// ---------------------------------------------------------------------------

function theme(overrides: Partial<DiscoveredTheme> & { tier?: DiscoveredTheme["manifest"]["tier"] } = {}): DiscoveredTheme {
  const { tier = "declarative", ...rest } = overrides;
  return {
    manifest: { id: "t", name: "T", version: "1.0.0", tier, engine: 1, regions: ["footer"] },
    tokens: {},
    tokensLight: {},
    templates: {},
    pages: {},
    partials: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    dir: "/nonexistent/test-theme",
    css: "",
    source: "site",
    status: "valid",
    errors: [],
    ...rest,
  };
}

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

/** Renders `node` as a declarative theme's home (and entry) template and returns the `<main>` body. */
async function renderTemplate(node: JsonValue, overrides: Partial<RenderSiteRequired> = {}): Promise<string> {
  const tree = node as TemplateNode;
  const html = await renderSite({ theme: theme({ templates: { home: tree, entry: tree } }), route: "home", siteTitle: "Site", posts: [], ...overrides });
  const start = html.indexOf("<body");
  return html.slice(html.indexOf(">", start) + 1, html.lastIndexOf("</body>"));
}

function doc(...content: JsonValue[]): JsonObject {
  return { type: "doc", content };
}

const PLACEHOLDER = '<div class="widget widget-placeholder" aria-hidden="true"></div>';

// --- declarative block tree ---------------------------------------------------------------------

test("block tree: a non-object child renders nothing", async () => {
  assert.ok((await renderTemplate(doc(null, { type: "component", id: "tovu/site-footer" }))).includes('<footer class="site-footer">'));
});

test("block tree: a doc block without a content array renders nothing", async () => {
  assert.ok(!(await renderTemplate(doc({ type: "doc", content: "nope" }))).includes("nope"));
});

test("block tree: a node with a non-string type falls through to the content-doc renderer", async () => {
  assert.ok((await renderTemplate(doc({ type: 5, content: [{ type: "text", text: "typeless" }] }))).includes("typeless"));
});

test("block tree: a TipTap paragraph inside a template renders as content-doc markup", async () => {
  assert.ok((await renderTemplate(doc({ type: "paragraph", content: [{ type: "text", text: "Hi" }] }))).includes("<p>Hi</p>"));
});

test("block tree: a component block with a non-string id renders the unknown-component comment", async () => {
  assert.ok((await renderTemplate(doc({ type: "component", id: 5 }))).includes("<!-- unknown component:  -->"));
});

test("block tree: an unregistered component id renders the escaped unknown-component comment", async () => {
  assert.ok((await renderTemplate(doc({ type: "component", id: "tovu/<nope>" }))).includes("<!-- unknown component: tovu/&lt;nope&gt; -->"));
});

test("block tree: a component block whose props are not an object renders with empty props", async () => {
  assert.ok((await renderTemplate(doc({ type: "component", id: "tovu/site-header", props: "bad" }))).includes('<header class="site-header">'));
});

test("block tree: a slot with a non-string name renders the unknown-slot comment", async () => {
  assert.ok((await renderTemplate(doc({ type: "slot", name: 1 }))).includes("<!-- unknown slot:  -->"));
});

test("block tree: the title slot renders the site title off the post route", async () => {
  assert.ok((await renderTemplate(doc({ type: "slot", name: "title" }))).includes('<h1 class="slot-title">Site</h1>'));
});

test("block tree: the title slot renders the post title on the post route", async () => {
  const post = buildPostRecord({ title: "My Post" });
  assert.ok((await renderTemplate(doc({ type: "slot", name: "title" }), { route: "post", post })).includes('<h1 class="slot-title">My Post</h1>'));
});

test("block tree: the content slot renders nothing without a post", async () => {
  assert.ok(!(await renderTemplate(doc({ type: "slot", name: "content" }))).includes("prose"));
});

test("block tree: the entry-list slot renders the post index", async () => {
  assert.ok((await renderTemplate(doc({ type: "slot", name: "entry-list" }))).includes('<section class="entry-list entry-list--index">'));
});

test("block tree: a region block with a non-string key renders no declared region", async () => {
  const widgets = { regions: { footer: [{ componentId: "text", props: { body: "never" } }] }, inlineResolved: new Map() };
  assert.ok(!(await renderTemplate(doc({ type: "region", key: 9 }), { widgets })).includes("never"));
});

// --- renderBlockSeam ----------------------------------------------------------------------------

test("renderBlockSeam: a region prop renders that widget region", () => {
  const ctx = context({ widgetRegions: { footer: [{ componentId: "text", props: { body: "hello" } }] } });
  assert.equal(renderBlockSeam(ctx, { region: "footer" }), '<div class="widget-region widget-region--footer"><div class="widget widget-text">hello</div></div>');
});

// --- tier dispatch ------------------------------------------------------------------------------

test("renderSite: a static theme without an index page renders the fallback body inside the page shell", async () => {
  const html = await renderSite({ theme: theme({ tier: "static" }), route: "home", siteTitle: "Static Site", posts: [] });
  assert.ok(html.includes('<a class="wordmark" href="/">Static Site</a>'), html);
});

test("renderSite: a templated theme with no Liquid template for the route renders the fallback body", async () => {
  const html = await renderSite({ theme: theme({ tier: "templated" }), route: "home", siteTitle: "Liquid Site", posts: [] });
  assert.ok(html.includes('<a class="wordmark" href="/">Liquid Site</a>'), html);
});

test("renderSite: a product without a slug links by its id in the fallback product list", async () => {
  const html = await renderSite({ theme: null, route: "products", siteTitle: "Shop", posts: [], products: [{ id: "p1", slug: "", title: "Mug", price: 1200 }] });
  assert.ok(html.includes('href="/products/p1"'), html);
});

test("renderSite: the product route without a product renders no product article", async () => {
  const html = await renderSite({ theme: null, route: "product", siteTitle: "Shop", posts: [] });
  assert.ok(!html.includes('<article class="entry">'), html);
});

test("renderSite: an html-format post with no stored body renders an empty prose block", async () => {
  const post = buildPostRecord({ bodyFormat: "html", bodyHtml: null });
  const html = await renderSite({ theme: null, route: "post", siteTitle: "Site", posts: [post], post });
  assert.ok(html.includes('<div class="prose"></div>'), html);
});

// --- page shell / static injection --------------------------------------------------------------

test("pageShell: an extraHead carrying its own <title> suppresses the shell's title", () => {
  const html = pageShell({ title: "Shell", theme: null, body: "", extraHead: "<title>SEO</title>" });
  assert.equal(html.match(/<title>/g)?.length, 1);
  assert.ok(html.includes("<title>SEO</title>"));
});

test("pageShell: an extraHead without a <title> keeps the shell's title", () => {
  const html = pageShell({ title: "Shell", theme: null, body: "", extraHead: '<meta name="x" content="y">' });
  assert.ok(html.includes("<title>Shell</title>") && html.includes('<meta name="x" content="y">'), html);
});

test("injectExtraHeadIntoStaticPage: a theme <title> with no closing tag is left in place", () => {
  const html = "<html><head><title>Theme</head><body></body></html>";
  assert.equal(injectExtraHeadIntoStaticPage(html, "<title>SEO</title>"), "<html><head><title>Theme<title>SEO</title></head><body></body></html>");
});

test("injectSiteAssistantIntoStaticPage: a page without </head> or </body> is returned unchanged", (t) => {
  useSiteChatBuild({ test: t, ready: true });
  assert.equal(injectSiteAssistantIntoStaticPage("<p>fragment</p>", "react"), "<p>fragment</p>");
});

test("injectSiteAssistantIntoStaticPage: without TOVU_SITE_CHAT_DIST, readiness is checked against the product's own site-chat dist", (t) => {
  useSiteChatBuild({ test: t, ready: false });
  const page = "<html><head></head><body></body></html>";
  process.env.TOVU_SITE_CHAT_DIST = resolveAppDistDir("site-chat", new URL("..", import.meta.url).pathname);
  const withExplicitDist = injectSiteAssistantIntoStaticPage(page, "vanilla");
  delete process.env.TOVU_SITE_CHAT_DIST;
  assert.equal(injectSiteAssistantIntoStaticPage(page, "vanilla"), withExplicitDist);
});

// --- gallery / media widgets --------------------------------------------------------------------

test("gallery widget: a URL image renders through the document image renderer", () => {
  const html = renderWidgetIr({ componentId: "gallery", props: { config: { images: [{ src: "https://cdn.example/a.jpg", alt: "A" }], layout: "grid" } } });
  assert.ok(html.includes('<figure class="jini-gallery-item"><img src="https://cdn.example/a.jpg" alt="A"'), html);
});

test("gallery widget: a managed image renders the resolved rendition with a 1x srcset", () => {
  const html = renderWidgetIr({
    componentId: "gallery",
    props: {
      config: { images: [{ mediaId: "m1", alt: "Managed" }], layout: "grid" },
      media: { m1: { assetId: "m1", transformName: "public", version: 2 } },
    },
  });
  assert.ok(html.includes('<img src="/m/m1/public.v2/image.jpg" srcset="/m/m1/public.v2/image.jpg 1x" alt="Managed"'), html);
});

test("media widget: raw HTML mode resolves a data-media-slug element to the canonical rendition", () => {
  const html = renderWidgetIr({
    componentId: "media",
    props: {
      config: { mode: "html", html: '<img data-media-slug="hero" alt="Hero">' },
      media: { hero: { assetId: "hero", transformName: "public", version: 1 } },
    },
  });
  assert.ok(html.includes("/m/hero/public.v1/image.jpg"), html);
});

// --- post-content widget ------------------------------------------------------------------------

test("post-content widget: a title without a body renders the widget placeholder", () => {
  assert.equal(renderWidgetIr({ componentId: "post-content", props: { title: "T" } }), PLACEHOLDER);
});

test("post-content widget: a publishAt date is shown instead of updatedAt", () => {
  const html = renderWidgetIr({ componentId: "post-content", props: { title: "T", bodyJson: doc(), publishAt: "2026-10-05T12:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" } });
  assert.ok(html.includes('<time datetime="2026-10-05T12:00:00.000Z">Oct 5, 2026</time>'), html);
});

// Bug D (2026-10-22): the label is the site's calendar day; `datetime` keeps the stored instant.
test("post-content widget: the date label is the calendar day in the IR's site time zone, UTC without one", () => {
  const at = (iso: string, timeZone?: string) =>
    renderWidgetIr({ componentId: "post-content", props: { title: "T", bodyJson: doc(), publishAt: iso, updatedAt: iso, ...(timeZone ? { timeZone } : {}) } });
  // 07:30 UTC Mar 4 is 23:30 Mar 3 in Los Angeles; 16:30 UTC Mar 3 is 01:30 Mar 4 in Tokyo.
  assert.ok(at("2026-03-04T07:30:00.000Z", "America/Los_Angeles").includes('<time datetime="2026-03-04T07:30:00.000Z">Mar 3, 2026</time>'));
  assert.ok(at("2026-03-03T16:30:00.000Z", "Asia/Tokyo").includes('<time datetime="2026-03-03T16:30:00.000Z">Mar 4, 2026</time>'));
  assert.ok(at("2026-03-03T16:30:00.000Z").includes('<time datetime="2026-03-03T16:30:00.000Z">Mar 3, 2026</time>'));
  assert.ok(at("2026-03-03T16:30:00.000Z", "Not/A_Zone").includes('<time datetime="2026-03-03T16:30:00.000Z">Mar 3, 2026</time>'));
});

test("post-content widget: a non-object body falls back to the plain title heading", () => {
  assert.equal(renderWidgetIr({ componentId: "post-content", props: { title: "T", header: true, bodyJson: "raw" } }), '<div class="post-detail-header"><h1>T</h1></div><div class="post-detail-body"></div>');
});

test("post-content widget: a body without a content array falls back to the plain title heading", () => {
  assert.ok(renderWidgetIr({ componentId: "post-content", props: { title: "T", bodyJson: {} } }).startsWith('<div class="post-detail-header"><h1>T</h1>'));
});

test("post-content widget: a title node without inline content renders an empty heading", () => {
  assert.ok(renderWidgetIr({ componentId: "post-content", props: { title: "T", bodyJson: doc({ type: "title" }) } }).startsWith('<div class="post-detail-header"><h1></h1>'));
});

test("post-content widget: serialized media transform versions and asset metadata size a body image; malformed entries are ignored", () => {
  const html = renderWidgetIr({
    componentId: "post-content",
    props: {
      title: "T",
      header: false,
      bodyJson: doc({ type: "image", attrs: { assetId: "a1", transformName: "public", alt: "A" } }),
      mediaTransformVersions: { public: 3, broken: "x" },
      mediaAssetMetadata: { a1: { width: 320, htmlAttributes: 'class="wide"', contentType: "image/png" }, junk: 5 },
    },
  });
  assert.equal(html, '<div class="post-detail-body"><img src="/m/a1/public.v3/image.jpg" alt="A" width="320" class="wide" loading="lazy"></div>');
});

test("post-content widget: serialized inline widgets render at their placement", () => {
  const html = renderWidgetIr({
    componentId: "post-content",
    props: {
      title: "T",
      header: false,
      bodyJson: doc({ type: "widgetEmbed", attrs: { placementId: "w1" } }),
      inlineWidgets: { w1: { componentId: "text", props: { body: "inline" } }, bad: { componentId: 1 } },
    },
  });
  assert.equal(html, '<div class="post-detail-body"><div class="widget widget-text">inline</div></div>');
});

test("post-content widget: asset metadata without a contentType still renders the body image", () => {
  const html = renderWidgetIr({
    componentId: "post-content",
    props: {
      title: "T",
      header: false,
      bodyJson: doc({ type: "image", attrs: { assetId: "a1", transformName: "public", alt: "A" } }),
      mediaTransformVersions: { public: 1 },
      mediaAssetMetadata: { a1: { height: 90 } },
    },
  });
  assert.equal(html, '<div class="post-detail-body"><img src="/m/a1/public.v1/image.jpg" alt="A" height="90" loading="lazy"></div>');
});
