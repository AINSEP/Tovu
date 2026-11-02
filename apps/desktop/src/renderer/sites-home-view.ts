/**
 * @file What `App` renders from section state + tab state + the polled project list, as plain
 * functions. Split out of `App.hooks.ts` (which still re-exports both) with no behaviour change.
 */
import type { RunnerSectionId } from '../contracts/sections.js';
import type { SiteRecord } from '../contracts/project.js';

export interface SitesHomeView {
  openSites: readonly SiteRecord[];
  // Tabs are a Projects mechanic. Every other section is a single Runner screen, so a strip above
  // one would advertise routes that section cannot take.
  inSites: boolean;
  activeSite: SiteRecord | undefined;
  showSiteTab: boolean;
  showSitesHome: boolean;
  visibleWorkspaceId: string | null;
  // Whether the (permanently mounted, see `CreateWebsiteHost` in `App.tsx`) create form should be
  // the thing on screen right now, as opposed to hidden behind Appearance, a project's workspace,
  // or a non-Projects section.
  showCreateForm: boolean;
}

/**
 * Everything `App` renders from that is a pure function of section state + tab state + the polled
 * project list: whether the sites grid, a project's workspace, or the create form is on screen,
 * and which one.
 *
 * A plain function, not a hook, and that is the point. It holds no state and calls nothing from
 * React, so the whole "which surface should be showing" rule set is exercisable by calling it with
 * an object — no renderer, no component, no hook harness.
 */
export function deriveSitesHomeView(input: {
  activeId: RunnerSectionId;
  appearanceOpen: boolean;
  activeTab: string | null;
  openTabs: readonly string[];
  projects: readonly SiteRecord[];
  isCreating: boolean;
}): SitesHomeView {
  const openSites = input.openTabs
    .map((id) => input.projects.find((project) => project.id === id))
    .filter((project): project is SiteRecord => project !== undefined);

  // Gating on `activeId` hides the strip without touching `openTabs`/`activeTab`, so navigating
  // away and back leaves the same tabs open.
  const inSites = input.activeId === 'projects';

  // A project deleted or lost between polls must not strand its tab pointing at nothing.
  const activeSite =
    input.activeTab === null ? undefined : openSites.find((p) => p.id === input.activeTab);
  // Deriving this from `inSites` as well — not from `activeTab` alone — is what makes a
  // project's workspace unreachable outside Projects rather than merely unlikely to be reached.
  const showSiteTab = inSites && activeSite !== undefined;
  const showSitesHome = !showSiteTab;
  // Every open project's workspace stays mounted (see `App`'s `<main>` body); this is the one that
  // is not hidden. Appearance layers over the whole content area, so it hides the workspace too.
  const visibleWorkspaceId = !input.appearanceOpen && showSiteTab ? input.activeTab : null;
  // The create form is a fourth layer competing for the same space as Appearance and a project's
  // workspace, so it is visible only when none of those are: not over Appearance, not over a
  // project tab, not over a non-Projects section.
  const showCreateForm = input.isCreating && !input.appearanceOpen && showSitesHome && inSites;

  return {
    openSites,
    inSites,
    activeSite,
    showSiteTab,
    showSitesHome,
    visibleWorkspaceId,
    showCreateForm,
  };
}

/** Derive root chrome and guest targets from the existing sites-home view.
 * Re-adding a tracked site opens its tab; folder failures stay on the websites view.
 * @param input The current sites-home view and the Add result notice.
 * @returns Chrome selection, the shared Find/Zoom target, and this tab's notice.
 * @complexity O(1) time and space.
 */
export function appPresentation(
  { showSiteTab, showSitesHome, appearanceOpen, activeTab, visibleWorkspaceId, addNotice }: {
    showSiteTab: boolean; showSitesHome: boolean; appearanceOpen: boolean;
    activeTab: string | null; visibleWorkspaceId: string | null;
    addNotice: { siteId: string; message: string } | null;
  }, _options = {},
): { onSitesHome: boolean; selectedTab: string | null; guestTarget: string | null; tabNotice: string | undefined } {
  return {
    onSitesHome: showSitesHome && !appearanceOpen,
    selectedTab: showSiteTab ? activeTab : null,
    guestTarget: showSiteTab ? visibleWorkspaceId : null,
    tabNotice: showSiteTab && addNotice?.siteId === activeTab ? addNotice.message : undefined,
  };
}
