// Keep request rendering separate from theme installation, imports, and agent tools.
import { scanMenuEmbedIds, type StaticMenuItem, type StaticMenuContent } from "#src/features/theme/index";
import type { DiscoveredTheme } from "#src/features/theme/theme";
import { urlFor } from "#src/platform/routing/index";
import type { RouteTarget } from "@jini-ai/cms/routing";
import { findBoundMenu, resolveMenuDoc } from "@jini-ai/cms/navigation";
import type { NavMenuEntry, NavTarget, ResolveTargetHrefFn } from "@jini-ai/cms/navigation";
import type { TemplateRenderDeps } from "./deps.js";

/** `NavTarget` (`navigation`) and `RouteTarget` (`routing`) are two independently-declared
 * discriminated unions with the same four kinds and matching fields (see `@jini-ai/cms/routing`'s file
 * header: the vocabulary was "promoted from Menus-local to routing-owned" precisely so both domains
 * share it) — but they remain two separate type declarations, not one shared import, so this maps
 * explicitly per-kind rather than relying on structural assignability compiling by coincidence.
 */
function navTargetToRouteTarget(target: NavTarget): RouteTarget {
  switch (target.kind) {
    case "entryRef":
      return { kind: "entryRef", entryId: target.entryId };
    case "termRef":
      return { kind: "termRef", termId: target.termId, taxonomy: target.taxonomy };
    case "url":
      return { kind: "url", href: target.href };
    case "route":
      return { kind: "route", route: target.route, params: target.params };
    // Preserve the undefined fallback for runtime inputs outside this exhaustive union.
    default: return undefined as never;
  }
}

