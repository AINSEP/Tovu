import { useCallback, useEffect, useState } from "react";

import { subscribeToSitePreview } from "../../../lib/site-preview-bus";

/**
 * @file `SitePreviewOverlay`'s open/close state and its subscription to `site-preview-bus.ts`.
 *
 * Deliberately does NOT `preventDefault()`/`stopPropagation()` on the Escape handler — same choice
 * `use-escape-to-cancel.hooks.ts` makes, and for the same reason: this overlay never traps focus or
 * blocks page interaction (the assistant dock must stay clickable while it is open — see
 * `2026-09-15-view-site-tool-PLAN.md` §Q6), so there is nothing here that NEEDS to swallow the event,
 * and swallowing it would only risk the jsdom `stopPropagation()`-false-RED trap this repo has hit
 * before (React root event delegation, no real `<details>` semantics).
 */
export interface UseSitePreviewOverlay {
  /** `true` once a path has been published and not yet closed. */
  open: boolean;
  /** The path currently shown, or `null` before the first publish / after close. */
  path: string | null;
  close: () => void;
}

export function useSitePreviewOverlay(): UseSitePreviewOverlay {
  const [path, setPath] = useState<string | null>(null);

  // Re-publishing a NEW path while already open must re-render with that new path, not just no-op —
  // see `site-preview-bus.ts`'s own header for why this bus carries a payload at all.
  useEffect(() => subscribeToSitePreview((request) => setPath(request.path)), []);

  const close = useCallback(() => setPath(null), []);

  useEffect(() => {
    if (path === null) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [path, close]);

  return { open: path !== null, path, close };
}
