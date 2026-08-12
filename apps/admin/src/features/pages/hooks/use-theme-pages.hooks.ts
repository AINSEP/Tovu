import { useEffect, useState } from "react";

import { defaultThemePagesPort } from "./theme-pages-dependencies.hooks";
import type { ThemePagesPort } from "./theme-pages-port.hooks";

/**
 * @file The "Theme Pages" tab's data — the active theme's own bundled `pages/*.html` ids (`static`
 * tier only; `[]` for every other tier, see `presentation/get.ts`'s own computation). These are NOT
 * `PostRecord`s: no id, no editor, no delete — reading `activeThemeStaticPageIds` off the existing
 * `getPresentation()` response is the whole feature, so this hook is a thin fetch rather than a
 * second endpoint. Feature-local, same `use-<thing>.hooks.ts` convention as `use-pages.hooks.ts`.
 *
 * `port` is injected — see `theme-pages-port.hooks.ts` — rather than importing `lib/api` directly,
 * so a test can describe the load against `createFakeThemePagesPort` instead of stubbing global
 * `fetch`. `useWiredThemePages` below is the zero-argument pair `Pages.tsx` actually mounts.
 */
export interface ThemePagesController {
  /** `null` until the initial load settles — the caller renders a loading state. `[]` once loaded
   *  means the active theme is genuinely not `static`-tier or ships no pages — not an error. */
  pageIds: string[] | null;
  error: string | null;
}

/**
 * @complexity Time/space: O(1) — one settings round trip on mount.
 */
export function useThemePages(port: ThemePagesPort): ThemePagesController {
  const [pageIds, setPageIds] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    port
      .getPresentation()
      .then((r) => setPageIds(r.activeThemeStaticPageIds))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load theme pages"));
  }, [port]);

  return { pageIds, error };
}

/**
 * Binds the real `/api/.../presentation` client — see `theme-pages-dependencies.hooks.ts`.
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `Pages.tsx` composes
 * this and a test composes {@link useThemePages} with `createFakeThemePagesPort`.
 */
export function useWiredThemePages(): ThemePagesController {
  return useThemePages(defaultThemePagesPort);
}
