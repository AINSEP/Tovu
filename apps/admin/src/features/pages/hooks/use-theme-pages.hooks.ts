import { useEffect, useState } from "react";

import { api } from "../../../lib/api";

/**
 * @file The "Theme Pages" tab's data — the active theme's own bundled `pages/*.html` ids (`static`
 * tier only; `[]` for every other tier, see `presentation/get.ts`'s own computation). These are NOT
 * `PostRecord`s: no id, no editor, no delete — reading `activeThemeStaticPageIds` off the existing
 * `getPresentation()` response is the whole feature, so this hook is a thin fetch rather than a
 * second endpoint. Feature-local, same `use-<thing>.hooks.ts` convention as `use-pages.hooks.ts`.
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
export function useThemePages(): ThemePagesController {
  const [pageIds, setPageIds] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getPresentation()
      .then((r) => setPageIds(r.activeThemeStaticPageIds))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load theme pages"));
  }, []);

  return { pageIds, error };
}
