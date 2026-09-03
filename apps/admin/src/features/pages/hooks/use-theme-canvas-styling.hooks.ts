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

/** The Tovu-owned canonical document-shell filename a `static`-tier theme ships for a `kind: "page"`,
 *  `bodyFormat: "html"` row with no explicit template choice — the browser-side twin of
 *  `STATIC_TIER_PAGE_SHELL_ID` in `apps/website/src/features/theme/static-render.ts` (see
 *  `resolveStaticTierPageShellFallback` there), which the live render path consults for exactly this
 *  case. That module is server/Node-only (its theme discovery reads real files off disk) and is not
 *  exposed through `@tovu/theme-layout`, the one deliberately-pure cross-runtime module this file
 *  already imports from (see this file's own header) — so its constant cannot be imported here the
 *  way `resolveThemeLayout` is. This is the one fact of theirs {@link resolveCanvasTemplateChoice}
 *  actually needs, kept in sync by hand: if the canonical filename ever changes, update both. */
const STATIC_TIER_PAGE_SHELL_TEMPLATE = "page-shell.html";

/**
 * What {@link useThemeCanvasStyling}'s `templateChoice` argument should actually be, given the page's
 * own `bodyFormat` — ordinarily `templateChoice` unchanged, except for an untemplated (`null`/`""`)
 * `html`-format Page, which the live render path (`resolveStaticTierPageShellFallback`, consulted by
 * `renderTemplateBranchIfEligible` in
 * `apps/website/src/server/inbound/public-http/routes/site/pages.ts`) renders through the active
 * theme's own {@link STATIC_TIER_PAGE_SHELL_TEMPLATE} when it ships one, instead of Tovu's generic
 * built-in chrome — see that function's own doc for the full "why". Before this existed, the
 * Interactive canvas asked for no template markup at all in this case, so it never derived a wrapper
 * and rendered the page full-bleed while the published page (the SAME row, through the SAME theme)
 * rendered inside the theme's real container.
 *
 * A `doc`-format Page is untouched — `bodyFormat !== "html"` short-circuits straight to
 * `templateChoice` unchanged. That shape already has its own, unaffected "never chosen" handling
 * (`isPageTemplateChoiceEligible` in `static-render.ts`), and this function must not reopen the
 * `terms-of-service`/blog-post-title regression that gate exists to prevent (see that function's own
 * doc). A real `templateChoice` — the operator picked one — always wins over the fallback.
 *
 * Fetching {@link STATIC_TIER_PAGE_SHELL_TEMPLATE} against a theme that does not ship one (every
 * non-`static` tier, and a `static` theme with no `page-shell.html`) fails harmlessly:
 * {@link useThemeCanvasStyling}'s own `fetchTemplateMarkup(...).catch(() => null)` already degrades
 * any fetch failure to "no wrapper" — the exact pre-existing behavior for this case. No theme-tier
 * check is needed here for that reason; the failed fetch IS the tier check.
 *
 * @param templateChoice - The page's own live template choice, same tri-state contract as
 *   {@link useThemeCanvasStyling}'s own parameter.
 * @param bodyFormat - The page's `bodyFormat`. `"doc"` — including "page not loaded yet", the
 *   caller's own conservative default — never triggers the fallback.
 * @returns The `templateChoice` to actually pass to {@link useThemeCanvasStyling}.
 * @complexity O(1) — one truthiness check, no I/O.
 */
