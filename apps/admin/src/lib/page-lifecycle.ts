/**
 * @file Whether this document is on its way out — the one fact `api.ts` needs to tell a request the
 * browser cancelled because of a navigation apart from a request that found no server.
 *
 * Chromium rejects a `fetch` still in flight when the page navigates with `TypeError: Failed to
 * fetch` — the same type and text as a refused connection — and does so AFTER `pagehide` has fired
 * (live-probed 2026-09-13: `beforeunload` → `pagehide` → `visibilitychange:hidden` → the rejection).
 * `pagehide` rather than `beforeunload` because only `pagehide` has a `pageshow` counterpart: a page
 * restored from the back/forward cache fires `pageshow`, and its requests must report real failures
 * again.
 *
 * Listeners are installed at import (guarded for non-browser environments) rather than lazily on the
 * first request, so a `pagehide` that lands before this module's first caller is never missed.
 */

let unloading = false;

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    unloading = true;
  });
  window.addEventListener("pageshow", () => {
    unloading = false;
  });
}

/**
 * True between `pagehide` and the next `pageshow` — i.e. while the document is being unloaded or sits
 * in the back/forward cache.
 *
 * @complexity O(1).
 */
export function isPageUnloading(): boolean {
  return unloading;
}
