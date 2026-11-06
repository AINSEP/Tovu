import { reportShellTelemetry } from './product-telemetry.js';
import { useProductScreen } from './use-product-screen.hooks.js';
import { findSection, type RunnerSectionId } from '../contracts/sections.js';
import { useTheme } from './theme.js';
import {
  appPresentation,
  countRunningSites,
  deriveSitesHomeView,
  useExpandedMode,
  useProjectMutations,
  useProjectTabs,
  useSiteRescan,
  useApplySiteRecord,
  useSitesPolling,
  useRunnerNavigation,
  useSectionNav,
} from './App.hooks.js';
import { useTabCloseAsk } from './use-tab-close-ask.hooks.js';
import { TabCloseAsk } from './app/TabCloseAsk.js';
import { chromeVisibility } from './expanded-mode.js';
import { mergeAddedSite, useAddSite } from './use-add-site.hooks.js';
import { useSiteToast } from './use-site-toast.hooks.js';
import { SiteToast } from './SiteToast.js';
import { useStartImported } from './use-start-imported.hooks.js';
import { useImportWebsite } from './use-import-website.hooks.js';
import { useFindInPage } from './use-find-in-page.hooks.js';
import { useZoom } from './use-zoom.hooks.js';
import { ResourcesMonitor } from './ResourcesPanel.js';
import type { useSiteStorageSettings } from './use-site-storage-settings.hooks.js';
import type { useSiteFolders } from './use-site-folders.hooks.js';
import type { SiteAdminPage } from './import-site-entry.js';
import { FindBar } from './app/FindBar.js';
import { TopNav } from './app/TopNav.js';
import { TabStrip } from './app/TabStrip.js';
import { MainArea } from './app/MainArea.js';
import { CreateWebsiteHost } from './app/CreateWebsiteHost.js';
import { ImportWebsite } from './ImportWebsite.js';
import { SiteWorkspaces } from './app/SiteWorkspace.js';

function appScreen({ appearanceOpen, showSitesHome, isCreating, isImporting, activeId }: {
  appearanceOpen: boolean; showSitesHome: boolean; isCreating: boolean; isImporting: boolean; activeId: RunnerSectionId;
}, _options = {}) {
  if (appearanceOpen) return 'appearance';
  if (!showSitesHome) return null;
  if (isImporting) return 'import_website';
  return isCreating ? 'create_website' : activeId;
}

/** The sites-settings hooks `App` threads down; see `App`'s own doc. Each one left out falls back to
 *  the real hook at the component that calls it (`SettingsControl`, `SitesFolders`). */
export interface SitesSettingsHooks {
  useFolders?: typeof useSiteFolders;
  useSiteSettings?: typeof useSiteStorageSettings;
}

/**
 * Runner's root component.
 *
 * Every prop is a HOOK, defaulted to the real one, so a test can mount `App` with polling, tab, or
 * section state replaced by a stub — no `setInterval`, no `window.tovuRunner`, no `window` keydown
 * listener. Production keeps calling `<App />` with no props at all, which is why the whole props
 * object defaults to `{}`.
 *
 * Two rules decided what is on this list and what is not. First, the prop is the hook FUNCTION,
 * never its result: a default of `useSitesPolling()` would only be evaluated when the caller
 * omits the prop, so hook order would change with the call site — a rules-of-hooks violation that
 * fails at runtime rather than at compile time. Second, only hooks whose RETURN VALUE this
 * component renders from are worth injecting. `useRunnerNavigation` returns nothing and no-ops
 * without a desktop bridge, so a stub for it would be a prop no test ever has a reason to set;
 * `useTheme` is injectable in principle but its only rendered consequence lives inside
 * `SettingsControl`, whose button is hard-disabled today, so there is no behaviour behind it yet.
 *
 * `typeof` the real hook is the annotation on purpose. A stub with the wrong return shape, or the
 * wrong arity, fails `npm run typecheck` rather than at assertion time — that type safety is most
 * of what injection buys.
 *
 * `sitesSettings` holds the two seams onto the sites-settings preload state: `useFolders` (the
 * Projects header's own `SitesFolders`) and `useSiteSettings` (the Settings menu's "Sites settings…"
 * dialog). Both defaults end in Jini's `useAsyncAction` and its dialog shell, which a test of this
 * component cannot render against its own React; threading them as props keeps every other default
 * real. One prop for the pair, not two, keeps `App` under the complexity ceiling (each defaulted
 * prop is a branch).
 */
