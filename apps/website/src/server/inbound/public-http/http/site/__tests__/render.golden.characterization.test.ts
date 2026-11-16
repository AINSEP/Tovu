import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import test, { mock } from "node:test";

import type { JsonObject, JsonValue } from "@jini-ai/core/primitives";
import type { WidgetRenderIR } from "@jini-ai/cms/widgets";
import { loadTheme, type DiscoveredTheme } from "#src/features/theme/index";
import { buildPostRecord } from "#src/features/post/__tests__/post-record.fixture";
import { useSiteChatBuild } from "./site-chat.fixture.js";
import { COMPONENTS, renderDocBodyAsPageHtml, renderDocNode, renderSite, renderWidgetIr, type MediaAssetRenderMeta, type SiteRenderContext } from "../render.js";
import { DOC_NODE_HANDLERS } from "../render/doc/doc-nodes.js";
import {
  MARK_RENDERERS,
} from "../render/doc/marks.js";
import {
  pageShell,
} from "../render/document-shell.js";
import {
  injectExtraHeadIntoStaticPage,
  injectSiteAssistantIntoStaticPage,
} from "../render/static-page-injection.js";

process.env.TOVU_THEME_RENDER_TIMEOUT_MS ??= "60000";

/**
 * @file Golden characterization pins for `render.ts` (size design 03, step 0a). One sha1 per case,
 * taken on the UNMODIFIED file; every later move step must leave every hash unchanged. Determinism:
 * the wall clock is pinned (the rich footer defaults to the current year) and the one random value
 * (`widget-contact-<uuid>`) is replaced by an ordinal before hashing — with two separate assertions
 * that keep what the replacement hides (one id per form, a different id per form).
 *
 * Regenerate the table only for an INTENTIONAL render change: `GOLDEN_PRINT=1 node ... --test <this file>`.
 */

const ROOT = path.resolve(import.meta.dirname, "../../../../../../../../../");
const PRINT = process.env.GOLDEN_PRINT === "1";
const NOW = new Date("2026-06-15T12:00:00.000Z");

function normalizeIds(html: string): string {
  const seen = new Map<string, number>();
  return html.replace(/widget-contact-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (id) => {
    if (!seen.has(id)) seen.set(id, seen.size);
    return `widget-contact-#${seen.get(id)}`;
  });
}

const sha = (html: string): string => createHash("sha1").update(normalizeIds(html)).digest("hex");
const printed: Record<string, string> = {};
const OUT: Record<string, string> = {};

function pin(name: string, html: string): void {
  assert.equal(typeof html, "string");
  OUT[name] = html;
  printed[name] = sha(html);
}

// --------------------------------------------------------------------------- fixtures

const text = (value: string, marks?: JsonObject[]): JsonObject => ({ type: "text", text: value, ...(marks ? { marks } : {}) });
const para = (...content: JsonObject[]): JsonObject => ({ type: "paragraph", content });

const META = (fields: Partial<MediaAssetRenderMeta>): MediaAssetRenderMeta => ({
  width: null, height: null, cssClass: null, htmlAttributes: null, contentType: null, slug: null, ...fields,
});

const DOC_OPTIONS = {
  mediaTransformVersions: new Map([["thumb", 3]]),
  mediaAssetMetadata: new Map<string, MediaAssetRenderMeta>([
    ["asset1", META({ sha256: "abc123", width: 640, height: 480, cssClass: "asset-class", htmlAttributes: 'data-a="1" class="from-attr"', slug: "hero-shot" })],
    ["vid1", META({ contentType: "video/mp4", width: 320, height: 240, sha256: "vv" })],
    ["aud1", META({ contentType: "audio/mpeg", sha256: "aa" })],
  ]),
  inlineResolved: new Map<string, WidgetRenderIR>([
    ["p1", { componentId: "text", props: { body: "hello\n<b>x</b>" } }],
    ["p2", { componentId: "social-links", props: { links: [{ platform: "Mastodon", url: "https://m.example/x" }, { platform: "Bad", url: "javascript:alert(1)" }] } }],
  ]),
};

function nest(type: "bulletList" | "blockquote", times: number): JsonObject {
  let node: JsonObject = para(text("leaf"));
  for (let i = 0; i < times; i++) node = { type, content: type === "bulletList" ? [{ type: "listItem", content: [node] }] : [node] };
  return node;
}

// --------------------------------------------------------------------------- (a) renderDocNode

