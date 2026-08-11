import { markersOfType, substituteMarkers, withInnerContent } from "#src/core/embeds/marker";
import { DEFAULT_THEME_SLOTS, type DiscoveredTheme, type ThemeSlotDescriptor, type ThemeTokens } from "./theme";

/**
 * @file Real (non-spike) request-time rendering for `static`-tier themes.
 *
 * Ports the logic each static theme's own `build-preview.mjs` (an authoring-time stand-in written
 * before this file existed) already proved out over 18+ screenshots this session: token injection,
 * asset-path rewriting, and `data-tovu-slot` resolution. That script still exists per-theme for
 * local preview/iteration; this module is the one real counterpart `render.ts` calls when actually
 * serving a static theme as the live site.
 *
 * Scope of this pass: **home route only.** Posts/products routes are not handled here at all;
 * callers fall back to the existing `fallbackBody()` for those.
 */

function tokensToRootCss(tokens: ThemeTokens, tokensLight: ThemeTokens): string {
  const darkLines = Object.entries(tokens).map(([k, v]) => `  ${k}: ${v};`);
  const lightLines = Object.entries(tokensLight).map(([k, v]) => `  ${k}: ${v};`);
  return (
    `:root {\n${darkLines.join("\n")}\n}\n` +
    `:root[data-theme="light"] {\n${lightLines.join("\n")}\n}`
  );
}

/**
 * A static page's `<link>`/`<script>` tags use `../css/`, `../js/` — correct only from inside the
 * theme's own `pages/` folder on disk. Rewritten generically (not per-filename, unlike the
 * per-theme build script) so the engine never needs updating when a theme adds a new script.
 */