export function App({
  useProjects = useSitesPolling,
  useTabs = useProjectTabs,
  useNav = useSectionNav,
  useExpanded = useExpandedMode,
  sitesSettings = {},
}: {
  useProjects?: typeof useSitesPolling;
  useTabs?: typeof useProjectTabs;
  useNav?: typeof useSectionNav;
  useExpanded?: typeof useExpandedMode;
  sitesSettings?: SitesSettingsHooks;
} = {}) {
  const [theme, setTheme] = useTheme();
  const { projects, setProjects, projectsLoading, loadError } = useProjects();
  const { rescanning, rescanError, rescan } = useSiteRescan(setProjects);
  // A card's Start/Stop resolves with main's refreshed record; this is what puts it on screen
  // rather than leaving the card four seconds behind the poll. See `useApplySiteRecord`.
  const applySiteRecord = useApplySiteRecord(setProjects);
  // Tabs before nav, and not the other way round: `useSectionNav` needs `setActiveTab` because
  // every section-level move also drops back to the sites home tab. What used to make that ordering
  // impossible — the tabs hook consuming `activeId`/`appearanceOpen` — is now `deriveSitesHomeView`.
  const { openTabs, activeTab, setActiveTab, openProjectTab, closeProjectTab, adminPages } = useTabs();
  const {
    activeId,
    setActiveId,
    appearanceOpen,
    isCreating,
    isImporting,
    selectSection,
    openAppearance,
    closeAppearance,
    startCreating,
    stopCreating,
    startImporting,
    stopImporting,
  } = useNav(setActiveTab);
  const { openSites, inSites, showSiteTab, showSitesHome, visibleWorkspaceId, showCreateForm, showImportPage } =
    deriveSitesHomeView({ activeId, appearanceOpen, activeTab, openTabs, projects, isCreating, isImporting });
  const { lastCreated, openCreateWebsite, handleCreate, handleDelete, cancelCreate, createFormKey } =
    useProjectMutations({
      projects,
      setProjects,
      closeProjectTab,
      startCreating,
      stopCreating,
    });

  const siteToast = useSiteToast({ lastCreated });
  // The Import page's sources. All end the same way: the new site's tab opens and the page closes.
  const openImported = (id: string, adminPage?: SiteAdminPage) => { openProjectTab(id, { adminPage }); stopImporting(); };
  const startImported = useStartImported({ applyRecord: applySiteRecord, showToast: siteToast.showToast });
  const { adding, addError, addDetails, addNotice, addSite, addDroppedFolder, clearAddError } = useAddSite({ setProjects }, {
    onAdded: (added) => { siteToast.announceAdded(added); openImported(added.id); startImported(added); },
  });
  const liveImport = useImportWebsite({
    createSite: ({ displayName }) => handleCreate({ displayName, database: { kind: 'sqlite' } }),
    openSite: ({ id, adminPage }) => openImported(id, adminPage),
    onArchiveImported: (site) => { setProjects((current) => mergeAddedSite(current, site)); siteToast.announceImported(site); openImported(site.id); startImported(site); },
  });

  const { expanded, toggleExpanded } = useExpanded(showSiteTab);
  const { onSitesHome, selectedTab, guestTarget, tabNotice } = appPresentation({
    showSiteTab, showSitesHome, appearanceOpen, activeTab, visibleWorkspaceId, addNotice,
  });
  // The visible project tab's guest when one is on screen, else the Projects screen itself — see
  // `use-find-in-page.hooks.ts`'s own header for why the target routing lives there, not here.
  const find = useFindInPage(guestTarget);
  // Same routing, for Cmd+Plus / Cmd+- / Cmd+0 — see `use-zoom.hooks.ts`'s own header.
  const zoom = useZoom(guestTarget);
  // Expanded mode's whole visible effect. See `expanded-mode.ts` for why this is a plain function
  // rather than three conditions inlined into the JSX below.
  const { showTopNav, showTabStrip } = chromeVisibility({ expanded, inSites, appearanceOpen });
  useRunnerNavigation(setActiveId, setActiveTab);
  const tabClose = useTabCloseAsk({ projects, closeTab: closeProjectTab, onSiteUpdated: applySiteRecord });
  const runningCount = countRunningSites(projects);
  const active = findSection(activeId);
  useProductScreen({ screen: appScreen({ appearanceOpen, showSitesHome, isCreating, isImporting, activeId }) });

  return (
    <ResourcesMonitor projects={projects} onSiteUpdated={applySiteRecord}>
    <div className="app">
      <FindBar find={find} />
      {showTopNav && (
      <TopNav
        activeId={activeId}
        onSitesHome={onSitesHome}
        runningCount={runningCount}
        theme={theme}
        onThemeChange={setTheme}
        onOpenAppearance={openAppearance}
        onSelectSection={selectSection}
        useSiteSettings={sitesSettings.useSiteSettings}
      />
      )}

      {showTabStrip && (
        <TabStrip
          projects={openSites}
          activeTab={selectedTab}
          onSelectSitesHome={() => setActiveTab(null)}
          onSelectTab={setActiveTab}
          onCloseTab={tabClose.requestClose}
        />
      )}

      <main className="main">
        <TabCloseAsk project={tabClose.asking} stopping={tabClose.stopping} error={tabClose.error}
          onStop={() => void tabClose.stopAndClose()} onKeepRunning={tabClose.keepRunning} onCancel={tabClose.cancel} />
        {/* Re-adding a tracked site opens its tab; keep that confirmation visible there too.
            Folder failures belong to the websites view and must not carry into site tabs. */}
        {tabNotice !== undefined && <p className="projects-feedback" role="status">{tabNotice}</p>}
        <MainArea
          appearanceOpen={appearanceOpen}
          onCloseAppearance={closeAppearance}
          showSitesHome={showSitesHome}
          activeId={activeId}
          isCreating={isCreating}
          isImporting={isImporting}
          active={active}
          lastCreated={lastCreated}
          projectsLoading={projectsLoading}
          loadError={loadError}
          projects={projects}
          onCreateWebsite={() => { reportShellTelemetry({ payload: { kind: 'action', id: 'create_website' } }); openCreateWebsite(); }}
          onOpenProject={(id) => { reportShellTelemetry({ payload: { kind: 'action', id: 'open_admin' } }); openProjectTab(id); }}
          onDeleteProject={handleDelete}
          onSiteUpdated={applySiteRecord}
          onRescan={rescan}
          rescanning={rescanning}
          rescanError={rescanError}
          onImport={() => { clearAddError(); liveImport.clearFailure(); startImporting(); }}
          useFolders={sitesSettings.useFolders}
        />

        <CreateWebsiteHost
          key={createFormKey}
          hidden={!showCreateForm}
          onBack={cancelCreate}
          onCreate={async (input) => { await handleCreate(input); }}
        />

        <ImportWebsite
          shown={showImportPage}
          onBack={stopImporting}
          adding={adding}
          onChooseFolder={() => { liveImport.clearFailure(); return addSite(); }}
          onDropFolder={(folder) => { liveImport.clearFailure(); return addDroppedFolder(folder); }}
          onImportArchive={liveImport.importArchive}
          onRefuse={liveImport.refuse}
          address={liveImport.address}
          onAddressChange={liveImport.setAddress}
          importing={liveImport.importing}
          onImportAddress={liveImport.importLive}
          failure={liveImport.failure}
          addError={addError}
          addDetails={addDetails}
        />

        <SiteWorkspaces
          inSites={inSites}
          openSites={openSites}
          visibleWorkspaceId={visibleWorkspaceId}
          expanded={expanded}
          onToggleExpanded={toggleExpanded}
          registerGuest={find.registerGuest}
          registerZoomGuest={zoom.registerGuest}
          // Same setter the grid's own Start/Stop uses (`onSiteUpdated` on `MainArea` above) — see
          // `useSiteStart`'s own doc on why a tab's "Start site" needs it too: without it, main's
          // resolved record sits unused and the tab waits on `useSitesPolling`'s 4s poll to agree
          // the site is actually up.
          onSiteUpdated={applySiteRecord}
          adminPages={adminPages}
        />
      </main>

      <SiteToast toast={siteToast.toast} onDismiss={siteToast.dismiss} />

      {/* NO chat FAB on this page, deliberately, and this comment is the whole reason.

          There used to be a disabled one here — a real `<button>` with `aria-disabled`, `tabIndex
          ={-1}` and a "Fleet chat (not available yet)" tooltip — standing in for a fleet-operator
          chat. Two things were wrong with it. It advertised a feature with no main-process half at
          all: `WORKSPACE_CHAT_CHANNELS` (`contracts/workspace-chat.ts`) has no `ipcMain.handle` anywhere
          in this app, so `workspace:chat:start` reaches nothing, and `WorkspaceChatPane` (its own module) has zero
          call sites. And because it was `position: fixed` on the HOST page while the real
          per-site assistant's FAB lives INSIDE the `<webview>` at the same corner and the same
          `z-index`, the decoy composited on top of it and swallowed every click meant for the
          working one — an unbuilt placeholder was blocking the built feature.

          So the one chat entry point is the site's own, inside the guest, where the tools and the
          content database are. That leaves the sites home tab with no assistant, which is the intended
          trade: there is no site in view there to assist with. When a workspace-level chat is
          actually built it should be a PANEL reachable from this app's own chrome, not a second
          floating button competing with the guest's. `WorkspaceChatPane` and the `.chat-fab*` rules
          in `app.css` are kept for it. */}
    </div>
    </ResourcesMonitor>
  );
}
