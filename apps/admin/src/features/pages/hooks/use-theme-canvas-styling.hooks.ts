import { useEffect, useState } from "react";

import type { CanvasStyling } from "@jini-ai/ui/html-editor";
import { resolveThemeLayout } from "@tovu/theme-layout";

import { defaultThemeCanvasPort } from "./theme-canvas-dependencies.hooks";
import type { ThemeCanvasPort, ThemeTokens } from "./theme-canvas-port.hooks";
import { deriveContentWrapperChain } from "./theme-canvas-wrapper";

/**
 * @file Resolves the CSS the Pages editor's Interactive tab renders its canvas against, so the
 * operator edits a page looking roughly like the published one instead of against browser defaults
 * (Times on white, which is what that tab showed for every page before this existed).
 *
 * The published page's appearance comes from two things, not one — `src/server/http/site/render.ts`
 * and `features/theme/static-render.ts` emit both into every rendered document:
 *
 * 1. `<link rel="stylesheet" href="/theme-assets/{themeId}/css/theme.css">` — the theme's own rules.
 * 2. An inline `:root { --bg: …; --fg: … }` block built from the theme's `tokens.json`.
 *
 * Only (1) is a fetchable stylesheet; (2) is generated per render and has no URL. Loading (1) alone
 * is not a partial improvement but a visual no-op — a v2 theme's `css/theme.css` reads `var(--x)`
 * exclusively and defines no token itself (that file's own header says so), so without (2) every
 * color, font, and spacing value resolves to nothing. That is why this hook fetches the token files
 * rather than just handing the editor a stylesheet URL, and why a failed token fetch falls all the
 * way back to no canvas styling at all instead of shipping the stylesheet on its own.
 */

/** `/theme-assets/{themeId}/{relativePath}` — `theme-static-assets.ts`'s `express.static` mount,
 *  reached from the admin origin in dev through `apps/admin/vite.config.ts`'s `/theme-assets` proxy
 *  rule. `encodeURIComponent` on the theme id only: a theme id containing a space or `?` would
 *  otherwise 404 or be parsed as a query string, while `relativePath`'s own `/` separators are real
 *  path segments and must stay unencoded. */
function themeAssetUrl(themeId: string, relativePath: string): string {
  return `/theme-assets/${encodeURIComponent(themeId)}/${relativePath}`;
}

/** The active theme's one required stylesheet, at the path its own `apiVersion` puts it
 *  (`css/theme.css` for v2, `css/styles.css` for v1) — resolved through `@tovu/theme-layout`, the
 *  same resolver the server render uses, rather than a second independently-spelled literal. */
export function themeStylesheetUrl(themeId: string, apiVersion: 2 | undefined): string {
  return themeAssetUrl(themeId, resolveThemeLayout(apiVersion).stylesheetPath);
}

/** The theme's default-mode token file. Required — `theme.ts` treats its absence as a load failure
 *  that invalidates the whole theme. */
export function themeTokensUrl(themeId: string): string {
  return themeAssetUrl(themeId, "tokens.json");
}

/** The theme's light-mode token file. Optional by contract (`theme.ts`: "absent is not an error, it
 *  just means the theme ships no light variant"), so a rejected fetch for this one is expected, not
 *  a failure. */
export function themeLightTokensUrl(themeId: string): string {
  return themeAssetUrl(themeId, "tokens.light.json");
}

/** A theme template's own raw markup — same `render/pages`(v2)/`pages`(v1) folder
 *  `resolveThemeLayout` already gives `themeStylesheetUrl`, just a template filename instead of the
 *  stylesheet. Marker still present, unresolved — see `theme-canvas-wrapper.ts`'s file header for what
 *  this is fed into. `templateChoice` is encoded (unlike `pagesDir`'s own `/`, a real path segment):
 *  it is one filename, never a path, so `encodeURIComponent` cannot legitimately need to leave
 *  anything in it unencoded the way `themeAssetUrl`'s `relativePath` sometimes does. */
export function templateMarkupUrl(themeId: string, apiVersion: 2 | undefined, templateChoice: string): string {
  return themeAssetUrl(themeId, `${resolveThemeLayout(apiVersion).pagesDir}/${encodeURIComponent(templateChoice)}`);
}

