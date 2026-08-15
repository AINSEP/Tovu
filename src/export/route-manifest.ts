import { randomUUID } from "node:crypto";

import { listPublishedPosts } from "#src/features/post/index";
import type { PostRecord } from "#src/features/post/index";
import { resolveActiveTheme, resolveActiveThemeId } from "../server/routes/site/pages";
import { resolveStorefrontProducts } from "../server/routes/site/products";
import type { RouteDeps } from "../server/routes/types";
import type { ManifestRoute, ManifestSkip, RouteManifest, RouteManifestPort } from "./ports";

/**
 * @file The one implementation of {@link RouteManifestPort} (`ports.ts`).
 *
 * Reuses the SAME selection logic the real public routes render with —
 * `resolveActiveThemeId`/`resolveActiveTheme` (`server/routes/site/pages.ts`) and
 * `resolveStorefrontProducts` (`server/routes/site/products.ts`), both exported for exactly this
 * reuse — rather than re-deriving "which theme is active" or "which products are live" a second
 * time. A manifest built from independent logic could silently drift from what the routes it is
 * describing actually do; reusing the exact functions makes that drift structurally impossible.
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
 * The full `RouteDeps` composition-root object, not a narrow `Pick` — unlike the render-helper
 * `Pick`s in `pages.ts` (`TemplateRenderDeps` etc.), the reused functions this file calls
 * (`resolveActiveThemeId`, `resolveActiveTheme`, `resolveStorefrontProducts`) are themselves typed
 * against the full `RouteDeps`/`TemplateRenderDeps` shape, not a manifest-sized slice — narrowing
 * here would just move the type error to every call site below. A real `RouteDeps` object (what
 * `createApp`/`serve.ts` already build) always satisfies this trivially; only a test needs to
 * assemble one, and every route test in this repo already does via `createRouteDeps()`.
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
 * Builds the full {@link RouteManifest} for one workspace: home, every published post/page, every
 * theme-owned static marketing page not shadowed by a post, the product grid + each product detail
 * page (when any product exists), every statically-enumerable (`exact`-match, `active`) redirect
 * rule, and a collision-checked 404 probe. `prefix`/`wildcard`/`regex` redirect rules are recorded
 * in `skipped` rather than silently dropped — they match a FAMILY of paths, not one enumerable
 * path, so no finite manifest entry can represent them.
 *
 * Never throws for "no theme installed" — that is itself a real, reportable state (an export with
 * only `/` and a 404 probe, and a `skipped` entry explaining why), not a crash; every other error
 * (a repo failure, for instance) propagates uncaught, same as the live routes it mirrors.
 *
 * @complexity O(P + T + R) — P published posts, T theme pages, R redirect rules — one pass over
 *   each, no nested iteration. Products add O(K) for K storefront products. All four sources are
 *   already loaded in full by their own repos (no pagination exists yet anywhere in this codebase),
 *   so this makes no additional query-shape assumption beyond what those repos already commit to.
 */
export async function buildRouteManifest(deps: RouteManifestDeps): Promise<RouteManifest> {
  const routes: ManifestRoute[] = [{ path: "/", kind: "home", label: "home" }];
  const skipped: ManifestSkip[] = [];

  const [activeThemeId, { posts }] = await Promise.all([
    resolveActiveThemeId(deps),
    listPublishedPosts({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId } }),
  ]);

  const theme = resolveActiveTheme(deps, activeThemeId);
  if (!theme) {
    skipped.push({
      reason: "no-theme",
      detail: "no valid theme discovered for this workspace — only '/' and the 404 probe could be enumerated",
    });
  } else {
    const postBySlug = new Map<string, PostRecord>(posts.map((post) => [post.slug, post]));
    // Slugs claimed by a theme-owned static page THIS pass, so the post loop below can skip a post
    // that is shadowed at its own slug (pages.ts:749-779: the theme page wins unless the post has
    // explicitly opted into `overridesThemePage`).
    const shadowedSlugs = new Set<string>();

    if (theme.manifest.tier === "static") {
      const templateShellStems = new Set((theme.manifest.templates ?? []).map((file) => file.replace(/\.html$/, "")));
      for (const pageId of Object.keys(theme.pages)) {
        // "index"/"404" are home and the not-found page respectively — both handled elsewhere in
        // this function, never as their own `/index` or `/404` route. Template shells (see file
        // header) are never their own route regardless of tier.
        if (pageId === "index" || pageId === "404" || templateShellStems.has(pageId)) continue;

        const collidingPost = postBySlug.get(pageId);
        if (collidingPost?.overridesThemePage) continue; // the post loop below will add it instead.

        routes.push({ path: `/${pageId}`, kind: "theme-page", label: pageId });
        shadowedSlugs.add(pageId);
      }
    }

    for (const post of posts) {
      if (shadowedSlugs.has(post.slug)) continue;
      routes.push({ path: `/${post.slug}`, kind: post.kind === "page" ? "page" : "post", label: post.title });
    }
  }

  const products = await resolveStorefrontProducts(deps);
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

  return { routes, skipped };
}

/** Constructs a {@link RouteManifestPort} bound to one workspace's deps — the DI seam callers
 *  (the exporter engine, the CLI command, tests) depend on instead of the free function above. */
export function createRouteManifestReader(deps: RouteManifestDeps): RouteManifestPort {
  return { build: () => buildRouteManifest(deps) };
}
