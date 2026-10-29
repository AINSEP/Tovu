import { useCallback as useQueryFetchCallback } from "react";
import { useFetchQuery } from "@jini-ai/ui/fetch-query";

import { resolveThemeLayout } from "@tovu/theme-layout";

import type { ThemeTier } from "@/lib/api";
import { defaultTemplateSourcePort } from "./template-source-dependencies.hooks";
import type { TemplateSourcePort } from "./template-source-port.hooks";

/**
 * @file `TemplateSourceModal`'s template-source fetch, split out per the `use-<thing>.hooks.ts`
 * convention. `port` is injected (see `template-source-port.hooks.ts`) rather than calling global
 * `fetch` directly, so a test can describe "this template loaded/failed" against
 * `createFakeTemplateSourcePort` instead of stubbing `fetch`.
 *
 * Moved here from `features/posts/hooks/use-post-template-source.hooks.ts` (2026-09-24): "View
 * Template" started as a Post-only affordance (2026-08-10), then `features/pages`' `PageEditor.tsx`
 * grew the identical eye-icon button/modal next to its own template picker — the fetch/URL-building
 * logic below was already feature-agnostic (it only ever took a theme id, tier, apiVersion and
 * filename, none of them Post-specific), so the move is a rename plus a relocation, not a rewrite.
 * `features/posts/PostEditor.tsx` and `features/pages/PageEditor.tsx` both import from here now,
 * instead of Pages copy-pasting a second implementation.
 *
 * 2026-08-19 architecture audit finding 1: this used to build `/theme-assets/{theme}/pages/{file}`
 * unconditionally — the v1 layout. Every current static theme (`src/themes/static/basic` and its six
 * siblings) is `apiVersion: 2`, whose page templates live under `render/pages/`, so "View Template"
 * 404ed for every real built-in theme. `templateAssetUrl` now takes the active theme's `apiVersion`
 * and resolves the folder through `@tovu/theme-layout` — the same resolver `explore.ts`'s server route
 * uses — instead of a second, independently-spelled `pages`/`render/pages` literal.
 */

export type TemplateSourceFetchState =
  | { status: "loading" }
  | { status: "loaded"; html: string }
  | { status: "error"; message: string };

/** `/theme-assets/{themeId}/{pagesDir}/{templateFilename}` — the exact route
 *  `theme-static-assets.ts` serves a static-tier theme's page templates under (verified live,
 *  2026-08-10: `GET /theme-assets/basic/render/pages/blog-sidebar-template.html` → 200 with the raw
 *  HTML). `pagesDir` comes from `resolveThemeLayout(apiVersion)` — `pages` for a v1 theme,
 *  `render/pages` for `apiVersion: 2`. `encodeURIComponent` on the theme id and filename segments: a
 *  theme id or filename with a space/`#`/`?` would otherwise either 404 against the exact static path
 *  or get parsed as a query string; `pagesDir`'s own `/` is intentionally left unencoded, matching a
 *  real static path segment. */
export function templateAssetUrl(themeId: string, templateFilename: string, apiVersion: 2 | undefined): string {
  const { pagesDir } = resolveThemeLayout(apiVersion);
  return `/theme-assets/${encodeURIComponent(themeId)}/${pagesDir}/${encodeURIComponent(templateFilename)}`;
}

/**
 * Route path (not a full URL — matches this app's `navigate()`, see `apps/admin/src/lib/router.ts`)
 * for the Theme Explore screen with this template preselected — `TemplateSourceModal`'s "Edit"
 * button target (owner ask, 2026-09-22). The viewer stays read-only; this only ever points the
 * operator at Explore, which is where the real edit happens.
 *
 * Builds the short `?page=<label>` form Theme Explore documents and writes for an ordinary page
 * (`theme-explore-url.hooks.ts`'s file header and `writeThemeExploreSelectionToUrl`), not the
 * longer `?file=<full path>` form — every template this modal can show is itself a static-tier
 * page template, so `resolveThemeExploreSelectionValue`'s label match (`kind === "page"`, basename
 * minus `.html`) always resolves it without needing `pagesDir` at all. Built with `URLSearchParams`,
 * matching that module's own encoding.
 *
 * @param themeId - The active theme id.
 * @param templateFilename - The selected template's filename (e.g. `posts-default.html`).
 * @returns A `/themes/explore?theme=...&page=...` route path.
 * @complexity O(1).
 */
