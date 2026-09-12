/**
 * @file Fetches one project's cached preview image on demand.
 *
 * `SiteRecord.previewVersion` (`contracts/project.ts`) is a version token, never the image — see
 * that field's own doc for why `useSitesPolling`'s 4s poll cannot carry a payload. This hook is the
 * on-demand fetch that token exists to trigger: it calls `SITE_IPC_CHANNELS.preview` once per
 * distinct version rather than once per poll.
 *
 * Refetches when `previewVersion` CHANGES, not when it "increases". The token is a filesystem
 * mtime (`site-preview-store.ts`), and a restored backup or a clock-skewed capture can move it
 * backward as easily as forward — a growth check would silently keep serving a stale image in
 * exactly that case. React's dependency-array comparison (`Object.is`) already does the right thing
 * here for free; the only discipline this file owes is not "improving" it into a `>` comparison.
 *
 * `previewFetchPlan` and `nextPreviewUrl` are pulled out as plain functions — same reason
 * `folder-drop.ts` was pulled out of `App.hooks.ts`: this package has no React renderer at all (no
 * jsdom, no testing-library, no react-test-renderer), so a decision left inside a `useEffect` body
 * is untestable without one. Between them they cover every decision the effect makes; the ONE thing
 * that stays inline is the `[id, previewVersion]` dependency array itself, because a dependency
 * array is React's own wiring — there is no way to observe "did this effect re-run" without a
 * renderer to run it in.
 */
import { useEffect, useState } from 'react';
import { runnerInventoryBridge } from './runner-api.js';
import type { RunnerInventoryBridge } from './runner-api.js';

export type PreviewFetchPlan =
  | { readonly kind: 'clear' }
  | { readonly kind: 'skip' }
  | { readonly kind: 'fetch'; readonly bridge: RunnerInventoryBridge; readonly id: string };

/**
 * What this effect run should do: clear the shown preview (no capture exists for this version, so
 * any URL held from a PRIOR id/version must not keep rendering under a card it no longer belongs
 * to), skip entirely (there IS a version to show, but no desktop bridge to ask), or fetch (the
 * bridge and id to ask it with). Checked in that order — a null version wins even when a bridge is
 * present, matching what the effect must do either way: show nothing.
 *
 * @complexity O(1).
 */
export function previewFetchPlan(
  id: string,
  previewVersion: number | null,
  bridge: RunnerInventoryBridge | undefined,
): PreviewFetchPlan {
  if (previewVersion === null) return { kind: 'clear' };
  if (bridge === undefined) return { kind: 'skip' };
  return { kind: 'fetch', bridge, id };
}

/**
 * What `setUrl` should be called with once `getSitePreview` settles, or `undefined` for "call
 * nothing at all" — this effect run was cancelled (a newer `id`/`previewVersion` started a fresh
 * request) before its own came back, and a stale result must not clobber whatever the newer run is
 * about to show.
 *
 * `outcome` is the settlement itself: `{ ok: true, url }` for a resolved `getSitePreview` (`url` is
 * `null` when there is genuinely no capture yet, which renders identically to a fetch that has not
 * resolved or one that failed — see this file's own `useSitePreview` doc), `{ ok: false }` for a
 * rejected one.
 *
 * @complexity O(1).
 */
export function nextPreviewUrl(
  cancelled: boolean,
  outcome: { readonly ok: true; readonly url: string | null } | { readonly ok: false },
): string | null | undefined {
  if (cancelled) return undefined;
  return outcome.ok ? outcome.url : null;
}

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
    const plan = previewFetchPlan(id, previewVersion, runnerInventoryBridge());
    if (plan.kind === 'clear') {
      setUrl(null);
      return;
    }
    if (plan.kind === 'skip') return;

    let cancelled = false;
    plan.bridge
      .getSitePreview(plan.id)
      .then((result) => {
        const next = nextPreviewUrl(cancelled, { ok: true, url: result });
        if (next !== undefined) setUrl(next);
      })
      .catch(() => {
        const next = nextPreviewUrl(cancelled, { ok: false });
        if (next !== undefined) setUrl(next);
      });
    return () => {
      cancelled = true;
    };
  }, [id, previewVersion]);

  return url;
}
