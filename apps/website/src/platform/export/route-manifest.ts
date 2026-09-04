import { randomUUID } from "node:crypto";

import type { UUID } from "@jini-ai/cms/core";

import type { PostRecord, PostRepoPort } from "#src/features/post/index";
import { resolveActiveTheme, isStandaloneThemePage } from "#src/features/theme/index";
import { postPublicPath } from "#src/platform/routing/index";
import type { DiscoveredTheme } from "#src/features/theme/index";
import type { PresentationSettingsRepoPort } from "#src/features/presentation/index";
import type { RedirectRecord, RedirectRepoPort } from "#src/features/redirects/index";
import type { ManifestRoute, ManifestSkip, RouteManifest, RouteManifestPort } from "./ports.js";

/**
 * @file The one implementation of {@link RouteManifestPort} (`ports.ts`).
 *
 * Reuses the SAME selection logic the real public routes render with — rather than re-deriving
 * "which theme is active" or "which products are live" a second time, so a manifest built from
 * independent logic could never silently drift from what the routes it is describing actually do.
 *
 * Every one of `resolveActiveThemeId`/`listPublishedPosts`/`resolveStorefrontProducts` is reached
 * through `RouteManifestDeps` injection (`deps.resolveActiveThemeId()`/`deps.listPublishedPosts()`/
 * `deps.resolveStorefrontProducts()` below), not a direct import, and all three are bound to the
 * real implementation at the composition root (`server/runtime/composition/app.ts`/`deps.ts`) —
 * mirroring `runExportSite`/`createSiteApp`'s existing precedent on the same `RouteDeps` type. This
 * file lives under `platform/` (Tier-2, foundation-layer), while `resolveActiveThemeId` and
 * `listPublishedPosts` are owned by `features/presentation` and `features/post` respectively;
 * calling either directly from here would make `platform` reach back up into a feature that itself
 * depends on `platform` (via `platform/db`, `platform/routing`), closing a runtime module cycle
 * (`check:architecture` flagged `features/post <-> platform` and `features/presentation <->
 * platform`, SCC 0 -> 3). `resolveStorefrontProducts` was already injected for an unrelated reason
 * (its return type is deliberately off-limits to `features/commerce`, see `storefront.ts`'s own
 * file header) — the other two now take the identical shape for the module-boundary reason above,
 * per the established Option-A structural-injection technique (see
 * `ADS-memory/reports/architecture/2026-08-17-post-listpublishedposts-design-options.md` for the
 * same technique applied to a different `features/post` cycle).
 * `resolveActiveTheme`/`isStandaloneThemePage` stay as direct imports from `#src/features/theme/index`
 * — `features/theme` does not depend on `platform` at runtime, so that edge closes no cycle.
 *
 * The one non-obvious piece of domain knowledge this file owns: a static theme's `pages/*.html`
 * folder (`DiscoveredTheme.pages`, `features/theme/theme.ts`) holds BOTH real standalone pages
 * (`about.html`, `pricing.html`, …) and content-embedding template shells a Post/Page picks via
 * `templateChoice` (`page-shell.html`, `blog-post.html`, …, declared in `theme.manifest.templates`).
 * Both live in the identical `Record<string, string>`, keyed the identical way (filename minus
 * `.html`) — nothing in the loaded theme shape distinguishes them by TYPE, only by which OTHER list
 * names them. Enumerating `theme.pages` without excluding `theme.manifest.templates` would offer a
 * template shell as if it were its own page route — it IS technically reachable at that URL today
 * (`pages.ts`'s `theme.pages[slug]` check has no such exclusion), but exporting it produces a
 * broken/incomplete document (a shell meant to have a Post's content substituted in, rendered with
 * none), not a second copy of a real page. Excluded here for that reason.
 */

