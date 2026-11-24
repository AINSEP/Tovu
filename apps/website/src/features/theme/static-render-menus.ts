// Render workers need only handle identity, not the agent runtime's core barrel.
import { agentHandleSegment } from '@jini-ai/core/agent-handles';
import { markersOfType, MENU_MARKER_TYPE, substituteMarkers, withElementKeptIfAttributed, withInnerContent, type EmbedMarker } from "@jini-ai/cms/widgets/markers";
import { toAllowedHref } from "@jini-ai/cms/navigation/href";
import { renderMenuToggle } from "@jini-ai/cms/navigation/dropdown";
import { renderHtmlMenu } from "#src/platform/html/menu-render";
import { menuLinkRelAttr } from "@jini-ai/cms/navigation/menu-render";
import { escapeHtml } from "@jini-ai/core/text";
import type { DiscoveredTheme } from "./theme.js";


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
  readonly isActive?: boolean;
  /** `NavItemAttrs` passthrough — all five presentational fields (`cssClass`/`description`/`icon`
   *  render as before; `rel`/`openInNewTab` added alongside them, escaped; `rel` arrives allowlisted
   *  from Jini's resolver and a new tab always adds `noopener noreferrer` — see `menuItemLinkAttrs`). */
  readonly attrs?:
    | {
        readonly cssClass?: string;
        readonly description?: string;
        readonly icon?: string;
        readonly rel?: string;
        readonly openInNewTab?: boolean;
      };
  readonly children: readonly StaticMenuItem[];
}

/** An HTML-mode menu (owner 2026-10-08): the author's own stored markup, placed as-is at the marker.
 *  Trusted, admin/owner-only markup like HTML-mode forms; the save path (Jini `menu-html.ts`) balances it. */
export interface StaticHtmlMenu {
  readonly html: string;
}

