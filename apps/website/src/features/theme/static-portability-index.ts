import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { PARTIAL_MARKER_TYPE, substituteMarkers, withInnerContentFinal, type EmbedMarker } from "#src/contracts/core/embeds/marker";
import { DEFAULT_THEME_SLOTS, loadTheme, type DiscoveredTheme } from "./theme.js";
import { resolveThemeLayout } from "./theme-layout.js";

/**
 * @file Milestone 5 — a generated root `index.html` for a `static`-tier theme, so the folder is a
 * self-contained portability backup: someone can take it to another vendor and open one file that
 * already looks like the real thing, without wiring it up to Tovu first.
 *
 * Not a live-render path. `static-render.ts`'s `renderStaticPage` serves the real site (Tovu-relative
 * asset URLs, real menu/content data resolved server-side); this module produces one static snapshot
 * that stands on its own — root-relative asset paths (the file sits at the theme's OWN root, one
 * level up from where a v2 theme's `render/pages/index.html` normally resolves `../css/`/`../scripts/`
 * from, or a v1 theme's `pages/index.html` resolves `../css/`/`../js/` from — see {@link
 * import("./theme-layout.js").resolveThemeLayout}, this module's own apiVersion-aware source of truth
 * for both shapes, 2026-08-19 architecture audit finding 5), design tokens inlined as real CSS (a
 * theme's own required stylesheet deliberately defines none of its own — see that file's own header on
 * every migrated theme), and no dependency on a live Tovu instance to look right.
 *
 * Two embed-marker categories, per the owner's decision (2026-08-18):
 * - `partial` (nav, footer): resolves to the theme's own `render/partials/*.html` — spliced in as
 *   real content, exactly like the live render path's `resolveSlots`, since the content already
 *   exists as a real file at generation time.
 * - Everything else (`menu`, `post`, `content`, `widget`, `media`): genuinely dynamic, cannot be
 *   resolved outside a running Tovu instance. Replaced with a literal, visible placeholder comment —
 *   never left blank, never invented. This applies even to a `menu` marker carrying real-looking
 *   authored fallback links (`nav.html`'s own `<a>` tags): that fallback is the THEME AUTHOR's guess
 *   at what a menu might contain, not necessarily what any real deployed site actually configures, so
 *   showing it as if it were the site's real navigation in a "portability backup" would misrepresent
 *   the real site — the same "never invent fake data" reasoning, not an oversight.
 *
 * Two-pass substitution (`spliceRootPartials` then `placeholderRemainingMarkers`) rather than one:
 * `nav.html`/`footer.html` themselves carry `menu` markers (confirmed against every real static theme
 * on disk) — a single pass over the ORIGINAL page HTML would never see those, since they only exist in
 * the page string after the partial's own content has been spliced in. Re-scanning after the splice is
 * what catches them.
 *
 * Generated, never hand-authored — same "regenerate the whole file, never patch it" contract
 * `preview/` already carries (`theme-files.ts`'s `isGeneratedThemePath`, extended here to also
 * recognize this single root file, not just a directory). Regeneration is a deliberate, explicit
 * action (`tovu theme generate-index <dir>`, `cli/commands/theme/generate-index.ts`) rather than
 * wired into a live write route — that decision, and which write paths (if any) should eventually
 * trigger it automatically, is left to whoever owns those routes next; see the handoff notes this
 * change shipped with.
 */

/** The literal placeholder every genuinely-dynamic marker collapses to. Visible in view-source (never
 * silently blank), and deliberately not real-looking copy — the whole point is that a reader can tell
 * this slot is not real content, not mistake it for the live site's actual menu/post/content. */
const LIVE_CONTENT_PLACEHOLDER = "<!-- live content when connected to Tovu -->";

/** The generated file's name, at the theme's own root — exported so `theme-files.ts`'s generated-path
 * recognition and `structure.ts`'s approved-roots list both name this file from the one place that
 * decides what it's called, rather than each hardcoding the literal string independently. */
export const STATIC_PORTABILITY_INDEX_FILENAME = "index.html";

/** `nav.html` -> `nav`; the key {@link DiscoveredTheme.partials} stores root partials under
 * (mirrors `static-render.ts`'s own private `partialIdFromSource`, not itself exported). */
function partialIdFromSource(source: string): string {
  return source.endsWith(".html") ? source.slice(0, -".html".length) : source;
}