/** A token name must be a plain CSS custom property; a value must not contain any character that
 *  could terminate the declaration, the rule, or — the one that actually escalates — the `<style>`
 *  element itself. GrapesJS injects this CSS by string-concatenating it into `<style>…</style>` and
 *  parsing that as HTML (`FrameView.renderBody`), so a `</style>` inside a token value would escape
 *  into markup. Themes are downloadable from a marketplace, so their token files are not fully
 *  trusted input; an offending token is dropped rather than escaped, since no legitimate token value
 *  contains these at all. */
const SAFE_TOKEN_NAME = /^--[A-Za-z0-9_-]+$/;
const UNSAFE_TOKEN_VALUE = /[<>{};]/;

function isSafeToken([name, value]: [string, string]): boolean {
  return SAFE_TOKEN_NAME.test(name) && typeof value === "string" && !UNSAFE_TOKEN_VALUE.test(value);
}

/**
 * Builds the `:root` custom-property block the canvas needs, mirroring what
 * `features/theme/static-render.ts`'s `tokensToRootCss` emits into every real rendered page —
 * default-mode tokens on bare `:root`, light-mode tokens behind `[data-theme="light"]`. The canvas
 * document sets no `data-theme`, so it renders in the theme's default mode, exactly as an
 * un-toggled first visit to the live site does.
 *
 * @param tokens - The theme's default-mode tokens (`tokens.json`).
 * @param lightTokens - The theme's light-mode tokens, or `undefined` when it ships none.
 * @returns One CSS string. Empty when `tokens` holds nothing usable, which the caller treats as
 *   "this theme cannot style the canvas" rather than emitting an empty rule.
 * @complexity O(n) in the total number of tokens.
 */
export function tokensToCanvasCss(tokens: ThemeTokens, lightTokens: ThemeTokens | undefined): string {
  const block = (selector: string, entries: [string, string][]) =>
    entries.length === 0 ? "" : `${selector}{${entries.map(([k, v]) => `${k}:${v};`).join("")}}`;
  const defaultBlock = block(":root", Object.entries(tokens).filter(isSafeToken));
  if (!defaultBlock) return "";
  return defaultBlock + block(':root[data-theme="light"]', Object.entries(lightTokens ?? {}).filter(isSafeToken));
}

/** Pending until the token fetch settles, because `InteractiveHtmlEditor` reads its canvas styling
 *  once at mount and never again — a caller that mounted the editor while this was still resolving
 *  would get an unstyled canvas permanently. `ready` covers success AND every failure: on failure
 *  `styling` is `{}`, which reproduces the pre-existing unstyled canvas rather than blocking the
 *  tab on a theme asset the operator cannot do anything about. */
export type ThemeCanvasStylingState = { status: "pending" } | { status: "ready"; styling: CanvasStyling };

/** What a theme with no usable tokens resolves to — the exact behavior every caller had before this
 *  hook existed. */
const NO_CANVAS_STYLING: ThemeCanvasStylingState = { status: "ready", styling: {} };

/**
 * Fetches the active theme's tokens and pairs them with its stylesheet URL, as the `canvasStyling`
 * `@jini-ai/ui`'s `InteractiveHtmlEditor` accepts.
 *
 * @param themeId - The active theme's id, or `null` before presentation settings have loaded (stays
 *   `pending` until it arrives — the editor must not mount unstyled and then learn the theme).
 * @param apiVersion - The active theme's manifest `apiVersion`, used only to locate its stylesheet.
 *   Unknown is treated as v1, matching `resolveThemeLayout`'s own default.
 * @param port - Injected {@link ThemeCanvasPort} — see `theme-canvas-port.hooks.ts`.
 * @param templateChoice - The page's own selected template (same tri-state contract as
 *   `PageEditorController.templateChoice`: `null`/`""` both mean "no template", a filename fetches
 *   that template's markup) — appended as a 4th, DEFAULTED parameter rather than inserted earlier, so
 *   `use-page-editor.hooks.ts`'s existing 3-argument call site keeps compiling and behaving exactly as
 *   before (no wrapper) until it is deliberately updated to pass one. When given, this hook derives
 *   the real ancestor chain the template wraps `{"type":"content"}` in
 *   (`theme-canvas-wrapper.ts`'s `deriveContentWrapperChain`) and includes it as the returned
 *   styling's `contentWrapper` — see that module's own file header for what it does and why. Any
 *   failure along this path (fetch rejects, no marker found, markup unparseable) degrades to no
 *   wrapper rather than failing the whole canvas: `contentWrapper` is optional on `CanvasStyling`, and
 *   its absence reproduces the exact pre-existing "no wrapper" canvas.
 * @returns The current {@link ThemeCanvasStylingState}.
 * @complexity Two-or-three requests per theme (three when `templateChoice` is set), no retry loop;
 *   O(n) in the token count to build the CSS, O(m) in the template markup's size to derive the wrapper.
 */
