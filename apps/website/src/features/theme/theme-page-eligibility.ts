import { RESERVED_SEGMENTS } from "#src/platform/routing/index";
import { type DiscoveredTheme } from "./theme.js";


/**
 * Page ids that live in `pages` but are never their own public URL: `index` is served at `/` by the
 * home route, and `404` is the error document `handlePostNotFoundOnSlugRoute` renders WITH a 404
 * status. Serving either at `/<id>` is a soft 404 — a real 200 response carrying error-page or
 * duplicate-home content, which search engines index as genuine.
 */
const NON_ROUTABLE_THEME_PAGE_IDS: ReadonlySet<string> = new Set(["index", "404"]);

/**
 * Whether `pageId` is a page SHAPE {@link isStandaloneThemePage}'s publish check can apply to at all —
 * every check that predicate makes EXCEPT the publish-state lookup itself: the page exists, isn't
 * `index`/`404`, and isn't a declared {@link ThemeManifest.templates} shell.
 *
 * Split out (2026-08-30) so the publish-toggle UI/route can tell "this isn't a publishable page at
 * all" (index, 404, a Post/Page template shell, or no such page) apart from "it's a real candidate
 * page that is currently turned off" — {@link isStandaloneThemePage} answers only the second question
 * once this one is already true, and re-deriving these same three checks a second time at the route
 * layer is exactly the drift this predicate's own history already warns against once (see that
 * function's own doc for the pre-2026 duplication this file fixed).
 *
 * @complexity O(t) over `manifest.templates`' length — 0–3 entries on every real theme on disk.
 */
export function isPublishableThemePageCandidate({ theme, pageId }: { theme: DiscoveredTheme; pageId: string }, _optional = {}): boolean {
  if (theme.pages[pageId] === undefined) return false;
  if (NON_ROUTABLE_THEME_PAGE_IDS.has(pageId) || RESERVED_SEGMENTS.has(pageId.toLowerCase())) return false;
  return !(theme.manifest.templates ?? []).some((entry) => entry.replace(/\.html$/, "") === pageId);
}

/**
 * Whether `pageId` is one of this theme's own standalone, publicly reachable pages — i.e. whether
 * `GET /<pageId>` should render it directly.
 *
 * **Why this exists as one shared predicate.** A static theme's `pages` record
 * (`DiscoveredTheme.pages`) holds two structurally identical but semantically different kinds of
 * entry under the same string keys: real standalone marketing pages (`about`, `pricing`, …) AND
 * content-embedding template shells a Post/Page selects via `templateChoice` (`blog-post`,
 * `page-shell`, …, declared in `manifest.templates` and validated by
 * {@link validateTemplateDeclarations} above). Nothing in the loaded theme shape distinguishes them
 * by type — only which OTHER list names a given key. A shell served directly is a document whose
 * `{"type":"content"}` marker was never substituted: structurally fine, content silently missing,
 * the exact failure class {@link validateTemplateDeclarations}'s own doc calls "the worst failure
 * class this codebase keeps hitting".
 *
 * The live `GET /:slug` resolver (`apps/website/src/server/inbound/public-http/routes/site/pages.ts`'s `isMarketingPageSlug`) and the
 * static exporter's route enumeration (`apps/website/src/features/site-export/route-manifest.ts`) both have to answer this same
 * question, and previously each spelled its own answer — the exporter excluded shells and `404`,
 * the live route excluded neither, so `/blog-post` and `/404` were publicly reachable 200s on the
 * running server while the export correctly omitted them. Two resolvers for one question is a
 * drift waiting to happen; this is the single one both now call.
 *
 * NOT tier-gated: `pages` is empty for every non-static theme (`loadStaticTierAssets`'s own early
 * return), and both callers already branch on `tier === "static"` for their own separate reasons
 * (the live route to pick a resolution strategy, the exporter to skip the theme entirely). Gating
 * here too would be a third copy of a guarantee that already holds twice over.
 *
 * **Publish state (2026-08-30 addition, off-by-default retroactively since the same day).** Once
 * every {@link isPublishableThemePageCandidate} check passes, this also consults
 * {@link ThemeManifest.publishedPages} — see that field's own doc for the absent-means-unpublished /
 * present-means-explicit-allow-list contract. Checked LAST, after every shape check above: a page
 * that isn't even a candidate is never "unpublished", it simply isn't a publishable page at all.
 *
 * @complexity O(t) over `manifest.templates`' length — 0–3 entries on every real theme on disk.
 */
export function isStandaloneThemePage({ theme, pageId }: { theme: DiscoveredTheme; pageId: string }, _optional = {}): boolean {
  if (!isPublishableThemePageCandidate({ theme, pageId })) return false;
  const { publishedPages } = theme.manifest;
  // No recorded decision on this theme at all — off by default (2026-08-30 owner correction,
  // applied retroactively to every theme, not only ones touched after this date). See
  // `ThemeManifest.publishedPages`'s own doc for the full history and the owner's own reasoning.
  if (publishedPages === undefined) return false;
  return publishedPages.includes(pageId);
}