/**
 * The minimal structural slice {@link buildRouteManifest} actually reads, declared locally rather
 * than importing `server/routes/types.ts`'s `RouteDeps` (2026-08-20 RouteDeps-narrowing fix,
 * mirroring `features/theme/active-theme.ts`'s own `ActiveThemeResolutionDeps` — see that file's own
 * header for why a type-only import of the god type still counts as a real graph edge under
 * `check:architecture`'s `--ts-pre-compilation-deps` resolution, not just a runtime one).
 *
 * `resolveActiveThemeId` (`#src/features/presentation/index`) and `resolveActiveTheme`
 * (`#src/features/theme/index`) each only need their own narrow
 * `ActiveThemeIdResolutionDeps`/`ActiveThemeResolutionDeps` — this interface is a structural
 * superset of both (the same `presentationRepo`/`workspaceId`/`themes` fields, same types), so
 * passing `deps` through to either call works with no cast, exactly as it did against the real
 * `RouteDeps` object before this change.
 *
 * `resolveStorefrontProducts` is now NULLARY (`() => Promise<RouteManifestProduct[]>`), not
 * `(routeDeps: RouteDeps) => ...` — the matching 2026-08-20 field-contract change on `RouteDeps`
 * itself (see that field's own doc in `server/routes/types.ts`) that is what lets this file drop
 * `RouteDeps` entirely: the real implementation (`server/routes/site/products.ts`) is now bound to
 * its own `routeDeps` ONCE, at composition-root construction time, the same way
 * `RouteDeps.exportSiteBound` already binds `exportSite` itself. See {@link RouteManifestProduct}'s
 * own doc for why its return type is a local minimal shape rather than an import of the real
 * `SiteProduct`.
 *
 * A real `RouteDeps` object (what `createApp`/`serve.ts` already build) always satisfies this
 * trivially; only a test needs to assemble one, and every route test in this repo already does via
 * `createRouteDeps()`.
 */
export interface RouteManifestDeps {
  readonly workspaceId: UUID;
  readonly postRepo: PostRepoPort;
  readonly presentationRepo: PresentationSettingsRepoPort;
  readonly themes: DiscoveredTheme[];
  readonly redirectRepo: RedirectRepoPort;
  /** The same `resolveActiveThemeId` (`features/presentation/active-theme-id.ts`) the live routes
   *  resolve the active theme with, injected rather than imported directly — see file header. */
  readonly resolveActiveThemeId: () => Promise<string>;
  /** The same `listPublishedPosts` (`features/post/post.ts`) the live routes render posts/pages
   *  with, injected rather than imported directly — see file header. */
  readonly listPublishedPosts: () => Promise<{ posts: PostRecord[] }>;
  readonly resolveStorefrontProducts: () => Promise<RouteManifestProduct[]>;
}

/**
 * The exact 2 fields {@link buildRouteManifest} reads off each resolved storefront product — a
 * minimal structural slice of the real `SiteProduct` (`server/http/site/render.ts`), not an import
 * of it: importing `SiteProduct` here would relocate this file's `RouteDeps` back-edge rather than
 * remove it (`SiteProduct` itself lives under `src/server/**`, same as `RouteDeps`). Return-type
 * covariance means the real `resolveStorefrontProducts` (which returns full `SiteProduct[]`, a
 * strict superset of these 2 fields) satisfies {@link RouteManifestDeps}'s narrower field with no
 * cast anywhere — every `SiteProduct` already has both `id` and `title`.
 */
export interface RouteManifestProduct {
  readonly id: string;
  readonly title: string;
}

/** Base slug for the synthetic 404-probe route (`ports.ts`'s `ManifestRoute.kind: "not-found"`
 *  doc) — a real-looking, `[a-z0-9-]+`-shaped slug chosen specifically to miss every real post,
 *  page, and theme page, so requesting it exercises the SAME "nothing matched" branch a genuinely
 *  broken visitor link would. */
const NOT_FOUND_PROBE_BASE = "tovu-export-404-check";