function rewriteAssetPaths(html: string, themeId: string): string {
  return html
    .replace(/href="\.\.\/css\//g, `href="/theme-assets/${themeId}/css/`)
    .replace(/src="\.\.\/js\//g, `src="/theme-assets/${themeId}/js/`);
}

/**
 * A static page's internal nav/footer/body links point at sibling page files (`href="pricing.html"`)
 * — correct only when viewing the raw file on disk. Rewritten generically to the real route
 * (`href="/pricing"`, `href="/"` for `index.html`) so a real click in the browser lands on the route
 * Tovu actually serves instead of a bare filename the server never registers. Hash links (`href="#..."`)
 * and the already-rewritten `../css/`/`../js/` asset paths are untouched — this only matches a bare
 * `<name>.html` href, never one containing `/`.
 */
function rewritePageLinks(html: string): string {
  return html.replace(/href="([a-z0-9-]+)\.html"/g, (_m, name: string) => (name === "index" ? 'href="/"' : `href="/${name}"`));
}

/**
 * A post-template page (e.g. `blog-post.html`, referenced from a theme's `theme.json` `postTemplate`
 * array) ships `data-embed-config='{"type":"post","id":"{{post}}"}'` — a literal placeholder, not a
 * real id, since the template is authored once and reused across whichever posts pick it. The route
 * layer (`pages.ts`) already knows which real post is being rendered by the time it calls this, so it
 * substitutes the real stored id here, BEFORE the embed scanner/resolver ever sees the html —
 * `resolveHtmlPageEmbeds` (`widgets/resolver-service.ts`) and `renderHtmlPageBody`
 * (`server/http/site/render.ts`) then treat this exactly like any other real `{"type":"post"}`
 * reference, no special-casing needed downstream. A page with no `{{post}}` placeholder (a non-post-
 * template page, or a misauthored template missing the slot) is simply unaffected — `replace` is a
 * no-op when the token isn't present.
 *
 * A string substitution rather than a marker rewrite on purpose: `{{post}}` is authored INSIDE the
 * JSON as a legal string value (that is what the `marker.canary.test.ts` `{{post}}` canary pins), so
 * swapping it leaves the surrounding config byte-identical and cannot perturb any other key.
 */
export function injectPostEmbedId(html: string, postId: string): string {
  return html.replace('"id":"{{post}}"', `"id":${JSON.stringify(postId)}`);
}

/**
 * Splices a Page's own already-authored body HTML into every `{"type":"content"}` marker in a chosen
 * page-template file — the page-template counterpart to {@link injectPostEmbedId} immediately above,
 * and the mechanism the Pages template picker needs that a Post's `{{post}}` substitution does not: a
 * Post is IDENTIFIED by an id a template can carry as a literal placeholder and defer to a resolver
 * stage; a Page's body is not a reference to look up at all — the route already fetched the Page row
 * before choosing to render it through a template, so `contentHtml` is already in hand and there is
 * nothing to defer.
 *
 * **Deliberately NOT a `resolver-service.ts` `HTML_EMBED_RESOLVERS` entry.** An async registry
 * resolver's failure mode is the REQ-28 generic placeholder — the right degrade for "this referenced
 * widget was deleted", and the wrong one for "this page has no body": there is no such case at this
 * point in the call chain, only a string that may be empty. Placing `content` alongside `partial`/
 * `menu` instead (theme-owned, `isPageEmbedType("content")` is `false` with no registry entry to add)
 * means an unsubstituted marker — this function skipped, or called against html that never had one —
 * survives exactly as authored, the same "unresolved means untouched" contract theme nav/footer
 * already rely on (`resolver-service.ts`'s `isPageEmbedType` doc). Silently blanking a page's entire
 * body to a widget-shaped placeholder would be a materially worse failure than leaving a visible,
 * debuggable marker in the output.
 *
 * Called BEFORE `resolveHtmlPageEmbeds`, the same pipeline position `injectPostEmbedId` occupies in
 * `renderPostViaTemplate` — any `widget`/`media`/`post` marker authored INSIDE the page's own body
 * (not only the template's) is therefore resolved in the same later pass once the two strings are
 * combined here.
 *
 * Uses {@link withInnerContent} (keeps the marker's own tag and authored attributes, splices only what
 * is inside) rather than a whole-element replace. A content slot is far likelier to carry the theme's
 * own styling wrapper (`<main class="page-body" data-embed-config='{"type":"content"}'></main>`) that
 * must survive — the same reason a `menu` marker uses `withInnerContent` — and unlike `post`/`partial`,
 * whose marker element is a bare, classless `<div>` in every theme shipped in this repo today
 * (verified: zero `class` attributes on any `post`/`partial` marker across `src/themes/static/*\/pages/
 * *.html`), so whole-element replacement has never had anything to preserve for those two types.
 *
 * Every `content` marker present receives the SAME `contentHtml` — more than one content slot in one
 * template is unusual but not invalid, and silently filling only the first occurrence would be a worse
 * surprise than filling every one identically.
 *
 * @complexity O(n) over `template`'s length — one `substituteMarkers` scan-and-splice pass, the same
 * cost shape every other marker-substitution call in this codebase already pays.
 */
export function injectPageContent(template: string, contentHtml: string): string {
  return substituteMarkers(template, (marker) => (marker.type === "content" ? withInnerContent(marker, contentHtml) : undefined));
}

/** Minimal HTML-attribute/text escaping, matching `server/http/site/render.ts`'s `escapeHtml`
 * byte-for-byte. Not imported from there: that module pulls in the full template-tree renderer
 * (widgets, Liquid/Handlebars sandboxes, forms), and `render.ts` already imports TYPES from this
 * theme module — importing a runtime value back would open the one runtime import cycle between
 * `features/theme` and `server/http/site` that does not exist today. A four-line pure function is
 * cheaper than that edge. */
function escapeHtmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/**
 * Substitutes a page-template's title placeholder with a Page's own real title —
 * `injectPageContent`'s sibling for the `<title>` tag, following the same "string substitution, not a
 * marker rewrite" convention {@link injectPostEmbedId} documents.
 *
 * Matches the WHOLE `<title>...</title>` element the placeholder sits in, not a bare token search —
 * learned the hard way while authoring `page-shell.html`: that file's own explanatory HTML comment
 * mentions the placeholder as prose, and a bare-token `.replace()` matched THAT occurrence (the first
 * one in the file) instead of the real one in `<head>`, silently leaving the `<title>` tag unfilled.
 * Scoping the match to the full element, the same way {@link injectPostEmbedId} scopes its match to
 * `"id":"..."` rather than a bare `{{post}}`, makes an incidental mention elsewhere in the template
 * (a comment, authored copy) structurally unable to collide with the real slot.
 *
 * Exists because the template-picker's other rendering path, `renderPostViaTemplate`, has a disclosed,
 * ACCEPTED limitation here: `blog-post.html`'s `<title>` is one fixed string, and every post rendered
 * through it shows that generic title in the browser tab. That is tolerable for posts (their real
 * title still renders in the visible `<h1>`), but the five legacy Pages this template targets used to
 * be silently mis-templated for the exact same reason — a hardcoded template `<title>` overriding
 * their real one (Task 1's render-gate fix, this session). Shipping a page-template with the same
 * fixed-title limitation would reintroduce that regression through a new door, so unlike the Post
 * side, the Page template gets a real per-render substitution instead of accepting the limitation.
 *
 * A page-template file authored without this exact `<title>...</title>` shape is simply unaffected —
 * `replace` is a no-op when the pattern isn't present, same degrade `injectPostEmbedId` relies on for
 * a template missing `{{post}}`.
 *
 * @complexity O(n) over `html`'s length — one string search-and-replace.
 */
export function injectPageTitle(html: string, title: string): string {
  return html.replace(/<title>\{\{title\}\}<\/title>/, () => `<title>${escapeHtmlText(title)}</title>`);
}

/**
 * The minimal structural shape this module needs from a resolved menu item — matches
 * `ResolvedNavItem` (`@jini-ai/cms/navigation`, re-exported by `#src/navigation`) field-for-field on
 * every field actually used here. A local shape rather than importing that type keeps `features/theme`
 * from gaining a new import edge onto `navigation` purely for a type; the real `ResolvedNavItem[]` the
 * route layer resolves already satisfies this structurally (same convention `render.ts`'s own
 * `MediaAssetRenderMeta` uses for pre-resolved render-time data owned by a different feature).
 */
export interface StaticMenuItem {
  readonly label: string;
  readonly href: string | null;
  readonly available: boolean;
  readonly isCurrent: boolean;
  /** True when this item OR a descendant is current — what a sidebar uses to expand a section. */
  readonly isActive?: boolean | undefined;
  /** `NavItemAttrs` passthrough. Only the presentational fields this renderer emits are declared. */
  readonly attrs?: { readonly cssClass?: string | undefined; readonly description?: string | undefined; readonly icon?: string | undefined } | undefined;
  readonly children: readonly StaticMenuItem[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Renders one location's resolved menu items as a flat sequence of `<a>` tags. Top-level items
 * only — v1: every static theme's nav/footer markup this session is a flat link row/column with no
 * dropdown/submenu CSS to hook a nested render into, so rendering `children` would need chrome none
 * of these themes ship (a real gap, not silently papered over: nested items are simply not emitted).
 * An unavailable item (deleted/unpublished target, or an unresolvable ref) is omitted entirely,
 * never rendered as a dead link — mirrors `render.ts`'s own `renderWidgetMenuItems` convention for
 * the same `ResolvedNavItem` shape.
 */
function renderMenuLinks(items: readonly StaticMenuItem[]): string {
  return items
    .filter((item) => item.available && item.href !== null)
    .map((item) => {
      const current = item.isCurrent ? ' aria-current="page"' : "";
      return `<a href="${escapeHtml(item.href as string)}"${current}>${escapeHtml(item.label)}</a>`;
    })
    .join("");
}

/**
 * Renders a resolved menu as a nested `<ul>`/`<li>` tree — the shape a docs sidebar needs and
 * {@link renderMenuLinks} cannot produce. **Opt-in per marker** via `{"variant":"tree"}` in the
 * marker's `data-embed-config`, and
 * that is a hard requirement rather than a preference: every static theme's nav CSS today targets
 * direct `<a>` children of a flex container (`basic`'s own `.main-nav { display: flex }` with
 * `.main-nav a`, and the same shape in the other six), so unconditionally introducing a `<ul>` wrapper
 * would collapse each of those navs to a single flex child. Flat stays the default and stays
 * byte-identical; a theme opts a specific marker into the tree when its CSS is ready for one.
 *
 * Emitted hooks, all of which `renderMenuLinks` drops on the floor: `is-current` (this item is the
 * page), `is-active` (this item or a descendant is — what expands the right section), `has-children`,
 * a `depth-N` class, and the item's own authored `attrs.cssClass`. `description`/`icon` render as
 * child spans so a theme can style or ignore them without the renderer knowing an icon set.
 *
 * Availability rule, which differs from the flat renderer's on purpose: an unavailable **leaf** is
 * omitted entirely (the flat contract — never emit a dead link), but an unavailable **branch** is
 * kept as inert text so its available children are not deleted along with it. A trashed section
 * heading should not silently take its whole subtree off the page.
 */
/** The `<li>` class list: structural hooks first, then the item's own authored `cssClass`. */
function menuItemClasses(item: StaticMenuItem, depth: number): string {
  return [
    "menu-item",
    `depth-${depth}`,
    item.children.length > 0 ? "has-children" : "",
    item.isCurrent ? "is-current" : "",
    item.isActive ? "is-active" : "",
    item.attrs?.cssClass ?? "",
  ]
    .filter((c) => c !== "")
    .join(" ");
}

/**
 * The item's own label markup — an `<a>` when it resolves, an inert `<span>` when it does not.
 * `icon`/`description` render as child spans so a theme can style or ignore them without this
 * renderer having to know an icon set.
 */
function menuItemBody(item: StaticMenuItem, linkable: boolean): string {
  const label = escapeHtml(item.label);
  const icon = item.attrs?.icon ? `<span class="menu-item-icon" data-icon="${escapeHtml(item.attrs.icon)}"></span>` : "";
  const description = item.attrs?.description
    ? `<span class="menu-item-desc">${escapeHtml(item.attrs.description)}</span>`
    : "";
  const inner = `${icon}${label}${description}`;
  if (!linkable) return `<span class="menu-item-label">${inner}</span>`;
  const current = item.isCurrent ? ' aria-current="page"' : "";
  return `<a href="${escapeHtml(item.href as string)}"${current}>${inner}</a>`;
}

/** One `<li>`, or `""` when the item is neither linkable nor a branch worth keeping for its children. */
function renderMenuItem(item: StaticMenuItem, depth: number): string {
  const linkable = item.available && item.href !== null;
  const children = item.children.length > 0 ? renderMenuTree(item.children, depth + 1) : "";
  if (!linkable && children === "") return "";
  return `<li class="${menuItemClasses(item, depth)}">${menuItemBody(item, linkable)}${children}</li>`;
}

function renderMenuTree(items: readonly StaticMenuItem[], depth = 0): string {
  const rendered = items
    .map((item) => renderMenuItem(item, depth))
    .filter((li) => li !== "")
    .join("");

  return rendered === "" ? "" : `<ul class="menu-list depth-${depth}">${rendered}</ul>`;
}

/**
 * Fill every `{"type":"menu"}` marker with that menu's resolved items, or leave the marker's authored
 * content completely untouched when no data is supplied for its id (deleted menu, typo in the theme's
 * markup, or the id simply resolves to zero renderable links). That fallback is the contract, not a
 * convenience: an active static theme must render as it did before menus existed, never an empty nav.
 *
 * The marker element itself survives — {@link withInnerContent} rebuilds it from its own tag and
 * attributes, so `nav.html`'s `class="main-nav"` and the docs sidebar's `aria-label` are preserved.
 *
 * Marker location and parsing are `core/embeds/marker.ts`'s job; this function only decides what goes
 * inside. That split is the point of the 2026-08-10 unification — four scanners with four regexes
 * became one.
 */
function injectMenuEmbeds(
  html: string,
  menus: Readonly<Record<string, readonly StaticMenuItem[]>>
): string {
  return substituteMarkers(html, (marker) => {
    if (marker.type !== "menu" || marker.id === undefined) return undefined;
    const items = menus[marker.id];
    if (items === undefined) return undefined;
    const inner = marker.config.variant === "tree" ? renderMenuTree(items) : renderMenuLinks(items);
    return inner === "" ? undefined : withInnerContent(marker, inner);
  });
}

/**
 * Every menu id a static theme's pages and partials reference, deduped, in no particular order. Pure
 * — reads only the in-memory shapes `loadTheme()` produced, no I/O. The route layer calls this BEFORE
 * `renderStaticPage` to know which real menus to fetch, since this file stays I/O-free.
 *
 * Scans every page and partial rather than only the one about to render: the route layer runs once
 * per request before the exact page is chosen, and `nav.html`/`footer.html` are shared across every
 * page anyway.
 *
 * @complexity O(n) over the theme's total authored HTML length across all pages and partials.
 */
export function scanMenuEmbedIds(theme: DiscoveredTheme): readonly string[] {
  const ids = new Set<string>();
  for (const html of [...Object.values(theme.pages), ...Object.values(theme.partials)]) {
    for (const marker of markersOfType(html, "menu")) {
      if (marker.id !== undefined) ids.add(marker.id);
    }
  }
  return Array.from(ids);
}

/** Escape a manifest-supplied string so it matches literally inside a constructed `RegExp`. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `nav.html` → `nav`; the partial-id key `loadStaticTierAssets` stores root partials under. */
function partialIdFromSource(source: string): string {
  return source.endsWith(".html") ? source.slice(0, -".html".length) : source;
}

/**
 * Resolve one partial-slot marker to the partial's content: pick the source (the descriptor's
 * explicit `variants` map, else the `<source-stem>-<variant>.html` convention), then splice
 * `aria-current="page"` onto the partial's own `data-nav-id="<current>"` anchor.
 *
 * `descriptor.honorsCurrentPage` no longer names an attribute to read — the config key is always
 * `current`. It survives as the theme's declaration of WHETHER this slot honors a current-page hint
 * at all, which is still a per-slot fact (a footer has no current item).
 *
 * A marker whose resolved partial does not exist collapses to empty, matching the pre-2026-08-10
 * behavior for the same case.
 */
function resolveSlotMarker(
  descriptor: ThemeSlotDescriptor,
  partials: Record<string, string>,
  config: Readonly<Record<string, unknown>>
): string {
  const variant = typeof config.variant === "string" ? config.variant : undefined;
  const current = typeof config.current === "string" ? config.current : undefined;
  const source =
    variant === undefined
      ? descriptor.source
      : descriptor.variants?.[variant] ?? `${partialIdFromSource(descriptor.source)}-${variant}.html`;
  const partial = partials[partialIdFromSource(source)] ?? "";

  if (descriptor.honorsCurrentPage !== true || current === undefined) return partial;
  const linkRe = new RegExp(`(<a href="[^"]+" data-nav-id="${escapeRegExp(current)}")(>)`);
  return partial.replace(linkRe, '$1 aria-current="page"$2');
}

/**
 * Replace every `{"type":"partial"}` marker with the root partial the theme's `theme.json` `slots`
 * block maps that key to. Unlike a menu marker, the marker element itself disappears — it is
 * scaffolding, and the partial is a complete `<nav>`/`<footer>` of its own.
 *
 * Manifest-driven rather than the hardcoded `nav`/`footer` pair this carried before 2026-08-10; that
 * pair now lives in {@link DEFAULT_THEME_SLOTS} and is used verbatim for a theme declaring no
 * `slots`. A marker naming a key the manifest does not declare is left untouched rather than blanked,
 * so a typo shows the authored fallback instead of a hole.
 *
 * @complexity O(n) over `html` for the single marker scan, plus one map lookup per marker — where the
 * pre-unification version ran one full regex pass per declared slot key, times two spellings.
 */
function resolveSlots(
  html: string,
  partials: Record<string, string>,
  slots: Readonly<Record<string, ThemeSlotDescriptor>> = DEFAULT_THEME_SLOTS
): string {
  return substituteMarkers(html, (marker) => {
    if (marker.type !== "partial" || marker.id === undefined) return undefined;
    const descriptor = slots[marker.id];
    if (descriptor === undefined) return undefined;
    return resolveSlotMarker(descriptor, partials, marker.config);
  });
}

/**
 * Stamp the theme's declared `defaultMode` onto the page's `<html>` element as `data-theme`, which is
 * the selector `tokensToRootCss` emits the `tokens.light.json` override block under. Without this the
 * light token set was authored, loaded, and emitted into the page — but unreachable, because nothing
 * ever set the attribute its block keys off.
 *
 * No-ops when the manifest declares no `defaultMode`, and leaves an `<html>` that already carries a
 * `data-theme` alone, so a theme hand-authoring its own value keeps it. A theme wanting the mode to be
 * user-switchable ships its own toggle script against `document.documentElement.dataset.theme`; this
 * only establishes the server-rendered starting value.
 */
function injectColorMode(html: string, defaultMode: string | undefined): string {
  if (defaultMode === undefined) return html;
  return html.replace(/<html(?![^>]*\sdata-theme=)([^>]*)>/i, `<html$1 data-theme="${escapeHtml(defaultMode)}">`);
}

/**
 * Render one page of a `static`-tier theme for the live site. Returns `null` if the theme has no
 * page under that id (caller degrades to `fallbackBody()`, same REQ-10 contract every other tier
 * already follows for an unresolved route).
 *
 * `htmlOverride` (post-template-picker feature, 2026-08-10): when supplied, used as the page source
 * INSTEAD of `theme.pages[pageId]` — the route layer's post-template render path already read the
 * template off `theme.pages`, substituted the real post id via {@link injectPostEmbedId}, and
 * resolved+rendered its `data-embed-type="post"` slot (I/O this file must stay free of, see the file
 * header), so by the time it calls this the embed is already real HTML; this function still applies
 * every OTHER static-tier treatment (token injection, asset-path rewrite, slot resolution, link
 * rewrite) uniformly on top, so a post-template page gets exactly the same treatment any other static
 * page does, not a parallel/divergent code path.
 *
 * `menus` (direct menu-embed wiring, superseding the earlier `header`/`footer` location scheme):
 * pre-resolved items keyed by real menu id (`navigation`'s `resolveMenuDoc`, fetched per id found by
 * {@link scanMenuEmbedIds}, run by the route layer — this file stays I/O-free, same split
 * `pages.ts`'s own resolver functions document). Each key is independently optional: a menu id with
 * no entry in this map (or a request for a non-static-tier theme, which never calls this with
 * `menus` at all) simply leaves that marker's theme-authored fallback content untouched, see
 * {@link injectMenuEmbeds}.
 */
export function renderStaticPage(
  required: {
    theme: DiscoveredTheme;
    pageId: string;
    htmlOverride?: string;
    menus?: Readonly<Record<string, readonly StaticMenuItem[]>>;
  },
  _optional: Record<string, never> = {}
): string | null {
  const { theme, pageId, htmlOverride, menus } = required;
  const source = htmlOverride ?? theme.pages[pageId];
  if (source === undefined) return null;

  let html = source.replace(
    '<link rel="stylesheet" href="../css/styles.css" />',
    () =>
      `<style>\n${tokensToRootCss(theme.tokens, theme.tokensLight)}\n</style>\n<link rel="stylesheet" href="../css/styles.css" />`
  );
  html = rewriteAssetPaths(html, theme.manifest.id);
  html = injectColorMode(html, theme.manifest.defaultMode);
  html = resolveSlots(html, theme.partials, theme.manifest.slots ?? DEFAULT_THEME_SLOTS);
  html = injectMenuEmbeds(html, menus ?? {});
  html = rewritePageLinks(html);
  return html;
}

/**
 * The minimal host document a partial renders inside when previewed standalone. Carries the exact
 * literal `<link rel="stylesheet" href="../css/styles.css" />` {@link renderStaticPage}'s own
 * token-injection step matches against (see its call to {@link tokensToRootCss} above), so a partial
 * preview picks up the theme's design tokens and stylesheet through the SAME code path a real page
 * uses — no second "inject styles into a fragment" mechanism to keep in sync with the first.
 */
function wrapPartialInHostDocument(partialHtml: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Partial preview</title>
<link rel="stylesheet" href="../css/styles.css" />
</head>
<body>
${partialHtml}
</body>
</html>`;
}

/**
 * Render a static theme's PARTIAL (`nav`, `footer`, `sidebar`, any slot's root file) standalone,
 * styled with the theme's own tokens and stylesheet — for the Explore screen's preview, which used to
 * refuse partials outright ("Partials have no standalone preview") on the theory that a fragment out
 * of page context is meaningless. It isn't: a partial IS complete, styled markup the moment its CSS
 * loads, and wrapping it in {@link wrapPartialInHostDocument} and handing that to
 * {@link renderStaticPage} as `htmlOverride` gets it every treatment a real page gets — token
 * injection, asset-path rewrite, its own slot/menu markers (if it happens to carry any), internal
 * link rewrite — through the one pipeline rather than a parallel partial-only one.
 *
 * `pageId` passed to `renderStaticPage` is irrelevant here (it only reads `theme.pages[pageId]` as a
 * fallback when `htmlOverride` is absent, and this always supplies one), so the partial id doubles
 * for it rather than inventing a placeholder.
 *
 * Returns `null` if the theme has no partial under that id — same "unknown id, not found" contract
 * {@link renderStaticPage} already uses for an unknown page id.
 */
export function renderStaticPartial(
  required: { theme: DiscoveredTheme; partialId: string },
  _optional: Record<string, never> = {}
): string | null {
  const { theme, partialId } = required;
  const partial = theme.partials[partialId];
  if (partial === undefined) return null;
  return renderStaticPage({ theme, pageId: partialId, htmlOverride: wrapPartialInHostDocument(partial) });
}

/**
 * Outcome of {@link resolvePostTemplate} or {@link resolvePageTemplate}: either a usable template, or
 * the diagnostic page. Name kept singular ("Post") for historical/import-compatibility reasons — this
 * type is shared, kind-agnostic shape, not Post-specific; renaming it is a pure rename with no
 * behavior change and was left out of this task's scope.
 */
export type PostTemplateResolution =
  | { kind: "template"; pageId: string; html: string }
  | { kind: "diagnostic" };

/**
 * Decide which of a static theme's template pages a Post or Page renders through — the shared
 * tri-state engine behind both {@link resolvePostTemplate} (`postTemplate`/`"post"` slot) and
 * {@link resolvePageTemplate} (`pageTemplate`/`"content"` slot, Task 4, 2026-08-11). Pure — the
 * caller owns the embed-resolution I/O that follows.
 *
 * `templateChoice` is a **tri-state**, and the difference between two of its values is the whole
 * point of this function (regression, 2026-08-09: 15 of 19 published posts served the diagnostic
 * page at HTTP 200 because the two were conflated):
 *
 * - `null`/`undefined` — *never chosen*. Migration `0028` added `template_choice` as an additive
 *   nullable column with no backfill, so every pre-feature row reads `null`, as does any row
 *   written by a path that doesn't know this field exists (seed script, agent tool, direct API or
 *   DB insert). That is the absence of a decision, not a decision, so it falls back to the theme's
 *   first-listed template — the same value the admin editor's picker already defaults an unset row
 *   to on load, which keeps what an author sees selected and what the public site renders in
 *   agreement. Making the *column default* the *safe* behavior is deliberate: it is what stops this
 *   bug reappearing on the next row created outside the editor.
 *
 *   For a `kind: "page"` row specifically, this fallback arm is never reached in practice —
 *   `isEligibleForPostTemplateBranch`'s Page rule (`pages.ts`) refuses to route a Page into this
 *   resolution at all unless `templateChoice` is already non-`null`/`undefined`. It stays here
 *   rather than being special-cased away because the tri-state is a property of the CHOICE, not of
 *   which kind of row is asking — a caller that ever legitimately wants "never chosen -> theme's
 *   first template" for a Page (none does today) gets correct behavior for free, and duplicating
 *   this function per kind (rejected — see `resolvePageTemplate`'s own doc) would only recreate the
 *   exact regression class this function exists to prevent.
 * - `""` — *explicitly opted out*, the admin picker's "No template chosen" option. A deliberate
 *   author action, and the one value no naive insert produces. Keeps showing the diagnostic page,
 *   which is the designed product behavior ("not a silent fallback to generic rendering"). It is
 *   the ONLY value that reaches the diagnostic page without the theme first getting a say.
 * - `"blog-post.html"` — an explicit choice. Rendered as-is when the ACTIVE theme can honor it,
 *   and otherwise treated exactly like the never-chosen case, for the reason below.
 *
 * A stored choice is **theme-relative but not theme-scoped**: it names a file in whatever theme was
 * active when an author picked it, and nothing on the row records which theme that was. Switching
 * the site's active theme therefore strands every explicit choice at once. Reading a stranded
 * choice as an opt-out would put every one of those rows back on the HTTP-200 diagnostic page —
 * the same outage as the `null` regression, reached by a routine admin action instead of a
 * migration, and unreachable by any backfill because the stored value is a real filename rather
 * than `null`. "This theme has no such template" is the absence of a decision *for this theme*, not
 * a decision, so it falls back. Only `""` is theme-independent enough to mean opt-out.
 *
 * A page that exists but ships no slot of `slotMarkerType` counts as "cannot honor" for the same
 * reason and falls back too; the diagnostic page is reached only when the theme's own first
 * template is also unusable, since rendering a slotless template would silently drop the row's body.
 *
 * `theme.pages` is keyed by filename WITHOUT `.html` (`loadTheme`'s convention) while
 * `templateChoice`/`templateCandidates` entries carry it; the `.replace` below is the one place
 * that naming mismatch is bridged.
 *
 * @complexity O(n) in the template's HTML length for the slot check, over at most two candidates;
 *   O(1) lookups otherwise.
 */
function resolveTemplateChoice(required: {
  theme: DiscoveredTheme;
  templateChoice: string | null | undefined;
  templateCandidates: readonly string[] | undefined;
  slotMarkerType: string;
}): PostTemplateResolution {
  const { theme, templateChoice, templateCandidates, slotMarkerType } = required;
  if (templateChoice === "") return { kind: "diagnostic" };

  const resolveAgainstTheme = (choice: string | undefined): PostTemplateResolution | undefined => {
    if (choice === undefined || choice === "") return undefined;
    const pageId = choice.replace(/\.html$/, "");
    const html = theme.pages[pageId];
    // "Ships a slot" is asked of the shared parser, never of a substring match. The literal
    // `data-embed-id="{{post}}"` this used to test for stopped existing the moment the themes moved
    // onto `data-embed-config` (2026-08-10), and because the miss is indistinguishable from "this
    // theme has no such template", EVERY post silently fell through to the diagnostic page at HTTP
    // 200 — the exact 2026-08-09 regression this function's own doc was written about, re-entered
    // through a different door. Asking `markersOfType` also means a template carrying a hardcoded
    // real post id (or an already-spliced Page body) counts as having a slot, which it does.
    if (html === undefined || markersOfType(html, slotMarkerType).length === 0) return undefined;
    return { kind: "template", pageId, html };
  };

  return (
    resolveAgainstTheme(templateChoice ?? undefined) ??
    resolveAgainstTheme(templateCandidates?.[0]) ?? { kind: "diagnostic" }
  );
}

/** {@link resolveTemplateChoice} specialized to Posts: `theme.manifest.postTemplate`, `"post"` slot. */
export function resolvePostTemplate(
  required: { theme: DiscoveredTheme; templateChoice: string | null | undefined },
  _optional: Record<string, never> = {}
): PostTemplateResolution {
  return resolveTemplateChoice({
    theme: required.theme,
    templateChoice: required.templateChoice,
    templateCandidates: required.theme.manifest.postTemplate,
    slotMarkerType: "post",
  });
}

/**
 * {@link resolveTemplateChoice} specialized to Pages (Task 4, 2026-08-11): `theme.manifest.
 * pageTemplate`, `"content"` slot (`injectPageContent`'s marker, Task 3) instead of `"post"`.
 *
 * A thin wrapper rather than a copy-pasted twin of {@link resolvePostTemplate} on purpose: the two
 * differ only in which manifest array and which marker type they check, and the 2026-08-09
 * null-vs-""-conflation regression `resolvePostTemplate`'s own doc describes is exactly the kind of
 * bug a second, independently-maintained copy of this logic would be positioned to reintroduce.
 * `pages.ts`'s `isEligibleForPostTemplateBranch` is the layer that actually withholds the
 * null/undefined fallback arm from Pages — see that function's doc — not this one; this function
 * stays a faithful, kind-agnostic tri-state resolver so it never has to know why a caller withheld
 * a value from it.
 */
export function resolvePageTemplate(
  required: { theme: DiscoveredTheme; templateChoice: string | null | undefined },
  _optional: Record<string, never> = {}
): PostTemplateResolution {
  return resolveTemplateChoice({
    theme: required.theme,
    templateChoice: required.templateChoice,
    templateCandidates: required.theme.manifest.pageTemplate,
    slotMarkerType: "content",
  });
}

/**
 * Gates whether a `posts`-table record should even be routed into the post-template render branch
 * (`renderPostViaTemplate` in `server/routes/site/pages.ts`) — a decision distinct from, and prior
 * to, {@link resolvePostTemplate}'s own tri-state resolution of WHICH template to use once inside
 * that branch.
 *
 * The two `kind`s need different answers for the same `templateChoice: null`/`undefined` input:
 *
 * - `kind: "post"` — eligible whenever the record is `doc`-format, `templateChoice` included.
 *   `resolvePostTemplate` treats `null`/`undefined` as "never chosen" and deliberately falls back to
 *   the theme's first-listed template (see that function's own doc): migration `0028` added
 *   `template_choice` as an additive nullable column with no backfill, so every pre-feature and
 *   externally-inserted Post reads `null`, and "no opinion yet" must render *something* sensible
 *   rather than a diagnostic page.
 * - `kind: "page"` — eligible ONLY when `templateChoice` is not `null`/`undefined`, i.e. an admin has
 *   actually set it (a real filename, or `""` for explicit opt-out — both still handled by
 *   `resolvePostTemplate` unchanged). The "never chosen → theme's first template" fallback that is
 *   safe for Posts is wrong for Pages: no admin surface has ever set `template_choice` on a `kind:
 *   "page"` row (as of 2026-08-11, `PageEditor.tsx` has no template control), so every existing Page
 *   reads `null` not because an author had no opinion but because the field does not exist for Pages
 *   yet. Falling back would apply a Post-shaped template to a Page that never asked for one — the
 *   live bug this function fixes: `terms-of-service`, `privacy-policy`, `contact`, `team`, `faq` and
 *   two `untitled` Pages rendered under the theme's first `postTemplate` entry (observed as `<title>
 *   Blog post — Basic</title>` on Terms of Service) purely because `bodyFormat === "doc"` was the
 *   only condition checked, with no `kind` check at all.
 *
 * `our-story` (`kind: "page"`, `bodyFormat: "doc"`, `templateChoice: "page-shell.html"`, set by hand
 * via SQL as the proof-of-concept for the whole page-template model) keeps rendering through this
 * branch under the rule above, because its choice IS explicit.
 *
 * Deliberately narrower than "any Page with an explicit choice": `bodyFormat` is still required to
 * be `"doc"` for both kinds. An `"html"`-format Page (what `PageEditor.tsx` actually produces) has
 * its own body already in hand and its own embed-resolution path (`resolveHtmlEmbedsForRender` in
 * `pages.ts`) — routing it through `renderPostViaTemplate` would run `injectPostEmbedId` and the
 * `{"type":"post"}` marker machinery against a record that isn't a Post lookup target, discarding
 * the Page's real body. `renderPageViaTemplate`/{@link isEligibleForPageTemplateBranch} (Task 4,
 * 2026-08-11) is the real, now-built counterpart for that case — a deliberately SEPARATE function
 * rather than a widened branch here, since the two route to different render functions
 * (`renderPostViaTemplate` vs `renderPageViaTemplate`) using different resolvers (`resolvePostTemplate`
 * vs `resolvePageTemplate`) and different injection primitives (`injectPostEmbedId` vs
 * `injectPageContent`) — merging them would need this function's return type to say WHICH branch to
 * call, turning a boolean gate into a dispatch table for no real gain.
 *
 * @complexity O(1) — field comparisons only, no I/O or iteration.
 */
export function isEligibleForPostTemplateBranch(
  required: {
    theme: DiscoveredTheme;
    post: { kind: "post" | "page"; bodyFormat: "doc" | "html"; templateChoice?: string | null };
  },
  _optional: Record<string, never> = {}
): boolean {
  const { theme, post } = required;
  if (theme.manifest.tier !== "static") return false;
  if ((theme.manifest.postTemplate?.length ?? 0) === 0) return false;
  if (post.bodyFormat !== "doc") return false;
  if (post.kind === "post") return true;
  return post.templateChoice !== null && post.templateChoice !== undefined;
}

/**
 * {@link isEligibleForPostTemplateBranch}'s counterpart for the Pages template picker (Task 4,
 * 2026-08-11): gates whether a `kind: "page"`, `bodyFormat: "html"` record should be routed into
 * `renderPageViaTemplate` (`pages.ts`) instead of the generic `resolveHtmlEmbedsForRender` path.
 *
 * Only `kind: "page"` + `bodyFormat: "html"` + a NON-EMPTY, EXPLICIT `templateChoice` (a real
 * filename) qualifies — no "never chosen, fall back to the theme's first template" arm at all,
 * unlike Posts. This is the same explicit-choice-only rule `isEligibleForPostTemplateBranch` applies
 * to Pages, one step stricter here because there is no legacy-migration excuse to relax it: every
 * `bodyFormat: "html"` Page was created (or converted, see `development/scripts/
 * convert-legacy-doc-pages-to-html.ts`) after the Pages picker existed as a concept, so `null`
 * `templateChoice` on one of these rows always means "this Page's own body is the whole page" — the
 * existing, working, default behavior — never "an admin surface that doesn't exist yet couldn't have
 * set it".
 *
 * **`""` is treated identically to `null`/`undefined` here — a deliberate DIVERGENCE from Posts'
 * tri-state, not an oversight.** For a Post, `""` (the admin picker's explicit "No template chosen")
 * routes to a loud diagnostic page rather than a silent fallback, because the owner's own words were
 * "not a silent fallback to generic rendering" — a Post's generic single-post layout is a real,
 * separate rendering mode an author might not have intended to land on by skipping the picker. A
 * Page has no such distinction: "no template" IS a Page's normal, fully-functional, default
 * behavior (render its own authored body) — there is no separate "generic Page rendering" an
 * operator could be surprised to land on. Routing an explicit "" to the diagnostic page for a Page
 * would therefore let a dropdown selection break an otherwise-working page for no benefit, so both
 * "never chosen" and "explicitly chose nothing" collapse to the same safe outcome: render the Page's
 * own body directly, exactly as every `"html"`-format Page has always rendered before this feature
 * existed.
 *
 * @complexity O(1) — field comparisons only, no I/O or iteration.
 */
export function isEligibleForPageTemplateBranch(
  required: {
    theme: DiscoveredTheme;
    post: { kind: "post" | "page"; bodyFormat: "doc" | "html"; templateChoice?: string | null };
  },
  _optional: Record<string, never> = {}
): boolean {
  const { theme, post } = required;
  if (theme.manifest.tier !== "static") return false;
  if ((theme.manifest.pageTemplate?.length ?? 0) === 0) return false;
  if (post.kind !== "page") return false;
  if (post.bodyFormat !== "html") return false;
  return post.templateChoice !== null && post.templateChoice !== undefined && post.templateChoice !== "";
}