/**
 * A theme's own page's `../css/`/`../js/`/`../scripts/` references are correct only from inside its
 * pages folder (`render/pages/` for v2, `pages/` for v1) — one directory level shallower than the
 * generated file's own location (the theme root). Rewritten to root-relative `{cssDir}/
 * {stylesheetFilename}` (this theme's own one required stylesheet, by name — v2 gets `css/theme.css`,
 * v1 gets `css/styles.css` — regardless of what the raw source currently spells; see this module's
 * own file header on why a migrated page's raw content cannot be trusted to already say the right
 * filename) and `{scriptsDir}/<path>` (folder possibly renamed, filename/subpath under it preserved).
 *
 * 2026-08-19 architecture audit finding 5: this used to hardcode v2's `css/theme.css`/`scripts/`
 * unconditionally, so running it against a real v1 theme (whose real files are `css/styles.css`/
 * `js/*.js`) produced a "valid"-looking portability page whose stylesheet and script URLs both
 * pointed at files that do not exist. The SOURCE pattern still matches either folder spelling
 * (`js` or `scripts`) — a genuinely migrated-but-unclean v2 theme's raw page may still literally say
 * `../js/...` — only the OUTPUT folder/filename is now `apiVersion`-aware, via `resolveThemeLayout`.
 *
 * @complexity O(n) over `html`'s length — two regex passes.
 */