const NODE_FIXTURES: Record<string, JsonValue> = {
  doc: { type: "doc", content: [para(text("in doc"))] },
  paragraph: { type: "paragraph", attrs: { textAlign: "center" }, content: [text("centered")] },
  heading: { type: "heading", attrs: { level: 2, textAlign: "right" }, content: [text("Hello, World & Co")] },
  "heading-level-clamp": { type: "heading", attrs: { level: 9 }, content: [text("Clamped")] },
  title: { type: "title", content: [text("never rendered")] },
  text: text("plain <text> & more"),
  taskItem: { type: "taskItem", attrs: { checked: true }, content: [para(text("lone task"))] },
  listItem: { type: "listItem", content: [para(text("bare item"))] },
  tableRow: { type: "tableRow", content: [{ type: "tableCell", content: [para(text("r"))] }] },
  tableCell: { type: "tableCell", attrs: { colspan: 2, rowspan: 2, textAlign: "left" }, content: [para(text("cell"))] },
  tableHeader: { type: "tableHeader", attrs: { colspan: 3 }, content: [para(text("hdr"))] },
  bulletList: { type: "bulletList", content: [{ type: "listItem", content: [para(text("a"))] }, { type: "listItem", content: [para(text("b"))] }] },
  orderedList: { type: "orderedList", content: [{ type: "listItem", content: [para(text("one"))] }] },
  taskList: { type: "taskList", content: [
    { type: "taskItem", attrs: { checked: true }, content: [para(text("done"))] },
    { type: "taskItem", attrs: { checked: false }, content: [para(text("todo"))] },
  ] },
  table: { type: "table", content: [
    { type: "tableRow", content: [
      { type: "tableHeader", attrs: { colspan: 2, textAlign: "center" }, content: [para(text("H"))] },
    ] },
    { type: "tableRow", content: [
      { type: "tableCell", attrs: { rowspan: 3, colspan: 1, textAlign: "right" }, content: [para(text("c1"))] },
      { type: "tableCell", attrs: { colspan: "x" }, content: [para(text("c2"))] },
    ] },
  ] },
  blockquote: { type: "blockquote", content: [para(text("quoted"))] },
  codeBlock: { type: "codeBlock", attrs: { language: "ts" }, content: [text("const a = 1 < 2;")] },
  "codeBlock-bad-language": { type: "codeBlock", attrs: { language: "x y\"z" }, content: [text("raw")] },
  horizontalRule: { type: "horizontalRule" },
  hardBreak: { type: "hardBreak" },
  "image-ref": { type: "image", attrs: { assetId: "asset1", transformName: "thumb", alt: "A <photo>" } },
  "image-ref-no-meta": { type: "image", attrs: { assetId: "asset9", transformName: "thumb", alt: "none" } },
  "image-ref-unknown-transform": { type: "image", attrs: { assetId: "asset1", transformName: "nope", alt: "x" } },
  "image-legacy-src": { type: "image", attrs: { src: "https://cdn.example/a.png", alt: "legacy", title: "T", width: 10, height: "20" } },
  "image-javascript-src": { type: "image", attrs: { src: "javascript:alert(1)", alt: "bad" } },
  "image-placeholder": { type: "image", attrs: { alt: "nothing" } },
  "media-video": { type: "media", attrs: { assetId: "vid1", alt: "vid", cssClass: "node-class" } },
  "media-audio": { type: "media", attrs: { assetId: "aud1", alt: "aud", htmlAttributes: 'controls data-k="v"' } },
  "media-image": { type: "media", attrs: { assetId: "asset1", transformName: "thumb", alt: "m", cssClass: "n", htmlAttributes: 'data-z="9"' } },
  "media-placeholder": { type: "media", attrs: { assetId: "../bad", alt: "" } },
  youtube: { type: "youtube", attrs: { src: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", start: 42 } },
  "youtube-bad": { type: "youtube", attrs: { src: "https://evil.example/watch?v=dQw4w9WgXcQ" } },
  mention: { type: "mention", attrs: { id: "hello-world", label: "Hello <World>" } },
  "mention-bad-slug": { type: "mention", attrs: { id: "Bad Slug!", label: "x" } },
  "widgetEmbed-plain": { type: "widgetEmbed", attrs: { placementId: "p1" } },
  "widgetEmbed-class-attrs": { type: "widgetEmbed", attrs: { placementId: "p2", cssClass: "wide", htmlAttributes: 'class="extra" data-x="1"' } },
  "widgetEmbed-unresolved": { type: "widgetEmbed", attrs: { placementId: "missing", cssClass: "only-class" } },
  "unknown-node-renders-children": { type: "mystery", content: [para(text("child"))] },
  "non-object-node": "just a string",
  "legacy-gallery-image-callback": { type: "image", attrs: { src: "https://cdn.example/legacy.png", alt: "legacy gallery" } },
};

test("golden (a): renderDocNode covers every DOC_NODE_HANDLERS type", () => {
  const covered = new Set(Object.keys(NODE_FIXTURES).map((key) => key.split("-")[0]));
  for (const type of Object.keys(DOC_NODE_HANDLERS)) assert.ok(covered.has(type), `no fixture for node type ${type}`);
});

test("golden (a): renderDocNode per node type", () => {
  for (const [name, node] of Object.entries(NODE_FIXTURES)) pin(`doc-node:${name}`, renderDocNode({ node }, DOC_OPTIONS));
});

const MARK_CASES: Record<string, JsonObject[]> = {
  bold: [{ type: "bold" }],
  italic: [{ type: "italic" }],
  code: [{ type: "code" }],
  underline: [{ type: "underline" }],
  strike: [{ type: "strike" }],
  subscript: [{ type: "subscript" }],
  superscript: [{ type: "superscript" }],
  textStyle: [{ type: "textStyle", attrs: { color: "#ff0000", fontFamily: "Georgia, serif", fontSize: "18px" } }],
  "textStyle-hostile": [{ type: "textStyle", attrs: { color: "red;background:url(x)", fontFamily: "a;b", fontSize: "1em;x" } }],
  highlight: [{ type: "highlight", attrs: { color: "#ffee00" } }],
  link: [{ type: "link", attrs: { href: "https://tovu.dev/a?b=c&d=e" } }],
  "link-hostile": [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
  "bold+link+italic": [{ type: "bold" }, { type: "link", attrs: { href: "/x" } }, { type: "italic" }],
  "unknown-mark": [{ type: "wiggle" }],
};

test("golden (a): renderDocNode per mark type", () => {
  for (const type of Object.keys(MARK_RENDERERS)) assert.ok(Object.keys(MARK_CASES).some((key) => key.split(/[-+]/)[0] === type), `no fixture for mark ${type}`);
  for (const [name, marks] of Object.entries(MARK_CASES)) pin(`doc-mark:${name}`, renderDocNode({ node: para(text("m <x>", marks)) }));
});

test("golden (a): depth limit — at the limit renders, one level past renders the placeholder", () => {
  // Each `bulletList` level costs two depth units (list -> listItem), a blockquote one.
  const atLimit = renderDocNode({ node: { type: "doc", content: [nest("blockquote", 198)] } });
  const pastLimit = renderDocNode({ node: { type: "doc", content: [nest("blockquote", 199)] } });
  const wayPast = renderDocNode({ node: { type: "doc", content: [nest("blockquote", 230)] } });
  const lists = renderDocNode({ node: { type: "doc", content: [nest("bulletList", 60), nest("bulletList", 120)] } });
  pin("doc-depth:blockquote-198", atLimit);
  pin("doc-depth:blockquote-199", pastLimit);
  pin("doc-depth:blockquote-230", wayPast);
  pin("doc-depth:bulletList-60-120", lists);
  assert.ok(!atLimit.includes("Content too deeply nested to render"), "depth 198 must still render");
  assert.ok(wayPast.includes("Content too deeply nested to render"), "past the limit must be a placeholder");
  assert.notEqual(atLimit, wayPast);
});

test("golden (a): renderDocBodyAsPageHtml (managed markers, heading ids)", () => {
  const doc: JsonObject = { type: "doc", content: [
    { type: "heading", attrs: { level: 2 }, content: [text("Same")] },
    { type: "heading", attrs: { level: 2 }, content: [text("Same")] },
    { type: "heading", attrs: { level: 3 }, content: [text("Über Café!")] },
    { type: "widgetEmbed", attrs: { widgetEntryId: "w1", cssClass: "emb", htmlAttributes: 'data-k="v" class="c2"' } },
    { type: "image", attrs: { assetId: "asset1", transformName: "thumb", alt: "managed <x>" } },
    { type: "media", attrs: { assetId: "asset2", cssClass: "m" } },
    para(text("tail")),
  ] };
  const body = renderDocBodyAsPageHtml({ bodyJson: doc });
  pin("doc-body-as-page-html", body);
  pin("doc-body-as-page-html:non-doc", renderDocBodyAsPageHtml({ bodyJson: "nope" }));
  assert.ok(body.includes("data-embed-config"), "managed nodes become embed markers");
  assert.ok(!body.includes("DOCMARKER"), "no marker token may leak");
});

test("golden (a): legacy `src` gallery image and post title with marks go through the doc renderer", () => {
  const gallery = renderWidgetIr({ componentId: "gallery", props: {
    config: { layout: "grid", columns: 2, images: [{ src: "https://cdn.example/legacy.png", alt: "legacy" }, { mediaId: "hero-shot" }] },
    media: { "hero-shot": { assetId: "asset1", transformName: "thumb", version: 3, slug: "hero-shot", alt: "stored alt" } },
  } });
  pin("callback:gallery-legacy-src-image", gallery);
  assert.ok(gallery.includes("cdn.example/legacy.png"), gallery);
  const title = renderWidgetIr({ componentId: "post-content", props: {
    title: "ignored", header: true, publishAt: "2026-10-05T12:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    bodyJson: { type: "doc", content: [{ type: "title", content: [text("A "), text("bold", [{ type: "bold" }]), text(" <title>", [{ type: "italic" }])] }, para(text("body"))] },
  } });
  pin("callback:post-title-with-marks", title);
  assert.ok(title.includes("<strong>bold</strong>"), title);
});

// --------------------------------------------------------------------------- (b) renderWidgetIr

const WIDGET_CASES: Record<string, WidgetRenderIR> = {
  text: { componentId: "text", props: { body: "line1\nline <2>" } },
  "social-links": { componentId: "social-links", props: { links: [{ platform: "Mastodon", url: "https://m.example/x" }, "junk", { platform: "x", url: "javascript:1" }] } },
  "recent-entries-empty": { componentId: "recent-entries", props: {} },
  "recent-entries-list": { componentId: "recent-entries", props: { layout: "list" }, children: [
    { componentId: "entry-summary", props: { title: "First <post>", href: "/first", dateIso: "2026-01-02", dateLabel: "Jan 2, 2026" } },
    { componentId: "entry-summary", props: { title: "No link" } },
  ] },
  "recent-entries-grid": { componentId: "recent-entries", props: { layout: "grid", columns: 2, typeKey: "news" }, children: [
    { componentId: "entry-summary", props: { title: "G1", href: "/g1", dateIso: "2026-02-02", dateLabel: "Feb 2, 2026", fields: [{ name: "k", label: "K", kind: "text", value: "v" }] } },
  ] },
  "entry-summary": { componentId: "entry-summary", props: { slug: "my-post", title: "My <Post>" } },
  "entry-summary-bad-slug": { componentId: "entry-summary", props: { slug: "Bad Slug", title: "x" } },
  "menu-items": { componentId: "menu", props: { title: "Main", items: [
    { label: "Home", href: "/", available: true, attrs: { cssClass: "x", icon: "home", description: "Start", openInNewTab: true, rel: "me" } },
    { label: "Gone", href: "/gone", available: false },
    { label: "Parent", href: "/p", available: true, children: [{ label: "Kid", href: "/p/k", available: true }] },
  ] } },
  "menu-html": { componentId: "menu", props: { title: "Raw", mode: "html", html: "<ul><li>raw</li></ul>" } },
  "taxonomy-list": { componentId: "taxonomy-list", props: { id: "tags", name: "Tags", hierarchical: true, terms: [
    { id: "t1", name: "One", parentId: null }, { id: "t2", name: "Two", parentId: "t1" }, "junk",
  ] } },
  "contact-form-no-slug": { componentId: "contact-form", props: {} },
  "contact-form-default": { componentId: "contact-form", props: { slug: "contact", successMessage: "Thanks <3", schemaHash: "h1", fields: [
    { id: "email", label: "Email", type: "email", required: true }, { id: "msg", label: "Message", type: "textarea" }, { id: "up", label: "File", type: "file" },
  ] } },
  "contact-form-range": { componentId: "contact-form", props: { slug: "r", fields: [{ id: "n", label: "N", type: "range" }] } },
  "contact-form-html": { componentId: "contact-form", props: { slug: "h", mode: "html", html: '<form><input name="email"></form>', fields: [{ id: "email", label: "Email", type: "email" }] } },
  "contact-form-collection": { componentId: "contact-form", props: { slug: "c", collectionPlan: { kind: "post", external: true, action: "https://forms.example.test/submit" }, fields: [{ id: "email", label: "Email", type: "email", required: true }], collectionConsentOff: true } },
  "media-image-no-id": { componentId: "media-image", props: {} },
  "media-image-image": { componentId: "media-image", props: { assetId: "asset1", transformName: "thumb", version: 3, alt: "alt <1>", sha256: "abc", slug: "hero", width: 100, height: 50, cssClass: "c1", htmlAttributes: 'data-q="1"', galleryResponsive: true } },
  "media-image-video": { componentId: "media-image", props: { assetId: "vid1", contentType: "video/mp4", alt: "v", width: 320, height: 240, controls: true, htmlAttributes: 'loop muted poster="/p.png"' } },
  "media-image-audio": { componentId: "media-image", props: { assetId: "aud1", contentType: "audio/mpeg", alt: "a" } },
  "media-image-no-transform": { componentId: "media-image", props: { assetId: "asset1" } },
  gallery: { componentId: "gallery", props: {
    config: { layout: "carousel", lightbox: true, images: [{ mediaId: "hero-shot", caption: "Cap <1>" }, { src: "https://cdn.example/legacy.png", alt: "legacy" }, { mediaId: "ghost" }] },
    media: { "hero-shot": { assetId: "asset1", transformName: "thumb", version: 3, slug: "hero-shot", alt: "stored" } },
  } },
  "media-empty": { componentId: "media", props: { config: { mode: "media", layout: "single", items: [] }, media: {} } },
  "media-items": { componentId: "media", props: {
    config: { mode: "media", layout: "grid", columns: 2, aspectRatio: "4/3", cssClass: "gal", htmlAttributes: 'data-g="1" style="gap:2px"', items: [{ slug: "hero-shot", alt: "A", caption: "C <1>" }] },
    media: { "hero-shot": { assetId: "asset1", transformName: "thumb", version: 3, slug: "hero-shot" } },
  } },
  "media-html": { componentId: "media", props: {
    config: { mode: "html", html: "<div>{{media:hero-shot}}</div>" },
    media: { "hero-shot": { assetId: "asset1", transformName: "thumb", version: 3, slug: "hero-shot", alt: "H" } },
  } },
  "post-content": { componentId: "post-content", props: {
    title: "Post <T>", header: true, publishAt: "2026-10-05T12:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", timeZone: "Asia/Tokyo",
    author: "Jane & Doe", showAuthor: true,
    bodyJson: { type: "doc", content: [para(text("post body")), { type: "widgetEmbed", attrs: { placementId: "p1" } }] },
  } },
  "post-content-no-body": { componentId: "post-content", props: { title: "T" } },
  "unknown-id": { componentId: "totally-unknown", props: { x: "<script>" } },
  "widget-placeholder": { componentId: "widget-placeholder", props: {} },
};

test("golden (b): renderWidgetIr per componentId (incl. unknown id)", () => {
  for (const [name, ir] of Object.entries(WIDGET_CASES)) pin(`widget:${name}`, renderWidgetIr(ir));
  for (const id of ["text", "social-links", "recent-entries", "entry-summary", "menu", "taxonomy-list", "contact-form", "media-image", "gallery", "media", "post-content"]) {
    assert.ok(Object.values(WIDGET_CASES).some((ir) => ir.componentId === id), `no fixture for ${id}`);
  }
  assert.notEqual(OUT["widget:menu-items"], OUT["widget:unknown-id"]);
});

test("golden (b): contact-form ids — one per form, different between forms (what normalisation hides)", () => {
  const ir: WidgetRenderIR = { componentId: "contact-form", props: { slug: "contact", fields: [{ id: "email", label: "Email", type: "email", required: true, helpText: "We reply" }] } };
  const first = renderWidgetIr(ir);
  const second = renderWidgetIr(ir);
  const ids = (html: string): string[] => [...new Set([...html.matchAll(/widget-contact-[0-9a-f-]{36}/g)].map((m) => m[0]))];
  assert.equal(ids(first).length, 1, "every id/for/aria-describedby in one form shares one generated prefix");
  assert.equal(ids(second).length, 1);
  assert.notEqual(ids(first)[0], ids(second)[0], "two forms on one page get different ids");
  assert.ok(first.includes(`for="${ids(first)[0]}`) || first.includes(`id="${ids(first)[0]}`), first);
});

// --------------------------------------------------------------------------- (c) COMPONENTS

function fakeCtx(overrides: Partial<SiteRenderContext> = {}): SiteRenderContext {
  const post = buildPostRecord({ id: "p-1", title: "Hello <World>", slug: "hello-world", bodyJson: { type: "doc", content: [para(text("Body text"))] } });
  const second = buildPostRecord({ id: "p-2", title: "Second", slug: "second", updatedAt: "2026-05-01T00:00:00.000Z" });
  return {
    siteTitle: "Golden <Site>", route: "home", posts: [post, second], products: [], themeName: "Golden", widgetRegions: {},
    widgetInlineResolved: new Map(), mediaTransformVersions: new Map(), mediaAssetMetadata: new Map(), assignedTerms: [],
    ...overrides,
  };
}

const ACTIONS = [{ label: "Go <now>", href: "/go" }, { label: "Later", href: "javascript:alert(1)" }, "junk"];
const COMPONENT_PROPS: Record<string, JsonObject> = {
  "tovu/site-header": {},
  "tovu/entry-list": {},
  "tovu/entry-content": {},
  "tovu/site-footer": {},
  "tovu/hero": { badge: "New", eyebrow: "Eye", title: "Big <Title>", subtitle: "Sub", actions: ACTIONS, media: { label: "Pic", ratio: "4 / 3" } },
  "tovu/section": { id: "s1", side: "left", eyebrow: "E", title: "T", lead: "L", body: ["p1", "p2 <x>"], bullets: ["b1", "b2"], actions: ACTIONS, media: { label: "M" } },
  "tovu/feature-grid": { eyebrow: "E", title: "Features", items: [{ tag: "t", title: "F1", body: "B1" }, { title: "F2", body: "B2 <b>" }, "junk"] },
  "tovu/media-placeholder": { label: "Lbl <x>", ratio: "21 / 9" },
  "tovu/announcement": { text: "News <1>", link: { href: "/news", label: "Read" } },
  "tovu/nav": { brand: "Brand", items: [{ label: "A", href: "/a" }, { label: "P", href: "/p", children: [{ label: "K", href: "/p/k" }] }, "junk"], cta: { href: "/join", label: "Join" } },
  "tovu/cta": { eyebrow: "E", title: "Join <us>", subtitle: "Sub", actions: ACTIONS },
  "tovu/footer": { brand: "B", blurb: "Blurb", social: [{ label: "X", href: "https://x.example" }], columns: [{ title: "Col", links: [{ label: "L", href: "/l" }] }, "junk"] },
};

test("golden (c): every COMPONENTS entry", () => {
  mock.timers.enable({ apis: ["Date"], now: NOW });
  try {
    for (const id of Object.keys(COMPONENTS)) assert.ok(id in COMPONENT_PROPS, `no fixture for component ${id}`);
    for (const [id, props] of Object.entries(COMPONENT_PROPS)) {
      pin(`component:${id}`, COMPONENTS[id]!(fakeCtx(), props));
    }
    pin("component:tovu/footer:default-legal-year", COMPONENTS["tovu/footer"]!(fakeCtx(), {}));
    pin("component:tovu/entry-list:products", COMPONENTS["tovu/entry-list"]!(fakeCtx({ route: "products", products: [{ id: "pr1", slug: "tee", title: "Tee <1>", price: 1999, currency: "USD", stock: 3, compareAtPrice: 2999 }] }), {}));
    pin("component:tovu/entry-content:post", COMPONENTS["tovu/entry-content"]!(fakeCtx({ route: "post", post: buildPostRecord({ title: "P", bodyJson: { type: "doc", content: [para(text("body"))] } }) }), {}));
    pin("component:tovu/entry-content:product", COMPONENTS["tovu/entry-content"]!(fakeCtx({ route: "product", product: { id: "pr1", slug: "tee", title: "Tee", price: 1999, specs: [{ label: "Size", value: "M" }] } }), {}));
  } finally {
    mock.timers.reset();
  }
  assert.match(OUT["component:tovu/footer:default-legal-year"]!, /© 2026 /, "the pinned clock must reach the rich footer");
});

// --------------------------------------------------------------------------- (d) pageShell + renderSite

const STATIC_PAGE = [
  "<!doctype html>", '<html lang="en"><head>', "<meta charset=\"utf-8\" />",
  "<!-- the tag below carries a <title> placeholder -->", "<title>Theme Title</title>",
  "</head><body><h1>Hi</h1></body></html>",
].join("\n");

test("golden (d): pageShell variants", (t) => {
  useSiteChatBuild({ test: t, ready: true });
  const theme = loadTheme({ themeDir: path.join(ROOT, "development", "fixtures", "theme-archive", "grayscale"), id: "grayscale", source: "built-in" });
  pin("shell:no-theme", pageShell({ title: "T <1>", theme: null, body: "<p>b</p>" }));
  pin("shell:theme", pageShell({ title: "T", theme, body: "<p>b</p>" }));
  pin("shell:extra-head-title", pageShell({ title: "Shell", theme, body: "", extraHead: "<title>SEO</title><link rel=\"canonical\" href=\"/c\"/>" }));
  pin("shell:assets", pageShell({ title: "T", theme: null, body: "", documentAssets: { head: "<!--h-->", body: "<!--b-->" } }));
  pin("shell:assistant-on", pageShell({ title: "T", theme: null, body: "", siteAssistantEnabled: true }));
  pin("shell:assistant-off", pageShell({ title: "T", theme: null, body: "", siteAssistantEnabled: false }));
  assert.notEqual(OUT["shell:assistant-on"], OUT["shell:assistant-off"], "assistant markup must be spliced when enabled");
});

function declarativeTheme(home: JsonObject): DiscoveredTheme {
  return {
    manifest: { id: "t", name: "T", version: "1.0.0", tier: "declarative", engine: 1, regions: ["footer"] },
    tokens: { "--c": "#fff" }, tokensLight: { "--c": "#000" },
    templates: { home, entry: { type: "doc", content: [{ type: "component", id: "tovu/entry-content" }] } },
    pages: {}, partials: {}, liquidTemplates: {}, handlebarsTemplates: {},
    dir: "/nonexistent/test-theme", css: ".x{color:red}", source: "site", status: "valid", errors: [],
  };
}

test("golden (d): renderSite once per tier", async (t) => {
  useSiteChatBuild({ test: t, ready: true });
  mock.timers.enable({ apis: ["Date"], now: NOW });
  try {
    const posts = [buildPostRecord({ title: "One", slug: "one", bodyJson: { type: "doc", content: [para(text("first body"))] } }), buildPostRecord({ id: "post-2", title: "Two", slug: "two" })];
    const base = { siteTitle: "Golden Site", posts };

    const fallback = await renderSite({ ...base, theme: null, route: "home" });
    pin("site:fallback-home", fallback);
    pin("site:fallback-home-listing", await renderSite({ ...base, theme: null, route: "home", listing: { pagePath: "/", after: 12 } }));
    pin("site:fallback-post", await renderSite({ ...base, theme: null, route: "post", post: posts[0] }));
    pin("site:fallback-products", await renderSite({ ...base, theme: null, route: "products", products: [{ id: "pr1", slug: "tee", title: "Tee", price: 1999 }] }));

    const staticTheme = loadTheme({ themeDir: path.join(ROOT, "content", "themes", "static", "tovu-theme"), id: "tovu-theme", source: "built-in" });
    pin("site:static-home", await renderSite({ ...base, theme: staticTheme, route: "home", extraHead: "<title>SEO</title>", siteAssistantEnabled: false }));
    pin("site:static-home-assistant", await renderSite({ ...base, theme: staticTheme, route: "home", siteAssistantEnabled: true }));
    pin("site:fallback-home-assistant", await renderSite({ ...base, theme: null, route: "home", siteAssistantEnabled: true }));

    const liquid = loadTheme({ themeDir: path.join(ROOT, "development", "fixtures", "theme-archive", "dispatch"), id: "dispatch", source: "built-in" });
    liquid.liquidTemplates.home = '<main id="g">Liquid {{ site.title }}</main>{% render_block component: "tovu/site-footer" %}';
    pin("site:liquid-home", await renderSite({ ...base, theme: liquid, route: "home" }));

    const hbs = loadTheme({ themeDir: path.join(ROOT, "development", "fixtures", "theme-archive", "ledger"), id: "ledger", source: "built-in" });
    pin("site:handlebars-home", await renderSite({ ...base, theme: hbs, route: "home" }));
    pin("site:handlebars-post", await renderSite({ ...base, theme: hbs, route: "post", post: posts[0] }));

    const decl = declarativeTheme({ type: "doc", content: [
      { type: "component", id: "tovu/hero", props: COMPONENT_PROPS["tovu/hero"] },
      { type: "component", id: "tovu/entry-list" },
      { type: "slot", name: "entries" },
      { type: "region", key: "footer" },
    ] });
    const widgets = { regions: { footer: [{ componentId: "text", props: { body: "footer widget" } }] }, inlineResolved: new Map() };
    pin("site:declarative-home", await renderSite({ ...base, theme: decl, route: "home", widgets, extraHead: "<meta name=\"x\" content=\"y\"/>" }));
    pin("site:declarative-post", await renderSite({ ...base, theme: decl, route: "post", post: posts[0], widgets }));
  } finally {
    mock.timers.reset();
  }
});

// --------------------------------------------------------------------------- (e) static-page injectors

test("golden (e): injectExtraHeadIntoStaticPage / injectSiteAssistantIntoStaticPage", (t) => {
  useSiteChatBuild({ test: t, ready: true });
  const seo = '<title>Contact</title><link rel="canonical" href="/contact"/>';
  pin("inject-head:basic", injectExtraHeadIntoStaticPage({ html: STATIC_PAGE, extraHead: seo }));
  pin("inject-head:preserve-title", injectExtraHeadIntoStaticPage({ html: STATIC_PAGE, extraHead: seo }, { preserveThemeTitle: true }));
  pin("inject-head:commented-title-only", injectExtraHeadIntoStaticPage({
    html: "<html><head><!-- <title>commented</title> --><meta charset=\"utf-8\"/></head><body></body></html>", extraHead: seo,
  }));
  pin("inject-head:commented-closing-head", injectExtraHeadIntoStaticPage({
    html: "<html><head><title>T</title><!-- </head> --></head><body></body></html>", extraHead: "<meta name=\"a\" content=\"b\"/>",
  }));
  pin("inject-head:no-head", injectExtraHeadIntoStaticPage({ html: "<p>fragment</p>", extraHead: seo }));
  pin("inject-head:empty-extra", injectExtraHeadIntoStaticPage({ html: STATIC_PAGE, extraHead: "" }));
  pin("inject-assistant:off", injectSiteAssistantIntoStaticPage({ html: STATIC_PAGE, enabled: false }));
  pin("inject-assistant:on", injectSiteAssistantIntoStaticPage({ html: STATIC_PAGE, enabled: true }));
  pin("inject-assistant:commented-tags", injectSiteAssistantIntoStaticPage({
    html: "<html><head><!-- </head> --></head><body><!-- </body> --></body></html>", enabled: true,
  }));
  assert.notEqual(OUT["inject-assistant:on"], OUT["inject-assistant:off"], "assistant markup must be spliced when enabled");
  assert.ok(OUT["inject-head:basic"]!.includes("<title>Contact</title>") && !OUT["inject-head:basic"]!.includes("Theme Title"));
  assert.ok(OUT["inject-head:commented-title-only"]!.includes("<!-- <title>commented</title> -->"), "a commented-out <title> is skipped, not removed");
});

// --------------------------------------------------------------------------- compare

const GOLDEN: Record<string, string> = {
  "doc-node:doc": "f645a2d96c230fc3407d8bde8458ebf0785ff949",
  "doc-node:paragraph": "68604897b3db46ca74e1e04cab1c30802782f808",
  "doc-node:heading": "0b9eb6f3661c3dbd11717bc7c12a6a3bde6b8f9a",
  "doc-node:heading-level-clamp": "68f901164b9f1044ab42ad0a9cbd37c49b4c064e",
  "doc-node:title": "da39a3ee5e6b4b0d3255bfef95601890afd80709",
  "doc-node:text": "9e5dec5a2c60b4d42e1db6cf2c6669094cd8f7c7",
  "doc-node:taskItem": "961bc91c9ea6f516c6a83a93f803d636a9b4ef24",
  "doc-node:listItem": "35876926b1bb57b5fb50c01b3b116050a8143386",
  "doc-node:tableRow": "fad7d94b986e28bb7352b4f14b53ff6fd3bcd788",
  "doc-node:tableCell": "1bb520bc035501066e0948a34a0c566593eb49ac",
  "doc-node:tableHeader": "1b2be2b6b5acb9f708072acd726fff571799e0c2",
  "doc-node:bulletList": "ceab37fec3762d4282c38d15561eb54a7c7a358a",
  "doc-node:orderedList": "504a02ec802765ce375a04dae746092f1c2df3fa",
  "doc-node:taskList": "e3d0213e48bb91316596acf75c978d56ef38f538",
  "doc-node:table": "648edfcc9476585086b34b6a1aa67c662d5dbb7a",
  "doc-node:blockquote": "0d84f76a3c511bdda5ba7ff95c5c26ce8cd063ba",
  "doc-node:codeBlock": "bae315e982491dc8385f383a4ca63046ae712f72",
  "doc-node:codeBlock-bad-language": "89153870da9ceba0911f78685ee9810b138f02e4",
  "doc-node:horizontalRule": "199d32ce0a1160d8c2b14d0d6c26d5cfc4a40dc1",
  "doc-node:hardBreak": "7c87180da784cd4b6fa64ebc291716e7c7d3be99",
  "doc-node:image-ref": "a1de7f0440b9af59b2a18d223bf2465a715d8ceb",
  "doc-node:image-ref-no-meta": "e982543187c61e16b6c67a81187f61d4a926f5f9",
  "doc-node:image-ref-unknown-transform": "76882c30d6d949778a77a7379698dfdeb2a4eda1",
  "doc-node:image-legacy-src": "5960b9458835c8de0866529a9cca9a8c5b34cc74",
  "doc-node:image-javascript-src": "864a365821d08a730e6cbcd4c177997f96796070",
  "doc-node:image-placeholder": "fda609ea22e331a9cf3f9feeb7f8897557cfb8b9",
  "doc-node:media-video": "d550fde7b30e00cf79002216631a61a891bcf3f2",
  "doc-node:media-audio": "d3bfac661cab4267c037a0d0807763bedf1bb71f",
  "doc-node:media-image": "6682c01fdca64be4ea6706c69a92acfb5a2e87bf",
  "doc-node:media-placeholder": "8474bfc55eee367eb3f6f1ce244b8088b5c825d3",
  "doc-node:youtube": "57eda0a6c401b01e6ae4c6aa52df64f62ab9ce32",
  "doc-node:youtube-bad": "c017bb583d6eebfbbcaef0f73e18dcd3af5d9cea",
  "doc-node:mention": "7a3106335e57099097f917afdb8a38351262e7bc",
  "doc-node:mention-bad-slug": "da39a3ee5e6b4b0d3255bfef95601890afd80709",
  "doc-node:widgetEmbed-plain": "06865172a684aaca3f72a56ec718817ab032279d",
  "doc-node:widgetEmbed-class-attrs": "1e8326e22e84029f29ba888c41aef91f0402457e",
  "doc-node:widgetEmbed-unresolved": "3acbc8a7892685882ce413bb1ad875a38faeda37",
  "doc-node:unknown-node-renders-children": "745c208c5d7c1a2d507685b158946a0dc91dd181",
  "doc-node:non-object-node": "da39a3ee5e6b4b0d3255bfef95601890afd80709",
  "doc-node:legacy-gallery-image-callback": "d16f6f7d32f27c703093d4652a8b99f7194daa0a",
  "doc-mark:bold": "f3b4526db58f847108c2738bc5a08174f8d74254",
  "doc-mark:italic": "b44671a31a3403c513a867292d4ab0f40f7e933c",
  "doc-mark:code": "5dffcad2e70ddf8f234555f3480210be93e40eaf",
  "doc-mark:underline": "93845743bd71bdb4497b3b0ac27f9a19ac441500",
  "doc-mark:strike": "501fab7ee1535426dd8471010737c7e1ebf641ba",
  "doc-mark:subscript": "28287d1491e2b2278b302b96d2d9054990133703",
  "doc-mark:superscript": "bba827269d9fffd6f09235cb492270d2944eadb3",
  "doc-mark:textStyle": "fc2673120bcb1207ec26c3c1173ea910e52b861f",
  "doc-mark:textStyle-hostile": "3898a625aaa9beb61f72af5241526a5544854a4b",
  "doc-mark:highlight": "fedb553b4e5befd4188ce9d4ac5bcc6720177e5e",
  "doc-mark:link": "bde31527843d16df12c79c3bb53c1b900bf30d9b",
  "doc-mark:link-hostile": "928663f840c0025176e15f5d173b3f87ff887b9d",
  "doc-mark:bold+link+italic": "e8a699cab41112027ddc05f0c11171027a13844c",
  "doc-mark:unknown-mark": "3898a625aaa9beb61f72af5241526a5544854a4b",
  "doc-depth:blockquote-198": "f4b73e233c93d9ad3c2e860f4be586a578acc128",
  "doc-depth:blockquote-199": "61b690fcf9b4d95691d0c6bd0510476bf976f46e",
  "doc-depth:blockquote-230": "4670eb2e2e5cb2e2a80ef9b56e9d79995b167b90",
  "doc-depth:bulletList-60-120": "be6d175d8ab27b9a9c548cff993f05653cd292f4",
  "doc-body-as-page-html": "5aa8b99a6147d240d41dd866014442dc987bece0",
  "doc-body-as-page-html:non-doc": "da39a3ee5e6b4b0d3255bfef95601890afd80709",
  "callback:gallery-legacy-src-image": "cd5aeb5973af0ac44fa2600a0650b3e0cd35acfd",
  "callback:post-title-with-marks": "6a32f56ac6a0f6b697e3cc3d915108f88249e685",
  "widget:text": "a8feecdeb739f7cd3657018b97ba2e630d5f2a56",
  "widget:social-links": "39c26c0834327dfc6044efd2de3075b91b6f10bb",
  "widget:recent-entries-empty": "b772a321ee69a42eb468dac2388198f1aa9b6b29",
  "widget:recent-entries-list": "fc4c137d0c734aaf45f296926ea6edb8c436974e",
  "widget:recent-entries-grid": "25047d7ded5dd1d668ded15f5055a74d0c565426",
  "widget:entry-summary": "f9f0b51d8a92dae932ff8dc157a880518aeca0f2",
  "widget:entry-summary-bad-slug": "d5a442657249e68a6aff4a4d76e1ed0ead954d57",
  "widget:menu-items": "b3046b36f08b54b94bb6a08f265c73c4283dfc56",
  "widget:menu-html": "9be4e88363d455a71bbfeea74412c2ca81a70933",
  "widget:taxonomy-list": "d48c0829557872d5cf99536b463f1f9b4d937607",
  "widget:contact-form-no-slug": "97d3dcec516f4dcee32c864597405ece0523046a",
  "widget:contact-form-default": "6db3accbc5c1f70701fc658bf17a895e78ee140b",
  "widget:contact-form-range": "92b94806407fb86230ff8164086d8926be0a42ae",
  "widget:contact-form-html": "8aa335c224914f73be0a27031ba7ab98d3504a1c",
  "widget:contact-form-collection": "c0f35b5382f3ce2930c6906dbbdf7eff887e9259",
  "widget:media-image-no-id": "97d3dcec516f4dcee32c864597405ece0523046a",
  "widget:media-image-image": "6c5581f29105895e6d8ab2ff5fc6ce0e7342abae",
  "widget:media-image-video": "6d1251a578f8161374141ca15d11cabe9a4ebe31",
  "widget:media-image-audio": "423e346a377a233b7b198741ff1f85af04a53181",
  "widget:media-image-no-transform": "97d3dcec516f4dcee32c864597405ece0523046a",
  "widget:gallery": "591d17861bb76438ec05075da732e256b196c574",
  "widget:media-empty": "019ba08e4bdfa816672730946631a8537b3c1373",
  "widget:media-items": "ffe877aff4cd95c51ce263136690fec67aa7ead5",
  "widget:media-html": "1b4785f7b189947cf325b164cd1d0c7f38ab8e29",
  "widget:post-content": "7c508948be72cd4ee7dec4c98c697110efff8b38",
  "widget:post-content-no-body": "97d3dcec516f4dcee32c864597405ece0523046a",
  "widget:unknown-id": "97d3dcec516f4dcee32c864597405ece0523046a",
  "widget:widget-placeholder": "97d3dcec516f4dcee32c864597405ece0523046a",
  "component:tovu/site-header": "79d15e78528bf874e1b8856df19e4ad9b0ce5a81",
  "component:tovu/entry-list": "d6497863d0276c4f7d0ee8a0f92710343b7ef670",
  "component:tovu/entry-content": "da39a3ee5e6b4b0d3255bfef95601890afd80709",
  "component:tovu/site-footer": "b69f538a0c71341acbb0591f88aecc5268cd59e9",
  "component:tovu/hero": "c0ed3f06b53c280dfcc6527d0915bd5b893de3a1",
  "component:tovu/section": "fd3010ec86d6c2c9b48219b9bf6c7a37b636ed9e",
  "component:tovu/feature-grid": "53c82b9108d82c7009e31ea1417e20ac2b98b984",
  "component:tovu/media-placeholder": "b6abe978067b583ecdc47d882b3a542ec5a1b8e4",
  "component:tovu/announcement": "32f671cae89485a81a38a2ae1f8eafdcac952ba5",
  "component:tovu/nav": "7a8323c2ad13984717a4c2deeaf88d3be35bab7f",
  "component:tovu/cta": "6a12ab7b3498c22d4a9299791669d5eabf407220",
  "component:tovu/footer": "5d0a240971082a2b11076518f03f02dc0a572e51",
  "component:tovu/footer:default-legal-year": "0c892731b75e11c4746f6a960e4435a8e461911d",
  "component:tovu/entry-list:products": "d6497863d0276c4f7d0ee8a0f92710343b7ef670",
  "component:tovu/entry-content:post": "22ee22fb6db9dbc52c6dd0ffee9561d8c6c70d3c",
  "component:tovu/entry-content:product": "da39a3ee5e6b4b0d3255bfef95601890afd80709",
  "shell:no-theme": "769f7d3c2381878df284208fc78d3981659a12b9",
  "shell:theme": "c91a93d9d1e2c02d87364a949523dd8b0d1eac9b",
  "shell:extra-head-title": "e63cac95682ad64c217ab62ee0d740e1ffabee3d",
  "shell:assets": "731b8e66c9ce27060a30fe327ae3ff319d8c38b5",
  "shell:assistant-on": "9f46afa3a2164a84585a5b38f33fae2898da48b9",
  "shell:assistant-off": "735395b46352ed51d6a86fb1d2b1054f076a93ef",
  "site:fallback-home": "7460743b345e2fb134303ca7136d2a0ec7de24f2",
  "site:fallback-home-listing": "331b6f01c1e54b5e6aceceab095fcafdacd5864a",
  "site:fallback-post": "616150877699bd0c57ef6c321e37096f38b7d9a0",
  "site:fallback-products": "87efc30b0c75b3cc197272893ed5903638bfa9ff",
  "site:static-home": "9ab81b65c77051098997e0cbf2eecd05fdd1605c",
  "site:static-home-assistant": "cb886642853e2d4945cb8747b97fdf662a945a72",
  "site:fallback-home-assistant": "2f1e5f10052605fbf9bbfb512d76be2888f33dc5",
  "site:liquid-home": "312d891ce1f47aeb2de1d19d67d6f2c693127f95",
  "site:handlebars-home": "ab2e377a1ec23dead8fd44d2501307e5a3e06b38",
  "site:handlebars-post": "4db51c1700de3da3bff8617d489783df80a46063",
  "site:declarative-home": "3922c5f264be6a6a4e2ad722aa96a1a342a04ad9",
  "site:declarative-post": "39cfe61f92864fe2af02b9547bba7d6425bc1ee6",
  "inject-head:basic": "abda4b464cf6d5ec7e293d028eaca451ce159397",
  "inject-head:preserve-title": "6451331bc5813044538e491f2a50b48addca8af3",
  "inject-head:commented-title-only": "6f7834083e6900ecebd0b74594742194c43b2827",
  "inject-head:commented-closing-head": "42ee364871a7219b6863cb77203a196972136193",
  "inject-head:no-head": "2ff0be90feb46c193fd5e0d42b48dc01ef8499e8",
  "inject-head:empty-extra": "0db460ac43dcf2ed1b225d5a5f1b682a1ee3dcc6",
  "inject-assistant:off": "0db460ac43dcf2ed1b225d5a5f1b682a1ee3dcc6",
  "inject-assistant:on": "96ed49d692819718a4fd484e84bf318022f0a8d7",
  "inject-assistant:commented-tags": "02b2bbadbc6725f7d5f3918711b1c48dafbc6227",
};

test("golden: every pinned hash matches the committed table", () => {
  if (PRINT) {
    console.log(`GOLDEN_JSON:${JSON.stringify(printed, null, 2)}`);
    if (process.env.GOLDEN_OUT) console.log(`GOLDEN_OUT:${JSON.stringify(OUT)}`);
    return;
  }
  assert.deepEqual(Object.keys(printed).sort(), Object.keys(GOLDEN).sort(), "the set of pinned cases changed");
  const drifted = Object.keys(GOLDEN).filter((key) => printed[key] !== GOLDEN[key]);
  assert.deepEqual(drifted, [], `render output drifted for: ${drifted.join(", ")}`);
});