/**
 * Picks a request path guaranteed not to collide with any route already in the manifest, so the
 * 404 probe (below) cannot accidentally hit real content. Collision is vanishingly unlikely for the
 * base slug alone (a genuine post/page would need that exact, deliberately-unusual title-shaped
 * slug), but a random suffix costs nothing and turns "vanishingly unlikely" into "cannot happen"
 * without the caller needing to reason about the odds.
 *
 * @complexity O(n) in the number of already-claimed paths for the (typical) zero-collision case;
 *   each retry is another O(n) membership check against the same fixed set, bounded in practice by
 *   collision probability rather than by any loop guard — a `Set` lookup is O(1) amortized, so this
 *   is not a hot path even for a large route count.
 */
function chooseNotFoundProbePath(claimedPaths: ReadonlySet<string>): string {
  let candidate = `/${NOT_FOUND_PROBE_BASE}`;
  while (claimedPaths.has(candidate)) {
    candidate = `/${NOT_FOUND_PROBE_BASE}-${randomUUID().slice(0, 8)}`;
  }
  return candidate;
}

/**
 * Builds the full {@link RouteManifest} for one workspace: home, the two always-registered
 * convention routes (`/robots.txt`, `/sitemap.xml`), every published post/page, every theme-owned
 * static marketing page not shadowed by a post, the product grid + each product detail page (when
 * any product exists), every statically-enumerable (`exact`-match, `active`) redirect rule, and a
 * collision-checked 404 probe. `prefix`/`wildcard`/`regex` redirect rules — and the fact that Tovu
 * has no favicon/manifest route to enumerate at all — are recorded in `skipped` rather than
 * silently dropped: the redirect rules match a FAMILY of paths, not one enumerable path, so no
 * finite manifest entry can represent them; favicon/manifest are convention-addressed paths with no
 * backing route to find in the first place.
 *
 * Also resolves and returns `activeTheme` (id + on-disk `dir`) when a theme was found — the one
 * piece of theme-resolution state a caller outside this function needs (the exporter's
 * unreferenced-theme-file diff) without re-resolving "which theme is active" a third time.
 *
 * Never throws for "no theme installed" — that is itself a real, reportable state (an export with
 * only `/`, the two convention routes, and a 404 probe, and a `skipped` entry explaining why), not
 * a crash; every other error (a repo failure, for instance) propagates uncaught, same as the live
 * routes it mirrors.
 *
 * @complexity O(P + T + R) — P published posts, T theme pages, R redirect rules — one pass over
 *   each, no nested iteration. Products add O(K) for K storefront products. All four sources are
 *   already loaded in full by their own repos (no pagination exists yet anywhere in this codebase),
 *   so this makes no additional query-shape assumption beyond what those repos already commit to.
 */
/**
 * Enumerates a static theme's own pages as routes, skipping `index`/`404` (handled elsewhere) and
 * template shells (see file header), and skipping any page whose slug a post has claimed (per the
 * same `overridesThemePage` tri-state the live resolver uses). Non-static themes contribute none.
 */
function buildThemePageRoutes(
  theme: DiscoveredTheme,
  postBySlug: ReadonlyMap<string, PostRecord>
): { routes: ManifestRoute[]; shadowedSlugs: ReadonlySet<string> } {
  const routes: ManifestRoute[] = [];
  const shadowedSlugs = new Set<string>();
  if (theme.manifest.tier !== "static") return { routes, shadowedSlugs };

  for (const pageId of Object.keys(theme.pages)) {
    // `index`/`404`/template-shell exclusion, shared with the live `GET /:slug` resolver rather
    // than respelled here — see `isStandaloneThemePage`'s own doc (`features/theme/theme.ts`).
    if (!isStandaloneThemePage(theme, pageId)) continue;

    const collidingPost = postBySlug.get(pageId);
    if (collidingPost && collidingPost.overridesThemePage !== false) continue; // the post loop adds it instead.

    routes.push({ path: `/${pageId}`, kind: "theme-page", label: pageId });
    shadowedSlugs.add(pageId);
  }
  return { routes, shadowedSlugs };
}

