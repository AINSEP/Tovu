/**
 * @file Immersive mode's state. Split out of `App.hooks.ts` (which still re-exports it) with no
 * behaviour change; the window it listens on is now an injected port defaulting to `window`.
 */
import { useEffect, useState } from 'react';
import { expandedAfterKeyDown, expandedAfterWorkspaceChange, nextExpanded } from './expanded-mode.js';

/** The slice of `window` {@link useExpandedMode} listens on for Escape. */
export type KeydownTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>;

/**
 * Immersive mode: the active project's admin takes the whole window and Tovu's own chrome (top
 * nav, tab strip, fleet chat) gets out of the way. Owns both the state and the two rules that keep
 * it honest — it must never outlive the workspace it is immersing, and Escape must collapse it.
 *
 * @param showSiteTab whether a project's workspace is on screen (`deriveSitesHomeView`'s flag).
 * @param options.target where Escape is listened for; `window` unless a test supplies its own.
 */
export function useExpandedMode(
  showSiteTab: boolean,
  { target = window }: { target?: KeydownTarget } = {},
): {
  expanded: boolean;
  toggleExpanded: () => void;
} {
  const [expanded, setExpanded] = useState(false);

  // Expanded hides the only navigation there is, so it must never outlive the thing it was
  // expanding. Closing the tab, deleting the project, or a `desktop.navigate` call moving the nav
  // would otherwise leave the chrome hidden with nothing to be immersed in and no way back.
  useEffect(() => {
    setExpanded((on) => expandedAfterWorkspaceChange(on, showSiteTab));
  }, [showSiteTab]);

  // Escape collapses. This listener only sees keys pressed in Tovu's own chrome — a <webview>
  // is a separate browsing context and does not bubble its keydowns out to this document — so it
  // is a convenience, never the only exit. The bar's collapse button is the one that always works.
  // `expandedAfterKeyDown` returns the SAME value for every key that is not Escape, so the updater
  // form costs nothing for the other keys: React bails out of the re-render when state is unchanged.
  useEffect(() => {
    if (!expanded) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      setExpanded((on) => expandedAfterKeyDown(on, event.key));
    };
    target.addEventListener('keydown', onKeyDown);
    return () => target.removeEventListener('keydown', onKeyDown);
  }, [expanded, target]);

  const toggleExpanded = () => setExpanded(nextExpanded);

  return { expanded, toggleExpanded };
}