export function useThemeCanvasStyling(
  themeId: string | null,
  apiVersion: 2 | undefined,
  port: ThemeCanvasPort,
  templateChoice: string | null = null,
): ThemeCanvasStylingState {
  const [state, setState] = useState<ThemeCanvasStylingState>({ status: "pending" });

  useEffect(() => {
    if (!themeId) return; // Still `pending` — presentation settings have not landed yet.
    // Declared fresh inside the effect body on every run (not a ref/module-level flag) so it is
    // naturally reset on each mount, including StrictMode's dev-mode mount->unmount->mount — see
    // apps/admin/INFO.md's "disposed flag" trap.
    let cancelled = false;
    setState({ status: "pending" });
    // `null` (no fetch at all) for "no template chosen" — resolved immediately rather than left out of
    // the `Promise.all` below, so readiness always waits on exactly one settle shape regardless of
    // whether a template is selected.
    const templateMarkup: Promise<string | null> = templateChoice
      ? port.fetchTemplateMarkup(templateMarkupUrl(themeId, apiVersion, templateChoice)).catch(() => null)
      : Promise.resolve(null);
    Promise.all([
      port.fetchThemeTokens(themeTokensUrl(themeId)),
      // A theme with no light variant is normal, not an error — see `themeLightTokensUrl`.
      port.fetchThemeTokens(themeLightTokensUrl(themeId)).catch(() => undefined),
      templateMarkup,
    ])
      .then(([tokens, lightTokens, markup]) => {
        if (cancelled) return;
        const css = tokensToCanvasCss(tokens, lightTokens);
        if (!css) {
          setState(NO_CANVAS_STYLING);
          return;
        }
        // `null` covers both "no template chosen" and "the fetch/derivation above found nothing
        // usable" — both fall back to no wrapper identically, per this function's own doc.
        const contentWrapper = markup ? (deriveContentWrapperChain(markup) ?? undefined) : undefined;
        setState({
          status: "ready",
          styling: { stylesheets: [themeStylesheetUrl(themeId, apiVersion)], css, contentWrapper },
        });
      })
      .catch(() => {
        if (!cancelled) setState(NO_CANVAS_STYLING);
      });
    return () => {
      cancelled = true;
    };
  }, [themeId, apiVersion, port, templateChoice]);

  return state;
}

/**
 * Binds the real `/theme-assets/...` fetch — the zero-dependencies half of the
 * `useX(dependencies)` / `useWiredX()` pair, so `PageEditor.tsx` composes this and a test composes
 * {@link useThemeCanvasStyling} with `createFakeThemeCanvasPort`.
 *
 * @param themeId - See {@link useThemeCanvasStyling}.
 * @param apiVersion - See {@link useThemeCanvasStyling}.
 * @param templateChoice - See {@link useThemeCanvasStyling}.
 * @returns The current {@link ThemeCanvasStylingState}.
 */
export function useWiredThemeCanvasStyling(
  themeId: string | null,
  apiVersion: 2 | undefined,
  templateChoice: string | null = null,
): ThemeCanvasStylingState {
  return useThemeCanvasStyling(themeId, apiVersion, defaultThemeCanvasPort, templateChoice);
}
