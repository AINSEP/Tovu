import type { NavItemNode } from "@jini-ai/cms/navigation";
import { toolResultsIn, type CapturedModelRequest, type FakeToolCall, type FakeTurn, type ScriptedTurn } from "../harness/fake-model-server.js";

/**
 * @file The site-import journey's deterministic stand-in for a model following the `site-import`
 * skill (`content/agent-plugins/site-import/skills/site-import/`). Two layers:
 *
 * 1. **Pure helpers** that mirror the skill's references at fixture grade: robots.txt and sitemap
 *    parsing, URL normalization, classification with the reference's own rule ids, slug derivation,
 *    HTML -> TipTap conversion, layout-page HTML, palette/font extraction, the plan and its text.
 * 2. **A driver** that feeds the fake model server ({@link ScriptedTurn}s) one model turn at a time.
 *    Every turn reads the REAL tool results the site server just sent back (web_fetch_page bodies
 *    from the offline fixture site, ids minted by the real handlers) and decides the next tool
 *    calls from them. Nothing is precomputed from the fixture files, so the journey proves the
 *    tools returned what the skill relies on, not that a script can replay itself.
 *
 * Three phases, matching the skill's write gates: `discovery` (read only, ends with the plan and
 * "Shall I go ahead?"), `import` (after the owner's yes: taxonomy, media, entries, menu, redirects,
 * SEO, and the restyle of a DUPLICATED theme; ends asking to switch the live theme), `activation`
 * (after the second yes: `theme_set_active` on the copy, then an own-site screenshot).
 *
 * Tool results arrive through `execute_delegated_tool`, whose envelope this file does not assume:
 * {@link parseToolPayload} unwraps JSON/MCP text layers and the extractors deep-search for the keys
 * they need.
 */

// ---------------------------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------------------------

/** Rule ids from `references/discovery-and-classification.md` § 5. A unit test pins each to the file. */
export const CLASSIFICATION_RULE_IDS = [
  "skip-robots", "skip-archive", "skip-pagination", "skip-feed", "skip-commerce-account", "skip-platform", "skip-file", "skip-error",
  "post-path-segment", "post-date-path", "post-markup", "post-sitemap", "page-home", "page-default",
] as const;
export type ClassificationRuleId = (typeof CLASSIFICATION_RULE_IDS)[number];
export type EntryKind = "page" | "post";
export interface Classification { kind: EntryKind | "skip"; rule: ClassificationRuleId; reason: string }

const ARCHIVE_SEGMENTS = new Set(["tag", "tags", "category", "categories", "author", "authors", "archive", "archives"]);
const POST_SEGMENTS = new Set(["blog", "news", "journal", "articles", "posts", "stories", "updates", "insights"]);
const COMMERCE_SEGMENTS = new Set(["cart", "checkout", "basket", "account", "my-account", "login", "logout", "signin", "signup", "register", "search"]);
const PLATFORM_PREFIXES = ["wp-admin", "wp-json", "wp-content", "wp-login.php", "xmlrpc.php", "_api", "static"];
const TRACKING_PARAM = /^(utm_.*|fbclid|gclid|ref|mc_.*)$/i;
const RESERVED_SLUGS = new Set(["admin", "api"]);

const ENTITIES: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", middot: "·", deg: "°", mdash: "—", ndash: "–", hellip: "…" };

/** Decodes the named entities above plus numeric ones. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") return String.fromCodePoint(name[1]?.toLowerCase() === "x" ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1)));
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** Parses `robots.txt`: every `Sitemap:` line, and `Disallow:` rules of the `User-agent: *` group. */
export function parseRobots({ text }: { text: string }): { sitemaps: string[]; disallow: string[] } {
  const sitemaps: string[] = [];
  const disallow: string[] = [];
  let agents: string[] = [];
  let groupHasRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const match = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!match) continue;
    const field = match[1]!.toLowerCase();
    const value = match[2]!.trim();
    if (field === "sitemap") { if (value) sitemaps.push(value); continue; }
    if (field === "user-agent") {
      if (groupHasRules) { agents = []; groupHasRules = false; }
      agents.push(value);
      continue;
    }
    groupHasRules = true;
    if (field === "disallow" && value && agents.includes("*")) disallow.push(value);
  }
  return { sitemaps, disallow };
}

/** Parses a sitemap: `<sitemapindex>` children or `<urlset>` URLs, each with an optional lastmod. */
export function parseSitemap({ xml }: { xml: string }): { kind: "index" | "urlset"; entries: Array<{ loc: string; lastmod?: string }> } {
  const kind = /<sitemapindex[\s>]/i.test(xml) ? "index" : "urlset";
  const entries: Array<{ loc: string; lastmod?: string }> = [];
  for (const block of xml.matchAll(kind === "index" ? /<sitemap>([\s\S]*?)<\/sitemap>/gi : /<url>([\s\S]*?)<\/url>/gi)) {
    const loc = /<loc>\s*([\s\S]*?)\s*<\/loc>/i.exec(block[1]!)?.[1];
    const lastmod = /<lastmod>\s*([\s\S]*?)\s*<\/lastmod>/i.exec(block[1]!)?.[1];
    if (loc) entries.push({ loc: decodeEntities(loc), ...(lastmod ? { lastmod } : {}) });
  }
  return { kind, entries };
}

/** The classification hint a child sitemap's own name carries (reference § 2). */
export function sitemapHint({ sitemapUrl }: { sitemapUrl: string }): EntryKind | "skip" | undefined {
  const name = new URL(sitemapUrl).pathname.split("/").pop() ?? "";
  if (/^(post-sitemap|posts|blog-posts-sitemap)/i.test(name)) return "post";
  if (/^(page-sitemap|pages)/i.test(name)) return "page";
  if (/^(category|tag|author|product)-sitemap/i.test(name)) return "skip";
  return undefined;
}

/** Drops the fragment and tracking parameters; `null` when a query string remains (a filter view). */
export function normalizeUrl({ url }: { url: string }): string | null {
  const parsed = new URL(url);
  parsed.hash = "";
  for (const key of [...parsed.searchParams.keys()]) if (TRACKING_PARAM.test(key)) parsed.searchParams.delete(key);
  if (parsed.search) return null;
  return parsed.href;
}

/** Identity of a normalized URL: `/about` and `/about/` and `/about/index.html` are one page. */
export function urlKey({ url }: { url: string }): string {
  const parsed = new URL(url);
  const pathname = parsed.pathname.replace(/\/index\.html?$/i, "/").replace(/\/+$/, "") || "/";
  return `${parsed.host.replace(/^www\./, "")}${pathname.toLowerCase()}`;
}

function segmentsOf(url: string): string[] {
  return new URL(url).pathname.split("/").filter(Boolean).map((segment) => segment.toLowerCase());
}

/**
 * Classifies one URL from its path alone (reference § 5; `post-markup` and `skip-error` need the
 * fetched page: {@link refineWithMarkup}). First matching rule wins.
 * @complexity O(segments + disallow rules).
 */
export function classifyUrl(
  { url, disallow }: { url: string; disallow: readonly string[] }, { hint }: { hint?: EntryKind | "skip" } = {},
): Classification {
  const pathname = new URL(url).pathname;
  const segments = segmentsOf(url);
  if (disallow.some((rule) => pathname.startsWith(rule))) return { kind: "skip", rule: "skip-robots", reason: "disallowed by robots.txt" };
  if (segments.some((segment) => ARCHIVE_SEGMENTS.has(segment))) return { kind: "skip", rule: "skip-archive", reason: "generated listing" };
  if (segments.length === 1 && POST_SEGMENTS.has(segments[0]!)) return { kind: "skip", rule: "skip-archive", reason: "post listing" };
  if (/\/page\/\d+\/?$/.test(pathname)) return { kind: "skip", rule: "skip-pagination", reason: "duplicate of a listing" };
  if (segments.some((segment) => segment === "feed" || segment === "rss") || /\.(xml|rss|atom)$/i.test(pathname)) return { kind: "skip", rule: "skip-feed", reason: "machine feed" };
  if (segments.some((segment) => COMMERCE_SEGMENTS.has(segment))) return { kind: "skip", rule: "skip-commerce-account", reason: "per-visitor or transactional page" };
  if (segments[0] && PLATFORM_PREFIXES.includes(segments[0])) return { kind: "skip", rule: "skip-platform", reason: "platform internals" };
  if (/\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|mp4|mp3)$/i.test(pathname)) return { kind: "skip", rule: "skip-file", reason: "not a page" };
  if (hint === "skip") return { kind: "skip", rule: "skip-archive", reason: "listed in a taxonomy/author/product sitemap" };
  const postIndex = segments.findIndex((segment) => POST_SEGMENTS.has(segment));
  if (postIndex >= 0 && postIndex < segments.length - 1) return { kind: "post", rule: "post-path-segment", reason: `under /${segments[postIndex]}/` };
  if (/\/\d{4}\/\d{2}(\/\d{2})?\//.test(`${pathname}/`)) return { kind: "post", rule: "post-date-path", reason: "dated path" };
  if (hint === "post") return { kind: "post", rule: "post-sitemap", reason: "listed in a post sitemap" };
  if (segments.length === 0) return { kind: "page", rule: "page-home", reason: "the homepage" };
  return { kind: "page", rule: "page-default", reason: "a standalone page" };
}