/**
 * Direct menu-embed wiring (2026-08-10) — resolves every `data-embed-type="menu"` marker a
 * `static`-tier active theme's own pages/partials reference (`scanMenuEmbedIds`) into render-ready
 * link data, ahead of `renderSite`/`renderStaticPage`. Mirrors `resolveWidgetsForRender`'s own
 * "route resolves, render stays I/O-free" split (this is the one call site for this resolution).
 *
 * Selection (2026-10-25, ADR-029 §7): a marker id is FIRST a location key — a menu assigned to that
 * location through `nav_location_bindings` (Jini's `findBoundMenu`, the same lookup
 * `resolveForLocation` uses) wins over a stored menu whose slug or id happens to match. With no
 * (or a stale) binding, the marker falls back to slug, then id (see `findStaticMenu`). The August 10
 * decision that bypassed bindings for static themes is superseded; its rationale is kept in
 * ./NOTES.md. `resolveMenuDoc` (`navigation`) is the doc-level building block
 * `resolveForLocation` itself composes on top of a location lookup — called directly here per
 * referenced menu id. It still needs the same injected `resolveTargetHref` seam `routing`'s
 * own `urlFor` backs, for exactly the same reason `resolveForLocation` needed it.
 *
 * Non-static themes never call this (checked by the caller); declarative/templated/handlebars themes
 * have their own, separate `menu` WIDGET type (`Jini/packages/cms/src/widgets/resolvers/menu.ts`, `resolveMenuDoc` over an
 * explicit per-instance `menuRef`) that already renders real menu content today — a different,
 * narrower mechanism (one specific menu placed by an author, not a theme marker naming a shared
 * site-wide menu), left untouched by this change.
 *
 * A referenced id absent from the returned map (no such menu, wrong workspace, or a theme-authoring
 * typo) is `renderStaticPage`'s own `injectMenuEmbed` treating "no entry" as "leave the theme's
 * authored fallback content untouched" — no caller-side branching needed for that case either.
 *
 * @complexity Up to one binding read plus two menu reads, then `resolveMenuDoc`, per distinct menu
 * id the theme's markup references (bounded in practice to the small, fixed set an author wrote
 * into the theme's own files), run concurrently.
 *
 * `extraMenuIds` (E3, 2026-09-23, D2's `finishStaticTierDocument`) — additional ids to resolve
 * alongside the theme's own file scan, unioned via `Set` so an id present in both is fetched once,
 * not twice. Exists because `scanMenuEmbedIds(theme)` only ever sees the theme's OWN pages/partials;
 * a menu marker authored directly in a Page/Post's own body (never in a theme file) is invisible to
 * it, so `finishStaticTierDocument` scans the fully assembled document for menu ids `staticMenus`
 * (this function's own FIRST, no-`extraMenuIds` call at the top of the request) does not already
 * carry, and passes exactly those here. Omitted, every pre-existing call site is unaffected.
 */
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
  { deps, context, resolveTargetHref }: StaticMenuResolution,
  _optional: Record<string, never> = {},
): Promise<StaticMenuItem | null> {
  const headerMenu = await findStaticMenu({ menuId: HEADER_NAV_MENU_SLUG, deps });
  if (!headerMenu) return null;
  const headerItems = await resolveMenuDoc({ doc: headerMenu.doc, context, resolveTargetHref });
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
function flattenDocsPages(groups: readonly StaticMenuItem[]): readonly StaticMenuItem[] {
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
function buildDocsPagerItems({ flatPages, currentIndex }: { flatPages: readonly StaticMenuItem[]; currentIndex: number }, _optional = {}): readonly StaticMenuItem[] {
  const pagerItem = ({ item, cssClass }: { item: StaticMenuItem; cssClass: string }, _optional = {}): StaticMenuItem => ({
    ...item,
    isCurrent: false,
    isActive: false,
    children: [],
    attrs: { ...item.attrs, cssClass: [cssClass, item.attrs?.cssClass].filter(Boolean).join(" ") },
  });

  const items: StaticMenuItem[] = [];
  const prev = flatPages[currentIndex - 1];
  const next = flatPages[currentIndex + 1];
  if (prev) items.push(pagerItem({ item: prev, cssClass: DOCS_PAGER_PREV_CLASS }));
  if (next) items.push(pagerItem({ item: next, cssClass: DOCS_PAGER_NEXT_CLASS }));
  return items;
}

/**
 * One stored menu's render content: its author-written HTML when the menu is in HTML mode (owner
 * 2026-10-08, Jini `menu-html.ts`), else its resolved item tree.
 */
async function resolveMenuContent({ menu, context, resolveTargetHref }: { menu: NavMenuEntry; context: { workspaceId: string; currentPath: string }; resolveTargetHref: ResolveTargetHrefFn }, _optional = {}): Promise<StaticMenuContent> {
  if (menu.doc.mode === "html") return { html: menu.doc.html ?? "" };
  return resolveMenuDoc({ doc: menu.doc, context, resolveTargetHref });
}

/** What every static-menu marker resolution needs: deps, the request's path context, and the
 *  shared target-href resolver. */
interface StaticMenuResolution {
  readonly deps: TemplateRenderDeps;
  readonly context: { workspaceId: string; currentPath: string };
  readonly resolveTargetHref: ResolveTargetHrefFn;
}

type StaticMenuEntry = readonly [string, StaticMenuContent];

/** Binding selection belongs to Jini; the static marker contract retains slug/id compatibility.
 * @returns A stored menu or null. Repository faults propagate.
 * @complexity At most four indexed reads per theme-authored marker, O(1) additional space.
 */
// After the binding, SLUG first, id second. A theme marker is authored once and shipped to every
// install, but `createMenu` mints a menu's id with `idGen.newId()` — so a hardcoded `data-embed-id`
// could only ever match on the one install where that random id happened to be generated. The slug
// is the stable machine handle the model already documents for exactly this ("e.g. `primary-nav`",
// navigation/types.ts:161), so it is what a shipped theme can actually name. The id lookup stays as
// the fallback for a marker pointing at a specific stored menu, which is what the pre-2026-08-10
// behavior did unconditionally.
// The id fallback is also required for `HEADER_NAV_MENU_SLUG` ("menu-header-nav"): it is the literal
// `data-embed-id` nav.html's theme author wrote, but the seeded `menu-header-nav` row's real `slug`
// column is `"header-nav"` (no `menu-` prefix) — only its primary-key `id` column equals the literal.
// A slug-only lookup therefore always missed on real data, degrading `docs-section`/`docs-prev-next`
// to their authored fallback on every page (found 2026-09-24 debugging a live "No docs menu bound
// yet" sidebar against production data, not caught by the unit tests' own fixture menu, which
// happened to give its slug and id the same value).
async function findStaticMenu(
  { menuId, deps }: { menuId: string; deps: TemplateRenderDeps },
  _optional: Record<string, never> = {},
): Promise<NavMenuEntry | null> {
  return (await findBoundMenu({
    deps: { menuRepo: deps.menuRepo, bindingRepo: deps.navLocationBindingRepo },
    input: { workspaceId: deps.workspaceId, locationKey: menuId },
  })) ?? (await deps.menuRepo.findBySlug({ workspaceId: deps.workspaceId, slug: menuId }))
    ?? deps.menuRepo.findById({ workspaceId: deps.workspaceId, id: menuId });
}

/** One menu marker id to its `[id, content]` entry, or `undefined` for a miss (the theme's authored
 *  fallback content stays). @complexity Up to four indexed menu/binding reads plus the doc walk. */
async function resolveOneStaticMenu({ menuId, env }: { menuId: string; env: StaticMenuResolution }, _optional: Record<string, never> = {}): Promise<StaticMenuEntry | undefined> {
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
  if (menuId === CURRENT_PAGE_DOCS_SIDEBAR_MENU_ID) return resolveCurrentPageSidebarMenu({ menuId, env });
  // `DOCS_SECTION_MENU_ID` is the second reserved exception (2026-09-24): it names "the Docs
  // subtree of the header nav," not a stored menu of its own. The whole `menu-header-nav` doc is
  // resolved once (so every item, at every depth, gets the same real `isCurrent`/`isActive`
  // this function already computes against `currentPath`), then the branch returns only the
  // children of whichever top-level item resolved to `/docs` — the groups, each still carrying
  // its own resolved pages. A header nav with no item linking to `/docs` (or no header nav at
  // all) degrades to the theme's authored fallback, same "not authored yet" posture as every
  // other reserved-id miss in this function.
  if (menuId === DOCS_SECTION_MENU_ID) return resolveDocsSectionMenu({ menuId, env });
  // `DOCS_PREV_NEXT_MENU_ID` is the third reserved exception (2026-09-24): same Docs-subtree
  // lookup as `DOCS_SECTION_MENU_ID` above, flattened across group boundaries and reduced to the
  // 0-2 neighbours of whichever page in that flattened order is `isCurrent`. A current page not
  // found in the flattened list (the requesting page is not itself a page in the Docs subtree —
  // e.g. a non-doc page that happens to carry this marker) degrades the same way as no `/docs`
  // item at all: the theme's authored fallback, not a crash or an empty-but-present pager.
  if (menuId === DOCS_PREV_NEXT_MENU_ID) return resolveDocsPrevNextMenu({ menuId, env });
  const menu = await findStaticMenu({ menuId, deps: env.deps });
  if (!menu) return undefined;
  return [menuId, await resolveMenuContent({ menu, context: env.context, resolveTargetHref: env.resolveTargetHref })] as const;
}

async function resolveCurrentPageSidebarMenu({ menuId, env }: { menuId: string; env: StaticMenuResolution }, _optional = {}): Promise<StaticMenuEntry | undefined> {
  const { deps, context, resolveTargetHref } = env;
  const menu = await deps.menuRepo.findBySlug({
    workspaceId: deps.workspaceId,
    slug: docsSidebarMenuSlugForPath({ currentPath: context.currentPath }),
  });
  if (!menu) return undefined;
  return [menuId, await resolveMenuContent({ menu, context, resolveTargetHref })] as const;
}

async function resolveDocsSectionMenu({ menuId, env }: { menuId: string; env: StaticMenuResolution }, _optional = {}): Promise<StaticMenuEntry | undefined> {
  const { deps, context, resolveTargetHref } = env;
  const docsItem = await resolveDocsSectionItem({ deps, context, resolveTargetHref });
  if (!docsItem) return undefined;
  return [menuId, docsItem.children] as const;
}

async function resolveDocsPrevNextMenu({ menuId, env }: { menuId: string; env: StaticMenuResolution }, _optional = {}): Promise<StaticMenuEntry | undefined> {
  const { deps, context, resolveTargetHref } = env;
  const docsItem = await resolveDocsSectionItem({ deps, context, resolveTargetHref });
  if (!docsItem) return undefined;
  const flatPages = flattenDocsPages(docsItem.children);
  const currentIndex = flatPages.findIndex((page) => page.isCurrent);
  if (currentIndex === -1) return undefined;
  return [menuId, buildDocsPagerItems({ flatPages, currentIndex })] as const;
}

export async function resolveStaticMenusForRender({ deps, theme, currentPath }: { deps: TemplateRenderDeps; /* `null` when the operator turned the theme off — no theme, no theme-owned menu embeds. */ theme: DiscoveredTheme | null; currentPath: string }, { extraMenuIds }: { extraMenuIds?: readonly string[] } = {}): Promise<StaticMenuMap> {
  if (theme === null || theme.manifest.tier !== "static") return {};

  const menuIds = Array.from(new Set([...scanMenuEmbedIds(theme), ...(extraMenuIds ?? [])]));
  if (menuIds.length === 0) return {};

  const resolveTargetHref: ResolveTargetHrefFn = async ({ target }) => {
    const resolved = await urlFor({
      deps: { postRepo: deps.postRepo },
      target: navTargetToRouteTarget(target),
      ctx: { workspaceId: deps.workspaceId },
    });
    return resolved ? { path: resolved.path, available: true } : null;
  };

  const env: StaticMenuResolution = { deps, context: { workspaceId: deps.workspaceId, currentPath }, resolveTargetHref };
  const entries = await Promise.all(menuIds.map((menuId) => resolveOneStaticMenu({ menuId, env })));

  return Object.fromEntries(
    entries.filter((entry): entry is StaticMenuEntry => entry !== undefined)
  );
}

/** Local alias for the per-menu-id resolved map {@link resolveStaticMenusForRender} returns (an item
 *  tree, or an HTML-mode menu's markup) — used by the `GET /:slug` handler's own extracted helpers
 *  below to avoid repeating the full `Readonly<Record<string, StaticMenuContent>>` shape. */
export type StaticMenuMap = Readonly<Record<string, StaticMenuContent>>;