export function templateEditUrl(themeId: string, templateFilename: string): string {
  const params = new URLSearchParams({ theme: themeId, page: templateFilename.replace(/\.html$/, "") });
  return `/themes/explore?${params.toString()}`;
}

/**
 * Fetches a static-tier theme's template source as plain text via the injected `port`. Kept out
 * of the component body so the three outcomes (loading/loaded/error) are the function's only
 * branches — no theme-tier decision in here, that gate lives in the caller
 * (`TemplateSourceModal`'s render), which is also why this never fetches at all for a non-static
 * theme.
 *
 * @param themeId - The active theme id — used to build the fetch URL.
 * @param themeTier - The active theme's capability tier. Only `"static"` triggers a fetch;
 *   anything else (including `null`, meaning the tier itself could not be determined) leaves this
 *   in its initial `loading` state forever, since the caller renders its own explanation instead
 *   of ever showing that state.
 * @param themeApiVersion - The active theme's manifest `apiVersion` — `2` or `undefined` (v1) — used
 *   to pick the right `pages`/`render/pages` folder via `templateAssetUrl`. Unknown-but-tier-known
 *   (e.g. presentation settings loaded but the theme's own `apiVersion` field wasn't in that
 *   response) is treated the same as `undefined` (v1), matching `resolveThemeLayout`'s own default.
 * @param templateFilename - The selected template's filename.
 * @param port - Injected {@link TemplateSourcePort} — see `template-source-port.hooks.ts`.
 * @returns The current {@link TemplateSourceFetchState}.
 * @complexity Time/space: O(n) in the fetched document's size — one request, no retry loop.
 */
export function useTemplateSource(
  themeId: string,
  themeTier: ThemeTier | null,
  themeApiVersion: 2 | undefined,
  templateFilename: string,
  port: TemplateSourcePort,
): TemplateSourceFetchState {
  // Keyed reads replace the cleanup flag: a prior route's source cannot populate this key.
  const queryFetch = useQueryFetchCallback(async () => {
    try { return await port.fetchTemplateSource(templateAssetUrl(themeId, templateFilename, themeApiVersion)); }
    catch (error) { throw new Error(error instanceof Error ? error.message : "failed to load the template"); }
  }, [port, themeId, themeApiVersion, templateFilename]);
  // Query ownership handles StrictMode cleanup/replay without a module-level disposed flag
  // surviving the second mount (apps/admin/INFO.md's disposed-flag trap).
  // Nothing to fetch — the caller renders the tier explanation instead for non-static themes.
  const query = useFetchQuery({ key: ["themes", "template-source", themeId, themeApiVersion ?? 1, templateFilename], fetch: queryFetch }, { enabled: themeTier === "static", staleTime: 0 });
  if (query.error) return { status: "error", message: query.error.message };
  if (query.data !== undefined) return { status: "loaded", html: query.data };
  return { status: "loading" };
}

/**
 * Binds the real `/theme-assets/...` fetch — see `template-source-dependencies.hooks.ts`.
 *
 * The zero-dependencies half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `TemplateSourceModal.tsx` composes this and a test composes {@link useTemplateSource} with
 * `createFakeTemplateSourcePort`.
 *
 * @param themeId - See {@link useTemplateSource}.
 * @param themeTier - See {@link useTemplateSource}.
 * @param themeApiVersion - See {@link useTemplateSource}.
 * @param templateFilename - See {@link useTemplateSource}.
 * @returns The current {@link TemplateSourceFetchState}.
 */
export function useWiredTemplateSource(
  themeId: string,
  themeTier: ThemeTier | null,
  themeApiVersion: 2 | undefined,
  templateFilename: string,
): TemplateSourceFetchState {
  return useTemplateSource(themeId, themeTier, themeApiVersion, templateFilename, defaultTemplateSourcePort);
}
