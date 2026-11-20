import { expandPartials } from "@jini-ai/cms/widgets/markers";
import { DEFAULT_THEME_SLOTS } from "../../contracts/core/theme-slots.js";
import { injectListingScript } from "@jini-ai/cms/listing";
import { injectMenuDropdownScript } from "@jini-ai/cms/navigation/dropdown";
import { escapeHtml } from "#src/platform/html/escape";
import { withEntryListStyleOnce } from "@jini-ai/cms/listing";
import { ENTRY_LIST_ATTRIBUTE, ENTRY_LIST_DEFAULT_STYLE } from "./entry-list-markup.js";
import { findUnrewrittenAssetPaths, rewriteAssetPaths, tokenStylesheetSentinel } from "./static-asset-contract.js";
import type { DiscoveredTheme, ThemeTokens } from "./theme.js";
import { themeTokenAliasDeclarations } from "./token-aliases.js";
import { type StaticMenuContent, injectMenuEmbeds } from "./static-render-menus.js";
import { type StaticPostPreview, type StaticListingBatch, type StaticPostPreviewsPage, injectPostPreviewsEmbeds } from "./static-render-previews.js";
import { type StaticFeaturedImage, injectFeaturedImage, injectPostAuthor } from "./static-render-content.js";
import { injectCollectionEmbeds } from "./static-render-collections.js";

/**
 * @file Real (non-spike) request-time rendering for `static`-tier themes.
 *
 * Ports the logic each static theme's own `theme preview build script` (an authoring-time stand-in written
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
function rewritePageLinks({ html }: { html: string }, _optional = {}): string {
  return html.replace(/href="([a-z0-9-]+)\.html"/g, (_m, name: string) => (name === "index" ? 'href="/"' : `href="/${name}"`));
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
function injectColorMode({ html, defaultMode }: { html: string; defaultMode: string | undefined }, _optional = {}): string {
  if (defaultMode === undefined) return html;
  return html.replace(/<html(?![^>]*\sdata-theme=)([^>]*)>/i, (_match, attributes: string) => `<html${attributes} data-theme="${escapeHtml({ text: defaultMode })}">`);
}

/**
 * {@link renderStaticPage}'s token step: insert the theme's design tokens as a `<style>` block just
 * before the exact sentinel {@link tokenStylesheetSentinel} picks for the theme's `apiVersion`. A page
 * without that sentinel is returned unchanged with a warning naming it — tokens are never guessed in.
 * @complexity O(n) in the page length.
 */
function injectTokenStylesheet(required: { html: string; theme: DiscoveredTheme; pageId: string }): string {
  const { html, theme, pageId } = required;
  const sentinel = tokenStylesheetSentinel({}, { apiVersion: theme.manifest.apiVersion });
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
  const unrewrittenAssetPaths = findUnrewrittenAssetPaths({ html }, { apiVersion });
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
  html = rewriteAssetPaths({ html, themeId: theme.manifest.id }, { apiVersion: theme.manifest.apiVersion });
  warnUnrewrittenAssetPaths({ html, theme, pageId });
  html = injectColorMode({ html, defaultMode: theme.manifest.defaultMode });
  html = expandPartials({ defaultSlots: DEFAULT_THEME_SLOTS, html: html, theme: theme });
  html = injectMenuEmbeds({ html, menus: menus ?? {} });
  html = injectPostPreviewsEmbeds({ html, previews: postPreviews ?? [], batches: postPreviewBatches ?? new Map() }, { page: postPreviewsPage });
  html = injectCollectionEmbeds({ html, lists: collectionLists ?? new Map() });
  html = injectFeaturedImage({ html, image: featuredImage });
  html = injectPostAuthor({ html, post: postAuthor });
  html = withEntryListStyleOnce({ html, attribute: ENTRY_LIST_ATTRIBUTE, style: ENTRY_LIST_DEFAULT_STYLE });
  html = rewritePageLinks({ html });
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
function wrapPartialInHostDocument({ partialHtml }: { partialHtml: string }, { apiVersion }: { apiVersion?: 2 } = {}): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Partial preview</title>
${tokenStylesheetSentinel({}, { apiVersion })}
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
  const rendered = renderStaticPage({
    theme,
    pageId: label,
    htmlOverride: wrapPartialInHostDocument({ partialHtml: html }, { apiVersion: theme.manifest.apiVersion }),
  });
  // htmlOverride is always supplied, so renderStaticPage's missing-source branch cannot run.
  if (rendered === null) throw new Error("Static theme fragment has no rendered page");
  return rendered;
}
