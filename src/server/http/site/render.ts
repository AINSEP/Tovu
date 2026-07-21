import type { JsonObject, JsonValue } from "../../../core/ports";
import type { PostRecord } from "../../../features/post";
import type { DiscoveredTheme, TemplateNode } from "../../../features/theme";
import { resolveTemplateId, resolveLiquidTemplateId } from "../../../features/theme";
import type { ResolvePageWidgetsResult } from "../../../widgets/resolver-service";
import type { WidgetRenderIR } from "../../../widgets/types";
import { renderLiquidInSandbox } from "./liquid-sandbox";

/**
 * @file Template-tree renderer for the public site (SPEC-004 spike slice).
 *
 * Purpose:
 * Turns a discovered declarative theme + page context into HTML. Resolves the
 * route to a template id, walks the template's JSON block tree, and renders
 * three node kinds: content doc nodes (TipTap/ProseMirror vocab), `slot` nodes
 * (context-filled), and `component` nodes (resolved against a core component
 * registry). No theme code executes — the theme is data.
 *
 * How it relates to the project:
 * - Used by `server/routes/site/pages.ts`.
 * - Theme look switches with the presentation feature's `activeThemeId`; the
 *   route resolves that id to a `DiscoveredTheme` and passes it here.
 *
 * Spike scope (VibeCoder): the four v1 core components + three slots, no theme
 * settings, no per-block sanitization. The blessed React renderer (ADR-002) can
 * replace this implementation without touching themes.
 */