/** Every published post/page not shadowed by a theme-owned static page at the same slug. */
function buildPostRoutes(posts: readonly PostRecord[], shadowedSlugs: ReadonlySet<string>): ManifestRoute[] {
  const routes: ManifestRoute[] = [];
  for (const post of posts) {
    if (shadowedSlugs.has(post.slug)) continue;
    routes.push({ path: postPublicPath(post.slug), kind: post.kind === "page" ? "page" : "post", label: post.title });
  }
  return routes;
}

/**
 * Resolves theme + post routes together (the post loop needs the theme's shadowed-slug set). When
 * no theme was discovered, records the `no-theme` skip and returns no routes/`activeTheme` — a real,
 * reportable state rather than a crash (see file header).
 */
function resolveThemeAndPostRoutes(
  theme: DiscoveredTheme | undefined,
  posts: readonly PostRecord[],
  skipped: ManifestSkip[]
): { activeTheme?: RouteManifest["activeTheme"]; routes: ManifestRoute[] } {
  if (!theme) {
    skipped.push({
      reason: "no-theme",
      detail: "no valid theme discovered for this workspace — only '/' and the 404 probe could be enumerated",
    });
    return { routes: [] };
  }

  const activeTheme: RouteManifest["activeTheme"] = { id: theme.manifest.id, dir: theme.dir, apiVersion: theme.manifest.apiVersion };
  const postBySlug = new Map<string, PostRecord>(posts.map((post) => [post.slug, post]));
  const { routes: themeRoutes, shadowedSlugs } = buildThemePageRoutes(theme, postBySlug);
  return { activeTheme, routes: [...themeRoutes, ...buildPostRoutes(posts, shadowedSlugs)] };
}

/** The product grid + one detail route per storefront product — omitted entirely when there are none. */
function buildProductRoutes(products: readonly RouteManifestProduct[]): ManifestRoute[] {
  if (products.length === 0) return [];
  const routes: ManifestRoute[] = [{ path: "/products", kind: "product-list", label: "products" }];
  for (const product of products) {
    routes.push({ path: `/products/${product.id}`, kind: "product", label: product.title });
  }
  return routes;
}

/** `exact` redirect rules become routes; every other match type is recorded in `skipped` (see file header). */
function buildRedirectRoutes(redirectRules: readonly RedirectRecord[], skipped: ManifestSkip[]): ManifestRoute[] {
  const routes: ManifestRoute[] = [];
  for (const rule of redirectRules) {
    if (rule.matchType !== "exact") {
      skipped.push({
        reason: "non-exact-redirect",
        detail: `${rule.matchType} rule '${rule.fromPattern}' -> '${rule.toTarget}' matches a family of paths, not one enumerable path`,
      });
      continue;
    }
    routes.push({
      path: rule.fromPattern,
      kind: "redirect",
      label: rule.fromPattern,
      redirectTarget: rule.toTarget,
      redirectStatusCode: rule.statusCode,
    });
  }
  return routes;
}

