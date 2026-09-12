/**
 * @file The two ⋮-menu actions that already had working IPC before this menu existed: starting a
 * stopped site, and handing a running one's public surface to the default browser.
 *
 * **Why these call the bridge directly instead of arriving as props from `App.tsx`.** `onOpen` and
 * `onDelete` are drilled down three component levels because `App.tsx` owns the projects list and
 * has to react to them — a delete removes a card, an open adds a tab. These two do not: `Start`'s
 * result is picked up by `useSitesPolling`'s 4s poll, which flips `status` to `running` on its own
 * (the same reason `SiteStartPanel` sets nothing locally on success — see its own doc), and
 * "Open in browser" changes nothing in this window at all.
 *
 * So this follows `SiteStartPanel`'s existing precedent rather than adding two more props to a
 * three-level chain for state that nothing up that chain needs to see. `App.tsx:515`'s
 * `openInBrowser` already calls `openSiteExternal` the same way from the workspace bar.
 *
 * Errors are deliberately swallowed to a returned string rather than thrown: these run from a menu
 * item that has already closed, so there is no surface left to throw at. A start that fails leaves
 * the card exactly as it was — stopped — which is the honest outcome, and `SiteStartPanel` inside
 * the tab is where an operator gets the reason.
 */
import { runnerInventoryBridge } from './runner-api.js';

export interface SiteActions {
  /** Ensure a site's `tovu serve` is up. Resolves to an operator-facing message on failure. */
  startSite: (id: string) => Promise<string | null>;
  /** Open a running site's PUBLIC surface in the default browser. */
  openInBrowser: (id: string) => Promise<string | null>;
}

/**
 * The bridge-backed implementations, as a hook so `SiteGrid` can default-inject them the same way
 * it defaults `useDeleteConfirmation` — and so a test can pass spies without a `window.tovuRunner`.
 *
 * @complexity O(1) — no state, two thin wrappers.
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
    startSite: (id) => call((bridge) => bridge.startSite(id)),
    // `view: 'site'` — the PUBLIC site, not the admin. The workspace bar's own "Open in browser"
    // sends whichever surface that tab is showing, which is right there and wrong here: a card has
    // no current surface, and "open in browser" from a card means the website.
    openInBrowser: (id) => call((bridge) => bridge.openSiteExternal({ siteId: id, view: 'site' })),
  };
}
