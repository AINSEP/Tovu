// Keep request rendering separate from theme installation, imports, and agent tools.
// Host adapter (w5-routes): the generic static-menu marker resolution lives in Jini cms
// (`@jini-ai/cms/public-http/routes/site/pages/render-context/static-menus`); what stays here is the
// theme-owned part — which ids a static theme's files reference (`scanMenuEmbedIds`), the three
// reserved docs-IA marker ids Tovu's own themes author, and the Tovu `urlFor`/navigation binding.
import { scanMenuEmbedIds, type StaticMenuContent } from "#src/features/theme/static-render-menus";
import type { DiscoveredTheme } from "#src/features/theme/theme";
import { urlFor } from "#src/platform/routing/index";
import { findBoundMenu, resolveMenuDoc, type ResolvedNavItem } from "@jini-ai/cms/navigation";
import {
  findStaticMenu,
  resolveMenuContent,
  resolveStaticMenusForIds,
  type StaticMenuCollaborators,
  type StaticMenuEntry,
  type StaticMenuReservedResolver,
  type StaticMenuResolution,
} from "@jini-ai/cms/public-http/routes/site/pages/render-context/static-menus";
import type { TemplateRenderDeps } from "./deps.js";

/**
 * The one reserved `data-embed-id` a static theme's docs-sidebar marker can carry to mean "this
 * page's own sidebar," rather than one fixed stored menu (2026-08-31, docs-nav restructure). See
 * {@link resolveStaticMenusForRender}'s own doc for why this exists; kept literal here (not derived)
 * so `posts-sidebar.html` (`blog-sidebar-template.html` before the 2026-09-03 posts-* / pages-* rename)
 * and this file agree on the exact string by inspection, the same way {@link MENU_MARKER_TYPE} is a
 * literal a theme author's markup and this codebase both spell out.
 */
const CURRENT_PAGE_DOCS_SIDEBAR_MENU_ID = "docs-current-page-sidebar";

/**
 * The naming convention a per-page docs sidebar menu's slug follows: `docs-<slug>-sidebar` for the
 * page at `currentPath`. Pure string derivation, no I/O — the caller still has to look the derived
 * slug up (a stored menu at that slug may not exist, which is an ordinary "not authored yet" case,
 * not an error). `currentPath` is already the exact route the site received (`req.path` at this
 * function's one call site), so stripping the leading slash recovers the same slug column value
 * `posts.slug` stores — no second slug-resolution pass needed just for this.
 *
 * @complexity O(1).
 */
function docsSidebarMenuSlugForPath({ currentPath }: { currentPath: string }, _optional = {}): string {
  const slug = currentPath.replace(/^\/+/, "");
  return `docs-${slug}-sidebar`;
}

/**
 * The second reserved `data-embed-id` a static theme's docs template can carry (2026-09-24, docs IA
 * restructure) — the GROUP sidebar, distinct from {@link CURRENT_PAGE_DOCS_SIDEBAR_MENU_ID}'s
 * per-page in-page-anchor TOC. Rather than naming one fixed stored menu, it means "the Docs subtree
 * of the site's header nav" — depth 1 of that subtree is the four groups (Get started, Build your
 * site, …), depth 2 is each group's pages. This is deliberately the SAME data `menu-header-nav`
 * already feeds the top-nav flyout and the mobile drawer (`nav.html`), not a second authored copy —
 * see the docs IA proposal's "Mapping onto the Menus feature (one source)" section. Adding doc page
 * N+1, or reordering/renaming a group, is a `menu-header-nav` edit; nothing here changes.
 */
const DOCS_SECTION_MENU_ID = "docs-section";

/** The stable slug `nav.html`'s own `menu-header-nav` marker names — see that file's own comment. */
const HEADER_NAV_MENU_SLUG = "menu-header-nav";

/**
 * The resolved href the header nav's own "Docs" item is expected to carry (its own link to the
 * `/docs` landing page). {@link DOCS_SECTION_MENU_ID} identifies that item by this resolved path
 * rather than by label text, so renaming the item's authored label (an editorial change) does not
 * silently break the sidebar — only moving the item's target away from `/docs` would, which is
 * exactly the case that SHOULD stop this from finding the wrong subtree.
 */
const DOCS_LANDING_PATH = "/docs";

/**
 * The third reserved `data-embed-id` (2026-09-24, docs IA restructure) — Previous/Next pager links
 * at the bottom of a doc page, derived from the SAME Docs subtree {@link DOCS_SECTION_MENU_ID}
 * renders, crossing group boundaries (the last page of one group's neighbour is the first page of
 * the next). Resolves to 0-2 synthetic items (not real `NavItemNode`s — there is nothing to look up
 * by id for "the page before this one"), tagged via `attrs.cssClass` so the theme can style/order
 * them as a two-up row without a second marker type.
 */
const DOCS_PREV_NEXT_MENU_ID = "docs-prev-next";

