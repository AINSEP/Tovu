/**
 * @file The one ⋮-menu action that is neither destructive nor a lifecycle change: handing a running
 * site's public surface to the operator's default browser.
 *
 * **Why it calls the bridge directly instead of arriving as a prop from `App.tsx`.** `onOpen` and
 * `onDelete` are drilled down three component levels because `App.tsx` owns the projects list and
 * has to react to them — a delete removes a card, an open adds a tab. This one does not: opening a
 * browser changes nothing in this window at all. `App.tsx:515`'s `openInBrowser` already calls
 * `openSiteExternal` the same way from the workspace bar.
 *
 * **Start is no longer here.** It was, back when the ⋮ menu was a stopped site's only way up; the
 * card now carries a labelled Start/Stop button of its own (`use-site-power.hooks.ts`), and a menu
 * entry doing the same thing would be the duplicate affordance that arrangement exists to avoid.
 * That hook needs the `SiteRecord` each call RESOLVES with, which is the other reason it is not
 * built on the error-swallowing `call` below.
 *
 * The error is deliberately swallowed to a returned string rather than thrown: this runs from a
 * menu item that has already closed, so there is no surface left to throw at.
 */
import { runnerInventoryBridge } from './runner-api.js';

export interface SiteActions {
  /** Open a running site's PUBLIC surface in the default browser. */
  openInBrowser: (id: string) => Promise<string | null>;
}

/**
 * The bridge-backed implementations, as a hook so `SiteGrid` can default-inject them the same way
 * it defaults `useDeleteConfirmation` — and so a test can pass spies without a `window.tovuRunner`.
 *
 * @complexity O(1) — no state, one thin wrapper.
 */
export function useSiteActions(): SiteActions {
  const call = async (act: (bridge: NonNullable<ReturnType<typeof runnerInventoryBridge>>) => Promise<unknown>) => {
    const bridge = runnerInventoryBridge();
    if (!bridge) return 'The desktop bridge is unavailable.';
    try {
      await act(bridge);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  };

  return {
    // `view: 'site'` — the PUBLIC site, not the admin. The workspace bar's own "Open in browser"
    // sends whichever surface that tab is showing, which is right there and wrong here: a card has
    // no current surface, and "open in browser" from a card means the website.
    openInBrowser: (id) => call((bridge) => bridge.openSiteExternal({ siteId: id, view: 'site' })),
  };
}