export function resolveCanvasTemplateChoice(templateChoice: string | null, bodyFormat: "doc" | "html"): string | null {
  if (templateChoice) return templateChoice;
  return bodyFormat === "html" ? STATIC_TIER_PAGE_SHELL_TEMPLATE : templateChoice;
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
 * Which of a theme's two token sets the canvas renders against.
 *
 * `"dark"` selects the theme's DEFAULT set (`tokens.json`) — named "dark" because every theme this
 * repo ships declares `defaultMode: "dark"` (`basic`, `basic-2`, `tailark-dusk`,
 * `tailark-quartz-dark`, `tailark-quartz-libre`), so for all of them the default set IS the dark
 * one and that is the word an operator recognises from the site's own theme-toggle button. A theme
 * declaring `defaultMode: "light"` would make this label wrong; correcting it would mean reading
 * `defaultMode` out of the theme's `theme.json` (fetchable at `/theme-assets/{id}/theme.json`) and
 * labelling the control from it. Recorded as a known limitation, not fetched here — no such theme
 * exists yet, and the extra request would buy nothing today.
 *
 * `"light"` selects `tokens.light.json`, which is a fixed filename in the theme contract (see
 * {@link themeLightTokensUrl}) rather than a mode name derived from the manifest.
 */
export type ThemeCanvasMode = "dark" | "light";

/**
 * Builds the `:root` custom-property block the canvas needs, mirroring what
 * `features/theme/static-render.ts`'s `tokensToRootCss` emits into every real rendered page —
 * default-mode tokens on bare `:root`, light-mode tokens behind `[data-theme="light"]`.
 *
 * The canvas document sets no `data-theme` (GrapesJS owns its `<html>` and the host has no hook to
 * stamp an attribute on it), so in the default `"dark"` mode this renders the theme's default mode,
 * exactly as an un-toggled first visit to the live site does. That is also why `"light"` cannot work
 * by relying on the attribute selector: it would never match. Light mode instead promotes the light
 * tokens onto bare `:root`, emitted AFTER the default block — the same last-wins cascade the real
 * page gets from `[data-theme="light"]`, and a token the light set omits still resolves from the
 * default one rather than disappearing.
 *
 * @param tokens - The theme's default-mode tokens (`tokens.json`).
 * @param lightTokens - The theme's light-mode tokens, or `undefined` when it ships none — in which
 *   case `"light"` mode is a no-op and this returns exactly the default-mode CSS.
 * @param mode - Which set the canvas should render against. Defaults to `"dark"`, whose output is
 *   byte-identical to this function's pre-merge output.
 * @returns One CSS string. Empty when `tokens` holds nothing usable, which the caller treats as
 *   "this theme cannot style the canvas" rather than emitting an empty rule.
 * @complexity O(n) in the total number of tokens.
 */
export function tokensToCanvasCss(
  tokens: ThemeTokens,
  lightTokens: ThemeTokens | undefined,
  mode: ThemeCanvasMode = "dark",
): string {
  const block = (selector: string, entries: [string, string][]) =>
    entries.length === 0 ? "" : `${selector}{${entries.map(([k, v]) => `${k}:${v};`).join("")}}`;
  const defaultBlock = block(":root", Object.entries(tokens).filter(isSafeToken));
  if (!defaultBlock) return "";
  const lightSelector = mode === "light" ? ":root" : ':root[data-theme="light"]';
  return defaultBlock + block(lightSelector, Object.entries(lightTokens ?? {}).filter(isSafeToken));
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
 * @param mode - Which of the theme's two token sets to render against (see {@link ThemeCanvasMode}).
 *   Appended as a 5th, DEFAULTED parameter for the same reason `templateChoice` was: the existing
 *   4-argument call sites keep compiling and behaving byte-for-byte as before. Changing this re-runs
 *   the fetches — they are static assets the browser has already cached, and the resulting `pending`
 *   beat is what unmounts and remounts the canvas, which is the only way `InteractiveHtmlEditor`
 *   (which reads its styling once at mount) can pick up a new mode at all.
 * @returns The current {@link ThemeCanvasStylingState}.
 * @complexity Two-or-three requests per theme (three when `templateChoice` is set), no retry loop;
 *   O(n) in the token count to build the CSS, O(m) in the template markup's size to derive the wrapper.
 */
export function useThemeCanvasStyling(
  themeId: string | null,
  apiVersion: 2 | undefined,
  port: ThemeCanvasPort,
  templateChoice: string | null = null,
  mode: ThemeCanvasMode = "dark",
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
        const css = tokensToCanvasCss(tokens, lightTokens, mode);
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
  }, [themeId, apiVersion, port, templateChoice, mode]);

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
 * @param mode - See {@link useThemeCanvasStyling}.
 * @returns The current {@link ThemeCanvasStylingState}.
 */
export function useWiredThemeCanvasStyling(
  themeId: string | null,
  apiVersion: 2 | undefined,
  templateChoice: string | null = null,
  mode: ThemeCanvasMode = "dark",
): ThemeCanvasStylingState {
  return useThemeCanvasStyling(themeId, apiVersion, defaultThemeCanvasPort, templateChoice, mode);
}