/** `attrs.cssClass` hooks {@link DOCS_PREV_NEXT_MENU_ID}'s synthetic items carry — theme-facing,
 *  mirrors the convention every other authored `cssClass` already uses. */
const DOCS_PAGER_PREV_CLASS = "docs-pager-prev";

const DOCS_PAGER_NEXT_CLASS = "docs-pager-next";

/**
 * Shared lookup both docs reserved ids need: resolve `menu-header-nav`, then the top-level item
 * whose resolved href is `/docs`. `null` covers both "no header nav menu exists" and "the header nav
 * has no item linking to /docs" — both degrade the same way at each call site (an unresolved marker,
 * left as the theme's own authored fallback).
 */
async function resolveDocsSectionItem(
  { env }: { env: StaticMenuResolution },
  _optional: Record<string, never> = {},
): Promise<ResolvedNavItem | null> {
  const headerMenu = await findStaticMenu({ menuId: HEADER_NAV_MENU_SLUG, env });
  if (!headerMenu) return null;
  const headerItems = await env.collaborators.navigation.resolveMenuDoc({ doc: headerMenu.doc, context: env.context, resolveTargetHref: env.resolveTargetHref });
  return headerItems.find((item) => item.href === DOCS_LANDING_PATH) ?? null;
}

/**
 * Flattens the Docs subtree's groups into one ordered list of pages (depth-2 items only — the
 * groups themselves, depth-1, are not page destinations), preserving group order then within-group
 * order. This IS the "crossing group boundaries" behavior: the last page of group N and the first
 * page of group N+1 end up adjacent, with no group-boundary special case needed at the call site.
 *
 * @complexity O(n) over the subtree's total page count.
 */
function flattenDocsPages(groups: readonly ResolvedNavItem[]): readonly ResolvedNavItem[] {
  return groups.flatMap((group) => group.children);
}

/**
 * Builds the 0-2 synthetic pager items for the page at `currentIndex` in `flatPages` — the item
 * immediately before (if any) tagged `docs-pager-prev`, the one immediately after (if any) tagged
 * `docs-pager-next`. A page whose neighbour is unavailable (deleted/unpublished target) still gets a
 * synthetic item here; `renderMenuTree` already drops an unavailable, childless leaf on its own, so
 * this function does not need to duplicate that filtering.
 *
 * @complexity O(1).
 */
function buildDocsPagerItems({ flatPages, currentIndex }: { flatPages: readonly ResolvedNavItem[]; currentIndex: number }, _optional = {}): readonly ResolvedNavItem[] {
  const pagerItem = ({ item, cssClass }: { item: ResolvedNavItem; cssClass: string }, _optional = {}): ResolvedNavItem => ({
    ...item,
    isCurrent: false,
    isActive: false,
    children: [],
    attrs: { ...item.attrs, cssClass: [cssClass, item.attrs?.cssClass].filter(Boolean).join(" ") },
  });

  const items: ResolvedNavItem[] = [];
  const prev = flatPages[currentIndex - 1];
  const next = flatPages[currentIndex + 1];
  if (prev) items.push(pagerItem({ item: prev, cssClass: DOCS_PAGER_PREV_CLASS }));
  if (next) items.push(pagerItem({ item: next, cssClass: DOCS_PAGER_NEXT_CLASS }));
  return items;
}

async function resolveCurrentPageSidebarMenu({ menuId, env }: { menuId: string; env: StaticMenuResolution }, _optional = {}): Promise<StaticMenuEntry | undefined> {
  const { deps, context } = env;
  const menu = await deps.menuRepo.findBySlug({
    workspaceId: deps.workspaceId,
    slug: docsSidebarMenuSlugForPath({ currentPath: context.currentPath }),
  });
  if (!menu) return undefined;
  return [menuId, await resolveMenuContent({ menu, env })] as const;
}

async function resolveDocsSectionMenu({ menuId, env }: { menuId: string; env: StaticMenuResolution }, _optional = {}): Promise<StaticMenuEntry | undefined> {
  const docsItem = await resolveDocsSectionItem({ env });
  if (!docsItem) return undefined;
  return [menuId, docsItem.children] as const;
}

async function resolveDocsPrevNextMenu({ menuId, env }: { menuId: string; env: StaticMenuResolution }, _optional = {}): Promise<StaticMenuEntry | undefined> {
  const docsItem = await resolveDocsSectionItem({ env });
  if (!docsItem) return undefined;
  const flatPages = flattenDocsPages(docsItem.children);
  const currentIndex = flatPages.findIndex((page) => page.isCurrent);
  if (currentIndex === -1) return undefined;
  return [menuId, buildDocsPagerItems({ flatPages, currentIndex })] as const;
}

