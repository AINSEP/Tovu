/**
 * @file Which project tabs are open and which one is selected. Split out of `App.hooks.ts` (which
 * still re-exports it) with no behaviour change.
 */
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { runnerInventoryBridge, type BridgeLookup } from './runner-api.js';
import { tabAfterClose } from './site-shell-policy.js';
import { sameAdminPage, type SiteAdminPage } from './import-site-entry.js';

export interface ProjectTabsState {
  // Project ids with an open tab, in the order they were opened.
  openTabs: readonly string[];
  activeTab: string | null;
  setActiveTab: Dispatch<SetStateAction<string | null>>;
  /** `adminPage` sends the tab's admin to that page (the "Import site" entry); without it an
   *  already-open tab stays wherever it is. */
  openProjectTab: (id: string, options?: { adminPage?: SiteAdminPage }) => void;
  closeProjectTab: (id: string) => void;
  /** The admin page each tab was opened on, by project id. Absent = the admin's root. */
  adminPages: Readonly<Record<string, SiteAdminPage>>;
}

/**
 * Owns which project tabs are open and which one is selected — the state, and nothing derived
 * from it. Everything that was derived here now lives in `deriveSitesHomeView`, which needs section
 * state this hook does not have.
 *
 * `openProjectTab` only ever adds a tab and selects it — it does not itself ask main to start
 * anything. `SiteWorkspace` (`App.tsx`) is what shows a "not running" panel for a freshly opened
 * tab and lets the operator start it from there (`useSiteStart`), the same split Tovu-Runner's
 * own `App.hooks.ts` makes: opening a tab and starting a site are two different actions, one
 * instant and local, the other async and IPC-backed.
 */
export function useProjectTabs(
  _input: Record<string, never> = {},
  { getBridge = runnerInventoryBridge }: { getBridge?: BridgeLookup<'reportOpenSiteTabs'> } = {},
): ProjectTabsState {
  // `null` active tab means the sites home tab (Runner's own sections); a string means that project's
  // embedded admin.
  const [openTabs, setOpenTabs] = useState<readonly string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [adminPages, setAdminPages] = useState<Readonly<Record<string, SiteAdminPage>>>({});

  // Presence follows tabs, not loaded guests: hidden and unloaded open tabs keep their server awake.
  useEffect(() => {
    void getBridge()?.reportOpenSiteTabs?.({ siteIds: openTabs }).catch(error => {
      console.error('[tovu-desktop] report open site tabs:', error);
    });
  }, [getBridge, openTabs]);

  const openProjectTab = (id: string, options: { adminPage?: SiteAdminPage } = {}) => {
    setOpenTabs((current) => (current.includes(id) ? current : [...current, id]));
    setActiveTab(id);
    const { adminPage } = options;
    if (adminPage) setAdminPages((current) => (sameAdminPage({ a: current[id], b: adminPage }) ? current : { ...current, [id]: adminPage }));
  };

  const closeProjectTab = (id: string) => {
    // Resolve from the current tab order before removing the closed tab.
    setActiveTab((current) => tabAfterClose({ tabs: openTabs, active: current, closing: id }));
    setOpenTabs((current) => current.filter((tabId) => tabId !== id));
    setAdminPages((current) => {
      if (!(id in current)) return current;
      const { [id]: _closed, ...rest } = current;
      return rest;
    });
  };

  return { openTabs, activeTab, setActiveTab, openProjectTab, closeProjectTab, adminPages };
}