function rewriteRootRelativeAssetPaths(html: string, apiVersion: 2 | undefined): string {
  const { cssDir, stylesheetFilename, scriptsDir } = resolveThemeLayout(apiVersion);
  const cssRewritten = html.replace(
    /href=(["'])\.\.\/css\/[^"']*\1/g,
    (_match, quote: string) => `href=${quote}${cssDir}/${stylesheetFilename}${quote}`
  );
  return cssRewritten.replace(
    /src=(["'])\.\.\/(?:js|scripts)\/([^"']*)\1/g,
    (_match, quote: string, rest: string) => `src=${quote}${scriptsDir}/${rest}${quote}`
  );
}

/** Escapes a string for literal use inside a `RegExp` — `resolveThemeLayout`'s two possible
 *  `stylesheetPath` values (`css/theme.css`, `css/styles.css`) both contain a `.`, which is
 *  otherwise a "match any character" wildcard rather than a literal dot. */
function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The same `:root`/`:root[data-theme="light"]` CSS custom-property block `static-render.ts`'s own
 * (private) `tokensToRootCss` emits at request time — duplicated rather than imported so this module
 * stays independent of that file's export surface; both are pure, four-line, and derived from the
 * identical `ThemeTokens` shape, so drift risk is low relative to widening a shared render-path file's
 * public API for one caller. */
function tokensToRootCss(theme: DiscoveredTheme): string {
  const darkLines = Object.entries(theme.tokens).map(([key, value]) => `  ${key}: ${value};`);
  const lightLines = Object.entries(theme.tokensLight).map(([key, value]) => `  ${key}: ${value};`);
  return `:root {\n${darkLines.join("\n")}\n}\n:root[data-theme="light"] {\n${lightLines.join("\n")}\n}`;
}

/** Stamps `defaultMode` onto `<html>` as `data-theme`, the selector {@link tokensToRootCss}'s light
 * block keys off — mirrors `static-render.ts`'s `injectColorMode`. No-ops when the manifest declares
 * no `defaultMode`, or when the raw page already carries its own `data-theme`. */
function injectDefaultColorMode(html: string, defaultMode: string | undefined): string {
  if (defaultMode === undefined) return html;
  return html.replace(/<html(?![^>]*\sdata-theme=)([^>]*)>/i, `<html$1 data-theme="${defaultMode}">`);
}

/** Inlines {@link tokensToRootCss}'s `<style>` block immediately before the (already root-relative)
 * stylesheet `<link>` — this theme's own stylesheet itself defines no custom properties, so without
 * this the page renders with every `var(--*)` reference undefined. No-ops (returns `html` unchanged)
 * if the stylesheet link is missing, matching the live render path's own warn-and-continue posture for
 * a page that does not carry the expected sentinel, rather than throwing.
 *
 * 2026-08-19 architecture audit finding 5: the link pattern used to hardcode v2's `css/theme.css`
 * unconditionally, so this silently no-op'd for a v1 theme even after {@link rewriteRootRelativeAssetPaths}
 * correctly rewrote its link to `css/styles.css` — the theme would render with every design-token CSS
 * variable undefined. Now built from `resolveThemeLayout(theme.manifest.apiVersion)`'s own
 * `stylesheetPath`, the same source of truth the asset-path rewrite just used. */
function injectTokenStyleBlock(html: string, theme: DiscoveredTheme): string {
  const { stylesheetPath } = resolveThemeLayout(theme.manifest.apiVersion);
  const linkPattern = new RegExp(`<link rel="stylesheet" href="${escapeForRegExp(stylesheetPath)}" />`);
  if (!linkPattern.test(html)) return html;
  return html.replace(linkPattern, (match) => `<style>\n${tokensToRootCss(theme)}\n</style>\n${match}`);
}

/**
 * Replace every `{"type":"partial"}` marker with the real partial content it names — the theme's own
 * `render/partials/*.html`, already loaded onto {@link DiscoveredTheme.partials} by `loadTheme()`. A
 * marker naming a slot the manifest does not declare, or whose partial file does not exist, is left
 * untouched here (picked up by {@link placeholderRemainingMarkers}'s later pass) rather than guessed.
 *
 * @complexity O(n) over `html`'s length for the marker scan, plus one map lookup per marker.
 */
function spliceRootPartials(html: string, theme: DiscoveredTheme): string {
  const slots = theme.manifest.slots ?? DEFAULT_THEME_SLOTS;
  return substituteMarkers(html, (marker) => {
    if (marker.type !== PARTIAL_MARKER_TYPE || marker.id === undefined) return undefined;
    const descriptor = slots[marker.id];
    if (descriptor === undefined) return undefined;
    return theme.partials[partialIdFromSource(descriptor.source)];
  });
}

/**
 * Every marker still present after {@link spliceRootPartials} — a genuinely dynamic type (`menu`,
 * `post`, `content`, `widget`, `media`), or a `partial` that did not resolve — collapses to
 * {@link LIVE_CONTENT_PLACEHOLDER}. Uses {@link withInnerContentFinal} (keeps the marker's own tag and
 * every OTHER authored attribute — `class`, `aria-label` — but strips `data-embed-config` itself)
 * rather than {@link withInnerContent} (which would keep `data-embed-config` too): unlike the live
 * render path, where a resolved menu marker stays a legitimate re-render target on the next request,
 * this generated file IS the final output — a one-shot portability snapshot nothing ever re-scans —
 * so the marker vocabulary has no reason to survive into it. Leaving it in would both fail to signal
 * "this slot is inert" as cleanly as the placeholder alone does, and leak Tovu-internal JSON into a
 * file explicitly meant to hand to another vendor with no Tovu dependency (see this module's own file
 * header). Matches the same "resolved-and-inert, never re-scanned" convention `resolveHtmlPageEmbeds`'s
 * own terminal content-marker splice already uses `withInnerContentFinal` for
 * (`resolve-html-format-content-markers.test.ts`'s "must be inert to a later re-scan" case).
 *
 * Run as its own full re-scan (not folded into {@link spliceRootPartials}'s single pass) specifically
 * so a `menu` marker nested INSIDE a just-spliced partial (`nav.html` itself carries one on every real
 * theme) is caught — it does not exist in the page string until after the splice runs.
 *
 * @complexity O(n) over `html`'s length for the marker scan.
 */
function placeholderRemainingMarkers(html: string): string {
  return substituteMarkers(html, (marker: EmbedMarker) => withInnerContentFinal(marker, LIVE_CONTENT_PLACEHOLDER));
}

/**
 * Build the generated root `index.html` for one already-loaded `static`-tier theme. Pure — no I/O, no
 * writes; {@link generateStaticPortabilityIndex} is the write wrapper.
 *
 * @returns The generated HTML, or `undefined` if `theme` is not `static`-tier or ships no `index` page
 * (every real static theme does — REQ-10 — but a hand-assembled/fixture theme might not).
 * @complexity O(n) over the index page's own HTML length — a fixed handful of linear passes.
 */
export function buildStaticPortabilityIndex(theme: DiscoveredTheme): string | undefined {
  if (theme.manifest.tier !== "static") return undefined;
  const source = theme.pages.index;
  if (source === undefined) return undefined;

  let html = rewriteRootRelativeAssetPaths(source, theme.manifest.apiVersion);
  html = injectDefaultColorMode(html, theme.manifest.defaultMode);
  html = injectTokenStyleBlock(html, theme);
  html = spliceRootPartials(html, theme);
  html = placeholderRemainingMarkers(html);
  return html;
}

export type GenerateStaticPortabilityIndexResult =
  | { readonly status: "written"; readonly path: string }
  | { readonly status: "skipped"; readonly reason: string };

/**
 * Load a `static`-tier theme from disk and (re)write its generated root `index.html` in place —
 * idempotent, always a full regenerate, never a patch (matches {@link buildStaticPortabilityIndex}'s
 * own "generated, not hand-authored" contract). The one write wrapper every caller (the CLI command,
 * and any future automatic hook) should share, rather than each re-deriving `loadTheme()` + the output
 * path independently.
 *
 * @returns `"skipped"` (with a human-readable reason) rather than throwing, for the ordinary,
 * expected cases this can't do anything about: the theme fails to load, it is not `static`-tier, or it
 * ships no `index` page. A caller iterating many themes can treat every result uniformly.
 * @complexity O(1) beyond `loadTheme`'s and {@link buildStaticPortabilityIndex}'s own bounded cost.
 */
export function generateStaticPortabilityIndex(
  required: { themeDir: string; id: string },
  _optional: Record<string, never> = {}
): GenerateStaticPortabilityIndexResult {
  const { themeDir, id } = required;
  const loaded = loadTheme({ themeDir, id, source: "built-in" });
  if (loaded.status !== "valid") {
    return { status: "skipped", reason: `theme failed to load (${loaded.status})` };
  }
  const html = buildStaticPortabilityIndex(loaded);
  if (html === undefined) {
    return { status: "skipped", reason: "not a static-tier theme, or ships no index page" };
  }
  const path = join(themeDir, STATIC_PORTABILITY_INDEX_FILENAME);
  writeFileSync(path, html, "utf8");
  return { status: "written", path };
}