/** The three reserved docs-IA marker ids (see their constants above) and what each one resolves to. */
const RESERVED_DOCS_MENUS: ReadonlyMap<string, StaticMenuReservedResolver> = new Map<string, StaticMenuReservedResolver>([
  [CURRENT_PAGE_DOCS_SIDEBAR_MENU_ID, resolveCurrentPageSidebarMenu],
  [DOCS_SECTION_MENU_ID, resolveDocsSectionMenu],
  [DOCS_PREV_NEXT_MENU_ID, resolveDocsPrevNextMenu],
]);

// Where each reserved id was branched on (verbatim from the pre-split `resolveOneStaticMenu`):
  // `CURRENT_PAGE_DOCS_SIDEBAR_MENU_ID` is a reserved exception: a theme marker authored with
  // THIS literal id does not name one fixed stored menu at all. It names "whichever sidebar menu
  // the page currently being requested owns," resolved by the naming convention
  // {@link docsSidebarMenuSlugForPath} derives from `currentPath` — the one piece of per-request
  // state this otherwise theme-wide scan already receives. This is what lets N doc pages
  // (`posts-sidebar.html`'s ONE marker — `blog-sidebar-template.html` before the 2026-09-03
  // posts-*/pages-* rename) each get their own distinct anchor menu without duplicating the
  // template file per page. A path with no matching menu (most pages, and any doc page nobody
  // has authored a sidebar for yet) falls through to `!menu` below exactly like an ordinary dead
  // marker id — the theme's authored fallback content, not an empty nav.
  // `DOCS_SECTION_MENU_ID` is the second reserved exception (2026-09-24): it names "the Docs
  // subtree of the header nav," not a stored menu of its own. The whole `menu-header-nav` doc is
  // resolved once (so every item, at every depth, gets the same real `isCurrent`/`isActive`
  // this function already computes against `currentPath`), then the branch returns only the
  // children of whichever top-level item resolved to `/docs` — the groups, each still carrying
  // its own resolved pages. A header nav with no item linking to `/docs` (or no header nav at
  // all) degrades to the theme's authored fallback, same "not authored yet" posture as every
  // other reserved-id miss in this function.
  // `DOCS_PREV_NEXT_MENU_ID` is the third reserved exception (2026-09-24): same Docs-subtree
  // lookup as `DOCS_SECTION_MENU_ID` above, flattened across group boundaries and reduced to the
  // 0-2 neighbours of whichever page in that flattened order is `isCurrent`. A current page not
  // found in the flattened list (the requesting page is not itself a page in the Docs subtree —
  // e.g. a non-doc page that happens to carry this marker) degrades the same way as no `/docs`
  // item at all: the theme's authored fallback, not a crash or an empty-but-present pager.


/**
 * Resolves every menu marker id a `static`-tier active theme references (plus `extraMenuIds`) —
 * the theme gate and `scanMenuEmbedIds` stay here; the resolution itself is Jini's
 * `resolveStaticMenusForIds` (its doc carries the selection rules).
 *
 * `extraMenuIds` (E3, 2026-09-23, D2's `finishStaticTierDocument`) — additional ids to resolve
 * alongside the theme's own file scan, unioned via `Set` so an id present in both is fetched once,
 * not twice. Exists because `scanMenuEmbedIds(theme)` only ever sees the theme's OWN pages/partials;
 * a menu marker authored directly in a Page/Post's own body (never in a theme file) is invisible to
 * it, so `finishStaticTierDocument` scans the fully assembled document for menu ids `staticMenus`
 * (this function's own FIRST, no-`extraMenuIds` call at the top of the request) does not already
 * carry, and passes exactly those here. Omitted, every pre-existing call site is unaffected.
 */
export async function resolveStaticMenusForRender({ deps, theme, currentPath }: { deps: TemplateRenderDeps; /* `null` when the operator turned the theme off — no theme, no theme-owned menu embeds. */ theme: DiscoveredTheme | null; currentPath: string }, { extraMenuIds }: { extraMenuIds?: readonly string[] } = {}): Promise<StaticMenuMap> {
  if (theme === null || theme.manifest.tier !== "static") return {};

  const menuIds = Array.from(new Set([...scanMenuEmbedIds(theme), ...(extraMenuIds ?? [])]));
  const collaborators: StaticMenuCollaborators = {
    navigation: { findBoundMenu, resolveMenuDoc },
    urlFor: ({ target }) => urlFor({ deps: { postRepo: deps.postRepo }, target, ctx: { workspaceId: deps.workspaceId } }),
  };
  return resolveStaticMenusForIds({ deps, menuIds, currentPath, collaborators }, { reserved: RESERVED_DOCS_MENUS });
}

/** Local alias for the per-menu-id resolved map {@link resolveStaticMenusForRender} returns (an item
 *  tree, or an HTML-mode menu's markup) — used by the `GET /:slug` handler's own extracted helpers
 *  below to avoid repeating the full `Readonly<Record<string, StaticMenuContent>>` shape. */
export type StaticMenuMap = Readonly<Record<string, StaticMenuContent>>;
