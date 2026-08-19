import { randomUUID } from "node:crypto";

import { listPublishedPosts } from "#src/features/post/index";
import type { PostRecord } from "#src/features/post/index";
import { resolveActiveTheme } from "#src/features/theme/index";
import { resolveActiveThemeId } from "#src/features/presentation/index";
import type { RouteDeps } from "../server/routes/types.js";
import type { ManifestRoute, ManifestSkip, RouteManifest, RouteManifestPort } from "./ports.js";

/**
 * @file The one implementation of {@link RouteManifestPort} (`ports.ts`).
 *
 * Reuses the SAME selection logic the real public routes render with — rather than re-deriving
 * "which theme is active" or "which products are live" a second time, so a manifest built from
 * independent logic could never silently drift from what the routes it is describing actually do.
 * Two different mechanisms as of 2026-08-16 (export<->server decoupling, edge 2 — see
 * `ADS-memory/reports/2026-08-16-export-edge-decoupling.md`), chosen per-function rather than
 * uniformly, because the two cases are not actually the same shape:
 * - `resolveActiveThemeId`/`resolveActiveTheme` are pure `(deps) => value` queries with zero
 *   `req`/`res`/routing coupling, so they moved to feature-owned homes and are imported directly,
 *   same as any other feature-owned function — but NOT the same home: `resolveActiveThemeId` has
 *   zero theme-data dependency (only reads presentation settings), so it lives in
 *   `#src/features/presentation/index` (`active-theme-id.ts`); `resolveActiveTheme` genuinely needs
 *   theme data, so it lives in `#src/features/theme/index` (`active-theme.ts`). Splitting them
 *   (rather than one combined file, since every real call site uses both together) avoided a
 *   measured `check:architecture` largest-SCC regression a combined home would have caused — see
 *   `active-theme.ts`'s own file header for the trace.
 * - `resolveStorefrontProducts` stays in `server/routes/site/products.ts` — its return type
 *   (`SiteProduct`, `server/http/site/render.ts`) is deliberately off-limits to `features/commerce`
 *   (see `storefront.ts`'s own file header), so moving it would violate that existing boundary
 *   instead of respecting it. Reused via `RouteDeps.resolveStorefrontProducts` injection instead
 *   (`deps.resolveStorefrontProducts(deps)` below) — the same shape `runExportSite`/`createSiteApp`
 *   already establish on this same type.
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
 * The full `RouteDeps` composition-root object, not a narrow `Pick`. `resolveActiveThemeId`
 * (`#src/features/presentation/index`) and `resolveActiveTheme` (`#src/features/theme/index`) each
 * only need their own narrow `ActiveThemeIdResolutionDeps`/`ActiveThemeResolutionDeps` —
 * `RouteDeps` is a structural superset of both, so passing it through works with no cast — but
 * `deps.resolveStorefrontProducts(deps)` below needs the injected field itself, which only exists
 * on the real `RouteDeps` shape. A real `RouteDeps` object (what `createApp`/`serve.ts` already
 * build) always satisfies this trivially; only a test needs to assemble one, and every route test
 * in this repo already does via `createRouteDeps()`.
 */
export type RouteManifestDeps = RouteDeps;

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
export async function buildRouteManifest(deps: RouteManifestDeps): Promise<RouteManifest> {
  const routes: ManifestRoute[] = [
    { path: "/", kind: "home", label: "home" },
    // Convention-addressed files: nothing in any rendered page LINKS to these — browsers and
    // crawlers request them by name — so a crawl-based asset discovery pass (site-exporter.ts)
    // structurally cannot find them. Both are always-registered routes regardless of settings
    // (`registerSeoRobotsRoute`/`registerSeoSitemapRoute`, mounted unconditionally in `app.ts`;
    // `sitemapEnabled` only gates whether `robots.txt` ADVERTISES the sitemap URL, not whether
    // `/sitemap.xml` itself responds), so — unlike favicon/manifest below — they belong in the
    // manifest proper rather than in `skipped`.
    { path: "/robots.txt", kind: "well-known", label: "robots.txt" },
    { path: "/sitemap.xml", kind: "well-known", label: "sitemap.xml" },
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

  const [activeThemeId, { posts }] = await Promise.all([
    resolveActiveThemeId(deps),
    listPublishedPosts({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId } }),
  ]);

  const theme = resolveActiveTheme(deps, activeThemeId);
  let activeTheme: RouteManifest["activeTheme"];
  if (!theme) {
    skipped.push({
      reason: "no-theme",
      detail: "no valid theme discovered for this workspace — only '/' and the 404 probe could be enumerated",
    });
  } else {
    activeTheme = { id: theme.manifest.id, dir: theme.dir };
    const postBySlug = new Map<string, PostRecord>(posts.map((post) => [post.slug, post]));
    // Slugs claimed by a theme-owned static page THIS pass, so the post loop below can skip a post
    // that is shadowed at its own slug (pages.ts:765-786: tri-state `overridesThemePage` — post wins
    // unless the stored value is explicitly `false`; see that resolver's own doc for the full
    // contract). Mirrored here rather than shared code so the exported manifest matches exactly what
    // the live site would serve for the same row — a mismatch here would make an exported site
    // disagree with its own live preview about which resource wins a collision.
    const shadowedSlugs = new Set<string>();

    if (theme.manifest.tier === "static") {
      const templateShellStems = new Set((theme.manifest.templates ?? []).map((file) => file.replace(/\.html$/, "")));
      for (const pageId of Object.keys(theme.pages)) {
        // "index"/"404" are home and the not-found page respectively — both handled elsewhere in
        // this function, never as their own `/index` or `/404` route. Template shells (see file
        // header) are never their own route regardless of tier.
        if (pageId === "index" || pageId === "404" || templateShellStems.has(pageId)) continue;

        const collidingPost = postBySlug.get(pageId);
        // `null`/absent (never decided) and explicit `true` both mean the post wins, same as the
        // live resolver; only an explicit `false` keeps the theme page winning.
        if (collidingPost && collidingPost.overridesThemePage !== false) continue; // the post loop below will add it instead.

        routes.push({ path: `/${pageId}`, kind: "theme-page", label: pageId });
        shadowedSlugs.add(pageId);
      }
    }

    for (const post of posts) {
      if (shadowedSlugs.has(post.slug)) continue;
      routes.push({ path: `/${post.slug}`, kind: post.kind === "page" ? "page" : "post", label: post.title });
    }
  }

  const products = await deps.resolveStorefrontProducts(deps);
  if (products.length > 0) {
    routes.push({ path: "/products", kind: "product-list", label: "products" });
    for (const product of products) {
      routes.push({ path: `/products/${product.id}`, kind: "product", label: product.title });
    }
  }

  const redirectRules = await deps.redirectRepo.list({ workspaceId: deps.workspaceId, status: "active" });
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

  const claimedPaths = new Set(routes.map((route) => route.path));
  routes.push({ path: chooseNotFoundProbePath(claimedPaths), kind: "not-found", label: "404" });

  return { routes, skipped, activeTheme };
}

/** Constructs a {@link RouteManifestPort} bound to one workspace's deps — the DI seam callers
 *  (the exporter engine, the CLI command, tests) depend on instead of the free function above. */
export function createRouteManifestReader(deps: RouteManifestDeps): RouteManifestPort {
  return { build: () => buildRouteManifest(deps) };
}
