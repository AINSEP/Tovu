import { safeHref } from "./render-contract.js";
import { COLLECTION_MARKER_TYPE, FEATURED_IMAGE_MARKER_TYPE, markersOfType, MENU_MARKER_TYPE, PARTIAL_MARKER_TYPE, POST_PREVIEWS_MARKER_TYPE, substituteMarkers, withAddedId, withElementKeptIfAttributed, withInnerContent, withInnerContentFinal, type EmbedMarker } from "@jini-ai/cms/widgets/markers";
import { extractListingCardTemplate, injectListingScript, listingKeyOfAttributes, parseListingBatchSize, renderListingMore, wrapListingItems } from "@jini-ai/cms/listing";
import { injectMenuDropdownScript, renderMenuToggle } from "@jini-ai/cms/navigation/dropdown";
import { postAuthorForDisplay } from "../../contracts/core/post-author.js";
import { renderHtmlMenu } from "#src/features/navigation/html-render";
import { escapeHtml } from "#src/platform/html/escape";
import { withEntryListStyleOnce } from "./entry-list-render.js";
import { findUnrewrittenAssetPaths, rewriteAssetPaths, tokenStylesheetSentinel } from "./static-asset-contract.js";
import type { DiscoveredTheme, ThemeSlotDescriptor, ThemeTokens } from "./theme.js";
import { DEFAULT_THEME_SLOTS } from "./render-contract.js";
import { themeTokenAliasDeclarations } from "./token-aliases.js";

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

/** Theme aliases ({@link themeTokenAliasDeclarations}) ride on the dark `:root` rule so they
 *  resolve against whichever mode's tokens are active — see `token-aliases.ts`. */