/** What the route layer resolved for one menu id: its item tree, or its authored HTML. */
export type StaticMenuContent = readonly StaticMenuItem[] | StaticHtmlMenu;

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
    .map((item) => `<a href="${escapeHtml({ text: toAllowedHref({ rawHref: item.href }) })}"${menuItemLinkAttrs(item)}>${escapeHtml({ text: item.label })}</a>`)
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
 * escaped here; the rel allowlist lives in Jini (`navigation/link-rel.ts`, applied by
 * `validateAndCloneTree` on write and `resolveMenuDoc` on read — 11-02 owner policy; before that
 * no allowlist existed anywhere despite `NavItemAttrs`' doc comment). A new-tab link always gets
 * `noopener noreferrer` via `menuLinkRelAttr`.
 *
 * Availability rule, which differs from the flat renderer's on purpose: an unavailable **leaf** is
 * omitted entirely (the flat contract — never emit a dead link), but an unavailable **branch** is
 * kept as inert text so its available children are not deleted along with it. A trashed section
 * heading should not silently take its whole subtree off the page.
 */
/** The `<li>` class list: structural hooks first, then the item's own authored `cssClass`. Raw —
 *  the caller escapes it, since authored `cssClass` is admin-controlled attribute text. */
function menuItemClasses({ item, depth }: { item: StaticMenuItem; depth: number }, _optional = {}): string {
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
  const label = escapeHtml({ text: item.label });
  const icon = item.attrs?.icon ? `<span class="menu-item-icon" data-icon="${escapeHtml({ text: item.attrs.icon })}"></span>` : "";
  const description = item.attrs?.description
    ? `<span class="menu-item-desc">${escapeHtml({ text: item.attrs.description })}</span>`
    : "";
  return `${icon}${label}${description}`;
}

/** The `<a>` tag's own attribute suffix (`aria-current`/`rel`/`target`) for a linkable item. */
function menuItemLinkAttrs(item: StaticMenuItem): string {
  const current = item.isCurrent ? ' aria-current="page"' : "";
  const rel = menuLinkRelAttr({ rel: item.attrs?.rel, openInNewTab: item.attrs?.openInNewTab });
  const target = item.attrs?.openInNewTab ? ' target="_blank"' : "";
  const identity = `${item.href}:${item.label}`;
  const name = `menu_${agentHandleSegment({ value: identity })}`;
  return `${current}${rel}${target} data-toolname="${name}" data-tooldescription="${escapeHtml({ text: item.label })}" data-tool-action="navigate"`;
}

/**
 * The item's own label markup — an `<a>` when it resolves, an inert `<span>` when it does not.
 * `icon`/`description` render as child spans so a theme can style or ignore them without this
 * renderer having to know an icon set.
 */
function menuItemBody({ item, linkable }: { item: StaticMenuItem; linkable: boolean }, _optional = {}): string {
  const inner = menuItemInnerHtml(item);
  if (!linkable) return `<span class="menu-item-label" data-toolname="menu_${agentHandleSegment({ value: item.label })}" data-tooldescription="${escapeHtml({ text: item.label })}" data-tool-action="read">${inner}</span>`;
  return `<a href="${escapeHtml({ text: toAllowedHref({ rawHref: item.href }) })}"${menuItemLinkAttrs(item)}>${inner}</a>`;
}

/** Set for `{"variant":"dropdown"}` menus: hands out the child-`<ul>` ids the toggles point at. */
type MenuDropdown = { nextId(): string };

/**
 * One `<li>`, or `""` when the item is neither linkable nor a branch worth keeping for its children.
 * With `dropdown`, a branch gets a Jini toggle as a direct child of its `<li>` whose `aria-controls`
 * is the child `<ul>`'s id: after the `<a>` (split button), or in place of the label when the parent
 * has no real link (unresolved, or exactly `"#"`). Leaves render exactly as the tree variant.
 */
function renderMenuItem({ item, depth }: { item: StaticMenuItem; depth: number }, { dropdown }: { dropdown?: MenuDropdown } = {}): string {
  const linkable = item.available && item.href !== null;
  const lis = item.children.length > 0 ? renderMenuItems({ items: item.children, depth: depth + 1 }, { dropdown }) : "";
  if (!linkable && lis === "") return "";
  const classes = escapeHtml({ text: menuItemClasses({ item, depth }) });
  if (dropdown === undefined || lis === "") {
    const children = lis === "" ? "" : `<ul class="menu-list depth-${depth + 1}">${lis}</ul>`;
    return `<li class="${classes}">${menuItemBody({ item, linkable })}${children}</li>`;
  }
  return renderDropdownBranch({ item, linkable, classes, depth, lis, dropdown });
}

/** The dropdown half of {@link renderMenuItem}: a branch with children gets its toggle (split button
 *  after the `<a>`, or in place of the label for a parent with no real link). */
function renderDropdownBranch(
  { item, linkable, classes, depth, lis, dropdown }: { item: StaticMenuItem; linkable: boolean; classes: string; depth: number; lis: string; dropdown: MenuDropdown },
  _optional = {},
): string {
  const controlsId = dropdown.nextId();
  const body = linkable && item.href !== "#"
    ? menuItemBody({ item, linkable: true }) + renderVisitorMenuToggle({ controlsId, label: item.label })
    : renderVisitorMenuToggle({ controlsId, label: item.label }, { asLabel: true });
  return `<li class="${classes}">${body}<ul class="menu-list depth-${depth + 1}" id="${escapeHtml({ text: controlsId })}">${lis}</ul></li>`;
}

function renderMenuItems({ items, depth }: { items: readonly StaticMenuItem[]; depth: number }, { dropdown }: { dropdown?: MenuDropdown } = {}): string {
  return items
    .map((item) => renderMenuItem({ item, depth }, { dropdown }))
    .filter((li) => li !== "")
    .join("");
}

function renderMenuTree(items: readonly StaticMenuItem[], dropdown?: MenuDropdown): string {
  const rendered = renderMenuItems({ items, depth: 0 }, { dropdown });
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
export function injectMenuEmbeds({ html, menus }: { html: string; menus: Readonly<Record<string, StaticMenuContent>> }, _optional = {}): string {
  // One counter per page, so two dropdown markers never mint the same submenu id.
  let submenuCount = 0;
  const dropdown: MenuDropdown = { nextId: () => {
    submenuCount++;
    return `jini-submenu-${submenuCount}`;
  } };
  return substituteMarkers({ html: html, resolve: (marker) => {
    if (marker.type !== MENU_MARKER_TYPE || marker.id === undefined) return undefined;
    const items = menus[marker.id];
    if (items === undefined) return undefined;
    if (!Array.isArray(items)) return injectAuthoredMenuHtml({ marker, html: (items as StaticHtmlMenu).html });
    if (marker.config.mode === "html") {
      const plain = renderHtmlMenu({ id: marker.id, items, sanitizeHref: (value) => toAllowedHref({ rawHref: value }) });
      // Match forms: a bare marker disappears; explicitly authored wrapper attributes survive.
      return plain === "" ? undefined : withElementKeptIfAttributed({ marker: marker, inner: plain });
    }
    const variant = marker.config.variant;
    let inner: string;
    switch (variant) {
      case "tree": inner = renderMenuTree(items); break;
      case "dropdown": inner = renderMenuTree(items, dropdown); break;
      default: inner = renderMenuLinks(items);
    }
    return inner === "" ? undefined : withInnerContent({ marker: marker, inner: inner });
  } });
}

/**
 * An HTML-mode menu's markup at its marker. The theme's own wrapper (`<nav class="main-nav">`) keeps
 * its tag and attributes so theme layout still applies around the author's markup; a bare "Copy HTML
 * embed" marker disappears, the same rule the generated `mode: "html"` menu above follows. Empty
 * markup leaves the authored fallback, like an empty item tree.
 */
function injectAuthoredMenuHtml({ marker, html }: { marker: EmbedMarker; html: string }, _optional = {}): string | undefined {
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

/** Theme publication adorns the existing Jini disclosure; it owns all menu state/keyboard behavior. */
function renderVisitorMenuToggle(required: { controlsId: string; label: string }, optional: { asLabel?: boolean } = {}): string {
  const attrs = ` data-toolname="${escapeHtml({ text: required.controlsId })}" data-tooldescription="${escapeHtml({ text: required.label })} submenu" data-tool-action="menu"`;
  return renderMenuToggle(required, optional).replace('<button', () => `<button${attrs}`);
}