export async function buildRouteManifest(deps: RouteManifestDeps): Promise<RouteManifest> {
  const routes: ManifestRoute[] = [
    { path: "/", kind: "home", label: "home" },
    // Convention-addressed files: nothing in any rendered page LINKS to these — browsers and
    // crawlers request them by name — so a crawl-based asset discovery pass (site-exporter.ts)
    // structurally cannot find them. All three are always-registered routes regardless of settings
    // (`registerSeoRobotsRoute`/`registerSeoSitemapRoute`/`registerLlmsTxtRoute`, mounted
    // unconditionally by `modules/seo.ts`; `sitemapEnabled` only gates whether `robots.txt`
    // ADVERTISES the sitemap URL, not whether `/sitemap.xml` itself responds), so — unlike
    // favicon/manifest below — they belong in the manifest proper rather than in `skipped`.
    { path: "/robots.txt", kind: "well-known", label: "robots.txt" },
    { path: "/sitemap.xml", kind: "well-known", label: "sitemap.xml" },
    { path: "/llms.txt", kind: "well-known", label: "llms.txt" },
  ];
  const skipped: ManifestSkip[] = [
    // Also convention-addressed and also invisible to a crawl — but unlike robots.txt/sitemap.xml,
    // Tovu registers no `/favicon.ico` or web-app-manifest route at all today (grep-confirmed
    // against `server/app.ts`/`server/routes/site/*`), so there is nothing here to enumerate, not a
    // route this manifest failed to find. Recorded so the export report names the gap rather than
    // looking complete — the fix, if wanted, is a product-level route, not an exporter change.
    {
      reason: "no-favicon-or-manifest-route",
      detail: "Tovu has no /favicon.ico or web-app-manifest route today — nothing to export for either convention",
    },
  ];

  const [activeThemeId, { posts }] = await Promise.all([deps.resolveActiveThemeId(), deps.listPublishedPosts()]);

  const theme = resolveActiveTheme(deps, activeThemeId);
  // Slugs claimed by a theme-owned static page THIS pass are tracked inside `resolveThemeAndPostRoutes`
  // so the post loop can skip a post shadowed at its own slug (pages.ts:765-786: tri-state
  // `overridesThemePage` — post wins unless the stored value is explicitly `false`; see that
  // resolver's own doc for the full contract). Mirrored here rather than shared code so the exported
  // manifest matches exactly what the live site would serve for the same row.
  // `resolveActiveTheme` returns `null` for "no active theme"; this helper's parameter is optional
  // (`| undefined`). Both mean the same absent-theme case, so normalize rather than widening the
  // helper's signature to accept two spellings of nothing.
  const { activeTheme, routes: themeAndPostRoutes } = resolveThemeAndPostRoutes(
    theme ?? undefined,
    posts,
    skipped
  );
  // Content-owned homepage (SPEC-0XX): a `kind: "page"` row may claim the reserved "/" slug and
  // `buildPostRoutes` above already resolves its path through the same `postPublicPath` the live
  // `GET /` handler uses, so it can appear in `themeAndPostRoutes` at path "/" too. The seeded
  // `{ path: "/", kind: "home" }` entry above is what the live site serves ONLY when no such page
  // exists — replace it with the real page's route instead of pushing a second, duplicate "/" entry,
  // the same "post wins over what the manifest would otherwise show at this path" shape
  // `buildThemePageRoutes`'s own `shadowedSlugs` already applies for a theme-owned static page.
  const homePageRouteIndex = themeAndPostRoutes.findIndex((route) => route.path === "/");
  if (homePageRouteIndex !== -1) {
    const [homePageRoute] = themeAndPostRoutes.splice(homePageRouteIndex, 1);
    routes[0] = homePageRoute;
  }
  routes.push(...themeAndPostRoutes);

  const products = await deps.resolveStorefrontProducts();
  routes.push(...buildProductRoutes(products));

  const redirectRules = await deps.redirectRepo.list({ workspaceId: deps.workspaceId, status: "active" });
  routes.push(...buildRedirectRoutes(redirectRules, skipped));

  const claimedPaths = new Set(routes.map((route) => route.path));
  routes.push({ path: chooseNotFoundProbePath(claimedPaths), kind: "not-found", label: "404" });

  return { routes, skipped, activeTheme };
}

/** Constructs a {@link RouteManifestPort} bound to one workspace's deps — the DI seam callers
 *  (the exporter engine, the CLI command, tests) depend on instead of the free function above. */
export function createRouteManifestReader(deps: RouteManifestDeps): RouteManifestPort {
  return { build: () => buildRouteManifest(deps) };
}
