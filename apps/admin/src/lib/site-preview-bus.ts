/**
 * @file The open/re-open signal for `admin.show_site_page`'s `SitePreviewOverlay`.
 *
 * Modeled directly on `agent-screenshot-bus.ts`: fire-and-forget, no request/response, one broken
 * subscriber must not suppress the others — see that file's own module doc for the full "why a bus
 * rather than a prop" reasoning (the publisher is `App.hooks.tsx`'s `buildAdminCapabilityExecutors`,
 * an executor with no relationship to `App.tsx`'s render body beyond the `agentBridge` value it
 * already returns, which carries no signal for "show this path now").
 *
 * ## The one difference from `agent-screenshot-bus.ts`, and why it is NOT a bug to "fix"
 *
 * This bus carries a payload (`{ path: string }`); the screenshot bus carries none. That is not an
 * oversight to reconcile — the two subscribers render different things. The screenshot toast always
 * shows the same fixed, already-translated sentence, so its publish needs no argument.
 * `SitePreviewOverlay` renders WHATEVER path it was just told to show (and must re-render on a
 * second call for a DIFFERENT path while already open), so its publish has to carry that path. Do
 * not "simplify" this back to the no-payload shape.
 */

export interface SitePreviewRequest {
  /** The already-validated path to show — see `lib/site-preview-path.ts`'s
   *  `resolveAdminSitePreviewPath`, which the publisher calls before this ever fires. */
  readonly path: string;
}

type Listener = (request: SitePreviewRequest) => void;

const listeners = new Set<Listener>();

/**
 * Registers `listener`, called with the request every time `admin.show_site_page` shows a path.
 *
 * @returns A disposer; call it from the subscriber's effect cleanup. A listener that outlives its
 * component would set state on an unmounted one.
 * @complexity O(1).
 */
export function subscribeToSitePreview(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Notifies every subscriber that `admin.show_site_page` wants `request.path` shown.
 *
 * Never throws: a listener that throws is logged and the remaining listeners still run — matching
 * `agent-screenshot-bus.ts`'s `publishScreenshotCaptured`, since the publisher is executor code with
 * no sensible way to handle one subscriber's rendering failure, and one broken subscriber must not
 * suppress the notification to any other.
 *
 * @complexity O(n) in the listener count.
 */
export function publishSitePreview(request: SitePreviewRequest): void {
  for (const listener of [...listeners]) {
    try {
      listener(request);
    } catch (error) {
      console.error("[admin] site-preview listener failed", error);
    }
  }
}

/** Test seam — drops every listener. Not used in production code. */
export function resetSitePreviewBus(): void {
  listeners.clear();
}