/** Applies the fetch-time rules: `skip-error` for a non-200 or off-host page, `post-markup` for article markup. */
export function refineWithMarkup(
  { classification, url, status, finalUrl, html }: { classification: Classification; url: string; status: number; finalUrl: string; html: string },
): Classification {
  if (status !== 200 || new URL(finalUrl).host !== new URL(url).host) return { kind: "skip", rule: "skip-error", reason: `fetch returned ${status}${finalUrl !== url ? ` at ${finalUrl}` : ""}` };
  if (classification.rule === "page-default" && (metaContents(html, "og:type")[0] === "article" || /article:published_time/.test(html))) {
    return { kind: "post", rule: "post-markup", reason: "article markup" };
  }
  return classification;
}

/** Target slug (reference content-mapping § 1): `/` for the homepage, else the last path segment. */
export function targetSlug({ url }: { url: string }): string {
  const segments = new URL(url).pathname.split("/").filter(Boolean);
  if (segments.length === 0) return "/";
  const slug = decodeURIComponent(segments.at(-1)!).toLowerCase().replace(/\.html?$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
  return RESERVED_SLUGS.has(slug) ? `${slug}-page` : slug || "page";
}

/** Lower-case, dash-separated, for filenames and handles. */
export function slugify(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

type Attrs = Record<string, string>;

function parseAttrs(source: string): Attrs {
  const attrs: Attrs = {};
  for (const match of source.matchAll(/([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    attrs[match[1]!.toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

function metaContents(html: string, key: string): string[] {
  const values: string[] = [];
  for (const match of html.matchAll(/<meta\b([^>]*)>/gi)) {
    const attrs = parseAttrs(match[1]!);
    if ((attrs.property ?? attrs.name)?.toLowerCase() === key && attrs.content !== undefined) values.push(attrs.content);
  }
  return values;
}

function innerOf(html: string, tag: string): string | undefined {
  return new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(html)?.[1];
}

function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function absolute(href: string, base: string): string | undefined {
  try { return new URL(decodeEntities(href), base).href; } catch { return undefined; }
}

/** Facts read from one fetched page; everything here is untrusted page data. */
export interface PageFacts {
  url: string;
  title: string;
  siteName?: string;
  description?: string;
  ogImage?: string;
  publishedTime?: string;
  author?: string;
  sections: string[];
  tags: string[];
  images: Array<{ src: string; alt: string }>;
  navLinks: Array<{ href: string; label: string }>;
  stylesheets: string[];
  fontFamilies: string[];
  mainHtml: string;
  /** True for the homepage and pages built from several `<section>`s: imported through `pages_write_html`. */
  layout: boolean;
  /** Hidden text that reads like instructions to an assistant. Reported, never followed. */
  hiddenInstructions: string[];
}

const INSTRUCTION_LIKE = /\b(ignore (all|your|any|the)?\s*(previous|prior)?\s*instructions|delete every|assistants?:)/i;

/**
 * Reads the facts the skill uses from a page's HTML (as `web_fetch_page` `format: "html"` returns it).
 * @complexity O(html length).
 */
export function readPageFacts({ url, html }: { url: string; html: string }): PageFacts {
  const rawTitle = textOf(innerOf(html, "title") ?? "");
  const siteName = metaContents(html, "og:site_name")[0];
  const titleParts = rawTitle.split(/\s+[|–—]\s+/);
  const title = (titleParts.length > 1 ? titleParts.slice(0, -1).join(" | ") : rawTitle) || metaContents(html, "og:title")[0] || "Untitled";
  const mainHtml = innerOf(html, "article") ?? innerOf(html, "main") ?? innerOf(html, "body") ?? "";
  const images = [...mainHtml.matchAll(/<img\b([^>]*)>/gi)].flatMap((match) => {
    const attrs = parseAttrs(match[1]!);
    const src = attrs.src ? absolute(attrs.src, url) : undefined;
    return src ? [{ src, alt: attrs.alt ?? "" }] : [];
  });
  const header = innerOf(html, "header") ?? "";
  const nav = innerOf(header, "nav") ?? innerOf(html, "nav") ?? "";
  const headerCtas = [...header.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
    .filter((match) => parseAttrs(match[1]!).class?.split(/\s+/).includes("button"))
    .map((match) => match[0]).join("");
  const navLinks = [...`${nav}${headerCtas}`.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].flatMap((match) => {
    const href = parseAttrs(match[1]!).href;
    const resolved = href ? absolute(href, url) : undefined;
    return resolved ? [{ href: resolved, label: textOf(match[2]!) }] : [];
  });
  const linkTags = [...html.matchAll(/<link\b([^>]*)>/gi)].map((match) => parseAttrs(match[1]!));
  const stylesheetHrefs = linkTags.filter((attrs) => attrs.rel?.toLowerCase().split(/\s+/).includes("stylesheet") && attrs.href).map((attrs) => absolute(attrs.href!, url)!).filter(Boolean);
  const fontFamilies = stylesheetHrefs.filter((href) => new URL(href).hostname === "fonts.googleapis.com").flatMap((href) => new URL(href).searchParams.getAll("family"));
  const hiddenInstructions = [...html.matchAll(/<(\w+)\b([^>]*style\s*=\s*["'][^"']*display\s*:\s*none[^"']*["'][^>]*)>([\s\S]*?)<\/\1>/gi)]
    .map((match) => textOf(match[3]!)).filter((text) => INSTRUCTION_LIKE.test(text));
  const ogImage = metaContents(html, "og:image")[0];
  const description = metaContents(html, "description")[0] ?? metaContents(html, "og:description")[0];
  const publishedTime = metaContents(html, "article:published_time")[0] ?? /<time\b[^>]*datetime\s*=\s*["']([^"']+)["']/i.exec(mainHtml)?.[1];
  const author = metaContents(html, "article:author")[0];
  return {
    url, title,
    ...(siteName ? { siteName } : {}),
    ...(description ? { description } : {}),
    ...(ogImage ? { ogImage: absolute(ogImage, url) ?? ogImage } : {}),
    ...(publishedTime ? { publishedTime } : {}),
    ...(author ? { author } : {}),
    sections: metaContents(html, "article:section"),
    tags: metaContents(html, "article:tag"),
    images, navLinks,
    stylesheets: stylesheetHrefs.filter((href) => new URL(href).host === new URL(url).host),
    fontFamilies, mainHtml,
    layout: new URL(url).pathname === "/" || (mainHtml.match(/<section\b/gi)?.length ?? 0) >= 2,
    hiddenInstructions,
  };
}

/** A TipTap node, as `content_post_create`'s `bodyJson` accepts it. */
export interface TiptapNode { type: string; attrs?: Record<string, unknown>; content?: TiptapNode[]; text?: string; marks?: Array<{ type: string; attrs?: Record<string, unknown> }> }

export interface ContentRewrites {
  /** Media id for an absolute source image URL; `undefined` drops the image. */
  imageFor: (src: string) => { id: string; publicUrl?: string | null } | undefined;
  /** New href for a link (already resolved against the page); `undefined` keeps it unchanged. */
  hrefFor: (href: string) => string | undefined;
}

const TOKEN = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>|([^<]+)/g;
const VOID_TAGS = new Set(["img", "br", "hr", "meta", "link", "input", "source"]);
const SKIPPED_CLASS = /\b(meta|tags|share|byline|comments?)\b/;

function isHidden(attrs: Attrs): boolean {
  return /display\s*:\s*none/i.test(attrs.style ?? "") || "hidden" in attrs || SKIPPED_CLASS.test(attrs.class ?? "");
}

function openBlock(tag: string): TiptapNode | undefined {
  if (tag === "p") return { type: "paragraph", content: [] };
  if (/^h[2-6]$/.test(tag)) return { type: "heading", attrs: { level: Math.min(Number(tag[1]), 4) }, content: [] };
  if (tag === "ul") return { type: "bulletList", content: [] };
  if (tag === "ol") return { type: "orderedList", content: [] };
  if (tag === "li") return { type: "listItem", content: [] };
  if (tag === "blockquote") return { type: "blockquote", content: [] };
  return undefined;
}

const TEXTBLOCKS = new Set(["paragraph", "heading"]);
const MARKS: Readonly<Record<string, string>> = { strong: "bold", b: "bold", em: "italic", i: "italic", code: "code", s: "strike", u: "underline" };

/** Trims edge whitespace in text blocks and drops empty text, paragraphs and lists. */
function tidy(node: TiptapNode): TiptapNode | undefined {
  if (node.type === "text") return node.text ? node : undefined;
  if (!node.content) return node;
  let content = node.content.map(tidy).filter((child): child is TiptapNode => child !== undefined);
  if (TEXTBLOCKS.has(node.type)) {
    const first = content[0];
    if (first?.type === "text") first.text = first.text!.replace(/^\s+/, "");
    const last = content.at(-1);
    if (last?.type === "text") last.text = last.text!.replace(/\s+$/, "");
    content = content.filter((child) => child.type !== "text" || child.text);
  }
  if (content.length === 0 && node.type !== "doc") return undefined;
  return { ...node, content };
}

/**
 * Converts an article's HTML into a TipTap document (reference content-mapping § 6, fixture grade):
 * paragraphs, h2-h4, lists, blockquotes, images as `media` nodes, bold/italic/code/link marks.
 * The `<h1>` (it repeats the title), hidden elements and byline/tag/share blocks are dropped.
 * @complexity O(html length).
 */
export function htmlToTiptap({ html }: { html: string }, rewrites: ContentRewrites): TiptapNode {
  const doc: TiptapNode = { type: "doc", content: [] };
  const stack: Array<{ tag: string; node: TiptapNode }> = [{ tag: "#doc", node: doc }];
  const marks: Array<{ tag: string; mark: { type: string; attrs?: Record<string, unknown> } }> = [];
  let skipping: { tag: string; depth: number } | undefined;
  const top = () => stack[stack.length - 1]!;
  const popImplicit = () => { while (top().tag === "#implicit") stack.pop(); };
  for (const match of html.matchAll(TOKEN)) {
    const [whole, closing, rawTag, rawAttrs, text] = match;
    if (whole.startsWith("<!--")) continue;
    const tag = rawTag?.toLowerCase();
    if (skipping) {
      if (tag === skipping.tag && !VOID_TAGS.has(tag)) skipping.depth += closing ? -1 : 1;
      if (skipping.depth === 0) skipping = undefined;
      continue;
    }
    if (text !== undefined) {
      const value = decodeEntities(text).replace(/\s+/g, " ");
      if (!TEXTBLOCKS.has(top().node.type)) {
        if (!value.trim() || ["bulletList", "orderedList"].includes(top().node.type)) continue;
        const paragraph: TiptapNode = { type: "paragraph", content: [] };
        top().node.content!.push(paragraph);
        stack.push({ tag: "#implicit", node: paragraph });
      }
      top().node.content!.push({ type: "text", text: value, ...(marks.length ? { marks: marks.map((entry) => entry.mark) } : {}) });
      continue;
    }
    const attrs = parseAttrs(rawAttrs ?? "");
    if (!closing && (tag === "h1" || isHidden(attrs))) {
      if (!VOID_TAGS.has(tag!)) skipping = { tag: tag!, depth: 1 };
      continue;
    }
    if (closing) {
      const markIndex = marks.map((entry) => entry.tag).lastIndexOf(tag!);
      if (markIndex >= 0) { marks.splice(markIndex, 1); continue; }
      const blockIndex = stack.map((entry) => entry.tag).lastIndexOf(tag!);
      if (blockIndex > 0) stack.length = blockIndex;
      continue;
    }
    if (tag === "a") {
      // An anchor without href adds no mark; its closing tag then matches nothing and is ignored.
      const resolved = attrs.href === undefined ? undefined : rewrites.hrefFor(attrs.href) ?? attrs.href;
      if (resolved) marks.push({ tag, mark: { type: "link", attrs: { href: resolved } } });
      continue;
    }
    if (MARKS[tag!]) { marks.push({ tag: tag!, mark: { type: MARKS[tag!]! } }); continue; }
    if (tag === "br") {
      if (TEXTBLOCKS.has(top().node.type)) top().node.content!.push({ type: "hardBreak" });
      continue;
    }
    if (tag === "img") {
      const media = attrs.src ? rewrites.imageFor(attrs.src) : undefined;
      if (!media) continue;
      while (TEXTBLOCKS.has(top().node.type)) stack.pop();
      top().node.content!.push({ type: "media", attrs: { assetId: media.id, transformName: "public", ...(attrs.alt ? { alt: attrs.alt } : {}) } });
      continue;
    }
    const block = openBlock(tag!);
    if (!block) continue;
    popImplicit();
    if (block.type === "listItem" && !["bulletList", "orderedList"].includes(top().node.type)) continue;
    if (TEXTBLOCKS.has(top().node.type)) stack.pop();
    top().node.content!.push(block);
    stack.push({ tag: tag!, node: block });
    if (block.type === "listItem") {
      // A list item takes block content only: its bare text goes into an implicit paragraph.
      const paragraph: TiptapNode = { type: "paragraph", content: [] };
      block.content!.push(paragraph);
      stack.push({ tag: "#implicit", node: paragraph });
    }
  }
  return tidy(doc) ?? { type: "doc", content: [] };
}

const LAYOUT_TAGS = new Set(["h1", "h2", "h3", "h4", "p", "ul", "ol", "li", "a", "img", "strong", "em", "div", "blockquote", "br"]);
const LAYOUT_CLASSES: Readonly<Record<string, string>> = { cards: "si-cards", card: "si-card", button: "si-button", hero: "si-hero" };

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Rebuilds a layout page as clean, handle-tagged HTML for `pages_write_html` (reference
 * content-mapping § 5): one `data-agent-element` region per source `<section>`, a small `<style>`
 * using theme tokens with the source colors as fallbacks, images from the media library, and
 * internal links rewritten. Source classes are mapped to a few `si-*` classes, never copied.
 * @complexity O(html length).
 */
export function layoutHtml(
  { html, palette }: { html: string; palette: Readonly<Record<string, string>> }, rewrites: ContentRewrites,
): string {
  const fallback = (token: string, value: string) => `var(${token}, ${palette[token] ?? value})`;
  const style = `<style>
.si-hero, .si-section { padding: 48px 0; }
.si-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 24px; padding: 32px 0; }
.si-card { background: ${fallback("--surface", "#f3ece4")}; border-radius: 12px; padding: 20px; }
.si-button { display: inline-block; background: ${fallback("--accent", "#b5543a")}; color: ${fallback("--accent-fg", "#ffffff")}; padding: 12px 20px; border-radius: 999px; text-decoration: none; }
.si-hero img { max-width: 100%; height: auto; border-radius: 12px; }
</style>`;
  const sections = [...html.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/gi)];
  const used = new Set<string>();
  const regions = sections.map((section, index) => {
    const sourceClass = parseAttrs(section[1]!).class?.split(/\s+/)[0] ?? "";
    let handle = slugify(sourceClass) || `section-${index + 1}`;
    while (used.has(handle)) handle = `${handle}-${index + 1}`;
    used.add(handle);
    const cls = LAYOUT_CLASSES[sourceClass] ?? "si-section";
    return `<section data-agent-element="${handle}" data-agent-role="region" class="${cls}">${cleanLayoutInner(section[2]!, rewrites)}</section>`;
  });
  return [style, ...regions].join("\n");
}

function cleanLayoutInner(html: string, rewrites: ContentRewrites): string {
  const out: string[] = [];
  for (const match of html.matchAll(TOKEN)) {
    const [whole, closing, rawTag, rawAttrs, text] = match;
    if (text !== undefined) { out.push(text); continue; }
    const tag = rawTag?.toLowerCase();
    if (!tag || whole.startsWith("<!--") || !LAYOUT_TAGS.has(tag)) continue;
    if (closing) { out.push(`</${tag}>`); continue; }
    const attrs = parseAttrs(rawAttrs ?? "");
    const cls = attrs.class ? LAYOUT_CLASSES[attrs.class.split(/\s+/)[0]!] : undefined;
    const classAttr = cls ? ` class="${cls}"` : "";
    if (tag === "img") {
      const media = attrs.src ? rewrites.imageFor(attrs.src) : undefined;
      if (media?.publicUrl) out.push(`<img src="${escapeAttr(media.publicUrl)}" alt="${escapeAttr(attrs.alt ?? "")}">`);
      continue;
    }
    if (tag === "a") {
      const href = attrs.href === undefined ? undefined : rewrites.hrefFor(attrs.href) ?? attrs.href;
      out.push(href === undefined ? `<a${classAttr}>` : `<a href="${escapeAttr(href)}"${classAttr}>`);
      continue;
    }
    out.push(`<${tag}${classAttr}>`);
  }
  return out.join("").replace(/\s+/g, " ").trim();
}

/** `:root` custom properties declared in a stylesheet (the first `:root` block wins per name). */
export function readPalette({ css }: { css: string }): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const block of css.matchAll(/:root\s*\{([^}]*)\}/g)) {
    for (const decl of block[1]!.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) vars[decl[1]!.toLowerCase()] ??= decl[2]!.trim();
  }
  return vars;
}

/** Tovu token <- source custom-property names that usually carry that role (reference theme-extraction § 2). */
const TOKEN_SOURCES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["--accent", ["--brand", "--primary", "--color-primary", "--accent", "--brand-color"]],
  ["--accent-fg", ["--brand-contrast", "--on-primary", "--primary-contrast", "--accent-fg"]],
  ["--bg", ["--bg", "--background", "--color-background", "--page-bg"]],
  ["--surface", ["--surface", "--card", "--panel"]],
  ["--fg", ["--text", "--fg", "--foreground", "--color-text"]],
  ["--muted", ["--muted", "--text-muted", "--secondary-text"]],
  ["--border", ["--border", "--line", "--divider"]],
  ["--font-display", ["--font-heading", "--font-display", "--heading-font"]],
  ["--font-body", ["--font-text", "--font-body", "--body-font"]],
];

/** Maps a source palette onto Tovu token names; roles the source does not declare are left out. */
export function paletteToTokens({ vars }: { vars: Readonly<Record<string, string>> }): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const [token, names] of TOKEN_SOURCES) {
    const name = names.find((candidate) => vars[candidate] !== undefined);
    if (name) tokens[token] = vars[name]!;
  }
  return tokens;
}

export interface PlannedEntry {
  sourceUrl: string;
  sourcePath: string;
  kind: EntryKind;
  slug: string;
  title: string;
  rule: ClassificationRuleId;
  action: "create" | "update";
  existingId?: string;
  existingVersion?: number;
  facts: PageFacts;
}

export interface MenuPlanItem { id: string; label: string; target: { kind: "entry"; slug: string; entryType: EntryKind } | { kind: "url"; href: string } }

export interface ImportPlan {
  origin: string;
  siteName: string;
  entries: PlannedEntry[];
  skipped: Array<{ path: string; rule: ClassificationRuleId; reason: string }>;
  categories: string[];
  tags: string[];
  images: Array<{ src: string; alt: string }>;
  menu: { title: string; slug: string; location: string; items: MenuPlanItem[]; leftOut: string[] };
  redirects: Array<{ from: string; to: string }>;
  theme: { sourceThemeId: string; copyName: string; tokens: Record<string, string>; fonts: string[] };
  hiddenInstructions: Array<{ path: string; text: string }>;
  /** Existing things this import changes (always reported in the plan). */
  changesToExisting: string[];
}

export interface ExistingEntry { id: string; kind: EntryKind; slug: string; version?: number }

/** The new address of an entry: `/` for the homepage slug, `/<slug>` otherwise. */
export function entryPath(slug: string): string {
  return slug === "/" ? "/" : `/${slug}`;
}

/**
 * Builds the plan from classified, fetched pages and what the site already has (reference
 * content-mapping § 1-2, 9, 10). Pure.
 * @complexity O(entries * (images + links)).
 */
export function buildPlan(
  { origin, pages, skipped, existing, palette, activeThemeId }: {
    origin: string;
    pages: Array<{ facts: PageFacts; classification: Classification & { kind: EntryKind } }>;
    skipped: ImportPlan["skipped"];
    existing: readonly ExistingEntry[];
    palette: Readonly<Record<string, string>>;
    activeThemeId: string;
  },
  { menuLocation = "primary" }: { menuLocation?: string } = {},
): ImportPlan {
  const home = pages.find((page) => page.classification.rule === "page-home")?.facts;
  const siteName = home?.siteName ?? pages[0]?.facts.siteName ?? new URL(origin).hostname;
  const existingBySlug = new Map(existing.map((row) => [row.slug, row]));
  const usedSlugs = new Set<string>();
  const changesToExisting: string[] = [];
  const entries: PlannedEntry[] = pages.map(({ facts, classification }) => {
    let slug = targetSlug({ url: facts.url });
    let match = existingBySlug.get(slug);
    if (slug === "/" && match) { slug = "home"; match = existingBySlug.get(slug); }
    if (match && match.kind !== classification.kind) { slug = `${slug}-imported`; match = existingBySlug.get(slug); }
    if (usedSlugs.has(slug)) { slug = `${slugify(segmentsOf(facts.url).at(-2) ?? "imported")}-${slug}`; match = existingBySlug.get(slug); }
    usedSlugs.add(slug);
    if (match) changesToExisting.push(`${classification.kind} ${entryPath(slug)} (update)`);
    return {
      sourceUrl: facts.url, sourcePath: new URL(facts.url).pathname, kind: classification.kind, slug, title: facts.title, rule: classification.rule,
      action: match ? "update" : "create",
      ...(match ? { existingId: match.id, ...(match.version !== undefined ? { existingVersion: match.version } : {}) } : {}),
      facts,
    };
  });
  const byKey = new Map(entries.map((entry) => [urlKey({ url: entry.sourceUrl }), entry]));
  const skippedKeys = new Set(skipped.map((row) => urlKey({ url: new URL(row.path, origin).href })));
  const posts = entries.filter((entry) => entry.kind === "post");
  const unique = (values: string[]) => [...new Map(values.map((value) => [value.toLowerCase(), value])).values()];
  // Unique by URL; an og:image that also appears in a page body takes that body image's alt text.
  const altBySrc = new Map<string, string>();
  for (const entry of entries) {
    for (const image of entry.facts.images) if (!altBySrc.get(image.src)) altBySrc.set(image.src, image.alt);
    if (entry.facts.ogImage && !altBySrc.has(entry.facts.ogImage)) altBySrc.set(entry.facts.ogImage, "");
  }
  const images = [...altBySrc].map(([src, alt]) => ({ src, alt }));
  const items: MenuPlanItem[] = [];
  const leftOut: string[] = [];
  for (const link of home?.navLinks ?? []) {
    const internal = new URL(link.href).host === new URL(origin).host;
    const entry = internal ? byKey.get(urlKey({ url: link.href })) : undefined;
    if (entry) items.push({ id: `${entry.slug === "/" ? "home" : entry.slug}-${items.length}`, label: link.label, target: { kind: "entry", slug: entry.slug, entryType: entry.kind } });
    else if (internal || skippedKeys.has(urlKey({ url: link.href }))) leftOut.push(`${link.label} (${new URL(link.href).pathname})`);
    else items.push({ id: slugify(link.label) || `link-${items.length + 1}`, label: link.label, target: { kind: "url", href: link.href } });
  }
  const redirects = entries
    .filter((entry) => entry.sourcePath !== "/" && entry.sourcePath.replace(/\/+$/, "") !== entryPath(entry.slug))
    .map((entry) => ({ from: entry.sourcePath, to: entryPath(entry.slug) }));
  return {
    origin, siteName, entries, skipped,
    categories: unique(posts.flatMap((entry) => entry.facts.sections)),
    tags: unique(posts.flatMap((entry) => entry.facts.tags)),
    images,
    menu: { title: `${siteName} menu`, slug: `${slugify(siteName)}-menu`, location: menuLocation, items, leftOut },
    redirects,
    theme: { sourceThemeId: activeThemeId, copyName: `${siteName} import`, tokens: paletteToTokens({ vars: palette }), fonts: home?.fontFamilies ?? [] },
    hiddenInstructions: entries.flatMap((entry) => entry.facts.hiddenInstructions.map((text) => ({ path: entry.sourcePath, text }))),
    changesToExisting,
  };
}

/** The plan as the skill's Step 3 shape, ending with the one question. */
export function planText({ plan }: { plan: ImportPlan }): string {
  const pages = plan.entries.filter((entry) => entry.kind === "page");
  const posts = plan.entries.filter((entry) => entry.kind === "post");
  const row = (entry: PlannedEntry) => `  ${entry.sourcePath} -> ${entryPath(entry.slug)} (${entry.action === "create" ? "new" : "update existing"})`;
  const lines = [
    `Import plan for ${plan.origin} (${plan.entries.length + plan.skipped.length} URLs found, ${plan.entries.length} to import)`,
    `Pages (${pages.length})`, ...pages.map(row),
    `Posts (${posts.length})`, ...posts.map((entry) => `${row(entry)} ${entry.facts.publishedTime ?? ""} [${entry.facts.sections.join(", ")}] {${entry.facts.tags.join(", ")}}`),
    `Categories: ${plan.categories.join(", ") || "none"}; tags: ${plan.tags.join(", ") || "none"}`,
    `Images: ${plan.images.length} to import into the media library`,
    `Menu: "${plan.menu.title}": ${plan.menu.items.map((item) => item.label).join(", ")}, assigned to ${plan.menu.location}${plan.menu.leftOut.length ? `; left out: ${plan.menu.leftOut.join(", ")}` : ""}`,
    `Redirects (${plan.redirects.length}): ${plan.redirects.map((rule) => `${rule.from} -> ${rule.to}`).join("; ")}`,
    `SEO: title + description + social image for ${plan.entries.length} entries`,
    `Theme: a copy of ${plan.theme.sourceThemeId} named "${plan.theme.copyName}"; colors ${Object.entries(plan.theme.tokens).filter(([token]) => !token.startsWith("--font")).map(([, value]) => value).join(", ")}; fonts ${plan.theme.fonts.join(", ") || "unchanged"}. The live theme is not modified; switching to the copy waits for your approval.`,
    `Skipped (${plan.skipped.length})`, ...plan.skipped.map((row) => `  ${row.path} — ${row.reason} (${row.rule})`),
    ...(plan.hiddenInstructions.length ? [`Ignored: hidden text addressed to assistants on ${plan.hiddenInstructions.map((row) => row.path).join(", ")} (imported as nothing, never followed)`] : []),
    "Status after import: drafts",
    `Changes to existing: ${plan.changesToExisting.join(", ") || "none"}`,
    "",
    "Shall I go ahead?",
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------------
// Tool-result reading
// ---------------------------------------------------------------------------------------------

/** Unwraps a tool result: JSON text, `{ content: [{ type: "text", text }] }` envelopes, nested JSON strings. */
export function parseToolPayload({ content }: { content: unknown }): unknown {
  let value = content;
  for (let depth = 0; depth < 4; depth++) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!/^[[{"]/.test(trimmed)) return value;
      try { value = JSON.parse(trimmed); continue; } catch { return value; }
    }
    if (value && typeof value === "object" && Array.isArray((value as { content?: unknown }).content)) {
      const parts = (value as { content: Array<{ type?: string; text?: unknown }> }).content.filter((part) => part.type === "text" && typeof part.text === "string");
      if (parts.length === 1) { value = parts[0]!.text; continue; }
      if (parts.length > 1) return parts.map((part) => parseToolPayload({ content: part.text }));
    }
    return value;
  }
  return value;
}

type JsonObject = Record<string, unknown>;

/** Breadth-first: every object inside `value` (itself included) that satisfies `test`. */
export function findAll(value: unknown, test: (candidate: JsonObject) => boolean, limit = 1_000): JsonObject[] {
  const found: JsonObject[] = [];
  const queue: unknown[] = [value];
  for (let index = 0; index < queue.length && found.length < limit && index < 100_000; index++) {
    const current = queue[index];
    if (!current || typeof current !== "object") continue;
    if (!Array.isArray(current) && test(current as JsonObject)) found.push(current as JsonObject);
    for (const child of Object.values(current as JsonObject)) if (child && typeof child === "object") queue.push(child);
  }
  return found;
}

export function findOne(value: unknown, test: (candidate: JsonObject) => boolean): JsonObject | undefined {
  return findAll(value, test, 1)[0];
}

const isString = (value: unknown): value is string => typeof value === "string" && value.length > 0;

// ---------------------------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------------------------

export interface RecordedCall { phase: Phase; step: string; toolUseId: string; toolId: string; input: JsonObject; nonFatal: boolean }
export interface RecordedResult { isError: boolean; raw: string; payload: unknown }
export type Phase = "discovery" | "import" | "activation";

export interface SiteImportState {
  readonly calls: RecordedCall[];
  readonly results: Map<string, RecordedResult>;
  /** Fatal tool failures and missing data; the journey asserts this is empty. */
  readonly errors: string[];
  /** Non-fatal outcomes the report mentions (e.g. no browser for screenshots). */
  readonly notes: string[];
  plan?: ImportPlan;
  planText?: string;
  reportText?: string;
  activationText?: string;
  pluginSearchFound?: boolean;
  activeThemeId?: string;
  themeCopyId?: string;
  menuId?: string;
  readonly mediaBySrc: Map<string, { id: string; publicUrl: string | null }>;
  readonly entryIds: Map<string, string>;
  readonly termIds: Map<string, string>;
  readonly taxonomyIds: { category?: string; tag?: string };
  /** Theme files the import wrote, by path, with their full new content. */
  readonly themeWrites: Map<string, string>;
}

interface StepCall { toolId: string; input: JsonObject; key?: string; nonFatal?: boolean }
interface StepOutput { text?: string; calls?: StepCall[] }
type Step = { name: string; run: () => StepOutput };

/** What the driver needs from the fake model server: a queue it can append turns to. */
export interface TurnQueue { enqueue(...turns: ScriptedTurn[]): void }

export interface SiteImportDriver {
  readonly state: SiteImportState;
  /** Current one-message workflow: discover, batch import and preview an inactive reference rebuild. */
  queueReferenceImport(): void;
  /** Queues the read-only discovery run (ends with the plan). */
  queueDiscovery(): void;
  /** Queues the import run that follows the owner's "yes" (ends asking to switch the theme). */
  queueImport(): void;
  /** Queues the theme activation that follows the owner's second "yes". */
  queueActivation(): void;
}

/**
 * Creates the scripted site-import driver for one fixture origin.
 * @param required.origin - The source site, e.g. `http://127.0.0.1:41234`.
 * @param required.queue - The fake model server (or any turn sink).
 * @param optional.menuLocation - Theme menu location for the imported menu. Default `primary`.
 */
export function createSiteImportDriver(
  { origin, queue }: { origin: string; queue: TurnQueue },
  { menuLocation = "primary" }: { menuLocation?: string } = {},
): SiteImportDriver {
  const state: SiteImportState = {
    calls: [], results: new Map(), errors: [], notes: [], mediaBySrc: new Map(), entryIds: new Map(), termIds: new Map(), taxonomyIds: {}, themeWrites: new Map(),
  };
  const keyed = new Map<string, string>();
  const batches = new Map<string, StepCall[]>();
  let referenceImport = false;
  let counter = 0;
  let phase: Phase = "discovery";

  function absorb(request: CapturedModelRequest): void {
    for (const result of toolResultsIn("anthropic", request)) {
      if (state.results.has(result.toolUseId)) continue;
      const call = state.calls.find((candidate) => candidate.toolUseId === result.toolUseId);
      if (!call) continue;
      state.results.set(result.toolUseId, { isError: result.isError, raw: result.content, payload: parseToolPayload({ content: result.content }) });
      if (result.isError) (call.nonFatal ? state.notes : state.errors).push(`${call.toolId} failed: ${result.content.slice(0, 400)}`);
      const children = batches.get(result.toolUseId);
      if (children) {
        const batch = findOne(parseToolPayload({ content: result.content }), (row) => row.batch === true && Array.isArray(row.results));
        for (const [index, child] of children.entries()) {
          const item = (batch?.results as JsonObject[] | undefined)?.find((row) => row.index === index);
          const payload = item?.ok === true ? parseToolPayload({ content: item.result }) : undefined;
          const isError = result.isError || item?.ok !== true;
          state.results.set(`${result.toolUseId}:${index}`, { isError, raw: JSON.stringify(item ?? {}), payload });
          if (isError) (child.nonFatal ? state.notes : state.errors).push(`${call.toolId}[${index}] failed: ${String(item?.error ?? "missing batch result")}`);
        }
      }
    }
  }

  /** The parsed payload of the call recorded under `key`, or `undefined` if it failed or never ran. */
  function payloadOf(key: string): unknown {
    const id = keyed.get(key);
    const result = id ? state.results.get(id) : undefined;
    return result && !result.isError ? result.payload : undefined;
  }

  function need<T>(value: T | undefined, what: string): T | undefined {
    if (value === undefined) state.errors.push(`missing: ${what}`);
    return value;
  }

  /** Runs steps until one produces tool calls (that turn ends with them) or text (the phase ends). */
  function turnFor(steps: Step[]): ScriptedTurn {
    return (request: CapturedModelRequest): FakeTurn => {
      absorb(request);
      while (steps.length) {
        const step = steps.shift()!;
        const output = step.run();
        const calls = output.calls ?? [];
        if (calls.length === 0 && output.text === undefined) continue;
        // The current skill requires one items call per batch, not many tool_use blocks in a turn.
        // Keep each logical result's key so subsequent steps still consume the owning tool's IDs.
        const grouped: StepCall[][] = [];
        const batchable = new Set(["web_fetch_page", "media_import_from_url", "content_post_create", "content_post_update", "pages_write_html", "theme_read_file", "theme_write_file", "theme_import_file_from_url"]);
        for (const call of calls) {
          const group = referenceImport && batchable.has(call.toolId)
            ? grouped.find((group) => group[0]!.toolId === call.toolId && group.length < 10) : undefined;
          if (group) group.push(call); else grouped.push([call]);
        }
        const toolCalls: FakeToolCall[] = grouped.map((group) => {
          const call = group[0]!;
          const toolUseId = `toolu_si_${++counter}`;
          const batched = group.length > 1;
          if (batched) batches.set(toolUseId, group);
          group.forEach((child, index) => { if (child.key) keyed.set(child.key, batched ? `${toolUseId}:${index}` : toolUseId); });
          const input = batched ? { items: group.map((child) => child.input) } : call.input;
          state.calls.push({ phase, step: step.name, toolUseId, toolId: call.toolId, input, nonFatal: call.nonFatal === true });
          return { id: toolUseId, name: "execute_delegated_tool", input: { toolId: call.toolId, input } };
        });
        if (toolCalls.length && steps.length) queue.enqueue(turnFor(steps));
        return { ...(output.text !== undefined ? { text: output.text } : {}), ...(toolCalls.length ? { toolCalls } : {}) };
      }
      return { text: "Nothing left to do." };
    };
  }

  const fetchPage = (url: string, format: "raw" | "html", key: string): StepCall => ({ toolId: "web_fetch_page", input: { url, format }, key });
  const fetched = (key: string) => findOne(payloadOf(key), (o) => isString(o.finalUrl) && typeof o.content === "string") as { finalUrl: string; status?: number; content: string } | undefined;

  // ---- discovery -----------------------------------------------------------------------------
  let robots = { sitemaps: [] as string[], disallow: [] as string[] };
  const sitemapQueue: string[] = [];
  const urlEntries: Array<{ url: string; hint?: EntryKind | "skip" }> = [];
  const candidates: Array<{ url: string; classification: Classification }> = [];
  const skipped: ImportPlan["skipped"] = [];
  let palette: Record<string, string> = {};

  function readSitemaps(keys: string[]): void {
    for (const key of keys) {
      const page = fetched(key);
      const sitemapUrl = key.slice(key.indexOf(":") + 1);
      if (!page || page.status !== 200) { state.notes.push(`sitemap ${sitemapUrl} could not be read`); continue; }
      const parsed = parseSitemap({ xml: page.content });
      for (const entry of parsed.entries) {
        if (new URL(entry.loc).host !== new URL(origin).host) continue;
        if (parsed.kind === "index") sitemapQueue.push(entry.loc);
        else urlEntries.push({ url: entry.loc, hint: sitemapHint({ sitemapUrl }) });
      }
    }
  }

  const discovery: Step[] = [
    { name: "robots", run: () => ({ calls: [
      { toolId: "search_agent_plugin_local", input: { query: "import an existing website into this site" }, key: "plugin-search" },
      fetchPage(`${origin}/robots.txt`, "raw", "robots"),
    ] }) },
    { name: "sitemaps", run: () => {
      state.pluginSearchFound = (state.results.get(keyed.get("plugin-search") ?? "")?.raw ?? "").includes("site-import");
      const page = fetched("robots");
      robots = page && page.status === 200 ? parseRobots({ text: page.content }) : robots;
      const sitemaps = robots.sitemaps.length ? robots.sitemaps : [`${origin}/sitemap.xml`];
      return { calls: sitemaps.map((url) => fetchPage(url, "raw", `sitemap:${url}`)) };
    } },
    { name: "child-sitemaps", run: () => {
      readSitemaps([...keyed.keys()].filter((key) => key.startsWith("sitemap:")));
      const children = sitemapQueue.splice(0);
      return { calls: children.map((url) => fetchPage(url, "raw", `child:${url}`)) };
    } },
    { name: "pages", run: () => {
      // One level of child sitemaps is normal; a nested index is not followed (reference § 2).
      readSitemaps([...keyed.keys()].filter((candidate) => candidate.startsWith("child:")));
      sitemapQueue.length = 0;
      const seen = new Set<string>();
      for (const entry of urlEntries) {
        const url = normalizeUrl({ url: entry.url });
        if (!url) continue;
        const key = urlKey({ url });
        if (seen.has(key)) continue;
        seen.add(key);
        const classification = classifyUrl({ url, disallow: robots.disallow }, entry.hint ? { hint: entry.hint } : {});
        if (classification.kind === "skip") skipped.push({ path: new URL(url).pathname, rule: classification.rule, reason: classification.reason });
        else candidates.push({ url, classification });
      }
      return { calls: [
        ...candidates.map((candidate) => fetchPage(candidate.url, "html", `page:${candidate.url}`)),
        { toolId: "content_read.content_post", input: { kind: "page", fields: ["id", "kind", "slug", "title", "version"], limit: 200 }, key: "existing-pages" },
        { toolId: "content_read.content_post", input: { kind: "post", fields: ["id", "kind", "slug", "title", "version"], limit: 200 }, key: "existing-posts" },
        { toolId: "content_read.taxonomy", input: {}, key: "taxonomies" },
        { toolId: "content_read.menu", input: {}, key: "menus" },
        { toolId: "site_get_profile", input: { sections: ["theme"] }, key: "profile" },
      ] };
    } },
    { name: "stylesheets", run: () => {
      const home = candidates.find((candidate) => candidate.classification.rule === "page-home");
      const page = home ? fetched(`page:${home.url}`) : undefined;
      const sheets = page ? readPageFacts({ url: home!.url, html: page.content }).stylesheets : [];
      return { calls: sheets.map((url) => fetchPage(url, "raw", `css:${url}`)) };
    } },
    { name: "plan", run: () => {
      for (const key of [...keyed.keys()].filter((candidate) => candidate.startsWith("css:"))) {
        const sheet = fetched(key);
        if (sheet) palette = { ...readPalette({ css: sheet.content }), ...palette };
      }
      const pages: Array<{ facts: PageFacts; classification: Classification & { kind: EntryKind } }> = [];
      for (const candidate of candidates) {
        const page = fetched(`page:${candidate.url}`);
        if (!page) { skipped.push({ path: new URL(candidate.url).pathname, rule: "skip-error", reason: "fetch failed" }); continue; }
        const classification = refineWithMarkup({ classification: candidate.classification, url: candidate.url, status: page.status ?? 200, finalUrl: page.finalUrl, html: page.content });
        if (classification.kind === "skip") { skipped.push({ path: new URL(candidate.url).pathname, rule: classification.rule, reason: classification.reason }); continue; }
        pages.push({ facts: readPageFacts({ url: candidate.url, html: page.content }), classification: classification as Classification & { kind: EntryKind } });
      }
      const existing = (["page", "post"] as const).flatMap((kind) => findAll(payloadOf(`existing-${kind}s`), (o) => isString(o.id) && typeof o.slug === "string")
        .map((row): ExistingEntry => ({ id: row.id as string, kind, slug: row.slug as string, ...(typeof row.version === "number" ? { version: row.version } : {}) })));
      const profile = findOne(payloadOf("profile"), (o) => "activeThemeId" in o);
      const activeThemeId = need((isString(profile?.activeThemeId) ? profile!.activeThemeId : (findOne(profile?.active, (o) => isString(o.id))?.id as string | undefined)), "the active theme id (site_get_profile)");
      state.activeThemeId = activeThemeId;
      state.plan = buildPlan({ origin, pages, skipped, existing: referenceImport ? existing.filter((row) => row.slug !== "/") : existing, palette, activeThemeId: activeThemeId ?? "" }, { menuLocation });
      state.planText = planText({ plan: state.plan });
      if (referenceImport) {
        // Historical assumption:
        // A fresh fixture site normally has no CMS homepage. Refuse to silently import to /home
        // when it does: the live variant must exercise the skill's move-existing-home behavior.
        // The ordinary seed now owns /. Exercise content-mapping §1's move in the scripted
        // variant too, completing it before the create batch can claim that slug.
        const home = existing.find((row) => row.slug === "/");
        if (home) {
          const used = new Set([...existing.map((row) => row.slug), ...state.plan.entries.map((entry) => entry.slug)]);
          let slug = "previous-home";
          for (let suffix = 2; used.has(slug); suffix++) slug = `previous-home-${suffix}`;
          state.plan.changesToExisting.push(`Moved the existing homepage from / to /${slug}`);
          return { calls: [{ toolId: "content_post_update", input: { id: home.id, kind: home.kind, slug,
            ...(home.version !== undefined ? { expectedVersion: home.version } : {}) }, key: "move-existing-home" }] };
        }
      }
      return referenceImport ? {} : { text: state.planText };
    } },
  ];

  // ---- import ------------------------------------------------------------------------------
  const rewritesFor = (pageUrl: string): ContentRewrites => {
    const plan = state.plan!;
    const byKey = new Map(plan.entries.map((entry) => [urlKey({ url: entry.sourceUrl }), entry]));
    return {
      imageFor: (src) => state.mediaBySrc.get(absolute(src, pageUrl) ?? src),
      hrefFor: (href) => {
        const resolved = absolute(href, pageUrl);
        if (!resolved || !/^https?:/.test(resolved)) return undefined;
        if (new URL(resolved).host !== new URL(origin).host) return undefined;
        const entry = byKey.get(urlKey({ url: resolved }));
        return entry ? entryPath(entry.slug) : resolved;
      },
    };
  };

  const importSteps: Step[] = [
    { name: "taxonomies-and-media", run: () => {
      const plan = state.plan;
      if (!plan) { state.errors.push("import started without a plan"); return { text: "There is no approved plan to import." }; }
      const items = findAll(payloadOf("taxonomies"), (o) => typeof o.taxonomy === "object" && o.taxonomy !== null);
      const taxonomy = (hierarchical: boolean, pattern: RegExp) => items.map((item) => item.taxonomy as JsonObject)
        .find((row) => row.hierarchical === hierarchical && pattern.test(String(row.name ?? row.key ?? row.slug ?? "")));
      const category = taxonomy(true, /^categor/i);
      const tag = taxonomy(false, /^tag/i);
      if (isString(category?.id)) state.taxonomyIds.category = category!.id as string;
      if (isString(tag?.id)) state.taxonomyIds.tag = tag!.id as string;
      for (const item of items) {
        for (const term of (Array.isArray(item.terms) ? item.terms : []) as JsonObject[]) {
          const taxonomyId = (item.taxonomy as JsonObject).id;
          if (isString(term.id) && isString(term.name)) state.termIds.set(`${taxonomyId}:${term.name.toLowerCase()}`, term.id);
        }
      }
      return { calls: [
        ...(!state.taxonomyIds.category && plan.categories.length ? [{ toolId: "taxonomy_create_taxonomy", input: { name: "Categories", hierarchical: true }, key: "new-taxonomy:category" }] : []),
        ...(!state.taxonomyIds.tag && plan.tags.length ? [{ toolId: "taxonomy_create_taxonomy", input: { name: "Tags", hierarchical: false }, key: "new-taxonomy:tag" }] : []),
        ...plan.images.map((image) => ({ toolId: "media_import_from_url", input: {
          url: image.src, filename: slugify(image.alt) || slugify(new URL(image.src).pathname.split("/").pop() ?? "image") || "image", ...(image.alt ? { alt: image.alt } : {}),
        }, key: `media:${image.src}` })),
      ] };
    } },
    { name: "terms-and-entries", run: () => {
      const plan = state.plan!;
      for (const which of ["category", "tag"] as const) {
        const created = findOne(payloadOf(`new-taxonomy:${which}`), (o) => isString(o.id) && typeof o.hierarchical === "boolean");
        if (created) state.taxonomyIds[which] = created.id as string;
      }
      for (const image of plan.images) {
        const media = findOne(payloadOf(`media:${image.src}`), (o) => isString(o.id) && ("sha256" in o || "publicUrl" in o));
        if (media) state.mediaBySrc.set(image.src, { id: media.id as string, publicUrl: isString(media.publicUrl) ? media.publicUrl : null });
      }
      const termCalls: StepCall[] = [];
      for (const [which, names] of [["category", plan.categories], ["tag", plan.tags]] as const) {
        const taxonomyId = need(state.taxonomyIds[which], `${which} taxonomy id`);
        if (!taxonomyId) continue;
        for (const name of names) {
          if (!state.termIds.has(`${taxonomyId}:${name.toLowerCase()}`)) termCalls.push({ toolId: "taxonomy_create_term", input: { taxonomyId, name }, key: `term:${taxonomyId}:${name.toLowerCase()}` });
        }
      }
      const entryCalls: StepCall[] = plan.entries.map((entry) => {
        const rewrites = rewritesFor(entry.sourceUrl);
        const lead = entry.facts.ogImage ?? entry.facts.images[0]?.src;
        const featured = lead ? state.mediaBySrc.get(lead)?.id : undefined;
        const body = entry.kind === "page" && entry.facts.layout ? {} : { bodyJson: htmlToTiptap({ html: entry.facts.mainHtml }, rewrites) };
        const fields: JsonObject = {
          kind: entry.kind, title: entry.title, ...body,
          ...(entry.kind === "post" && entry.facts.publishedTime ? { publishAt: new Date(entry.facts.publishedTime).toISOString() } : {}),
          ...(entry.kind === "post" && featured ? { featuredImage: featured } : {}),
        };
        return entry.action === "update"
          ? { toolId: "content_post_update", input: { id: entry.existingId!, ...fields, ...(entry.existingVersion !== undefined ? { expectedVersion: entry.existingVersion } : {}) }, key: `entry:${entry.slug}` }
          : { toolId: "content_post_create", input: { ...fields, slug: entry.slug, status: "draft" }, key: `entry:${entry.slug}` };
      });
      return { calls: [...termCalls, ...entryCalls] };
    } },
    { name: "layout-terms-seo-menu-redirects-theme", run: () => {
      const plan = state.plan!;
      for (const [key] of keyed) {
        if (!key.startsWith("term:")) continue;
        const term = findOne(payloadOf(key), (o) => isString(o.id) && isString(o.name));
        if (term) state.termIds.set(key.slice("term:".length), term.id as string);
      }
      for (const entry of plan.entries) {
        const row = findOne(payloadOf(`entry:${entry.slug}`), (o) => isString(o.id) && (o.kind === "post" || o.kind === "page" || typeof o.slug === "string"));
        const id = (row?.id as string | undefined) ?? entry.existingId;
        if (need(id, `id of ${entry.kind} ${entryPath(entry.slug)}`)) state.entryIds.set(entry.slug, id!);
      }
      const calls: StepCall[] = [];
      for (const entry of plan.entries) {
        const id = state.entryIds.get(entry.slug);
        if (!id) continue;
        if (entry.kind === "page" && entry.facts.layout) {
          calls.push({ toolId: "pages_write_html", input: { id, html: layoutHtml({ html: entry.facts.mainHtml, palette: plan.theme.tokens }, rewritesFor(entry.sourceUrl)) }, key: `html:${entry.slug}` });
        }
        if (entry.kind === "post") {
          const termIds = [
            ...entry.facts.sections.map((name) => state.termIds.get(`${state.taxonomyIds.category}:${name.toLowerCase()}`)),
            ...entry.facts.tags.map((name) => state.termIds.get(`${state.taxonomyIds.tag}:${name.toLowerCase()}`)),
          ];
          if (termIds.some((termId) => termId === undefined)) state.errors.push(`missing term ids for ${entry.slug}`);
          calls.push({ toolId: "taxonomy_assign_terms", input: { contentType: "post", contentId: id, termIds: termIds.filter(isString) }, key: `assign:${entry.slug}` });
        }
        const lead = entry.facts.ogImage ?? entry.facts.images[0]?.src;
        const leadId = lead ? state.mediaBySrc.get(lead)?.id : undefined;
        if (entry.facts.description || leadId) {
          calls.push({ toolId: "seo_set_entry_overrides", input: { entryId: id, ...(entry.facts.description ? { description: entry.facts.description } : {}), ...(leadId ? { ogImage: `${leadId}:public` } : {}) }, key: `seo:${entry.slug}` });
        }
      }
      const items = plan.menu.items.flatMap<NavItemNode>((item) => {
        if (item.target.kind === "url") return [{ id: item.id, label: item.label, target: { kind: "url", href: item.target.href } }];
        const entryId = state.entryIds.get(item.target.slug);
        return entryId ? [{ id: item.id, label: item.label, target: { kind: "entryRef", entryId, entryType: item.target.entryType } }] : [];
      });
      calls.push({ toolId: "menus_create_menu", input: { title: plan.menu.title, slug: plan.menu.slug, items }, key: "menu" });
      if (referenceImport) {
        const footer = innerOf(fetched(`page:${origin}/`)?.content ?? "", "footer") ?? "";
        const links = readPageFacts({ url: `${origin}/`, html: `<header><nav>${footer}</nav></header>` }).navLinks;
        calls.push({ toolId: "menus_create_menu", key: "footer-menu", input: {
          title: `${plan.siteName} footer`, slug: `${plan.menu.slug}-footer`,
          items: links.map((link, index) => ({ id: `footer-${index}`, label: link.label, target: {
            kind: "url", href: rewritesFor(`${origin}/`).hrefFor(link.href) ?? link.href,
          } })),
        } });
      }
      if (plan.redirects.length) {
        calls.push({ toolId: "redirects_import", input: { rules: plan.redirects.map((rule) => ({ matchType: "exact", fromPattern: rule.from, toTarget: rule.to, statusCode: 301 })) }, key: "redirects" });
      }
      if (need(plan.theme.sourceThemeId || undefined, "a source theme to duplicate")) {
        calls.push({ toolId: "theme_duplicate", input: { sourceThemeId: plan.theme.sourceThemeId, newName: plan.theme.copyName }, key: "theme-copy" });
      }
      return { calls };
    } },
    { name: "menu-location-and-theme-read", run: () => {
      const menu = findOne(payloadOf("menu"), (o) => isString(o.id) && isString(o.slug));
      state.menuId = need(menu?.id as string | undefined, "the new menu's id");
      const copy = findOne(payloadOf("theme-copy"), (o) => isString(o.themeId) && "sourceThemeId" in o);
      state.themeCopyId = need(copy?.themeId as string | undefined, "the duplicated theme's id");
      if (copy && copy.themeId === state.plan!.theme.sourceThemeId) state.errors.push("theme_duplicate returned the source theme's id");
      return { calls: [
        ...(state.menuId ? [{ toolId: "menus_assign_location", input: { menuId: state.menuId, locationKey: state.plan!.menu.location }, key: "menu-location" }] : []),
        ...(state.themeCopyId ? ["tokens.light.json", "tokens.json", "theme.json"].map((file) => ({ toolId: "theme_read_file", input: { themeId: state.themeCopyId!, path: file }, key: `theme-read:${file}` })) : []),
      ] };
    } },
    { name: "reference-fonts", run: () => {
      if (!referenceImport || !state.themeCopyId) return {};
      const css = [...keyed.keys()].filter((key) => key.startsWith("css:")).map((key) => fetched(key)?.content ?? "").join("\n");
      return { calls: [...css.matchAll(/url\(['"]?([^'"()]+\.woff2)['"]?\)/g)].map((match) => ({
        toolId: "theme_import_file_from_url", input: { themeId: state.themeCopyId, url: new URL(match[1]!, origin).href,
          path: `assets/fonts/${new URL(match[1]!, origin).pathname.split("/").pop()}` },
      })) };
    } },
    { name: "theme-write", run: () => {
      const copyId = state.themeCopyId;
      if (!copyId) return {};
      const plan = state.plan!;
      const read = (file: string) => {
        const row = findOne(payloadOf(`theme-read:${file}`), (o) => typeof o.content === "string");
        try { return row ? JSON.parse(row.content as string) as JsonObject : undefined; } catch { return undefined; }
      };
      const light = need(read("tokens.light.json"), "the copy's tokens.light.json");
      const dark = need(read("tokens.json"), "the copy's tokens.json");
      const manifest = need(read("theme.json"), "the copy's theme.json");
      const writes: Array<[string, JsonObject]> = [];
      if (light) writes.push(["tokens.light.json", { ...light, ...plan.theme.tokens }]);
      if (dark && plan.theme.tokens["--accent"]) writes.push(["tokens.json", { ...dark, "--accent": plan.theme.tokens["--accent"] }]);
      if (manifest) {
        const modes = Array.isArray(manifest.modes) ? manifest.modes as string[] : [];
        writes.push(["theme.json", { ...manifest, ...(modes.includes("light") ? { defaultMode: "light" } : {}), ...(plan.theme.fonts.length ? { fonts: plan.theme.fonts } : {}) }]);
      }
      const calls: StepCall[] = writes.map(([file, json]) => {
        const content = `${JSON.stringify(json, null, 2)}\n`;
        state.themeWrites.set(file, content);
        return { toolId: "theme_write_file", input: { themeId: copyId, path: file, content }, key: `theme-write:${file}` };
      });
      if (referenceImport) {
        const source = fetched(`page:${origin}/`)?.content ?? "";
        // Explore renders theme-authored fallbacks without CMS data, while the live render
        // replaces these same markers with the editable menus and current page body.
        const marker = (slug: string, fallback: string) => `<div data-embed-config='${JSON.stringify({ type: "menu", id: slug, variant: "tree" })}'>${fallback}</div>`;
        const navFallback = plan.menu.items.map((item) => `<a href="${escapeAttr(item.target.kind === "url" ? item.target.href : entryPath(item.target.slug))}">${escapeAttr(item.label)}</a>`).join("");
        const header = (innerOf(source, "header") ?? "")
          .replace(/<a\b[^>]*class=["']button["'][^>]*>[\s\S]*?<\/a>/gi, "")
          .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/i, `<nav aria-label="Main">${marker(plan.menu.slug, navFallback)}</nav>`);
        const footer = (innerOf(source, "footer") ?? "").replace(/<p>\s*<a\b[\s\S]*?<\/p>/i,
          (links) => marker(`${plan.menu.slug}-footer`, cleanLayoutInner(links, rewritesFor(`${origin}/`))));
        // Reuse the CMS layout converter, removing only its editor handles from theme markup.
        const bodyFallback = layoutHtml({ html: plan.entries.find((entry) => entry.slug === "/")?.facts.mainHtml ?? "", palette: plan.theme.tokens }, rewritesFor(`${origin}/`))
          .replace(/ data-agent-(?:element|role)="[^"]*"/g, "");
        const css = [...keyed.keys()].filter((key) => key.startsWith("css:")).map((key) => fetched(key)?.content ?? "").join("\n")
          .replace(/url\(['"]?\/fonts\/([^'"()]+)['"]?\)/g, 'url("../assets/fonts/$1")');
        for (const [file, content] of [
          ["render/partials/nav.html", `<header>${header}</header>`],
          ["render/partials/footer.html", `<footer>${footer}</footer>`],
          ["css/theme.css", css],
          ["render/pages/index.html", `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeAttr(plan.siteName)}</title><link rel="stylesheet" href="../css/theme.css" /></head><body><div data-embed-config='{"type":"partial","id":"nav"}'></div><main><div data-embed-config='{"type":"content","header":false}'>${bodyFallback}</div></main><div data-embed-config='{"type":"partial","id":"footer"}'></div></body></html>`],
        ]) {
          state.themeWrites.set(file!, content!);
          calls.push({ toolId: "theme_write_file", input: { themeId: copyId, path: file!, content: content! }, key: `theme-write:${file}` });
        }
      }
      return { calls };
    } },
    { name: "verify", run: () => {
      for (const [key] of keyed) {
        if (!key.startsWith("theme-write:")) continue;
        const status = findOne(payloadOf(key), (o) => o.status === "valid" || o.status === "invalid")?.status;
        if (status === "invalid") state.errors.push(`${key.slice("theme-write:".length)} left the theme copy invalid`);
      }
      const failed = findAll(payloadOf("redirects"), (o) => Array.isArray(o.failed)).flatMap((o) => o.failed as unknown[]);
      if (failed.length) state.errors.push(`redirects_import failed rules: ${JSON.stringify(failed).slice(0, 400)}`);
      return { calls: [
        { toolId: "content_read.content_post", input: { kind: "page", fields: ["id", "slug", "status"], limit: 200 }, key: "verify-pages" },
        { toolId: "content_read.content_post", input: { kind: "post", fields: ["id", "slug", "status", "publishAt"], limit: 200 }, key: "verify-posts" },
        { toolId: "content_read.redirect", input: { source: "manual" }, key: "verify-redirects" },
      ] };
    } },
    { name: "report", run: () => {
      const plan = state.plan!;
      const listed = new Set(["verify-pages", "verify-posts"].flatMap((key) => findAll(payloadOf(key), (o) => isString(o.id)).map((row) => row.id as string)));
      const missing = [...state.entryIds.entries()].filter(([, id]) => !listed.has(id)).map(([slug]) => entryPath(slug));
      if (missing.length) state.errors.push(`not listed after import: ${missing.join(", ")}`);
      const count = (kind: EntryKind, action: PlannedEntry["action"]) => plan.entries.filter((entry) => entry.kind === kind && entry.action === action && state.entryIds.has(entry.slug)).length;
      state.reportText = [
        `Imported from ${plan.origin}`,
        `- Pages: ${count("page", "create")} created, ${count("page", "update")} updated (drafts)`,
        `- Posts: ${count("post", "create")} created, ${count("post", "update")} updated (drafts, original dates kept)`,
        `- Categories/tags: ${plan.categories.length + plan.tags.length}; images: ${state.mediaBySrc.size}; menu: ${plan.menu.title} at ${plan.menu.location}; redirects: ${plan.redirects.length}`,
        `- Theme: a copy "${plan.theme.copyName}" (${state.themeCopyId ?? "not created"}) of ${plan.theme.sourceThemeId}, files changed: ${[...state.themeWrites.keys()].join(", ") || "none"}. The live theme is unchanged.`,
        ...plan.skipped.map((row) => `- Skipped: ${row.path} — ${row.reason}`),
        ...plan.hiddenInstructions.map((row) => `- Ignored hidden instructions on ${row.path}; nothing was deleted.`),
        ...plan.changesToExisting.map((change) => `- ${change}`),
        ...state.errors.map((error) => `- Failed: ${error}`),
        "- Left for you: the favicon (binary files cannot be written into a theme).",
        "",
        ...(referenceImport ? ["The reference rebuild is ready as an inactive copy; content is saved as drafts."] : [`Switch the live site to "${plan.theme.copyName}" now?`]),
      ].join("\n");
      return { text: state.reportText };
    } },
  ];

  // ---- activation --------------------------------------------------------------------------
  const activationSteps: Step[] = [
    { name: "activate", run: () => (state.themeCopyId
      ? { calls: [{ toolId: "theme_set_active", input: { themeId: state.themeCopyId }, key: "activate" }] }
      : { text: "There is no imported theme copy to switch to." }) },
    { name: "screenshot", run: () => ({ calls: (["desktop", "mobile"] as const).map((viewport) => ({
      toolId: "web_screenshot_page", input: { sitePath: "/", viewport }, key: `screenshot:${viewport}`, nonFatal: true,
    })) }) },
    { name: "done", run: () => {
      const unavailable = state.notes.some((note) => /web_screenshot_page failed/.test(note));
      state.activationText = [
        `Done: "${state.plan?.theme.copyName}" (${state.themeCopyId}) is now the live theme; ${state.activeThemeId} is unchanged and can be switched back at any time.`,
        unavailable ? "Screenshots are not available on this server, so the visual check used the fetched pages only." : "Captured the new homepage at desktop and mobile widths for comparison.",
      ].join("\n");
      return { text: state.activationText };
    } },
  ];

  return {
    state,
    queueReferenceImport: () => {
      referenceImport = true;
      phase = "import";
      const steps = [...discovery, ...importSteps];
      // Read the named behavior owner's instructions before rebuilding the theme. Using the
      // documented fs_read_file fallback keeps this deterministic when plugin tools are gated.
      steps.unshift({ name: "tovu-theme-owner", run: () => ({ calls: [{ toolId: "fs_read_file", input: {
        root: "repo", path: "content/agent-plugins/tovu-theme/skills/tovu-theme/SKILL.md",
      }, key: "theme-owner" }] }) });
      steps.splice(steps.length - 1, 0, { name: "compare-reference", run: () => ({ calls: (["desktop", "mobile"] as const).flatMap((viewport) => [
        { toolId: "web_screenshot_page", input: { url: `${origin}/`, viewport }, key: `source-capture:${viewport}`, nonFatal: true },
        { toolId: "web_screenshot_page", input: { sitePath: "/", themeId: state.themeCopyId, viewport }, key: `copy-capture:${viewport}`, nonFatal: true },
      ]) }) });
      queue.enqueue(turnFor(steps));
    },
    queueDiscovery: () => { phase = "discovery"; queue.enqueue(turnFor([...discovery])); },
    queueImport: () => { phase = "import"; queue.enqueue(turnFor([...importSteps])); },
    queueActivation: () => { phase = "activation"; queue.enqueue(turnFor([...activationSteps])); },
  };
}
