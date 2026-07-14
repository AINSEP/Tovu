import { Liquid, Hash, type TagToken, type Context } from "liquidjs";

import type { JsonObject, JsonValue } from "../../../core/ports";
import type { PostRecord } from "../../../features/post";
import type { DiscoveredTheme, TemplateNode } from "../../../features/theme";
import { resolveTemplateId, resolveLiquidTemplateId } from "../../../features/theme";

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
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeHtml(value: string): string {
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

function renderNodes(nodes: JsonValue[] | undefined): string {
  return (nodes ?? []).map((node) => renderDocNode(node)).join("");
}

/** Renders a TipTap/ProseMirror-style doc node to HTML. Unknown nodes render children. */
export function renderDocNode(node: JsonValue): string {
  if (!isObject(node)) return "";
  const content = Array.isArray(node.content) ? node.content : undefined;

  switch (node.type) {
    case "doc":
      return renderNodes(content);
    case "paragraph":
      return `<p>${renderNodes(content)}</p>`;
    case "heading": {
      const level = isObject(node.attrs) && typeof node.attrs.level === "number" ? node.attrs.level : 2;
      const h = Math.min(Math.max(level, 1), 6);
      return `<h${h}>${renderNodes(content)}</h${h}>`;
    }
    case "text":
      return renderMarks(
        typeof node.text === "string" ? node.text : "",
        Array.isArray(node.marks) ? node.marks : undefined
      );
    case "bulletList":
      return `<ul>${renderNodes(content)}</ul>`;
    case "orderedList":
      return `<ol>${renderNodes(content)}</ol>`;
    case "listItem":
      return `<li>${renderNodes(content)}</li>`;
    case "blockquote":
      return `<blockquote>${renderNodes(content)}</blockquote>`;
    case "codeBlock":
      return `<pre><code>${renderNodes(content)}</code></pre>`;
    case "horizontalRule":
      return "<hr/>";
    default:
      return renderNodes(content);
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
  return `<div class="wrap"><a class="back" href="/">← ${escapeHtml(ctx.siteTitle)}</a><article class="entry"><h1 class="entry-title">${escapeHtml(ctx.post.title)}</h1><p class="entry-meta">${escapeHtml(shortDate(ctx.post.updatedAt))}</p><div class="prose">${renderDocNode(ctx.post.bodyJson)}</div></article></div>`;
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

const COMPONENTS: Record<string, Component> = {
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
// Spike scope (VibeCoder): autoescape + zero filesystem access is the safety
// baseline. The full Tier-2 guardrails — tag/filter allowlist, render isolation,
// template lint-before-publish (ADR-020 §Guardrails / C6 / REQ-06) — are
// deferred to the C6 validation pipeline.
// ---------------------------------------------------------------------------

/** Key under which the live render context is passed to the render_block tag. */
const CTX_KEY = "__siteCtx";

const liquid = new Liquid({
  outputEscape: "escape",
  strictVariables: false,
  strictFilters: false,
  jsTruthy: true,
  cache: false,
});

liquid.registerTag("render_block", {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parse(this: any, token: TagToken) {
    this.hash = new Hash(token.args);
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  *render(this: any, ctx: Context): Generator<unknown, string, unknown> {
    const props = (yield this.hash.render(ctx)) as JsonObject;
    const id = typeof props.component === "string" ? props.component : "";
    const { component: _component, ...rest } = props;
    void _component;
    const siteCtx = ctx.getSync([CTX_KEY]) as SiteRenderContext | undefined;
    const component = COMPONENTS[id];
    if (!component || !siteCtx) return `<!-- unknown component: ${escapeHtml(id)} -->`;
    return component(siteCtx, rest);
  },
});

/**
 * Render a templated-tier theme body via LiquidJS. Sync render (no async
 * filters/tags, no filesystem access) preserves `renderSite`'s signature.
 * Throws propagate to the caller, which falls back to a minimal body.
 */
function renderLiquidBody(source: string, ctx: SiteRenderContext): string {
  const data = {
    site: { title: ctx.siteTitle },
    theme: { name: ctx.themeName },
    route: ctx.route,
    posts: ctx.posts.map((p) => ({ title: p.title, slug: p.slug, date: p.updatedAt })),
    // `content` is pre-sanitized HTML; templates emit it with `| raw`.
    post: ctx.post
      ? { title: ctx.post.title, slug: ctx.post.slug, date: ctx.post.updatedAt, content: renderDocNode(ctx.post.bodyJson) }
      : null,
    [CTX_KEY]: ctx,
  };
  return liquid.parseAndRenderSync(source, data);
}

// ---------------------------------------------------------------------------
// Slots — raw context injection points a template can drop in directly.
// ---------------------------------------------------------------------------

function renderSlot(name: string, ctx: SiteRenderContext): string {
  switch (name) {
    case "title":
      return `<h1 class="slot-title">${escapeHtml(ctx.route === "post" && ctx.post ? ctx.post.title : ctx.siteTitle)}</h1>`;
    case "content":
      return ctx.post ? `<div class="prose">${renderDocNode(ctx.post.bodyJson)}</div>` : "";
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

  if (node.type === "doc") {
    return (Array.isArray(node.content) ? node.content : []).map((child) => renderBlock(child, ctx)).join("");
  }

  // Anything else is content-doc vocabulary.
  return renderDocNode(node);
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
 */
export function renderSite(required: {
  theme: DiscoveredTheme;
  route: "home" | "post";
  siteTitle: string;
  posts: PostRecord[];
  post?: PostRecord;
  /** SPEC-008 T049 — pre-serialized `page.head` fold output, threaded through to `pageShell`. */
  extraHead?: string;
}): string {
  const { theme, route } = required;
  const ctx: SiteRenderContext = {
    siteTitle: required.siteTitle,
    route,
    posts: required.posts,
    post: required.post,
    themeName: theme.manifest.name,
  };

  const fallbackBody = (): string =>
    `${siteHeader(ctx, {})}${route === "post" ? entryContent(ctx) : entryList(ctx, {})}${siteFooter(ctx)}`;

  let body: string;
  if (theme.manifest.tier === "templated") {
    const liquidId = resolveLiquidTemplateId(route, theme.liquidTemplates);
    const source = liquidId ? theme.liquidTemplates[liquidId] : undefined;
    try {
      body = source ? renderLiquidBody(source, ctx) : fallbackBody();
    } catch (err) {
      // A broken Liquid template must not 500 the site (SPEC-004 REQ-10 spirit).
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
