import {
  markersOfType,
  MENU_MARKER_TYPE,
  PARTIAL_MARKER_TYPE,
  substituteMarkers,
  withAddedId,
  withInnerContent,
} from "#src/core/embeds/marker";
import { findUnrewrittenAssetPaths, rewriteAssetPaths, tokenStylesheetSentinel } from "./static-asset-contract.js";
import { DEFAULT_THEME_SLOTS, type DiscoveredTheme, type ThemeSlotDescriptor, type ThemeTokens } from "./theme.js";

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
 * `tokenStylesheetSentinel` (formerly a bare `TOKEN_STYLESHEET_SENTINEL` import), `rewriteAssetPaths`,
 * and `findUnrewrittenAssetPaths` live in `static-asset-contract.ts` (2026-08-12, ADR-020 §5) so
 * `build-conformance.ts`'s install-time gate can import the exact same sentinel/rewrite logic this file
 * uses at request time, without creating an import cycle back through `theme.ts` (see that file's own
 * header for why). All three now take the theme's `apiVersion` to pick between the v1 (`css/styles.css`,
 * `js/`) and v2 (`css/theme.css`, `scripts/`) asset-path shape — added for the Milestone 3 theme
 * migration work; every call site already threading `theme.manifest.apiVersion` through (undefined for
 * every theme on disk today) keeps this file's own behavior byte-for-byte unchanged from before.
 */

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
 * Fills the current entity's real id into every `{"type":"content"}` marker in `html` that carries NO
 * id — the unified-marker (2026-08-11) replacement for BOTH `injectPostEmbedId`'s `{{post}}` literal
 * substitution AND `injectPageContent`'s direct body-HTML splice.
 *
 * A theme-authored, id-less `{"type":"content"}` marker means "the entity the route already
 * resolved" (the unified-content-marker design doc's own wording) — the route layer (`pages.ts`)
 * knows that entity's real id by the time it calls this, so it fills it in here, BEFORE the embed
 * scanner/resolver ever sees the html. Everything downstream (the recursive `"html"`-format
 * pre-splice pass, `resolveHtmlPageEmbeds`'s registered `"content"` resolver, a later re-scan) then
 * sees an ORDINARY id-carrying marker — the same one an author gets by typing a real id directly —
 * with no "no id means current entity" special case anywhere else in the pipeline.
 *
 * A marker that ALREADY carries an id (an author's explicit reference to some OTHER entity) is left
 * completely untouched — this function only ever fills a gap, never overwrites an explicit choice.
 * The old `blog-post.html`/`page-shell.html` split (one marker type per kind) is gone: BOTH doc-format
 * Posts and Pages, and html-format Pages, use this exact same function now, since the row's
 * `bodyFormat` — not the marker's type — is what decides how the referenced content actually renders
 * (`resolveContentTypeEmbeds`, `resolver-service.ts`, and the recursive pre-splice in `pages.ts`).
 *
 * Marker-based (via {@link withAddedId}), not a literal string replace like the retired
 * `injectPostEmbedId` — that function could rely on `{{post}}` being authored as a specific literal
 * JSON value; here there is no literal token to search for (the marker's ABSENCE of an `id` key is
 * the whole signal), so filling the gap correctly for a marker carrying extra config keys (e.g. a
 * future `{"type":"content","variant":"..."}"`) needs the real parsed marker, not a substring match.
 *
 * @complexity O(n) over `html`'s length — one `substituteMarkers` scan-and-splice pass, the same cost
 * shape every other marker-substitution call in this codebase already pays.
 */
export function injectCurrentEntityContentId(html: string, entityId: string): string {
  return substituteMarkers(html, (marker) => {
    if (marker.type !== "content" || marker.id !== undefined) return undefined;
    return withAddedId(marker, entityId);
  });
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
 * Substitutes a page-template's title placeholder with the rendered row's own real title —
 * {@link injectCurrentEntityContentId}'s sibling for the `<title>` tag, a string substitution rather
 * than a marker rewrite (same convention that function documents for filling in a marker's `id`).
 *
 * Matches the WHOLE `<title>...</title>` element the placeholder sits in, not a bare token search —
 * learned the hard way while authoring `page-shell.html`: that file's own explanatory HTML comment
 * mentions the placeholder as prose, and a bare-token `.replace()` matched THAT occurrence (the first
 * one in the file) instead of the real one in `<head>`, silently leaving the `<title>` tag unfilled.
 * Scoping the match to the full element makes an incidental mention elsewhere in the template (a
 * comment, authored copy) structurally unable to collide with the real slot.
 *
 * Runs for every kind now (2026-08-11 unification; previously Post-rendered pages accepted a fixed
 * title as a disclosed limitation and only Pages got this substitution) — `blog-post.html`'s `<title>`
 * remains one fixed string with no placeholder, so calling this on a Post rendered through IT is
 * still a no-op, unchanged; a Post rendered through `page-shell.html` now correctly gets its own
 * title instead of a generic one, closing that disclosed gap for free.
 *
 * A template file authored without this exact `<title>...</title>` shape is simply unaffected —
 * `replace` is a no-op when the pattern isn't present.
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
    if (marker.type !== MENU_MARKER_TYPE || marker.id === undefined) return undefined;
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
    for (const marker of markersOfType(html, MENU_MARKER_TYPE)) {
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
    if (marker.type !== PARTIAL_MARKER_TYPE || marker.id === undefined) return undefined;
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

  const apiVersion = theme.manifest.apiVersion;
  const sentinel = tokenStylesheetSentinel(apiVersion);

  let html = source;
  if (!source.includes(sentinel)) {
    console.warn(
      `[theme] static page '${theme.manifest.id}/${pageId}' is missing the exact token stylesheet sentinel; design tokens were not injected`
    );
  } else {
    html = source.replace(
      sentinel,
      () => `<style>\n${tokensToRootCss(theme.tokens, theme.tokensLight)}\n</style>\n${sentinel}`
    );
  }
  html = rewriteAssetPaths(html, theme.manifest.id, apiVersion);
  const unrewrittenAssetPaths = findUnrewrittenAssetPaths(html, apiVersion);
  if (unrewrittenAssetPaths.length > 0) {
    const assetFolders = apiVersion === 2 ? "../css//../scripts/" : "../css//../js/";
    console.warn(
      `[theme] static page '${theme.manifest.id}/${pageId}' has ${unrewrittenAssetPaths.length} unrewritten ${assetFolders} asset reference(s) that will 404 in the browser: ${unrewrittenAssetPaths.join(", ")}`
    );
  }
  html = injectColorMode(html, theme.manifest.defaultMode);
  html = resolveSlots(html, theme.partials, theme.manifest.slots ?? DEFAULT_THEME_SLOTS);
  html = injectMenuEmbeds(html, menus ?? {});
  html = rewritePageLinks(html);
  return html;
}

/**
 * The minimal host document a partial renders inside when previewed standalone. Carries whichever
 * sentinel {@link tokenStylesheetSentinel} picks for `apiVersion` — the exact one
 * {@link renderStaticPage}'s own token-injection step matches against (see its call to
 * {@link tokensToRootCss} above) — so a partial preview picks up the theme's design tokens and
 * stylesheet through the SAME code path a real page uses, for either schema version, no second
 * "inject styles into a fragment" mechanism to keep in sync with the first.
 */
function wrapPartialInHostDocument(partialHtml: string, apiVersion?: 2): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Partial preview</title>
${tokenStylesheetSentinel(apiVersion)}
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
  return renderStaticPage({
    theme,
    pageId: partialId,
    htmlOverride: wrapPartialInHostDocument(partial, theme.manifest.apiVersion),
  });
}

/**
 * Outcome of {@link resolveTemplate}: either a usable template, or the diagnostic page. Name kept
 * singular ("Post") for historical/import-compatibility reasons — the type predates the 2026-08-11
 * unification and was already documented as shared/kind-agnostic before this change; renaming it
 * remains a pure rename with no behavior change and stays out of this pass's scope too.
 */
export type PostTemplateResolution =
  | { kind: "template"; pageId: string; html: string }
  | { kind: "diagnostic" };

/**
 * Decide which of a static theme's template pages a Post or Page renders through (2026-08-11
 * unification — collapses what were the separate `resolvePostTemplate`/`resolvePageTemplate`
 * specializations of this same tri-state engine into one function, now that both kinds resolve
 * against the SAME `theme.manifest.templates` array and the SAME `"content"` slot marker). Pure —
 * the caller owns the embed-resolution I/O that follows.
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
 *   `isEligibleForTemplateBranch`'s Page rule (`pages.ts`) refuses to route a Page into this
 *   resolution at all unless `templateChoice` is already non-`null`/`undefined`. It stays here
 *   rather than being special-cased away because the tri-state is a property of the CHOICE, not of
 *   which kind of row is asking — a caller that ever legitimately wants "never chosen -> theme's
 *   first template" for a Page (none does today) gets correct behavior for free, and that asymmetry
 *   living in the ELIGIBILITY gate rather than in here is exactly what let it survive this merge:
 *   this function did not have to change to preserve it, only its caller's gating did.
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
 * A page that exists but ships no `"content"` slot counts as "cannot honor" for the same reason and
 * falls back too; the diagnostic page is reached only when the theme's own first template is also
 * unusable, since rendering a slotless template would silently drop the row's body.
 *
 * `theme.pages` is keyed by filename WITHOUT `.html` (`loadTheme`'s convention) while
 * `templateChoice`/`theme.manifest.templates` entries carry it; the `.replace` below is the one
 * place that naming mismatch is bridged.
 *
 * @complexity O(n) in the template's HTML length for the slot check, over at most two candidates;
 *   O(1) lookups otherwise.
 */
export function resolveTemplate(
  required: { theme: DiscoveredTheme; templateChoice: string | null | undefined },
  _optional: Record<string, never> = {}
): PostTemplateResolution {
  const { theme, templateChoice } = required;
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
    // real id (or an already-spliced body) counts as having a slot, which it does.
    if (html === undefined || markersOfType(html, "content").length === 0) return undefined;
    return { kind: "template", pageId, html };
  };

  return (
    resolveAgainstTheme(templateChoice ?? undefined) ??
    resolveAgainstTheme(theme.manifest.templates?.[0]) ?? { kind: "diagnostic" }
  );
}

/**
 * Gates whether a `posts`-table record should even be routed into the template render branch
 * (`renderViaTemplate` in `server/routes/site/pages.ts`) — a decision distinct from, and prior to,
 * {@link resolveTemplate}'s own tri-state resolution of WHICH template to use once inside that
 * branch.
 *
 * 2026-08-11 unification: collapses what were the separate `isEligibleForPostTemplateBranch`/
 * `isEligibleForPageTemplateBranch` gates into one function, now that both route to the SAME
 * `renderViaTemplate` using the SAME `theme.manifest.templates` array. The two gates existed
 * separately only because a Post-shaped and a Page-shaped template used to be structurally different
 * artifacts (different marker type, different manifest array) that needed different eligibility
 * arrays to check against; the unified `"content"` marker and single `templates` array removed that
 * split at the source, so keeping two near-identical functions here would just be the same
 * duplicated-logic risk `resolveTemplate`'s own doc already warns about.
 *
 * The BEHAVIORAL asymmetries the two old gates encoded are preserved exactly, not merged away —
 * losing either would silently reintroduce a live bug:
 *
 * - `kind: "post"` — eligible whenever the record is `doc`-format, `templateChoice` included.
 *   {@link resolveTemplate} treats `null`/`undefined` as "never chosen" and deliberately falls back
 *   to the theme's first-listed template (see that function's own doc): migration `0028` added
 *   `template_choice` as an additive nullable column with no backfill, so every pre-feature and
 *   externally-inserted Post reads `null`, and "no opinion yet" must render *something* sensible
 *   rather than a diagnostic page. Posts are always `doc`-format (CIC-3, `PostBodyFormat`'s own
 *   doc), so `bodyFormat` needs no separate check for this arm.
 * - `kind: "page"`, `bodyFormat: "doc"` — eligible ONLY when `templateChoice` is not
 *   `null`/`undefined` (a real filename, or `""` for explicit opt-out — both still handled by
 *   `resolveTemplate` unchanged). The "never chosen → theme's first template" fallback that is safe
 *   for Posts is wrong for Pages: no admin surface set `template_choice` on a `kind: "page"` row
 *   before the Pages template picker shipped, so a Page reading `null` means "an admin surface that
 *   didn't exist yet couldn't have set it", not "no opinion". Falling back would apply a Post-shaped
 *   template to a Page that never asked for one — the live bug this asymmetry fixes: `terms-of-
 *   service`, `privacy-policy`, `contact`, `team`, `faq` rendered under the theme's first template
 *   entry (observed as `<title>Blog post — Basic</title>` on Terms of Service) purely because
 *   `bodyFormat === "doc"` was once the only condition checked, with no `kind` check at all.
 *   `our-story` (`kind: "page"`, `bodyFormat: "doc"`, `templateChoice: "page-shell.html"`, the
 *   proof-of-concept demo row) keeps rendering through this branch under this rule, because its
 *   choice IS explicit.
 * - `kind: "page"`, `bodyFormat: "html"` — same explicit-choice requirement, one step stricter:
 *   `""` is ALSO treated as ineligible here (identically to `null`/`undefined`), a deliberate
 *   DIVERGENCE from the `doc`-format Page/Post rule above, not an oversight. For a Post, `""` (the
 *   admin picker's explicit "No template chosen") routes to a loud diagnostic page rather than a
 *   silent fallback, because the owner's own words were "not a silent fallback to generic
 *   rendering" — a Post's generic single-post layout is a real, separate rendering mode an author
 *   might not have intended to land on by skipping the picker. An `"html"`-format Page has no such
 *   distinction: "no template" IS its normal, fully-functional, default behavior (render its own
 *   authored body via the generic `resolveHtmlEmbedsForRender` path) — there is no separate
 *   "generic Page rendering" an operator could be surprised to land on, so routing an explicit `""`
 *   to the diagnostic page would let a dropdown selection break an otherwise-working page for no
 *   benefit. This narrower `doc`-vs-`html` divergence predates the 2026-08-11 unification and is
 *   preserved verbatim here, not resolved — unifying it too was not asked for and would be an
 *   undisclosed behavior change for `doc`-format Pages.
 *
 * @complexity O(1) — field comparisons only, no I/O or iteration.
 */
export function isEligibleForTemplateBranch(
  required: {
    theme: DiscoveredTheme;
    post: { kind: "post" | "page"; bodyFormat: "doc" | "html"; templateChoice?: string | null };
  },
  _optional: Record<string, never> = {}
): boolean {
  const { theme, post } = required;
  if (theme.manifest.tier !== "static") return false;
  if ((theme.manifest.templates?.length ?? 0) === 0) return false;

  if (post.kind === "post") return true;

  // kind === "page" — no "never chosen" fallback arm, ever (see this function's own doc for why).
  if (post.bodyFormat === "html") {
    return post.templateChoice !== null && post.templateChoice !== undefined && post.templateChoice !== "";
  }
  return post.bodyFormat === "doc" && post.templateChoice !== null && post.templateChoice !== undefined;
}