/** Everything a template + its components need to render one page. */
export interface SiteRenderContext {
  siteTitle: string;
  route: "home" | "post";
  /** Published posts (home index; also the entry-list source). */
  posts: PostRecord[];
  /** The single post being viewed (post route). */
  post?: PostRecord;
  /** Active theme display name, for the footer badge. */
  themeName: string;
  /**
   * SPEC-043/ADR-047 W-004 — `resolvePageWidgets`'s per-region resolved widget IR, keyed by region
   * key. Empty object when the theme declares no regions or nothing resolved were passed in
   * (every render that doesn't opt into widgets, including every pre-existing test/caller of
   * `renderSite`, gets an empty object here — not a breaking change).
   */
  widgetRegions: Record<string, readonly WidgetRenderIR[]>;
  /** SPEC-043/ADR-047 REQ-21 — resolved inline `widgetEmbed` IR, keyed by `placementId`. */
  widgetInlineResolved: ReadonlyMap<string, WidgetRenderIR>;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Exported for `liquid-worker.ts`, which runs in an isolated worker thread and needs the same escaping used everywhere else in this renderer. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function shortDate(iso: string): string {
  return iso.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Content doc vocabulary (unchanged from the pre-theme renderer)
// ---------------------------------------------------------------------------

/**
 * Sanitize a content `link` href (C7). Content is data, so an inline link is an
 * untrusted string: allow only in-page (`#…`), same-origin relative (`/…`),
 * `http(s)://`, and `mailto:` targets. Everything else — notably `javascript:`
 * and `data:` — collapses to `"#"` so a doc can never smuggle script into a page.
 */
function safeHref(value: JsonValue | undefined): string {
  if (typeof value !== "string") return "#";
  const href = value.trim();
  if (href.startsWith("/") || href.startsWith("#")) return href;
  if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) return href;
  return "#";
}

function renderMarks(text: string, marks: JsonValue[] | undefined): string {
  let html = escapeHtml(text);
  for (const mark of marks ?? []) {
    if (!isObject(mark)) continue;
    const type = mark.type;
    if (type === "bold") html = `<strong>${html}</strong>`;
    else if (type === "italic") html = `<em>${html}</em>`;
    else if (type === "code") html = `<code>${html}</code>`;
    else if (type === "link") {
      const attrs = isObject(mark.attrs) ? mark.attrs : {};
      html = `<a href="${escapeHtml(safeHref(attrs.href))}">${html}</a>`;
    }
  }
  return html;
}

/** No-widgets default for every `renderDocNode`/`renderNodes` caller that doesn't pass one. */
const EMPTY_INLINE_RESOLVED: ReadonlyMap<string, WidgetRenderIR> = new Map();

function renderNodes(nodes: JsonValue[] | undefined, inlineResolved: ReadonlyMap<string, WidgetRenderIR>): string {
  return (nodes ?? []).map((node) => renderDocNode(node, inlineResolved)).join("");
}

/**
 * Renders a TipTap/ProseMirror-style doc node to HTML. Unknown nodes render children.
 *
 * `inlineResolved` (SPEC-043/ADR-047 REQ-21) is optional and defaults to empty — every pre-existing
 * caller (this file's `entryContent`, `liquid-worker.ts`'s `buildLiquidData`, and every direct test
 * call) keeps working unchanged; a `widgetEmbed` node with no matching entry in the map (embeds are
 * only resolvable when the caller threads a real `resolvePageWidgets` result through, see
 * `renderSite`) degrades to the same public-safe placeholder REQ-28 requires, never a crash or a raw
 * dump of the node's attrs.
 */
export function renderDocNode(node: JsonValue, inlineResolved: ReadonlyMap<string, WidgetRenderIR> = EMPTY_INLINE_RESOLVED): string {
  if (!isObject(node)) return "";
  const content = Array.isArray(node.content) ? node.content : undefined;

  switch (node.type) {
    case "doc":
      return renderNodes(content, inlineResolved);
    case "paragraph":
      return `<p>${renderNodes(content, inlineResolved)}</p>`;
    case "heading": {
      const level = isObject(node.attrs) && typeof node.attrs.level === "number" ? node.attrs.level : 2;
      const h = Math.min(Math.max(level, 1), 6);
      return `<h${h}>${renderNodes(content, inlineResolved)}</h${h}>`;
    }
    case "text":
      return renderMarks(
        typeof node.text === "string" ? node.text : "",
        Array.isArray(node.marks) ? node.marks : undefined
      );
    case "bulletList":
      return `<ul>${renderNodes(content, inlineResolved)}</ul>`;
    case "orderedList":
      return `<ol>${renderNodes(content, inlineResolved)}</ol>`;
    case "listItem":
      return `<li>${renderNodes(content, inlineResolved)}</li>`;
    case "blockquote":
      return `<blockquote>${renderNodes(content, inlineResolved)}</blockquote>`;
    case "codeBlock":
      return `<pre><code>${renderNodes(content, inlineResolved)}</code></pre>`;
    case "horizontalRule":
      return "<hr/>";
    case "widgetEmbed": {
      // REQ-18/REQ-21: a block-level atom node carrying a single widget-instance reference,
      // resolved server-side (by `resolvePageWidgets`, threaded in via `inlineResolved`) before this
      // content ever reaches a theme — the theme (declarative tier here, Liquid tier via
      // `liquid-worker.ts`'s `buildLiquidData` pre-computing `post.content`) never resolves a
      // `widgetEmbed` reference itself.
      const attrs = isObject(node.attrs) ? node.attrs : {};
      const placementId = typeof attrs.placementId === "string" ? attrs.placementId : undefined;
      const ir = placementId ? inlineResolved.get(placementId) : undefined;
      return renderWidgetIr(ir ?? WIDGET_PLACEHOLDER_IR);
    }
    default:
      return renderNodes(content, inlineResolved);
  }
}

// ---------------------------------------------------------------------------
// Core component registry (v1) — the safe building blocks a theme references.
// A theme can arrange these by id; it cannot define new ones (that is a plugin).
// ---------------------------------------------------------------------------

type Component = (ctx: SiteRenderContext, props: JsonObject) => string;

function siteHeader(ctx: SiteRenderContext, props: JsonObject): string {
  const compact = props.compact === true;
  const tagline = !compact && typeof props.tagline === "string"
    ? `<p class="tagline">${escapeHtml(props.tagline)}</p>`
    : "";
  return `<header class="site-header"><div class="wrap"><a class="wordmark" href="/">${escapeHtml(ctx.siteTitle)}</a>${tagline}<nav class="site-nav"><a href="/">Home</a><a href="/admin/">Admin</a></nav></div></header>`;
}

function entryList(ctx: SiteRenderContext, props: JsonObject): string {
  const layout = typeof props.layout === "string" ? props.layout : "index";
  const items = ctx.posts
    .map((post, i) => {
      const folio = String(i + 1).padStart(2, "0");
      return `<li class="entry"><a class="entry-link" href="/${escapeHtml(post.slug)}"><span class="entry-index">№ ${folio}</span><h2 class="entry-title">${escapeHtml(post.title)}</h2><p class="entry-meta">${escapeHtml(shortDate(post.updatedAt))}</p></a></li>`;
    })
    .join("");
  const body = items || `<li class="entry entry--empty"><p>No published posts yet.</p></li>`;
  return `<section class="entry-list entry-list--${escapeHtml(layout)}"><div class="wrap"><ol class="entries">${body}</ol></div></section>`;
}

function entryContent(ctx: SiteRenderContext): string {
  if (!ctx.post) return "";
  return `<div class="wrap"><a class="back" href="/">← ${escapeHtml(ctx.siteTitle)}</a><article class="entry"><h1 class="entry-title">${escapeHtml(ctx.post.title)}</h1><p class="entry-meta">${escapeHtml(shortDate(ctx.post.updatedAt))}</p><div class="prose">${renderDocNode(ctx.post.bodyJson, ctx.widgetInlineResolved)}</div></article></div>`;
}

function siteFooter(ctx: SiteRenderContext): string {
  return `<footer class="site-footer"><div class="wrap"><span>${escapeHtml(ctx.siteTitle)} — powered by Tovu</span><span class="theme-badge">theme: ${escapeHtml(ctx.themeName)}</span></div></footer>`;
}

// --- Prop readers (templates are untrusted-ish data — read defensively) ---

function str(value: JsonValue | undefined, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
function arr(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}
function obj(value: JsonValue | undefined): JsonObject | undefined {
  return isObject(value) ? value : undefined;
}

/** A labelled aspect-ratio box standing in for an image (no asset pipeline yet). */
function mediaPlaceholder(props: JsonObject): string {
  const label = escapeHtml(str(props.label, "Image"));
  const ratio = escapeHtml(str(props.ratio, "16 / 9"));
  return `<figure class="media-ph" style="aspect-ratio:${ratio}"><span class="media-ph__label">${label}</span></figure>`;
}

function actionsHtml(actions: JsonValue[]): string {
  const links = actions
    .map((a, i) => {
      const o = obj(a);
      if (!o) return "";
      const kind = i === 0 ? "btn btn--primary" : "btn btn--ghost";
      return `<a class="${kind}" href="${escapeHtml(str(o.href, "#"))}">${escapeHtml(str(o.label, "Learn more"))}</a>`;
    })
    .join("");
  return links ? `<div class="actions">${links}</div>` : "";
}

/** Landing hero: optional badge/eyebrow, title, subtitle, actions, optional media. */
function hero(_ctx: SiteRenderContext, props: JsonObject): string {
  const badge = str(props.badge) ? `<span class="hero__badge">${escapeHtml(str(props.badge))}</span>` : "";
  const eyebrow = str(props.eyebrow) ? `<p class="eyebrow">${escapeHtml(str(props.eyebrow))}</p>` : "";
  const subtitle = str(props.subtitle) ? `<p class="hero__sub">${escapeHtml(str(props.subtitle))}</p>` : "";
  const media = obj(props.media) ? `<div class="hero__media">${mediaPlaceholder(obj(props.media)!)}</div>` : "";
  return `<section class="hero"><div class="wrap hero__inner"><div class="hero__text">${badge}${eyebrow}<h1 class="hero__title">${escapeHtml(str(props.title))}</h1>${subtitle}${actionsHtml(arr(props.actions))}</div>${media}</div></section>`;
}

/** Thin promo strip above the nav. */
function announcement(_ctx: SiteRenderContext, props: JsonObject): string {
  const text = escapeHtml(str(props.text));
  if (!text) return "";
  const link = obj(props.link);
  const linkHtml = link
    ? ` <a class="topbar__link" href="${escapeHtml(str(link.href, "#"))}">${escapeHtml(str(link.label, "Learn more"))} →</a>`
    : "";
  return `<div class="topbar"><div class="wrap"><p class="topbar__text">${text}${linkHtml}</p></div></div>`;
}

/** Sticky nav bar with CSS-only hover dropdowns + a checkbox-driven mobile drawer (no JS). */
function siteNav(ctx: SiteRenderContext, props: JsonObject): string {
  const brand = escapeHtml(str(props.brand) || ctx.siteTitle);
  const caret = '<svg class="caret" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
  const items = arr(props.items)
    .map((it) => {
      const o = obj(it);
      if (!o) return "";
      const label = escapeHtml(str(o.label));
      const href = escapeHtml(str(o.href, "#"));
      const children = arr(o.children);
      if (children.length) {
        const sub = children
          .map((c) => {
            const co = obj(c);
            if (!co) return "";
            return `<li><a href="${escapeHtml(str(co.href, "#"))}">${escapeHtml(str(co.label))}</a></li>`;
          })
          .join("");
        return `<li class="nav-item has-children"><a class="nav-link" href="${href}">${label}${caret}</a><ul class="nav-dropdown">${sub}</ul></li>`;
      }
      return `<li class="nav-item"><a class="nav-link" href="${href}">${label}</a></li>`;
    })
    .join("");
  const cta = obj(props.cta);
  const ctaHtml = cta
    ? `<a class="btn btn--primary nav-cta" href="${escapeHtml(str(cta.href, "#"))}">${escapeHtml(str(cta.label, "Get started"))}</a>`
    : "";
  return `<header class="site-header"><div class="wrap nav"><a class="brand" href="/">${brand}</a><input type="checkbox" id="nav-toggle" class="nav-toggle" aria-label="Toggle menu"/><label for="nav-toggle" class="nav-burger"><span></span><span></span><span></span></label><nav class="nav-menu"><ul class="nav-list">${items}</ul>${ctaHtml}</nav></div></header>`;
}

/** Full-width final call-to-action band. */
function ctaBand(_ctx: SiteRenderContext, props: JsonObject): string {
  const eyebrow = str(props.eyebrow) ? `<p class="eyebrow eyebrow--on-dark">${escapeHtml(str(props.eyebrow))}</p>` : "";
  const subtitle = str(props.subtitle) ? `<p class="cta__sub">${escapeHtml(str(props.subtitle))}</p>` : "";
  return `<section class="cta"><div class="wrap"><div class="cta__inner">${eyebrow}<h2 class="cta__title">${escapeHtml(str(props.title))}</h2>${subtitle}${actionsHtml(arr(props.actions))}</div></div></section>`;
}

/** Multi-column footer: brand blurb + socials, link columns, legal row. */
function siteFooterRich(ctx: SiteRenderContext, props: JsonObject): string {
  const brand = escapeHtml(str(props.brand) || ctx.siteTitle);
  const blurb = str(props.blurb) ? `<p class="footer__blurb">${escapeHtml(str(props.blurb))}</p>` : "";
  const socials = arr(props.social)
    .map((s) => {
      const o = obj(s);
      if (!o) return "";
      return `<a class="footer__social" href="${escapeHtml(str(o.href, "#"))}">${escapeHtml(str(o.label))}</a>`;
    })
    .join("");
  const cols = arr(props.columns)
    .map((c) => {
      const o = obj(c);
      if (!o) return "";
      const links = arr(o.links)
        .map((l) => {
          const lo = obj(l);
          if (!lo) return "";
          return `<li><a href="${escapeHtml(str(lo.href, "#"))}">${escapeHtml(str(lo.label))}</a></li>`;
        })
        .join("");
      return `<div class="footer__col"><h4>${escapeHtml(str(o.title))}</h4><ul>${links}</ul></div>`;
    })
    .join("");
  const legal = escapeHtml(str(props.legal) || `© ${new Date().getFullYear()} ${str(props.brand) || ctx.siteTitle}`);
  return `<footer class="site-footer site-footer--rich"><div class="wrap footer__top"><div class="footer__brandcol"><a class="brand" href="/">${brand}</a>${blurb}<div class="footer__socials">${socials}</div></div><div class="footer__cols">${cols}</div></div><div class="wrap footer__bottom"><span>${legal}</span><span class="theme-badge">theme: ${escapeHtml(ctx.themeName)}</span></div></footer>`;
}

function paragraphsHtml(items: JsonValue[]): string {
  return items.map((p) => `<p>${escapeHtml(str(p))}</p>`).join("");
}
function bulletsHtml(items: JsonValue[]): string {
  const lis = items.map((b) => `<li>${escapeHtml(str(b))}</li>`).join("");
  return lis ? `<ul class="ticks">${lis}</ul>` : "";
}

/** A content section: eyebrow/title/lead/body/bullets, optional side media + actions. */
function section(_ctx: SiteRenderContext, props: JsonObject): string {
  const id = str(props.id) ? ` id="${escapeHtml(str(props.id))}"` : "";
  const mediaObj = obj(props.media);
  const side = str(props.side, "right") === "left" ? "section--media-left" : "section--media-right";
  const eyebrow = str(props.eyebrow) ? `<p class="eyebrow">${escapeHtml(str(props.eyebrow))}</p>` : "";
  const title = str(props.title) ? `<h2 class="section__title">${escapeHtml(str(props.title))}</h2>` : "";
  const lead = str(props.lead) ? `<p class="section__lead">${escapeHtml(str(props.lead))}</p>` : "";
  const text = `<div class="section__text">${eyebrow}${title}${lead}${paragraphsHtml(arr(props.body))}${bulletsHtml(arr(props.bullets))}${actionsHtml(arr(props.actions))}</div>`;
  const media = mediaObj ? `<div class="section__media">${mediaPlaceholder(mediaObj)}</div>` : "";
  const layout = media ? side : "section--plain";
  return `<section class="section ${layout}"${id}><div class="wrap section__inner">${text}${media}</div></section>`;
}

/** A 3-up (auto-fill) grid of labelled feature cards. */
function featureGrid(_ctx: SiteRenderContext, props: JsonObject): string {
  const eyebrow = str(props.eyebrow) ? `<p class="eyebrow">${escapeHtml(str(props.eyebrow))}</p>` : "";
  const title = str(props.title) ? `<h2 class="section__title">${escapeHtml(str(props.title))}</h2>` : "";
  const cards = arr(props.items)
    .map((it) => {
      const o = obj(it);
      if (!o) return "";
      const tag = str(o.tag) ? `<span class="feature__tag">${escapeHtml(str(o.tag))}</span>` : "";
      return `<article class="feature"><div class="feature__head">${tag}<h3 class="feature__title">${escapeHtml(str(o.title))}</h3></div><p class="feature__body">${escapeHtml(str(o.body))}</p></article>`;
    })
    .join("");
  return `<section class="feature-grid"><div class="wrap"><header class="feature-grid__head">${eyebrow}${title}</header><div class="features">${cards}</div></div></section>`;
}

/** Exported for `liquid-worker.ts`: the `render_block` Liquid tag (registered on the isolated worker's own engine) resolves against this same registry, so a Liquid theme and a declarative theme render identical output for the same component id. */
export const COMPONENTS: Record<string, Component> = {
  "tovu/site-header": siteHeader,
  "tovu/entry-list": entryList,
  "tovu/entry-content": entryContent,
  "tovu/site-footer": siteFooter,
  "tovu/hero": hero,
  "tovu/section": section,
  "tovu/feature-grid": featureGrid,
  "tovu/media-placeholder": (_ctx, props) => mediaPlaceholder(props),
  "tovu/announcement": announcement,
  "tovu/nav": siteNav,
  "tovu/cta": ctaBand,
  "tovu/footer": siteFooterRich,
};

// ---------------------------------------------------------------------------
// Widget IR rendering (SPEC-043/ADR-047 W-004) — renders `resolvePageWidgets`'s
// output (`WidgetRenderIR { componentId, props, children? }`), NOT theme-authored
// `TemplateNode` data. Deliberately a separate switch, not folded into `COMPONENTS`:
// `COMPONENTS`/`Component` resolve theme-authored `{type:"component", id, props}`
// nodes and have no concept of an IR's `children` array; widget IR is core-produced,
// closed-vocabulary data (exactly the five v1 `componentId`s the widget-type
// registry can ever emit, plus the `widget-placeholder` failure IR — see
// `src/widgets/registry.ts`/`resolver-service.ts`). Both render tiers reach this
// same function — the declarative tier via `renderBlock`'s new `region` node kind,
// the Liquid tier via `liquid-worker.ts`'s extended `render_block` tag — so ADR-047
// §2a's "no new Liquid capability required, both placement paths resolve to
// something the renderer already knows how to receive" holds for regions the same
// way it already held for the original four components.
// ---------------------------------------------------------------------------

/** REQ-28: a widget resolution failure (or, here, an unresolvable IR reaching the renderer some
 * other way) renders an isolated, public-safe placeholder — no internal error detail. */
const WIDGET_PLACEHOLDER_IR: WidgetRenderIR = { componentId: "widget-placeholder", props: {} };

function renderWidgetSocialLinks(props: JsonObject): string {
  const items = arr(props.links)
    .map((link) => {
      const o = obj(link);
      if (!o) return "";
      return `<li><a class="widget-social-link" href="${escapeHtml(safeHref(o.url))}">${escapeHtml(str(o.platform))}</a></li>`;
    })
    .join("");
  return `<ul class="widget widget-social-links">${items}</ul>`;
}

function renderWidgetEntrySummary(props: JsonObject): string {
  const slug = str(props.slug);
  const title = str(props.title);
  return `<li class="widget-entry-summary"><a href="/${escapeHtml(slug)}">${escapeHtml(title)}</a></li>`;
}

function renderWidgetRecentEntries(children: readonly WidgetRenderIR[] | undefined): string {
  const items = (children ?? []).map((child) => renderWidgetIr(child)).join("");
  return `<ul class="widget widget-recent-entries">${items || '<li class="widget-empty">No entries yet.</li>'}</ul>`;
}

/** Renders a `menu` widget's resolved nav items (`navigation/resolver.ts`'s `ResolvedNavItem[]`,
 * passed through as plain IR props) — mirrors `siteNav`'s own unavailable-link handling: an
 * `available:false` item renders as inert text, never a broken/empty href. */
function renderWidgetMenuItems(items: JsonValue[]): string {
  return items
    .map((item) => {
      const o = obj(item);
      if (!o) return "";
      const label = escapeHtml(str(o.label));
      const available = o.available === true && typeof o.href === "string";
      const link = available
        ? `<a href="${escapeHtml(safeHref(o.href))}">${label}</a>`
        : `<span class="widget-menu-item--unavailable">${label}</span>`;
      const children = arr(o.children);
      const sub = children.length ? `<ul>${renderWidgetMenuItems(children)}</ul>` : "";
      return `<li>${link}${sub}</li>`;
    })
    .join("");
}

function renderWidgetMenu(props: JsonObject): string {
  const title = str(props.title);
  const heading = title ? `<h3 class="widget-menu-title">${escapeHtml(title)}</h3>` : "";
  return `<nav class="widget widget-menu">${heading}<ul>${renderWidgetMenuItems(arr(props.items))}</ul></nav>`;
}

/** Renders a `contact-form` widget: Forms' own declared field vocabulary (REQ-37 — never a
 * hardcoded field-type list), posting to Forms' existing public route unmodified (`POST
 * /forms/:slug/submit`, `routes/site/forms-submit.ts`) — this widget type introduces no new
 * submission endpoint (REQ-39). */
function renderWidgetContactForm(props: JsonObject): string {
  const slug = str(props.slug);
  if (!slug) return renderWidgetPlaceholder();
  const fields = arr(props.fields)
    .map((f) => {
      const o = obj(f);
      if (!o) return "";
      const id = escapeHtml(str(o.id));
      const label = escapeHtml(str(o.label));
      const required = o.required === true;
      const kind = str(o.type, "text");
      const inputEl =
        kind === "textarea"
          ? `<textarea name="${id}" id="widget-contact-${id}"${required ? " required" : ""}></textarea>`
          : kind === "checkbox"
            ? `<input type="checkbox" name="${id}" id="widget-contact-${id}"${required ? " required" : ""}/>`
            : `<input type="${kind === "email" ? "email" : "text"}" name="${id}" id="widget-contact-${id}"${required ? " required" : ""}/>`;
      return `<div class="widget-form-field"><label for="widget-contact-${id}">${label}${required ? " *" : ""}</label>${inputEl}</div>`;
    })
    .join("");
  return `<form class="widget widget-contact-form" method="post" action="/forms/${escapeHtml(slug)}/submit">${fields}<button type="submit">Send</button></form>`;
}

/** REQ-28: no internal detail, no stack trace, no configuration secret — the placeholder itself
 * carries nothing beyond a static, styleable marker. */
function renderWidgetPlaceholder(): string {
  return `<div class="widget widget-placeholder" aria-hidden="true"></div>`;
}

/**
 * Renders one resolved widget IR node to HTML. Never throws: an unrecognized `componentId` (a
 * resolver shape this renderer doesn't yet know, or the REQ-27 failure taxonomy reaching here some
 * other way) degrades to the same public-safe placeholder REQ-28 requires, not a crash or an
 * unescaped dump of unknown props.
 */
function renderWidgetIr(ir: WidgetRenderIR): string {
  switch (ir.componentId) {
    case "text":
      return `<div class="widget widget-text">${escapeHtml(str(ir.props.body)).replaceAll("\n", "<br/>")}</div>`;
    case "social-links":
      return renderWidgetSocialLinks(ir.props);
    case "recent-entries":
      return renderWidgetRecentEntries(ir.children);
    case "entry-summary":
      return renderWidgetEntrySummary(ir.props);
    case "menu":
      return renderWidgetMenu(ir.props);
    case "contact-form":
      return renderWidgetContactForm(ir.props);
    case "widget-placeholder":
    default:
      return renderWidgetPlaceholder();
  }
}

/**
 * Renders a theme-declared region: the ordered, resolved widget list for `regionKey`, wrapped in
 * one semantic container. No layout/positioning opinion beyond that container (ADR-047 §4 "widgets
 * carry zero layout opinion" — that belongs to the region's placement context, i.e. the theme's own
 * CSS/template arrangement around this block). Renders nothing (not even the wrapper) when the
 * region has no resolved widgets — an empty/unbound region is not an error state (ADR-047 §7).
 */
/** Exported for `liquid-worker.ts`'s `render_block` tag, which resolves `region:` the same way it
 * resolves `component:` — over the same `COMPONENTS`-registry-adjacent seam, per ADR-047 §2a's "no
 * new Liquid capability required." */
export function renderWidgetRegion(ctx: SiteRenderContext, regionKey: string): string {
  const items = ctx.widgetRegions[regionKey] ?? [];
  if (items.length === 0) return "";
  return `<div class="widget-region widget-region--${escapeHtml(regionKey)}">${items.map((ir) => renderWidgetIr(ir)).join("")}</div>`;
}

// ---------------------------------------------------------------------------
// Templated tier (LiquidJS) — ADR-020 Tier 2.
//
// A "templated" theme ships `.liquid` files instead of JSON block trees. Liquid
// gives authors loops / conditionals / filters that the fixed-component
// declarative tier can't express — while executing NO theme JavaScript.
//
// Two seams bridge Liquid back into the trusted core:
//   • {% render_block component: "tovu/site-header", tagline: "…" %} renders a
//     component from the SAME registry the declarative tier uses (COMPONENTS).
//   • {{ content | raw }} injects the server-rendered, pre-sanitized TipTap body.
//     Output autoescaping is ON (outputEscape: "escape"), so a bare
//     {{ post.title }} is escaped and only explicitly-`raw` values pass HTML.
//
// C6/ADR-020 §3 Tier-2 guardrails are implemented (LiquidJS pinned ≥10.26.0
// per package.json; render isolation + fs lockdown in `liquid-worker.ts`,
// spawned per render by `liquid-sandbox.ts`'s `renderLiquidInSandbox`; the
// tag/filter allowlist + lint-before-publish in
// `features/theme/liquid-allowlist.ts`, wired into `loadTheme()` and
// defensively re-checked in the worker). The Liquid engine construction and
// `render_block` tag registration now live in `liquid-worker.ts`, not here —
// this file only forwards to the sandbox.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Slots — raw context injection points a template can drop in directly.
// ---------------------------------------------------------------------------

function renderSlot(name: string, ctx: SiteRenderContext): string {
  switch (name) {
    case "title":
      return `<h1 class="slot-title">${escapeHtml(ctx.route === "post" && ctx.post ? ctx.post.title : ctx.siteTitle)}</h1>`;
    case "content":
      return ctx.post ? `<div class="prose">${renderDocNode(ctx.post.bodyJson, ctx.widgetInlineResolved)}</div>` : "";
    case "entry-list":
      return entryList(ctx, {});
    default:
      return `<!-- unknown slot: ${escapeHtml(name)} -->`;
  }
}

// ---------------------------------------------------------------------------
// Template block tree
// ---------------------------------------------------------------------------

function renderBlock(node: TemplateNode, ctx: SiteRenderContext): string {
  if (!isObject(node)) return "";

  if (node.type === "component") {
    const id = typeof node.id === "string" ? node.id : "";
    const component = COMPONENTS[id];
    if (!component) return `<!-- unknown component: ${escapeHtml(id)} -->`;
    return component(ctx, isObject(node.props) ? node.props : {});
  }

  if (node.type === "slot") {
    return renderSlot(typeof node.name === "string" ? node.name : "", ctx);
  }

  // SPEC-043/ADR-047 W-004: `{"type":"region","key":"footer"}` — a theme-authored reference to a
  // theme-declared widget region (REQ-13/`ThemeManifest.regions`), resolved server-side ahead of
  // this walk (`resolvePageWidgets`, threaded in via `ctx.widgetRegions`). Checked before the
  // generic doc-vocabulary fallthrough so a region node is never mistaken for unknown content-doc
  // vocabulary (which would try to walk its `content`, not its `key`).
  if (node.type === "region") {
    return renderWidgetRegion(ctx, typeof node.key === "string" ? node.key : "");
  }

  if (node.type === "doc") {
    return (Array.isArray(node.content) ? node.content : []).map((child) => renderBlock(child, ctx)).join("");
  }

  // Anything else is content-doc vocabulary.
  return renderDocNode(node, ctx.widgetInlineResolved);
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

const BASE_STYLE = `
  *,*::before,*::after { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; -webkit-font-smoothing: antialiased; }
  img { max-width: 100%; height: auto; }
  a { color: inherit; }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;

function tokensToCss(tokens: Record<string, string>): string {
  const decls = Object.entries(tokens)
    .map(([name, value]) => `${name}: ${value};`)
    .join(" ");
  return `:root { ${decls} }\n  body { font-family: var(--font-body, system-ui, sans-serif); }`;
}

function fontLink(theme: DiscoveredTheme): string {
  const fonts = theme.manifest.fonts ?? [];
  if (fonts.length === 0) return "";
  const families = fonts.map((f) => `family=${f}`).join("&");
  return `<link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/><link rel="stylesheet" href="https://fonts.googleapis.com/css2?${families}&display=swap"/>`;
}

/**
 * `extraHead` is `page-head.ts`'s `serializeHeadElements()` output (SPEC-008
 * ADR-PIPE-008 T048) — already-escaped markup, inserted verbatim. When it
 * contains its own `<title>` (SEO's fold always emits one, per
 * `page-head-contributor.ts`'s priority-100 title element), this shell's own
 * hardcoded `<title>` is suppressed rather than emitting two competing tags.
 */
function pageShell(required: { title: string; theme: DiscoveredTheme; body: string; extraHead?: string }): string {
  const { theme, extraHead } = required;
  const foldHasTitle = extraHead?.includes("<title>") ?? false;
  const titleTag = foldHasTitle ? "" : `<title>${escapeHtml(required.title)}</title>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
${titleTag}
${extraHead ?? ""}
${fontLink(theme)}
<style>${BASE_STYLE}${tokensToCss(theme.tokens)}${theme.css}</style>
</head>
<body>
<div class="site" data-theme="${escapeHtml(theme.manifest.id)}">${required.body}</div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

/**
 * Render a page through a declarative theme. Resolves the route to a template
 * and walks its block tree. If the theme lacks the needed template, falls back
 * to a minimal built-in body so a partial theme never 500s (SPEC-004 REQ-10).
 *
 * `async` because the "templated" (LiquidJS) tier renders inside an isolated
 * `worker_threads` worker (ADR-020 §3 render isolation, C6) — the declarative
 * tier's own `renderBlock` walk stays fully synchronous, so most calls still
 * resolve on the same tick the returned promise is awaited.
 */
export async function renderSite(required: {
  theme: DiscoveredTheme;
  route: "home" | "post";
  siteTitle: string;
  posts: PostRecord[];
  post?: PostRecord;
  /**
   * SPEC-043/ADR-047 W-004 — pre-resolved widget data for this render (`resolvePageWidgets`'s own
   * output). `render.ts` stays a pure "resolved data -> HTML" renderer, matching how `posts`/`post`
   * are already pre-resolved by the caller (`routes/site/pages.ts`) rather than repo-fetched here —
   * `resolvePageWidgets` itself never throws (REQ-27), so the caller can always pass a real result.
   * Omitted entirely (every pre-existing caller/test of `renderSite`) behaves as "no regions
   * declared, no inline embeds resolved" — not a breaking change.
   */
  widgets?: ResolvePageWidgetsResult;
  /** SPEC-008 T049 — pre-serialized `page.head` fold output, threaded through to `pageShell`. */
  extraHead?: string;
}): Promise<string> {
  const { theme, route } = required;
  const ctx: SiteRenderContext = {
    siteTitle: required.siteTitle,
    route,
    posts: required.posts,
    post: required.post,
    themeName: theme.manifest.name,
    widgetRegions: required.widgets?.regions ?? {},
    widgetInlineResolved: required.widgets?.inlineResolved ?? EMPTY_INLINE_RESOLVED,
  };

  const fallbackBody = (): string =>
    `${siteHeader(ctx, {})}${route === "post" ? entryContent(ctx) : entryList(ctx, {})}${siteFooter(ctx)}`;

  let body: string;
  if (theme.manifest.tier === "templated") {
    const liquidId = resolveLiquidTemplateId(route, theme.liquidTemplates);
    const source = liquidId ? theme.liquidTemplates[liquidId] : undefined;
    try {
      body = source ? await renderLiquidInSandbox({ source, ctx }) : fallbackBody();
    } catch (err) {
      // A broken/hostile Liquid template must not 500 the site (SPEC-004
      // REQ-10 spirit) — covers a syntax error, a disallowed tag/filter the
      // worker's defensive re-lint caught, or a sandbox timeout/OOM.
      body = `<!-- theme render error: ${escapeHtml((err as Error).message)} -->${fallbackBody()}`;
    }
  } else {
    const templateId = resolveTemplateId(route, theme.templates);
    const tree = templateId ? theme.templates[templateId] : undefined;
    body = tree ? renderBlock(tree, ctx) : fallbackBody();
  }

  const title = route === "post" && required.post
    ? `${required.post.title} — ${required.siteTitle}`
    : required.siteTitle;

  return pageShell({ title, theme, body, extraHead: required.extraHead });
}
