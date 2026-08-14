import { useEffect, useState } from "react";

import type { ThemeTier } from "../../../lib/api";
import { defaultPostTemplatePort } from "./post-template-dependencies.hooks";
import type { PostTemplatePort } from "./post-template-port.hooks";

/**
 * @file `PostTemplateModal`'s template-source fetch, split out per the `use-<thing>.hooks.ts`
 * convention. `port` is injected (see `post-template-port.hooks.ts`) rather than calling global
 * `fetch` directly, so a test can describe "this template loaded/failed" against
 * `createFakePostTemplatePort` instead of stubbing `fetch`.
 */

export type PostTemplateFetchState =
  | { status: "loading" }
  | { status: "loaded"; html: string }
  | { status: "error"; message: string };

/** `/theme-assets/{themeId}/pages/{templateFilename}` — the exact route
 *  `theme-static-assets.ts` serves a static-tier theme's `pages/*.html` under (verified live,
 *  2026-08-10: `GET /theme-assets/basic/pages/blog-sidebar-template.html` → 200 with the raw
 *  HTML). `encodeURIComponent` on both segments: a theme id or filename with a space/`#`/`?`
 *  would otherwise either 404 against the exact static path or get parsed as a query string. */
export function templateAssetUrl(themeId: string, templateFilename: string): string {
  return `/theme-assets/${encodeURIComponent(themeId)}/pages/${encodeURIComponent(templateFilename)}`;
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
 * @param templateFilename - The selected template's filename.
 * @param port - Injected {@link PostTemplatePort} — see `post-template-port.hooks.ts`.
 * @returns The current {@link PostTemplateFetchState}.
 * @complexity Time/space: O(n) in the fetched document's size — one request, no retry loop.
 */
export function useTemplateSource(
  themeId: string,
  themeTier: ThemeTier | null,
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
      .fetchTemplateSource(templateAssetUrl(themeId, templateFilename))
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
  }, [themeId, themeTier, templateFilename, port]);

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
 * @param templateFilename - See {@link useTemplateSource}.
 * @returns The current {@link PostTemplateFetchState}.
 */
export function useWiredTemplateSource(
  themeId: string,
  themeTier: ThemeTier | null,
  templateFilename: string,
): PostTemplateFetchState {
  return useTemplateSource(themeId, themeTier, templateFilename, defaultPostTemplatePort);
}
