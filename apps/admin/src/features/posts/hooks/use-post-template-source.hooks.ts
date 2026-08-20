import { useEffect, useState } from "react";

import { resolveThemeLayout } from "@tovu/theme-layout";

import type { ThemeTier } from "../../../lib/api";
import { defaultPostTemplatePort } from "./post-template-dependencies.hooks";
import type { PostTemplatePort } from "./post-template-port.hooks";

/**
 * @file `PostTemplateModal`'s template-source fetch, split out per the `use-<thing>.hooks.ts`
 * convention. `port` is injected (see `post-template-port.hooks.ts`) rather than calling global
 * `fetch` directly, so a test can describe "this template loaded/failed" against
 * `createFakePostTemplatePort` instead of stubbing `fetch`.
 *
 * 2026-08-19 architecture audit finding 1: this used to build `/theme-assets/{theme}/pages/{file}`
 * unconditionally — the v1 layout. Every current static theme (`src/themes/static/basic` and its six
 * siblings) is `apiVersion: 2`, whose page templates live under `render/pages/`, so "View Template"
 * 404ed for every real built-in theme. `templateAssetUrl` now takes the active theme's `apiVersion`
 * and resolves the folder through `@tovu/theme-layout` — the same resolver `explore.ts`'s server route
 * uses — instead of a second, independently-spelled `pages`/`render/pages` literal.
 */

export type PostTemplateFetchState =
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
 * Fetches a static-tier theme's template source as plain text via the injected `port`. Kept out
 * of the component body so the three outcomes (loading/loaded/error) are the function's only
 * branches — no theme-tier decision in here, that gate lives in the caller
 * (`PostTemplateModal`'s render), which is also why this never fetches at all for a non-static
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
 * @param port - Injected {@link PostTemplatePort} — see `post-template-port.hooks.ts`.
 * @returns The current {@link PostTemplateFetchState}.
 * @complexity Time/space: O(n) in the fetched document's size — one request, no retry loop.
 */
export function useTemplateSource(
  themeId: string,
  themeTier: ThemeTier | null,
  themeApiVersion: 2 | undefined,
  templateFilename: string,
  port: PostTemplatePort,
): PostTemplateFetchState {
  const [state, setState] = useState<PostTemplateFetchState>({ status: "loading" });

  useEffect(() => {
    if (themeTier !== "static") return; // Nothing to fetch — the caller renders the tier explanation instead.
    // Declared fresh inside the effect body on every run (not a ref/module-level flag) so it is
    // naturally reset on each mount, including the second real mount StrictMode's dev-mode
    // mount->unmount->mount produces — see apps/admin/INFO.md's "disposed flag" trap.
    let cancelled = false;
    setState({ status: "loading" });
    port
      .fetchTemplateSource(templateAssetUrl(themeId, templateFilename, themeApiVersion))
      .then((html) => {
        if (!cancelled) setState({ status: "loaded", html });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setState({ status: "error", message: e instanceof Error ? e.message : "failed to load the template" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [themeId, themeTier, themeApiVersion, templateFilename, port]);

  return state;
}

/**
 * Binds the real `/theme-assets/...` fetch — see `post-template-dependencies.hooks.ts`.
 *
 * The zero-dependencies half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `PostTemplateModal.tsx` composes this and a test composes {@link useTemplateSource} with
 * `createFakePostTemplatePort`.
 *
 * @param themeId - See {@link useTemplateSource}.
 * @param themeTier - See {@link useTemplateSource}.
 * @param themeApiVersion - See {@link useTemplateSource}.
 * @param templateFilename - See {@link useTemplateSource}.
 * @returns The current {@link PostTemplateFetchState}.
 */
export function useWiredTemplateSource(
  themeId: string,
  themeTier: ThemeTier | null,
  themeApiVersion: 2 | undefined,
  templateFilename: string,
): PostTemplateFetchState {
  return useTemplateSource(themeId, themeTier, themeApiVersion, templateFilename, defaultPostTemplatePort);
}
