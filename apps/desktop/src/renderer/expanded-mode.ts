/**
 * @file Immersive ("expanded") mode's decision rules, as plain functions.
 *
 * `useExpandedMode` (`App.hooks.ts`) owns the state; `App.tsx` owns the JSX. Every RULE either one
 * applies lives here instead, so it can be called with real inputs and asserted against directly.
 * This package has no React renderer at all — no jsdom, no testing-library, no react-test-renderer
 * — so a hook cannot be invoked from a test and a component cannot be mounted in one; see
 * `use-site-rename.hooks.test.ts`'s own header for the empirical verification of that, and
 * `folder-drop.ts` for the same extraction done for the same reason. Rules in this shape are
 * testable; the identical rules inlined in an effect body or a JSX guard are not.
 *
 * The invariant every rule here serves: expanded mode hides the only navigation there is, so the
 * operator must always keep a VISIBLE way back. That is why the workspace bar survives into
 * expanded mode (`App.tsx`'s `SiteWorkspace`) and why `workspaceOnScreen` and
 * `expandedAfterWorkspaceChange` are two halves of one guarantee. Escape is a convenience, never
 * the exit: a <webview> is a separate browsing context and does not bubble its keydowns out to
 * this document, so a keyboard rule cannot be the thing the operator depends on.
 */

/** The one key that collapses expanded mode. Nothing else is an exit. */
export const COLLAPSE_KEY = 'Escape';

/** The workspace bar's toggle: expanded mode's one deliberate on/off switch. */
export function nextExpanded(expanded: boolean): boolean {
  return !expanded;
}

/**
 * Expanded state after a keydown lands in Tovu's own chrome.
 *
 * Escape collapses; every other key leaves the mode exactly as it was. Collapsing something already
 * collapsed is a no-op — `expandedAfterKeyDown(false, 'Escape')` is `false` — which is what makes
 * this safe to call for any key and from any state rather than only from inside the listener that
 * is attached while expanded.
 */
export function expandedAfterKeyDown(expanded: boolean, key: string): boolean {
  if (key === COLLAPSE_KEY) return false;
  return expanded;
}

/**
 * Expanded state after the thing being expanded may have gone away.
 *
 * Expanded mode must never outlive its workspace. Closing the tab, deleting the project, or a
 * `desktop.navigate` call moving the nav elsewhere would otherwise leave Tovu's chrome hidden with
 * nothing immersed in it and no way back — so a false `showSiteTab` collapses unconditionally,
 * whatever the mode was.
 */
export function expandedAfterWorkspaceChange(expanded: boolean, showSiteTab: boolean): boolean {
  return showSiteTab ? expanded : false;
}

/**
 * Whether an open project's workspace is the one currently on screen.
 *
 * Load-bearing for expanded mode rather than merely cosmetic: the workspace bar lives inside that
 * section, and the bar is the only chrome expanded mode leaves standing. A workspace that goes off
 * screen takes the operator's way out with it, so this and `expandedAfterWorkspaceChange` have to
 * agree — whenever expanded mode can be on, exactly one workspace must satisfy this.
 */
export function workspaceOnScreen(input: {
  inSites: boolean;
  projectId: string;
  visibleWorkspaceId: string | null;
}): boolean {
  return input.inSites && input.projectId === input.visibleWorkspaceId;
}

/** Which pieces of Tovu's own chrome `App` renders. See `chromeVisibility`. */
export interface ChromeVisibility {
  // The top nav carries section links, the appearance menu and the theme control. Expanded mode
  // hides it: it is the chrome the operator asked to get out of the way.
  showTopNav: boolean;
  // The tab strip is a Projects mechanic (hence `inSites`) and Appearance layers over the whole
  // content area (hence `appearanceOpen`) — both predate expanded mode and are unchanged by it.
  showTabStrip: boolean;
}

/**
 * Which pieces of Tovu's own chrome are on screen, given the current mode.
 *
 * Expanded mode's whole visible effect, in one place: the top nav and the tab strip go away so the
 * active project's admin has the entire window. Nothing here can hide the workspace bar — that is
 * deliberate, not an omission. The bar is the exit, so it is not this function's to take away.
 */
export function chromeVisibility(input: {
  expanded: boolean;
  inSites: boolean;
  appearanceOpen: boolean;
}): ChromeVisibility {
  return {
    showTopNav: !input.expanded,
    showTabStrip: input.inSites && !input.appearanceOpen && !input.expanded,
  };
}
