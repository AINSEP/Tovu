/**
 * @file Live site views: how many open project tabs keep a running `<webview>` guest at once.
 *
 * Every guest is a whole Chromium renderer process plus the site's admin bundle, so ten open tabs
 * used to mean ten of them, nine hidden. The limit (Settings "Loaded sites", 1–5, default 1) is
 * SOFT: the tab on screen always mounts its guest, and only then does this hook look for a hidden
 * one to release, least recently focused first. A guest is released only when it agrees to be.
 *
 * **The release probe.** `webview.executeJavaScript` dispatches a cancelable `beforeunload` and a
 * cancelable `jini:release-check` on the guest's `window`, then reads whether either was prevented.
 * `beforeunload` is what every editor's dirty guard (`useDirtyGuard`) already answers, so a post
 * with unsaved edits keeps its guest without any new code; `jini:release-check` is the composer's
 * and chat pane's own event (flush the draft, veto during an upload, unresolved send or running
 * reply) and the admin's route allowlist. Neither is prevented → the guest's route and scroll come
 * back in the same answer and the guest is unmounted. A guest that throws, rejects or never
 * answers is KEPT: a release is optional, discarding someone's work is not.
 *
 * If every hidden guest vetoes, the shell simply stays over the limit; the next focus change, tab
 * close or limit change tries again. There is no queue, no reservation and no polling.
 *
 * The admission hook itself is `@jini-ai/ui/live-views`'s `useLiveViews`; this file owns what is
 * this app's: the probe (which routes have audited guards, which element scrolls), the bridge lookup
 * and the "Loaded sites" bounds.
 */
import { useLiveViews as useGuestLiveViews, useSiteViewPreference, type LiveViews } from '@jini-ai/ui/live-views';
import { LIVE_SITE_VIEWS } from '../contracts/site-view-preference.js';
import { runnerInventoryBridge, type RunnerInventoryBridge } from './runner-api.js';

/** The admin's own scroll container (`.admin-content`, apps/admin `styles.css`): its window never
 *  scrolls, so `window.scrollY` alone would restore every admin page to the top. */
export const INNER_SCROLLER = '.admin-content';

/**
 * Runs in the GUEST, as a string: never built from a function's `toString()`, because a bundler's
 * helpers (esbuild's `__name`, say) would land inside it and throw in a page that has none.
 * `BeforeUnloadEvent` rather than a plain `Event` so a guard that only sets `returnValue` (or an
 * `onbeforeunload` that returns a string) counts as a veto too; the plain event is the fallback.
 */
export const RELEASE_PROBE = `(() => {
  try {
    // Only the admin has audited release guards. Public forms and embedded widgets can own
    // unsaved state without listeners, so absence of a veto there is not consent to destruction.
    if (!/^\\/admin(?:\\/|$)/.test(window.location.pathname)) return { release: false };
    let unload;
    try { unload = document.createEvent('BeforeUnloadEvent'); unload.initEvent('beforeunload', false, true); }
    catch { unload = new window.Event('beforeunload', { cancelable: true }); }
    window.dispatchEvent(unload);
    const check = new window.CustomEvent('jini:release-check', { cancelable: true });
    window.dispatchEvent(check);
    const prompted = typeof unload.returnValue === 'string' && unload.returnValue !== '';
    const kept = unload.defaultPrevented || prompted || check.defaultPrevented;
    const inner = document.querySelector(${JSON.stringify(INNER_SCROLLER)});
    return { release: !kept, url: window.location.href, x: window.scrollX, y: window.scrollY, innerY: inner ? inner.scrollTop : 0 };
  } catch { return { release: false }; }
})()`;

/**
 * Owns which open tabs keep their guest. `focusedId` is the tab on screen, `null` outside Websites
 * (every tab hidden, the last one focused still the most recent).
 */
export function useLiveViews({ openIds, focusedId }: { openIds: readonly string[]; focusedId: string | null }, {
  getBridge = runnerInventoryBridge,
  timeoutMs,
}: { getBridge?: () => RunnerInventoryBridge | undefined; timeoutMs?: number } = {}): LiveViews {
  return useGuestLiveViews(
    { openIds, focusedId, useSiteViewPreference, getBridge, bounds: LIVE_SITE_VIEWS, probe: RELEASE_PROBE },
    timeoutMs === undefined ? {} : { timeoutMs },
  );
}
