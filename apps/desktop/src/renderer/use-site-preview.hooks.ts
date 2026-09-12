/**
 * @file Fetches one project's cached preview image on demand.
 *
 * `SiteRecord.previewVersion` (`contracts/project.ts`) is a version token, never the image — see
 * that field's own doc for why `useSitesPolling`'s 4s poll cannot carry a payload. This hook is the
 * on-demand fetch that token exists to trigger: it calls `SITE_IPC_CHANNELS.preview` once per
 * distinct version rather than once per poll.
 *
 * Refetches when `previewVersion` CHANGES, not when it "increases". The token is a filesystem
 * mtime (`site-preview-store.js`), and a restored backup or a clock-skewed capture can move it
 * backward as easily as forward — a growth check would silently keep serving a stale image in
 * exactly that case. React's dependency-array comparison (`Object.is`) already does the right thing
 * here for free; the only discipline this file owes is not "improving" it into a `>` comparison.
 */
import { useEffect, useState } from 'react';
import { runnerInventoryBridge } from './runner-api.js';

/**
 * `null` until a capture exists, the fetch has not resolved yet, or the fetch failed — all three
 * render identically, as no image, which is exactly `.card__tile`'s existing fallback (the port
 * tile). The caller does not need to tell those apart: whichever it is, there is nothing to show.
 *
 * @complexity O(1) plus one IPC round trip per distinct `previewVersion`.
 */
export function useSitePreview(id: string, previewVersion: number | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    // No capture for this site (yet) — nothing to fetch, and any URL held from a PRIOR id/version
    // must not keep rendering under a card it no longer belongs to.
    if (previewVersion === null) {
      setUrl(null);
      return;
    }
    const bridge = runnerInventoryBridge();
    if (!bridge) return;

    let cancelled = false;
    bridge
      .getSitePreview(id)
      .then((result) => {
        if (!cancelled) setUrl(result);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [id, previewVersion]);

  return url;
}