function tokensToRootCss(tokens: ThemeTokens, tokensLight: ThemeTokens): string {
  const darkEntries = [...Object.entries(tokens), ...themeTokenAliasDeclarations({ tokens, tokensLight })];
  const darkLines = darkEntries.map(([k, v]) => `  ${k}: ${v};`);
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

/** `true` for a marker carrying a NON-EMPTY string `slug` — an explicit reference to another entity.
 * An empty `slug` names nothing (every resolver stage treats `""` as absent, `html-embeds.ts`'s
 * `normalizeEmbedSlug`), so it must not block filling in the current entity's id. */
function hasAuthoredSlug(marker: EmbedMarker): boolean {
  const slug = marker.config.slug;
  return typeof slug === "string" && slug.length > 0;
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
 * The same rule applies to a marker carrying a `slug` instead of an `id` (S3, 2026-09-23 widget-attrs
 * plan): `{"type":"content","slug":"some-other-entity"}` is just as much an explicit reference to
 * some OTHER entity as an id-carrying marker is — filling in the CURRENT entity's id here would win
 * over that authored `slug` (`resolveContentTypeEmbeds`'s id-authoritative-when-present order) and
 * silently redirect the marker to the wrong row. Checking `marker.id === undefined` alone would miss
 * this — a slug-only marker also has no `id` yet, but for a completely different reason than "this
 * means the current entity".
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
  return substituteMarkers({ html: html, resolve: (marker) => {
    if (marker.type !== "content" || marker.id !== undefined || hasAuthoredSlug(marker)) return undefined;
    return withAddedId({ marker: marker, id: entityId });
  } });
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
 * title as a disclosed limitation and only Pages got this substitution) — `basic`'s own `posts-*.html`
 * templates (`blog-post.html` before the 2026-09-03 posts-* / pages-* rename) keep one fixed `<title>`
 * string with no placeholder, so calling this on a Post rendered through one is still a no-op,
 * unchanged; a Post rendered through `pages-default.html` (`page-shell.html` before that same rename)
 * now correctly gets its own title instead of a generic one, closing that disclosed gap for free.
 *
 * A template file authored without this exact `<title>...</title>` shape is simply unaffected —
 * `replace` is a no-op when the pattern isn't present.
 *
 * @complexity O(n) over `html`'s length — one string search-and-replace.
 */
export function injectPageTitle(html: string, title: string): string {
  return html.replace(/<title>\{\{title\}\}<\/title>/, () => `<title>${escapeHtml(title)}</title>`);
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
  /** `NavItemAttrs` passthrough — all five presentational fields (`cssClass`/`description`/`icon`
   *  render as before; `rel`/`openInNewTab` added alongside them, same escaped/no-allowlist posture). */
  readonly attrs?:
    | {
        readonly cssClass?: string | undefined;
        readonly description?: string | undefined;
        readonly icon?: string | undefined;
        readonly rel?: string | undefined;
        readonly openInNewTab?: boolean | undefined;
      }
    | undefined;
  readonly children: readonly StaticMenuItem[];
}

/** An HTML-mode menu (owner 2026-10-08): the author's own stored markup, placed as-is at the marker.
 *  Trusted, admin/owner-only markup like HTML-mode forms; the save path (Jini `menu-html.ts`) balances it. */
export interface StaticHtmlMenu {
  readonly html: string;
}

/** What the route layer resolved for one menu id: its item tree, or its authored HTML. */
export type StaticMenuContent = readonly StaticMenuItem[] | StaticHtmlMenu;

export { safeHref } from "./render-contract.js";

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
  // `menuItemLinkAttrs` (not a bare aria-current) so authored `rel`/`openInNewTab` reach a FLAT nav
  // too — the tree variant and the widget-IR menu already honored them, and the admin menu editor
  // offers both, so a flat header/footer silently ignoring them was a render-path divergence.
  return items
    .filter((item) => item.available && item.href !== null)
    .map((item) => `<a href="${escapeHtml(safeHref(item.href as string))}"${menuItemLinkAttrs(item)}>${escapeHtml(item.label)}</a>`)
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
 * `{"variant":"dropdown"}` is that tree plus Jini's disclosure toggles and keyboard script
 * (`@jini-ai/cms/navigation`); see {@link renderMenuItem}.
 *
 * Emitted hooks, all of which `renderMenuLinks` drops on the floor: `is-current` (this item is the
 * page), `is-active` (this item or a descendant is — what expands the right section), `has-children`,
 * a `depth-N` class, and the item's own authored `attrs.cssClass`. `description`/`icon` render as
 * child spans so a theme can style or ignore them without the renderer knowing an icon set.
 * `attrs.rel`/`attrs.openInNewTab` render onto the `<a>` itself (`rel="…"`/`target="_blank"`) —
 * escaped, not allowlist-validated, same posture as `cssClass`/`icon` despite this file's own
 * `NavItemAttrs` doc comment describing `rel` as "validated against an allowlist": no such
 * allowlist exists anywhere in the write chokepoint (`validateAndCloneTree` clones `attrs`
 * untouched) — flagged, not fixed, here; fixing it is a Jini `menu-service.ts` change, out of this
 * pass's scope.
 *
 * Availability rule, which differs from the flat renderer's on purpose: an unavailable **leaf** is
 * omitted entirely (the flat contract — never emit a dead link), but an unavailable **branch** is
 * kept as inert text so its available children are not deleted along with it. A trashed section
 * heading should not silently take its whole subtree off the page.
 */
/** The `<li>` class list: structural hooks first, then the item's own authored `cssClass`. Raw —
 *  the caller escapes it, since authored `cssClass` is admin-controlled attribute text. */
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

/** The item's icon/label/description markup, shared by both the linkable and inert renderings of
 *  {@link menuItemBody}. `icon`/`description` render as child spans so a theme can style or ignore
 *  them without this renderer having to know an icon set. */
function menuItemInnerHtml(item: StaticMenuItem): string {
  const label = escapeHtml(item.label);
  const icon = item.attrs?.icon ? `<span class="menu-item-icon" data-icon="${escapeHtml(item.attrs.icon)}"></span>` : "";
  const description = item.attrs?.description
    ? `<span class="menu-item-desc">${escapeHtml(item.attrs.description)}</span>`
    : "";
  return `${icon}${label}${description}`;
}

/** The `<a>` tag's own attribute suffix (`aria-current`/`rel`/`target`) for a linkable item. */
function menuItemLinkAttrs(item: StaticMenuItem): string {
  const current = item.isCurrent ? ' aria-current="page"' : "";
  const rel = item.attrs?.rel ? ` rel="${escapeHtml(item.attrs.rel)}"` : "";
  const target = item.attrs?.openInNewTab ? ' target="_blank"' : "";
  return `${current}${rel}${target}`;
}

/**
 * The item's own label markup — an `<a>` when it resolves, an inert `<span>` when it does not.
 * `icon`/`description` render as child spans so a theme can style or ignore them without this
 * renderer having to know an icon set.
 */
function menuItemBody(item: StaticMenuItem, linkable: boolean): string {
  const inner = menuItemInnerHtml(item);
  if (!linkable) return `<span class="menu-item-label">${inner}</span>`;
  return `<a href="${escapeHtml(safeHref(item.href as string))}"${menuItemLinkAttrs(item)}>${inner}</a>`;
}

/** Set for `{"variant":"dropdown"}` menus: hands out the child-`<ul>` ids the toggles point at. */
type MenuDropdown = { nextId(): string };

/**
 * One `<li>`, or `""` when the item is neither linkable nor a branch worth keeping for its children.
 * With `dropdown`, a branch gets a Jini toggle as a direct child of its `<li>` whose `aria-controls`
 * is the child `<ul>`'s id: after the `<a>` (split button), or in place of the label when the parent
 * has no real link (unresolved, or exactly `"#"`). Leaves render exactly as the tree variant.
 */
function renderMenuItem(item: StaticMenuItem, depth: number, dropdown?: MenuDropdown): string {
  const linkable = item.available && item.href !== null;
  const lis = item.children.length > 0 ? renderMenuItems(item.children, depth + 1, dropdown) : "";
  if (!linkable && lis === "") return "";
  const classes = escapeHtml(menuItemClasses(item, depth));
  if (dropdown === undefined || lis === "") {
    const children = lis === "" ? "" : `<ul class="menu-list depth-${depth + 1}">${lis}</ul>`;
    return `<li class="${classes}">${menuItemBody(item, linkable)}${children}</li>`;
  }
  const controlsId = dropdown.nextId();
  const body = linkable && item.href !== "#"
    ? menuItemBody(item, true) + renderMenuToggle({ controlsId, label: item.label })
    : renderMenuToggle({ controlsId, label: item.label }, { asLabel: true });
  return `<li class="${classes}">${body}<ul class="menu-list depth-${depth + 1}" id="${escapeHtml(controlsId)}">${lis}</ul></li>`;
}

function renderMenuItems(items: readonly StaticMenuItem[], depth: number, dropdown?: MenuDropdown): string {
  return items
    .map((item) => renderMenuItem(item, depth, dropdown))
    .filter((li) => li !== "")
    .join("");
}

function renderMenuTree(items: readonly StaticMenuItem[], dropdown?: MenuDropdown): string {
  const rendered = renderMenuItems(items, 0, dropdown);
  if (rendered === "") return "";
  return `<ul class="menu-list depth-0"${dropdown === undefined ? "" : " data-jini-dropdown"}>${rendered}</ul>`;
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
 * Marker location and parsing are `Jini/packages/cms/src/widgets/markers/marker.ts`'s job; this function only decides what goes
 * inside. That split is the point of the 2026-08-10 unification — four scanners with four regexes
 * became one.
 */
function injectMenuEmbeds(
  html: string,
  menus: Readonly<Record<string, StaticMenuContent>>
): string {
  // One counter per page, so two dropdown markers never mint the same submenu id.
  let submenuCount = 0;
  const dropdown: MenuDropdown = { nextId: () => `jini-submenu-${++submenuCount}` };
  return substituteMarkers({ html: html, resolve: (marker) => {
    if (marker.type !== MENU_MARKER_TYPE || marker.id === undefined) return undefined;
    const items = menus[marker.id];
    if (items === undefined) return undefined;
    if (!Array.isArray(items)) return injectAuthoredMenuHtml(marker, (items as StaticHtmlMenu).html);
    if (marker.config.mode === "html") {
      const plain = renderHtmlMenu({ id: marker.id, items, sanitizeHref: safeHref });
      // Match forms: a bare marker disappears; explicitly authored wrapper attributes survive.
      return plain === "" ? undefined : withElementKeptIfAttributed({ marker: marker, inner: plain });
    }
    const variant = marker.config.variant;
    const inner = variant === "tree" ? renderMenuTree(items)
      : variant === "dropdown" ? renderMenuTree(items, dropdown)
      : renderMenuLinks(items);
    return inner === "" ? undefined : withInnerContent({ marker: marker, inner: inner });
  } });
}

/**
 * An HTML-mode menu's markup at its marker. The theme's own wrapper (`<nav class="main-nav">`) keeps
 * its tag and attributes so theme layout still applies around the author's markup; a bare "Copy HTML
 * embed" marker disappears, the same rule the generated `mode: "html"` menu above follows. Empty
 * markup leaves the authored fallback, like an empty item tree.
 */
function injectAuthoredMenuHtml(marker: EmbedMarker, html: string): string | undefined {
  if (html.trim() === "") return undefined;
  return marker.config.mode === "html"
    ? withElementKeptIfAttributed({ marker: marker, inner: html })
    : withInnerContent({ marker: marker, inner: html });
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
    for (const marker of markersOfType({ html: html, type: MENU_MARKER_TYPE })) {
      if (marker.id !== undefined) ids.add(marker.id);
    }
  }
  return Array.from(ids);
}

/**
 * Post-previews marker (2026-09-03) — a theme/page marker that renders a bounded list of published
 * post previews wherever `{"type":"post-previews"}` appears, so any authored Page can host a post
 * listing (the immediate consumer is a themed `/blog`-style marketing page, but the mechanism is not
 * special-cased to one slug or theme). Follows the SAME "route resolves the I/O, this file only
 * decides how it renders" split {@link injectMenuEmbeds}/{@link scanMenuEmbedIds} already establish
 * for `{"type":"menu"}`.
 */

/** A `{"type":"post-previews"}` marker with no `limit` keeps its legacy 6 (no silent change); a
 *  configured one is clamped by the shared listing rule (`parseListingBatchSize`, ceiling 24, the
 *  same REQ-25 bound `recent-entries.ts` applies), so no config can turn the listing into a scan. */
const LEGACY_POST_PREVIEWS_LIMIT = 6;

/**
 * Minimal render-time shape for one post shown by a `{"type":"post-previews"}` marker — the
 * post-listing counterpart to {@link StaticMenuItem}: the route layer resolves the real, bounded,
 * visibility-filtered `PostRecord[]` (query, ADR-030 §4 gate, public path) and hands this file only
 * what it renders, keeping this module I/O- and domain-free per the file's own header.
 */
export interface StaticPostPreview {
  readonly title: string;
  readonly href: string;
  /** ISO 8601, for `<time datetime>` — `PostRecord` has no `publishedAt` (the unified-content-marker
   *  design doc's own note on why), so this is the go-live time (`publishAt`) when the post has one,
   *  else `updatedAt`, the same field the bounded query orders by (`postDisplayDateIso`). */
  readonly dateIso: string;
  /** Pre-formatted for display (e.g. "Sep 3, 2026") — no date-formatting/locale logic belongs in
   *  this pure render layer, mirroring every other pre-resolved field on this shape. */
  readonly dateLabel: string;
  /** Library cover from the shared public policy; an absent image emits no tag. */
  readonly featuredImage?: StaticFeaturedImage | null;
}

/** One marker's batch size — what the route fetches, what {@link injectPostPreviewsEmbeds} shows,
 *  and a see-more listing's batch size, so they never disagree.
 *  The route scans only the current page: unlike shared menu chrome, post listings are page-scoped,
 *  so pages without a marker must not query posts. Plain markers share one bounded query at the
 *  widest clamped size; each marker slices its own limit. Keyed/paged listings resolve separately. */
export function postPreviewsBatchSize(marker: Pick<EmbedMarker, "config">): number {
  return parseListingBatchSize({ config: marker.config }, { fallback: LEGACY_POST_PREVIEWS_LIMIT });
}

/** `{"type":"post-previews","paged":true}` — a numbered-pages listing (Bug C, 2026-10-22): the route
 *  resolves the requested page (`/page/<n>`, `/blog/page/<n>`) and its nav, so no list stops at one
 *  batch with older posts unreachable from any link. */
export function isPagedPostPreviewsMarker(marker: Pick<EmbedMarker, "config">): boolean {
  return marker.config.paged === true;
}

/** A paged post-previews listing's current page, resolved by the route: its posts and its
 *  already-rendered nav (`''` when there is only one page). */
export interface StaticPostPreviewsPage {
  readonly items: readonly StaticPostPreview[];
  readonly nav: string;
}

/** One see-more listing's rendered batch (`data-jini-see-more`, keyed by `data-jini-listing`): the
 *  items at the requested cursor, plus the next batch URL when more exist. */
export interface StaticListingBatch<T> {
  readonly items: readonly T[];
  readonly nextHref?: string;
}

/** One preview's markup — optional cover, title link and display date, already resolved by the route. */
function renderPostPreviewCard(preview: StaticPostPreview): string {
  return (
    `<article class="post-card">` +
    (preview.featuredImage ? renderCoverImageTag({ image: preview.featuredImage }, { loading: "lazy" }) : "") +
    `<h3><a href="${escapeHtml(preview.href)}">${escapeHtml(preview.title)}</a></h3>` +
    `<div class="post-meta"><time datetime="${escapeHtml(preview.dateIso)}">${escapeHtml(preview.dateLabel)}</time></div>` +
    `</article>`
  );
}

/**
 * Fill every `{"type":"post-previews"}` marker with up to its own (clamped) `limit` of `previews`'
 * leading entries, or leave the marker's authored fallback content completely untouched when there
 * is nothing to show (`previews` empty — mechanism not wired for this page, or zero visible posts —
 * or this marker's own slice comes up empty). Identical "no data ⇒ theme's own fallback survives"
 * contract {@link injectMenuEmbeds} already established for `{"type":"menu"}`: a theme with no
 * published posts yet renders exactly as authored rather than an empty grid.
 *
 * `previews` is already the CALLER's bounded, visibility-filtered, ordered result — see
 * {@link StaticPostPreview}'s own doc. This function only decides how many of it one marker shows
 * and how each one renders; it performs no I/O and applies no visibility rule of its own.
 *
 * A `paged` marker ({@link isPagedPostPreviewsMarker}) renders `page` (the route's requested page and
 * its nav) instead, when the route resolved one; a see-more key on it is then ignored.
 *
 * @complexity O(n) over `html`'s length for the marker scan/splice, plus O(m) over the small, fixed
 * number of post-previews markers a real page carries.
 */
function injectPostPreviewsEmbeds(
  html: string,
  previews: readonly StaticPostPreview[],
  batches: ReadonlyMap<number, StaticListingBatch<StaticPostPreview>>,
  page?: StaticPostPreviewsPage
): string {
  return substituteMarkers({ html: html, resolve: (marker) => {
    if (marker.type !== POST_PREVIEWS_MARKER_TYPE) return undefined;
    if (page !== undefined && isPagedPostPreviewsMarker(marker)) return renderPagedPostPreviews({ marker, page });
    const key = listingKeyOfAttributes({ attrs: marker.attrs });
    const batch = key === undefined ? undefined : batches.get(key);
    if (key !== undefined && batch !== undefined) return renderKeyedPostPreviews({ marker, key, batch });
    const slice = previews.slice(0, postPreviewsBatchSize(marker));
    return slice.length === 0 ? undefined : withInnerContent({ marker: marker, inner: slice.map(renderPostPreviewCard).join("") });
  } });
}

/** A see-more listing's batch, or `undefined` (authored fallback) when it is empty. */
function renderKeyedPostPreviews(
  { marker, key, batch }: { marker: EmbedMarker; key: number; batch: StaticListingBatch<StaticPostPreview> },
  _optional: Record<string, never> = {}
): string | undefined {
  if (batch.items.length === 0) return undefined;
  // A theme's client-side card stays in the listing for the see-more script to fill.
  const card = extractListingCardTemplate({ html: marker.inner }) ?? "";
  const inner = card + wrapListingItems({ key, items: batch.items.map(renderPostPreviewCard).join("") });
  return withInnerContent({ marker, inner }) + (batch.nextHref === undefined ? "" : renderListingMore({ key, href: batch.nextHref }));
}

/** A paged listing's current page followed by its nav, or `undefined` (authored fallback, no nav)
 *  when there are no posts at all. */
function renderPagedPostPreviews(
  { marker, page }: { marker: EmbedMarker; page: StaticPostPreviewsPage },
  _optional: Record<string, never> = {}
): string | undefined {
  if (page.items.length === 0) return undefined;
  return withInnerContent({ marker, inner: page.items.map(renderPostPreviewCard).join("") }) + page.nav;
}

/**
 * One collection marker's already-rendered entry list, keyed by {@link collectionMarkerKey}. The
 * route layer (`pages.ts`'s `resolveCollectionListsForRender`, C5) builds these — one query per
 * distinct marker config found on the page, run through `entry-list-render.ts`'s `renderEntryList` —
 * and hands the result to {@link renderStaticPage} as a `ReadonlyMap<string, string | undefined>`.
 * `html` is `undefined` for a marker this file's caller looked up but found nothing to show for
 * (unknown type, invalid config, or zero matching entries): the map still records the key so
 * {@link injectCollectionEmbeds} treats it as a deliberate miss rather than re-querying, but the
 * marker's authored fallback survives either way (`collectionLists`'s own contract, same as
 * `postPreviews`'s "absent input, absent effect").
 */
export interface StaticCollectionList {
  /** {@link collectionMarkerKey}'s output for the marker this list answers. */
  readonly key: string;
  readonly html: string;
}

/**
 * A stable identity for one `{"type":"collection",…}` marker's config, so a page with several
 * differently-configured collection markers (or the same config repeated) can be resolved as
 * independent entries in a `Map` — the same per-marker addressing `withAddedId`'s own `id` field
 * gives markers that need one, done here via the WHOLE config instead because two collection markers
 * can differ in `typeKey`/`sort`/`where`/`limit` without either carrying an `id`. `JSON.stringify` of
 * the parsed config as-is (no key filtering) is deterministic for a given authored marker: both this
 * file's {@link injectCollectionEmbeds} and the route layer's map-builder parse the identical marker
 * text into the identical `config` object, so they always agree on the key.
 *
 * The authored `<template>` ({@link splitCollectionMarkerInner}) is part of the identity too: the
 * rendered list depends on it, so two markers with the same config but different templates must not
 * share one map entry (the route layer dedupes by this key and renders with the FIRST marker's
 * template). A template-less marker keeps the plain config-JSON key; a templated one uses a JSON
 * array `[config, template]`, which starts with `[` and so can never equal an object key.
 *
 * @complexity O(k + n) over the config's own key count and the marker's inner length — independent of
 * the surrounding document.
 */
export function collectionMarkerKey(marker: EmbedMarker): string {
  const { template } = splitCollectionMarkerInner(marker.inner);
  const key = template === undefined ? JSON.stringify(marker.config) : JSON.stringify([marker.config, template]);
  // A see-more listing renders its own key's batch, so it never shares an entry with another marker.
  const listingKey = listingKeyOfAttributes({ attrs: marker.attrs });
  return listingKey === undefined ? key : `listing:${listingKey}:${key}`;
}

/**
 * Splits a collection marker's authored inner content into an optional per-item `template` (the
 * first `<template>…</template>` found, exclusive of the tags themselves) and the remaining
 * `fallback` markup (everything else, shown untouched on a miss — see {@link injectCollectionEmbeds}).
 * A marker authored with no `<template>` returns its whole inner content as `fallback` and no
 * `template`, which routes the route layer's renderer into its built-in cards/list markup instead of
 * per-item template mode (`entry-list-render.ts`'s `EntryListRenderOptions.template`).
 *
 * @complexity O(n) over `inner`'s length for the two substring scans plus the slice/concat.
 */
export function splitCollectionMarkerInner(inner: string): { template?: string; fallback: string } {
  const openTag = "<template>";
  const closeTag = "</template>";
  const start = inner.indexOf(openTag);
  if (start === -1) return { fallback: inner };
  const end = inner.indexOf(closeTag, start + openTag.length);
  if (end === -1) return { fallback: inner };
  const template = inner.slice(start + openTag.length, end);
  const fallback = inner.slice(0, start) + inner.slice(end + closeTag.length);
  return { template, fallback };
}

/**
 * Substitutes each `{"type":"collection"}` marker with its pre-resolved, pre-rendered entry list from
 * `lists` (looked up by {@link collectionMarkerKey}), preserving the marker element's own tag and
 * authored attributes but stripping `data-embed-config` on the hit path so a later re-scan of the
 * same output can never rediscover and re-resolve it (D3: matches the widget rule via
 * {@link withInnerContentFinal}, unlike {@link injectPostPreviewsEmbeds}'s `withInnerContent`). A miss
 * — no entry in `lists` for this marker's key, or an entry whose `html` is `undefined` — leaves the
 * marker exactly as authored, so its fallback/empty-state markup survives untouched (same "absent
 * input, absent effect" contract {@link injectMenuEmbeds}/{@link injectPostPreviewsEmbeds} already
 * establish for their own marker types).
 *
 * @complexity O(n) over `html`'s length — one `substituteMarkers` scan-and-splice pass, plus O(1)
 * per collection marker for the map lookup.
 */
function injectCollectionEmbeds(html: string, lists: ReadonlyMap<string, string | undefined>): string {
  return substituteMarkers({ html: html, resolve: (marker) => {
    if (marker.type !== COLLECTION_MARKER_TYPE) return undefined;
    const rendered = lists.get(collectionMarkerKey(marker));
    if (rendered === undefined) return undefined;
    const listingKey = listingKeyOfAttributes({ attrs: marker.attrs });
    const html = withInnerContentFinal({ marker: marker, inner: rendered });
    // A built-in layout's own wrapper is the see-more container, so the marker element gives up the
    // key; in template mode the items sit directly in the marker element, which keeps it.
    return listingKey === undefined || splitCollectionMarkerInner(marker.inner).template !== undefined
      ? html
      : html.replace(` data-jini-listing="${listingKey}"`, "");
  } });
}

/**
 * The current post's featured image, already resolved by the route layer — the same
 * `{ url, alt, width, height }` the Liquid/Handlebars tiers read as `post.featuredImage`
 * (`render.ts`'s `featuredImageView`), so both tiers show the identical image and alt text.
 */
export interface StaticFeaturedImage {
  readonly url: string;
  readonly alt: string;
  readonly width: number | null;
  readonly height: number | null;
}

/** The `<img>` for a public cover. `width`/`height` reserve the box before the bytes arrive (no
 *  layout shift; the theme's CSS scales it with `height: auto`). Eager with high fetch priority, not
 *  lazy: it sits at the top of the post, so it is usually the page's largest paint. Cards opt into
 *  lazy loading; URL/alt escaping and optional dimensions stay identical across both surfaces.
 * @example renderCoverImageTag({ image }, { loading: "lazy" })
 * @complexity O(url + alt) for escaping; no I/O.
 */
export function renderCoverImageTag({ image }: { image: StaticFeaturedImage }, optional: { loading?: "lazy" } = {}): string {
  const width = image.width === null ? "" : ` width="${image.width}"`;
  const height = image.height === null ? "" : ` height="${image.height}"`;
  const priority = optional.loading === "lazy" ? ' loading="lazy"' : ' fetchpriority="high"';
  return `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt)}"${width}${height} decoding="async"${priority}>`;
}

/**
 * Fills every `{"type":"featured-image"}` marker with the current post's featured image, or removes
 * the marker's WHOLE element when there is none. Deliberately the opposite of the "absent input,
 * absent effect" rule {@link injectMenuEmbeds}/{@link injectPostPreviewsEmbeds} follow: a menu's
 * fallback is real content worth keeping, but a featured-image wrapper with nothing in it is an empty
 * figure with margins. `null`/`undefined` both mean "no image" — every surface that is not rendering
 * a post with one (home, marketing pages, a page with none set) passes nothing.
 *
 * @complexity O(n) over `html`'s length — one `substituteMarkers` scan-and-splice pass.
 */
export function injectFeaturedImage(html: string, image: StaticFeaturedImage | null | undefined): string {
  return substituteMarkers({ html: html, resolve: (marker) => {
    if (marker.type !== FEATURED_IMAGE_MARKER_TYPE) return undefined;
    return image ? withInnerContentFinal({ marker: marker, inner: renderCoverImageTag({ image }) }) : "";
  } });
}

/**
 * Fill author markers and the `{{author}}` shortcut with one escaped, visibility-gated credit.
 * A marker inside a content placeholder declares a byline for that content's header; fill it here
 * too for static previews, where the content itself has not yet been resolved.
 * @returns HTML with hidden marker elements removed and hidden tokens replaced with empty text.
 * @complexity O(n) time and output space in template length; no I/O or input mutation.
 */
export function injectPostAuthor(
  required: { html: string; post?: { author?: string | null; showAuthor?: boolean } },
  _optional: Record<string, never> = {},
): string {
  const author = required.post ? postAuthorForDisplay({ post: required.post }) : null;
  const credit = author ? `By ${escapeHtml(author)}` : "";
  const resolveAuthor = (marker: EmbedMarker): string | undefined => {
    if (marker.type !== "post-author") return undefined;
    return credit ? withInnerContentFinal({ marker, inner: (marker.attrs.includes('data-post-author-separator=') ? " · " : "") + credit }) : "";
  };
  // Substitute tokens before markers so token-like text in a saved author stays literal data.
  const html = required.html.replaceAll("{{author}}", () => credit);
  return substituteMarkers({ html, resolve: (marker) => {
    if (marker.type !== "content") return resolveAuthor(marker);
    const inner = substituteMarkers({ html: marker.inner, resolve: resolveAuthor });
    return inner === marker.inner ? undefined : withInnerContent({ marker, inner });
  } });
}

/**
 * Select the current content header's byline. A nested author marker explicitly places it below
 * the title/date; a byline elsewhere in the expanded template owns its own placement, so the core
 * header contributes none. Otherwise every theme gets the same `post-author` span as fallback: a span,
 * not a paragraph, because the core header sets it inside the date's `.post-meta` line, where a theme's
 * `p` margins or font size would pull it out of that line's typography (2026-10-10).
 * A nested marker goes into that same line, so it is re-tagged as a `span` too, keeping its authored
 * attributes and inner content: themes author it as `<p class="post-author">`, and as a `<p>` it took
 * the theme's 18px body text beside the 13px muted date, off the date's baseline (2026-10-10).
 * Return marker markup for the final {@link injectPostAuthor} pass, which owns escaping and
 * hidden-credit removal. Deferring that pass also keeps token-like text in a saved author literal.
 * @complexity O(n) time and output space in template length; pure, with no I/O.
 */
export function postAuthorForContentHeader(
  required: { html: string; post: { id: string; slug: string } },
  _optional: Record<string, never> = {},
): string {
  const content = markersOfType({ html: required.html, type: "content" }).find(marker =>
    marker.id !== undefined ? marker.id === required.post.id : marker.config.slug === required.post.slug);
  const nestedAuthor = content && markersOfType({ html: content.inner, type: "post-author" })[0];
  if (nestedAuthor) return `<span${nestedAuthor.attrs}>${nestedAuthor.inner}</span>`;
  const tokenInHeader = content?.inner.includes("{{author}}") === true;
  if (!tokenInHeader && (required.html.includes("{{author}}") || markersOfType({ html: required.html, type: "post-author" }).length > 0)) return "";
  return `<span class="post-author" data-embed-config='{"type":"post-author"}'></span>`;
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
  /** Escape a manifest-supplied string so it matches literally inside a constructed `RegExp`. */
  const linkRe = new RegExp(`(<a href="[^"]+" data-nav-id="${RegExp.escape(current)}")(>)`);
  return partial.replace(linkRe, '$1 aria-current="page"$2');
}

/**
 * Replace every `{"type":"partial"}` marker with the root partial the theme's `theme.json` `slots`
 * block maps that key to. A BARE marker's own element disappears entirely — it is scaffolding, and
 * the partial is a complete `<nav>`/`<footer>` of its own — but one carrying any authored attribute
 * besides `data-embed-config` keeps that element (minus the marker config) around the resolved
 * partial ({@link withElementKeptIfAttributed}, D3 of the 2026-09-23 collections/embeds plan): the
 * same keep-if-attributed rule the `widget` marker type already followed. A survey of every shipped
 * theme found no attributed partial marker in the wild, so this is additive — every existing bare
 * marker keeps disappearing exactly as before.
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
  return substituteMarkers({ html: html, resolve: (marker) => {
    if (marker.type !== PARTIAL_MARKER_TYPE || marker.id === undefined) return undefined;
    const descriptor = slots[marker.id];
    if (descriptor === undefined) return undefined;
    return withElementKeptIfAttributed({ marker: marker, inner: resolveSlotMarker(descriptor, partials, marker.config) });
  } });
}

/**
 * Partial-slot expansion as its OWN exported step (E2, 2026-09-23), so a caller can run it standalone
 * over already-assembled HTML rather than only as the inline step {@link renderStaticPage} below
 * still takes. Exists for D2's `finishStaticTierDocument` pipeline (`pages.ts`), which expands
 * partials first and only then scans the assembled result for widget/media/post/content/menu/
 * post-previews markers a partial itself might carry.
 *
 * Equivalent to {@link resolveSlots} called with the theme's own partials and declared (or default)
 * slots — no new behavior, just a named entry point for a caller that only has a `theme`, not the
 * two separate `partials`/`slots` arguments.
 *
 * @complexity Same as {@link resolveSlots}: O(n) over `html`'s length.
 */
export function expandPartials(html: string, theme: Pick<DiscoveredTheme, "partials"> & { manifest: Pick<DiscoveredTheme["manifest"], "slots"> }): string {
  return resolveSlots(html, theme.partials, theme.manifest.slots ?? DEFAULT_THEME_SLOTS);
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
 * {@link renderStaticPage}'s token step: insert the theme's design tokens as a `<style>` block just
 * before the exact sentinel {@link tokenStylesheetSentinel} picks for the theme's `apiVersion`. A page
 * without that sentinel is returned unchanged with a warning naming it — tokens are never guessed in.
 * @complexity O(n) in the page length.
 */
function injectTokenStylesheet(required: { html: string; theme: DiscoveredTheme; pageId: string }): string {
  const { html, theme, pageId } = required;
  const sentinel = tokenStylesheetSentinel(theme.manifest.apiVersion);
  if (!html.includes(sentinel)) {
    console.warn(
      `[theme] static page '${theme.manifest.id}/${pageId}' is missing the exact token stylesheet sentinel; design tokens were not injected`
    );
    return html;
  }
  return html.replace(
    sentinel,
    () => `<style>\n${tokensToRootCss(theme.tokens, theme.tokensLight)}\n</style>\n${sentinel}`
  );
}

/**
 * Warn (never fail) about relative asset references {@link rewriteAssetPaths} left alone — each one
 * will 404 in the browser. The folders named follow the theme's `apiVersion`.
 * @complexity O(n) in the page length.
 */
function warnUnrewrittenAssetPaths(required: { html: string; theme: DiscoveredTheme; pageId: string }): void {
  const { html, theme, pageId } = required;
  const apiVersion = theme.manifest.apiVersion;
  const unrewrittenAssetPaths = findUnrewrittenAssetPaths(html, apiVersion);
  if (unrewrittenAssetPaths.length === 0) return;
  const assetFolders = apiVersion === 2 ? "../css//../scripts/" : "../css//../js/";
  console.warn(
    `[theme] static page '${theme.manifest.id}/${pageId}' has ${unrewrittenAssetPaths.length} unrewritten ${assetFolders} asset reference(s) that will 404 in the browser: ${unrewrittenAssetPaths.join(", ")}`
  );
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
 *
 * `postPreviews` (post-previews marker, 2026-09-03): the route layer's already-bounded,
 * visibility-filtered result — see {@link postPreviewsBatchSize}/{@link StaticPostPreview}'s own
 * docs for how it decides whether to fetch anything at all. Omitted (or empty) leaves every
 * `{"type":"post-previews"}` marker's authored fallback untouched, see
 * {@link injectPostPreviewsEmbeds} — same "absent input, absent effect" contract `menus` already has.
 *
 * `collectionLists` (collection marker, 2026-09-23): the route layer's already-resolved,
 * already-rendered entry lists, one per distinct marker config — see {@link StaticCollectionList}'s
 * own doc for how a miss is recorded. Omitted (or a miss for a given marker) leaves that
 * `{"type":"collection"}` marker's authored fallback untouched, see {@link injectCollectionEmbeds} —
 * same "absent input, absent effect" contract `menus`/`postPreviews` already have.
 */
export function renderStaticPage(
  required: {
    theme: DiscoveredTheme;
    pageId: string;
    htmlOverride?: string;
    menus?: Readonly<Record<string, StaticMenuContent>>;
    postPreviews?: readonly StaticPostPreview[];
    /** See-more post-previews listings by listing key; a keyed marker absent here renders from `postPreviews`. */
    postPreviewBatches?: ReadonlyMap<number, StaticListingBatch<StaticPostPreview>>;
    /** The requested page of every `paged` post-previews marker; absent ⇒ those markers render as plain ones. */
    postPreviewsPage?: StaticPostPreviewsPage;
    collectionLists?: ReadonlyMap<string, string | undefined>;
    /** The current post's featured image ({@link injectFeaturedImage}); omitted ⇒ no image. */
    featuredImage?: StaticFeaturedImage | null;
    /** Current post metadata; absent on other static surfaces, which removes the byline marker. */
    postAuthor?: { author?: string | null; showAuthor?: boolean };
  },
  _optional: Record<string, never> = {}
): string | null {
  const { theme, pageId, htmlOverride, menus, postPreviews, postPreviewBatches, postPreviewsPage, collectionLists, featuredImage, postAuthor } = required;
  const source = htmlOverride ?? theme.pages[pageId];
  if (source === undefined) return null;

  let html = injectTokenStylesheet({ html: source, theme, pageId });
  html = rewriteAssetPaths(html, theme.manifest.id, theme.manifest.apiVersion);
  warnUnrewrittenAssetPaths({ html, theme, pageId });
  html = injectColorMode(html, theme.manifest.defaultMode);
  html = expandPartials(html, theme);
  html = injectMenuEmbeds(html, menus ?? {});
  html = injectPostPreviewsEmbeds(html, postPreviews ?? [], postPreviewBatches ?? new Map(), postPreviewsPage);
  html = injectCollectionEmbeds(html, collectionLists ?? new Map());
  html = injectFeaturedImage(html, featuredImage);
  html = injectPostAuthor({ html, post: postAuthor });
  html = withEntryListStyleOnce(html);
  html = rewritePageLinks(html);
  return injectMenuDropdownScript({ html: injectListingScript({ html }) });
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
  return renderStaticFragment({ theme, html: partial, label: partialId });
}

/** Unsaved fragments use the same document, token injection and asset rewriting as partials.
 * @complexity The existing static-page render cost over the fragment's HTML.
 */
export function renderStaticFragment(
  { theme, html, label }: { theme: DiscoveredTheme; html: string; label: string },
  _optional: Record<string, never> = {},
): string {
  return renderStaticPage({
    theme,
    pageId: label,
    htmlOverride: wrapPartialInHostDocument(html, theme.manifest.apiVersion),
  })!; // htmlOverride is always supplied, so renderStaticPage's missing-source branch cannot run.
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
 * Legacy -> current filename map for the live `basic` theme's 2026-09-03 rename to a
 * `posts-*.html`/`pages-*.html` content-template naming convention (`blog-post.html` ->
 * `posts-default.html`, `blog-sidebar-template.html` -> `posts-sidebar.html`, `page-shell.html` ->
 * `pages-default.html` — the theme's own `theme.json` `templates` array carries only the new names
 * now). Keyed and valued by `theme.pages` id (no `.html`), matching {@link resolveTemplate}'s own
 * `pageId` convention.
 *
 * Consulted ONLY as a fallback inside {@link resolveTemplate}'s `resolveAgainstTheme`, after a direct
 * `theme.pages[pageId]` lookup already missed — never as a first choice, and never for any OTHER
 * theme's own naming (a theme that still ships `blog-post.html` resolves it directly, this map is
 * never reached). This is what keeps every row whose stored `template_choice` still names an OLD
 * filename (27 counted 2026-09-03) rendering byte-for-byte identically after the rename, on `basic`
 * AND on every one of the five other installed static themes that still ship the old names — a row's
 * stored choice is theme-relative but not theme-scoped (this function's own doc above), so it must
 * keep resolving correctly however the active theme later changes. Explicitly NOT paired with a
 * database backfill of those 27 rows: backfilling `template_choice` to the new name would make a row
 * MORE fragile on a future theme switch (a theme that still ships only the old name would no longer
 * match), not less — this alias map is the only direction that stays correct in both timelines.
 *
 * A COMPATIBILITY SHIM, not a permanent feature — the mapping only exists because exactly one of six
 * installed static themes has adopted the new convention so far. Remove an entry once every
 * currently-installed static theme (`sites/tovu-com/themes/static/*`) ships the RIGHT-hand filename
 * instead of the left, and no `posts`/`pages` row's `template_choice` still names the left-hand one —
 * check both before deleting a line, not just one.
 */
const LEGACY_TEMPLATE_FILENAME_ALIASES: Readonly<Record<string, string>> = {
  "blog-post": "posts-default",
  "blog-sidebar-template": "posts-sidebar",
  "page-shell": "pages-default",
};

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
 *   author action, and the one value no naive insert produces. For a `kind: "post"` row, keeps
 *   showing the diagnostic page, which is the designed product behavior ("not a silent fallback to
 *   generic rendering") — the ONLY value that reaches the diagnostic page without the theme first
 *   getting a say.
 *
 *   For a `kind: "page"` row, `""` means something else since the owner's 2026-09-23 ruling: a
 *   **bare page** ({@link isBarePageChoice}), serving the Page's own HTML with no theme chrome at
 *   all — not the diagnostic page above. `isPageTemplateChoiceEligible` (below) now refuses a
 *   Page's `""` in both body formats, so this function is never reached with `""` for a Page in
 *   practice; the arm above applies to a Post only.
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
 * place that naming mismatch is bridged. A `pageId` absent from `theme.pages` gets ONE more chance
 * against {@link LEGACY_TEMPLATE_FILENAME_ALIASES} before counting as "cannot honor" — see that
 * constant's own doc for why this, not a database backfill, is what keeps a stranded old-named choice
 * resolving correctly on `basic` after its 2026-09-03 rename.
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
    const requestedId = choice.replace(/\.html$/, "");
    const pageId = theme.pages[requestedId] !== undefined ? requestedId : (LEGACY_TEMPLATE_FILENAME_ALIASES[requestedId] ?? requestedId);
    const html = theme.pages[pageId];
    // "Ships a slot" is asked of the shared parser, never of a substring match. The literal
    // `data-embed-id="{{post}}"` this used to test for stopped existing the moment the themes moved
    // onto `data-embed-config` (2026-08-10), and because the miss is indistinguishable from "this
    // theme has no such template", EVERY post silently fell through to the diagnostic page at HTTP
    // 200 — the exact 2026-08-09 regression this function's own doc was written about, re-entered
    // through a different door. Asking `markersOfType` also means a template carrying a hardcoded
    // real id (or an already-spliced body) counts as having a slot, which it does.
    if (html === undefined || markersOfType({ html: html, type: "content" }).length === 0) return undefined;
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
 * - `kind: "page"`, `bodyFormat: "doc"` — eligible ONLY when `templateChoice` is a real filename:
 *   not `null`/`undefined`, and — since the owner's 2026-09-23 bare-page ruling described in the next
 *   bullet — not `""` either. The "never chosen → theme's first template" fallback that is safe for
 *   Posts is wrong for Pages: no admin surface set `template_choice` on a `kind: "page"` row before
 *   the Pages template picker shipped, so a Page reading `null` means "an admin surface that didn't
 *   exist yet couldn't have set it", not "no opinion". Falling back would apply a Post-shaped
 *   template to a Page that never asked for one — the live bug this asymmetry fixes: `terms-of-
 *   service`, `privacy-policy`, `contact`, `team`, `faq` rendered under the theme's first template
 *   entry (observed as `<title>Blog post — Basic</title>` on Terms of Service) purely because
 *   `bodyFormat === "doc"` was once the only condition checked, with no `kind` check at all.
 *   `our-story` (`kind: "page"`, `bodyFormat: "doc"`, `templateChoice: "page-shell.html"`, the
 *   proof-of-concept demo row) keeps rendering through this branch under this rule, because its
 *   choice IS explicit.
 * - `kind: "page"`, `bodyFormat: "html"` — same explicit-choice requirement: `""` is ALSO ineligible
 *   here, identically to `null`/`undefined`. Before the owner's 2026-09-23 ruling this was a
 *   documented DIVERGENCE from the `doc`-format Page rule above: a doc-format Page's `""` used to be
 *   eligible (routing to `resolveTemplate`'s diagnostic-page arm, the same as a Post), while an
 *   `"html"`-format Page's `""` was already ineligible (matching `null`), because "no template" was
 *   that format's normal, fully-functional default and a stray dropdown selection shouldn't break an
 *   otherwise-working page. The ruling gave `""` a THIRD, Page-only meaning instead of resolving that
 *   divergence either way: a **bare page** ({@link isBarePageChoice}), serving the Page's own HTML
 *   with no theme chrome at all. A bare Page must never enter this template branch regardless of
 *   which body format it happens to be saved as, which is exactly what retires the divergence — both
 *   formats now agree, and `isPageTemplateChoiceEligible` below no longer even branches on
 *   `bodyFormat`.
 *
 *   CORRECTION (2026-09-02): "fully-functional" above was false for a `static`-tier active theme.
 *   The generic path this arm sends an untemplated `html` Page to (`renderSite`'s
 *   `renderDeclarativeTierBody` -> `fallbackSiteBody` -> `pageShell()`) is Tovu's own built-in demo
 *   chrome, correct for the `declarative`/`templated`/`handlebars` tiers (which have no other shell)
 *   but not a static theme's real document — no `data-theme`, no theme scripts/icons, no real
 *   nav/footer. Live: an agent-authored Page lost the active theme's chrome entirely. This gate's OWN
 *   behavior (never route an unchosen Page into the template branch) is UNCHANGED and stays correct —
 *   what was wrong is the assumption about what the fallback destination looked like. Fixed at that
 *   destination instead of here: see {@link resolveStaticTierPageShellFallback}, consulted by
 *   `renderTemplateBranchIfEligible` (`pages.ts`) only when this gate returns `false`.
 *
 * @complexity O(1) — field comparisons only, no I/O or iteration.
 */
/**
 * The `kind: "page"` half of {@link isEligibleForTemplateBranch} — split out purely to keep that
 * function's own branch count proportional to "which gate applies", not also this gate's own checks.
 *
 * Format-independent since the owner's 2026-09-23 bare-page ruling: `""` is ineligible in BOTH
 * `bodyFormat`s now (a bare Page, see {@link isBarePageChoice}), which retires the doc/html
 * divergence this function used to preserve verbatim — `bodyFormat` is accepted only because callers
 * pass whole records, and is no longer read. See the caller's own doc for the full history.
 */
function isPageTemplateChoiceEligible(post: { bodyFormat: "doc" | "html"; templateChoice?: string | null }): boolean {
  return post.templateChoice !== null && post.templateChoice !== undefined && post.templateChoice !== "";
}

/**
 * Identifies a **bare page** — the owner's 2026-09-23 ruling for `templateChoice: ""` on a
 * `kind: "page"` row: serve the Page's own HTML only, with no theme CSS/JS, header, or footer.
 *
 * Pure, and deliberately checked BEFORE any template-branch gate: `renderTemplateBranchIfEligible`
 * (`routes/site/pages.ts`) must call this first, ahead of the `theme === null` early return and
 * either template-branch gate, because a bare Page renders identically whether or not a theme is even
 * active. {@link isPageTemplateChoiceEligible} and {@link resolveStaticTierPageShellFallback}
 * separately also refuse a bare Page's `""` on their own — belt-and-suspenders, not this predicate's
 * job — so a caller that skips this check still cannot land a bare Page in the template branch or
 * under a static theme's page shell. This predicate exists for the caller that needs to route to the
 * SEPARATE bare-rendering path, not merely to exclude bare Pages from this one.
 *
 * A Post is excluded by construction (`post.kind === "page"`): a Post's `""` keeps its own, unrelated
 * meaning — the diagnostic page, see {@link resolveTemplate} — untouched by this ruling.
 *
 * @param post - The record being rendered. Only `kind` and `templateChoice` are read.
 * @returns `true` only for a `kind: "page"` row whose `templateChoice` is the empty string.
 * @complexity O(1) — two field comparisons, no I/O.
 */
export function isBarePageChoice(post: { kind: "post" | "page"; templateChoice?: string | null }): boolean {
  return post.kind === "page" && post.templateChoice === "";
}

/** The canonical filename(s) `static`-tier themes use for a reusable, content-agnostic document
 *  shell — the same role `"index"` plays for the home route in {@link renderStaticTierHomePage}, just
 *  for any OTHER route. A Tovu-owned convention, not a per-theme manifest choice (see
 *  {@link resolveStaticTierPageShellFallback}'s own doc for why that distinction matters).
 *
 *  ORDERED, new name first: `basic`'s 2026-09-03 rename moved this file from `page-shell.html` to
 *  `pages-default.html`, but `basic-2` — the only other installed static theme that ships this file at
 *  all — still ships it under the OLD name. Both entries are tried, in order, so either theme's real
 *  filename resolves; a COMPATIBILITY SHIM, same removal condition as
 *  {@link LEGACY_TEMPLATE_FILENAME_ALIASES}'s own doc (`resolveTemplate`, above): drop `"page-shell"`
 *  once every currently-installed static theme ships `pages-default.html` instead. */
const STATIC_TIER_PAGE_SHELL_IDS: readonly string[] = ["pages-default", "page-shell"];

/**
 * WIDENED 2026-09-16 to every `kind: "page"` row, not just `"html"`-format ones. The owner's words:
 * "it shouldnt need to be saved to render correctly." A Page is BORN `"doc"`-format — `createPost`
 * forces `(bodyFormat: "doc", bodyHtml: null)` by construction (`features/post/post.ts`'s
 * `resolveBodyFields`, the CIC-3 write chokepoint) for the agent tool and the admin's own "New Page"
 * button alike, and only the first save births the html row. The original `"html"` restriction was
 * therefore not a rule about document shape at all; it was an unstated assumption that every Page
 * reaching here had already been saved once. Measured on a doc-format Page before widening: the live
 * site served a 1231-byte Tovu-generic `pageShell()` with no `data-theme` and no `/theme-assets/` —
 * the EXACT symptom described below, still live for the one shape the fix did not cover.
 *
 * This cannot reopen the `terms-of-service` regression that `isEligibleForTemplateBranch`'s own gate
 * exists to prevent, and the distinction is the whole reason this function is safe to widen: that
 * regression was doc Pages landing on `theme.manifest.templates[0]` — array POSITION, which carries
 * no "this is a page shell" meaning. This function never reads manifest ordering; it looks up a
 * Tovu-owned closed vocabulary ({@link STATIC_TIER_PAGE_SHELL_IDS}) and returns `undefined` when the
 * theme ships neither name, leaving the record on the generic path exactly as before.
 *
 * The 2026-09-02 fix for a live bug: an `html`-format `kind: "page"` row with no explicit
 * `templateChoice` — the state EVERY Page starts in (neither the agent create tool nor the admin
 * Pages editor sets this column on creation; see this repo's `content_post_create` tool and
 * `PageEditor.tsx`'s picker, both of which persist `null`/`""` until an author makes an explicit
 * choice) — is correctly kept OUT of the template branch by {@link isPageTemplateChoiceEligible}. The
 * doc above that gate claims the generic (non-template) path it falls through to is Pages' "normal,
 * fully-functional, default behavior". That claim is true for the `declarative`/`templated`/
 * `handlebars` tiers, where a theme never has a real standalone document of its own — `pageShell()`
 * IS those themes' only shell, template or not. It was FALSE for `static` tier: a static theme's real
 * pages are complete documents (`<html data-theme>`, real `/theme-assets/` scripts, icons, a
 * manifest) that `pageShell()` cannot reproduce — it never sets `data-theme`, never references the
 * theme's own scripts/icons, and only inlines `theme.css`'s raw bytes into a `<style>` tag
 * (`render.ts`'s own `pageShell`). Observed live: an agent-authored Page landed on Tovu's generic
 * `siteHeader`/`siteFooter` markup with zero `/theme-assets/` references and no `data-theme`
 * attribute, instead of the active theme's real chrome.
 *
 * This function restores that claim for `static` tier by giving the generic path a document shell to
 * render into, WITHOUT guessing at the row's intended CONTENT template — the exact distinction that
 * matters against the regression `isEligibleForTemplateBranch`'s own doc records (`resolveTemplate`'s
 * "never chosen -> theme's first template" arm, safe for Posts, put `terms-of-service` et al. under a
 * Post-shaped template's chrome because array position 0 carries no "this is a generic page shell"
 * meaning). This does not read `theme.manifest.templates` or its ordering at all: it looks up one of a
 * small, ORDERED set of canonical, Tovu-owned filenames ({@link STATIC_TIER_PAGE_SHELL_IDS}, new name
 * first) — the same closed-vocabulary lookup `renderStaticTierHomePage` already performs for
 * `"index.html"` on the home route, extended to cover every other route a static theme has no
 * dedicated template for.
 *
 * Most static themes do NOT ship this file. Counted 2026-09-02 (before `basic`'s 2026-09-03
 * posts-* / pages-* rename): of the five installed under `sites/tovu-com/themes/static/`, only `basic`
 * and `basic-2` had `render/pages/page-shell.html` — `tailark-dusk`, `tailark-quartz-dark` and
 * `tailark-quartz-libre` do not, and neither do the seed copies
 * `dist/content/themes/static/{fuel,gracious-timing,portfolite}` nor the pre-migration
 * `content/themes/__original-themes__/static/basic`. After the rename, `basic` ships this file as
 * `pages-default.html` and `basic-2` still ships it as `page-shell.html` — both resolve, in that
 * order, via {@link STATIC_TIER_PAGE_SHELL_IDS}. A theme shipping NEITHER name returns `undefined`
 * here, identical to `resolveTemplate`'s own "theme has no such page" contract, and the caller's
 * pre-existing generic `pageShell()` fallback is unchanged for it — which means switching the active
 * theme to any of the three tailark themes still REOPENS the exact bug described above: an
 * untemplated `html` Page renders in Tovu's generic chrome again, at HTTP 200.
 *
 * That degrade stays deliberate — guessing at some other template is what put `terms-of-service`
 * under a Post-shaped template's chrome, so a miss must remain a no-op rather than a substitution. What it must not
 * remain is SILENT: the miss now emits {@link warnPageShellFallbackMissOnce}'s `[theme] …` warning
 * (this module's existing `console.warn` convention, see `renderStaticPage`), once per distinct
 * message rather than once per request, so the state is visible in the server log instead of being
 * inferable only by eyeballing a rendered page.
 *
 * Scoped to `kind: "page"` + `bodyFormat: "html"` only: `kind: "post"` and `bodyFormat: "doc"` Pages
 * already have their own, unaffected "never chosen" handling (`isPageTemplateChoiceEligible` above)
 * and must keep it — this function is never consulted for either, by construction of its own
 * `post.kind`/`post.bodyFormat` check, not by relying on the caller to gate correctly.
 *
 * @complexity O(n) in the shell template's HTML length for the one `markersOfType` slot check
 *   (identical cost shape to `resolveTemplate`'s own `resolveAgainstTheme`); O(1) otherwise.
 */
/**
 * Miss diagnostics {@link resolveStaticTierPageShellFallback} has already emitted, keyed by the exact
 * message text (which embeds the theme id and the reason), so each distinct miss is reported once per
 * process.
 *
 * De-duplicated where `renderStaticPage`'s two `[theme]` warnings are not, because the two are
 * bounded differently: those fire per page render and a theme has a fixed, small page count, while
 * this one sits on the generic-fallback path taken by EVERY request to EVERY untemplated `html` Page
 * on the site — an unbounded warn would bury its own signal within minutes of real traffic. Bounded
 * by (installed static themes x 2 reasons), so it cannot grow with traffic.
 */
const warnedPageShellFallbackMisses = new Set<string>();

/**
 * Emits a page-shell miss diagnostic at most once per distinct message.
 *
 * @param message - The full `[theme] …` warning text; doubles as the de-duplication key.
 * @returns Nothing. Side effect: one `console.warn`, only on the first call for this message.
 * @complexity O(1) — one `Set` lookup plus at most one insert.
 */
function warnPageShellFallbackMissOnce(message: string): void {
  if (warnedPageShellFallbackMisses.has(message)) return;
  warnedPageShellFallbackMisses.add(message);
  console.warn(message);
}

/** {@link findPageShellCandidate}'s outcome — never more than one usable/slotless id at a time,
 *  since the search stops the moment a usable one is found. */
type PageShellCandidateOutcome = { kind: "usable"; id: string } | { kind: "slotless"; id: string } | { kind: "none" };

/**
 * Walks {@link STATIC_TIER_PAGE_SHELL_IDS} in order and reports the first candidate the theme both
 * SHIPS and can actually use (a real `"content"` slot). When nothing usable turns up, reports the
 * FIRST slotless candidate seen instead (so the caller's miss diagnostic can name the one this
 * function would have preferred), or `{ kind: "none" }` when the theme ships neither candidate at
 * all. Split out of {@link resolveStaticTierPageShellFallback} purely to keep that function's own
 * branch count proportional to "gate, then react to one outcome" rather than also the search's own
 * branching (complexity ceiling).
 *
 * @complexity O(n) in `STATIC_TIER_PAGE_SHELL_IDS.length` (a small, fixed constant) — at most one
 *   `markersOfType` slot check per candidate the theme actually ships.
 */
function findPageShellCandidate(theme: DiscoveredTheme): PageShellCandidateOutcome {
  let slotlessId: string | undefined;
  for (const id of STATIC_TIER_PAGE_SHELL_IDS) {
    const html = theme.pages[id];
    if (html === undefined) continue;
    if (markersOfType({ html: html, type: "content" }).length > 0) return { kind: "usable", id };
    slotlessId ??= id;
  }
  return slotlessId !== undefined ? { kind: "slotless", id: slotlessId } : { kind: "none" };
}

/** The `[theme] …` miss diagnostic for {@link resolveStaticTierPageShellFallback}'s two non-`"usable"`
 *  {@link PageShellCandidateOutcome}s — split out purely to keep that function's own branch count
 *  down; has no side effect of its own, {@link warnPageShellFallbackMissOnce} still owns emitting it. */
function pageShellMissMessage(themeId: string, candidate: { kind: "slotless"; id: string } | { kind: "none" }): string {
  const candidateFilenames = STATIC_TIER_PAGE_SHELL_IDS.map((id) => `${id}.html`);
  const named =
    candidate.kind === "slotless"
      ? `a '${candidate.id}.html' with no {"type":"content"} slot`
      : `none of '${candidateFilenames.join("', '")}'`;
  return `[theme] static theme '${themeId}' ships ${named}; untemplated html Pages render in Tovu's generic chrome instead of this theme's own document`;
}

export function resolveStaticTierPageShellFallback(
  required: {
    theme: DiscoveredTheme;
    post: { kind: "post" | "page"; bodyFormat: "doc" | "html"; templateChoice?: string | null };
  },
  _optional: Record<string, never> = {}
): string | undefined {
  const { theme, post } = required;
  if (theme.manifest.tier !== "static") return undefined;
  // `kind` only — the `bodyFormat === "html"` half of this gate was removed 2026-09-16, see the
  // WIDENED note on this function's own doc. `bodyFormat` is not read at all now, and the parameter
  // keeps it only because callers pass whole records.
  if (post.kind !== "page") return undefined;
  // 2026-09-23: a bare Page (`isBarePageChoice`) never gets a theme's page shell either — the owner's
  // ruling is NO theme chrome for `""`, and a page shell IS theme chrome. `renderTemplateBranchIfEligible`
  // (`routes/site/pages.ts`) already intercepts a bare Page before either gate runs; this check is
  // belt-and-suspenders so a caller that skips that interception still cannot reach a page shell here.
  if (post.templateChoice === "") return undefined;

  const candidate = findPageShellCandidate(theme);
  if (candidate.kind === "usable") return `${candidate.id}.html`;

  warnPageShellFallbackMissOnce(pageShellMissMessage(theme.manifest.id, candidate));
  return undefined;
}

export function isEligibleForTemplateBranch(
  required: {
    theme: DiscoveredTheme;
    post: { kind: "post" | "page"; bodyFormat: "doc" | "html"; templateChoice?: string | null };
  },
  _optional: Record<string, never> = {}
): boolean {
  const { theme, post } = required;
  if (theme.manifest.tier !== "static") return false;

  const templateCount = theme.manifest.templates?.length ?? 0;
  if (templateCount === 0) return false;

  if (post.kind === "post") return true;

  // kind === "page" — no "never chosen" fallback arm, ever (see this function's own doc for why).
  return isPageTemplateChoiceEligible(post);
}

/**
 * {@link resolveTemplateBranchChoice}'s outcome — WHICH template a record actually renders through,
 * once both the eligibility gate and the static-tier page-shell fallback have had their say.
 *
 * - `"as-chosen"` — {@link isEligibleForTemplateBranch} said yes; render the record's own
 *   `templateChoice` unchanged and let {@link resolveTemplate}'s tri-state do the rest.
 * - `"page-shell"` — ineligible, but {@link resolveStaticTierPageShellFallback} found the theme's
 *   canonical page shell. `templateChoice` is the filename to render UNDER, for this render only;
 *   the caller must apply it to a shallow clone and never write it back to the row.
 * - `"ineligible"` — neither applies. The public site falls through to its generic render for this.
 */
export type TemplateBranchChoice =
  | { kind: "as-chosen" }
  | { kind: "page-shell"; templateChoice: string }
  | { kind: "ineligible" };

/**
 * The single answer to "which template does this record render through" — {@link
 * isEligibleForTemplateBranch} and {@link resolveStaticTierPageShellFallback} composed in the one
 * order that is correct, so that no caller has to remember to consult both.
 *
 * Extracted 2026-09-16 from `renderTemplateBranchIfEligible` (`routes/site/pages.ts`), which was the
 * ONLY caller that ran both — the admin template-preview route (`routes/posts/template-preview.ts`)
 * called `renderViaTemplate` directly and so ran NEITHER. For a `kind: "page"`, `bodyFormat: "html"`
 * row with `templateChoice: null` (the state every agent-created and every freshly-saved Page starts
 * in, since no create path writes that column) the two paths therefore disagreed: the public site
 * resolved the page shell while the preview fell through `resolveTemplate`'s "never chosen" arm onto
 * `theme.manifest.templates[0]` — `posts-default.html` on the live `basic` theme. The operator's
 * preview pane showed a Page wearing a blog post's chrome and stylesheet while the public URL served
 * it correctly (owner-observed, `/admin/pages/say-hello`: "the css for the preview wasnt rendering
 * correctly").
 *
 * The fix is this function's EXISTENCE, not its contents: the logic is byte-for-byte what
 * `renderTemplateBranchIfEligible` already did, and the defect was that a second render entry point
 * could reach `renderViaTemplate` without passing through it. Any THIRD entry point must call this,
 * not the two underlying functions in sequence.
 *
 * Deliberately says nothing about what an `"ineligible"` caller should do — the public site has a
 * generic render path to fall to and the admin preview does not, and pretending one answer serves
 * both is how the two drifted apart in the first place.
 *
 * @param required.theme - The active theme, already resolved (never `null` here; a caller with no
 *   theme has nothing to render through and must short-circuit before calling).
 * @param required.post - The record being rendered. Only `kind`, `bodyFormat` and `templateChoice`
 *   are read; a shallow clone carrying a PENDING `templateChoice` (the admin preview's override) is
 *   an intended input, not a misuse.
 * @returns Which template branch applies, per {@link TemplateBranchChoice}.
 * @complexity O(n) in the candidate templates' HTML length for their `"content"` slot checks, over a
 *   small fixed number of candidates; O(1) otherwise. No I/O.
 */
export function resolveTemplateBranchChoice(
  required: {
    theme: DiscoveredTheme;
    post: { kind: "post" | "page"; bodyFormat: "doc" | "html"; templateChoice?: string | null };
  },
  _optional: Record<string, never> = {}
): TemplateBranchChoice {
  const { theme, post } = required;
  if (isEligibleForTemplateBranch({ theme, post })) return { kind: "as-chosen" };

  const pageShell = resolveStaticTierPageShellFallback({ theme, post });
  return pageShell !== undefined ? { kind: "page-shell", templateChoice: pageShell } : { kind: "ineligible" };
}
