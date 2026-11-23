import { reportShellTelemetry } from './product-telemetry.js';
import { useProductScreen } from './use-product-screen.hooks.js';
import { findSection, type RunnerSectionId } from '../contracts/sections.js';
import { useTheme } from './theme.js';
import {
  appPresentation,
  countRunningSites,
  deriveSitesHomeView,
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
import { chromeVisibility, SiteToast, useExpandedMode } from '@jini-ai/ui/app-shell';
import { mergeAddedSite, useAddSite } from './use-add-site.hooks.js';
import { SITE_TOAST_CLASSES, SITE_TOAST_LABELS, useSiteToast } from './use-site-toast.hooks.js';
import { useStartImported } from './use-start-imported.hooks.js';
import { createOpenImported, createOpenImportPage, useImportWebsite } from './use-import-website.hooks.js';
import { useImportHandoff } from './use-import-handoff.hooks.js';
import { useFindInPage } from './use-find-in-page.hooks.js';
import { useZoom } from './use-zoom.hooks.js';
import { ResourcesMonitor } from './ResourcesPanel.js';
import type { useSiteStorageSettings } from './use-site-storage-settings.hooks.js';
import type { useSiteFolders } from './use-site-folders.hooks.js';
import { FindBar } from './app/FindBar.js';
import { TopNav } from './app/TopNav.js';
import { TabStrip, type ImportTab } from './app/TabStrip.js';
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

/** The Import tab's strip props, or none while it is closed. Out here so the open check is not one more
 *  branch in `App`, which sits at the complexity ceiling. */
function importTabProps({ open, selected, onSelect, onClose }: {
  open: boolean; selected: boolean; onSelect: () => void; onClose: () => void;
}, _options = {}): ImportTab | undefined {
  return open ? { selected, onSelect, onClose } : undefined;
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
  useProjects = useSitesPolling, useTabs = useProjectTabs, useNav = useSectionNav,
  useThemeHook = useTheme,
  useSiteRescanHook = useSiteRescan,
  useApplySiteRecordHook = useApplySiteRecord,
  sitesSettings = {}, ...props
}: {
  useProjects?: typeof useSitesPolling;
  useTabs?: typeof useProjectTabs;
  useNav?: typeof useSectionNav;
  useExpanded?: typeof useExpandedMode;
  sitesSettings?: SitesSettingsHooks;
  useThemeHook?: typeof useTheme;
  useSiteRescanHook?: typeof useSiteRescan;
  useApplySiteRecordHook?: typeof useApplySiteRecord;
  useProjectMutationsHook?: typeof useProjectMutations;
  useSiteToastHook?: typeof useSiteToast;
  useStartImportedHook?: typeof useStartImported;
  useAddSiteHook?: typeof useAddSite;
  useImportWebsiteHook?: typeof useImportWebsite;
  useImportHandoffHook?: typeof useImportHandoff;
  useFindInPageHook?: typeof useFindInPage;
  useZoomHook?: typeof useZoom;
  useRunnerNavigationHook?: typeof useRunnerNavigation;
  useTabCloseAskHook?: typeof useTabCloseAsk;
  useProductScreenHook?: typeof useProductScreen;
} = {}) {
  const theme = useThemeHook();
  const projectState = useProjects();
  const rescanState = useSiteRescanHook({ setProjects: projectState.setProjects });
  // A card's Start/Stop resolves with main's refreshed record; this is what puts it on screen
  // rather than leaving the card four seconds behind the poll. See `useApplySiteRecord`.
  const applySiteRecord = useApplySiteRecordHook({ setProjects: projectState.setProjects });
  // Tabs before nav, and not the other way round: `useSectionNav` needs `setActiveTab` because
  // every section-level move also drops back to the sites home tab. What used to make that ordering
  // impossible — the tabs hook consuming `activeId`/`appearanceOpen` — is now `deriveSitesHomeView`.
  const tabs = useTabs();
  const nav = useNav({ setActiveTab: tabs.setActiveTab });
  return <AppProjects {...props} state={{ theme, projectState, rescanState, applySiteRecord, tabs, nav, sitesSettings }} />;
}

function AppProjects({ state,
  useProjectMutationsHook = useProjectMutations,
  useSiteToastHook = useSiteToast,
  useStartImportedHook = useStartImported,
  useAddSiteHook = useAddSite,
  useImportWebsiteHook = useImportWebsite,
  useImportHandoffHook = useImportHandoff, ...props
}: NonNullable<Parameters<typeof App>[0]> & { state: {
  theme: ReturnType<typeof useTheme>; projectState: ReturnType<typeof useSitesPolling>;
  rescanState: ReturnType<typeof useSiteRescan>; applySiteRecord: ReturnType<typeof useApplySiteRecord>;
  tabs: ReturnType<typeof useProjectTabs>; nav: ReturnType<typeof useSectionNav>; sitesSettings: SitesSettingsHooks;
} }) {
  const { projects, setProjects } = state.projectState;
  const { applySiteRecord } = state;
  const { openProjectTab, closeProjectTab } = state.tabs;
  const { startCreating, stopCreating, startImporting, stopImporting } = state.nav;
  const mutations = useProjectMutationsHook({
      projects,
      setProjects,
      closeProjectTab,
      startCreating,
      stopCreating,
    });

  const { lastCreated, handleCreate } = mutations;
  const siteToast = useSiteToastHook({ lastCreated });
  const openImported = createOpenImported({ openProjectTab, stopImporting });
  const startImported = useStartImportedHook({ applyRecord: applySiteRecord, showToast: siteToast.showToast });
  const added = useAddSiteHook({ setProjects }, {
    onAdded: ({ added }, _options = {}) => { siteToast.announceAdded(added); openImported({ id: added.id }); startImported(added); },
  });
  const liveImport = useImportWebsiteHook({
    createSite: ({ displayName }) => handleCreate({ displayName, database: { kind: 'sqlite' } }),
    openSite: ({ site, adminPage }) => { openImported({ id: site.id }, { adminPage }); startImported(site); },
    onArchiveImported: ({ site }, _options = {}) => { setProjects((current) => mergeAddedSite({ current, added: site })); siteToast.announceImported(site); openImported({ id: site.id }); startImported(site); },
    onFailureWhileClosed: siteToast.showToast,
  });
  const openImportPage = createOpenImportPage({ clearAddError: added.clearAddError, liveImport, startImporting });
  useImportHandoffHook({ busy: liveImport.importing, prefill: liveImport.setAddress, open: openImportPage });

  return <AppNavigation {...props} state={state} imports={{ mutations, siteToast, added, liveImport, openImportPage }} />;
}

function AppNavigation({ state, imports, useExpanded = useExpandedMode,
  useFindInPageHook = useFindInPage,
  useZoomHook = useZoom,
  useRunnerNavigationHook = useRunnerNavigation,
  useTabCloseAskHook = useTabCloseAsk,
  useProductScreenHook = useProductScreen
}: Parameters<typeof AppProjects>[0] & { imports: {
  mutations: ReturnType<typeof useProjectMutations>; siteToast: ReturnType<typeof useSiteToast>; added: ReturnType<typeof useAddSite>;
  liveImport: ReturnType<typeof useImportWebsite>; openImportPage: ReturnType<typeof createOpenImportPage>;
} }) {
  const { projects } = state.projectState;
  const { activeTab, setActiveTab, openTabs, closeProjectTab } = state.tabs;
  const { activeId, setActiveId, appearanceOpen, isCreating, isImporting } = state.nav;
  const { applySiteRecord } = state;
  const { addNotice } = imports.added;
  const view = deriveSitesHomeView({ activeId, appearanceOpen, activeTab, openTabs, projects, isCreating, isImporting });
  const { showSiteTab, showSitesHome, visibleWorkspaceId, inSites } = view;
  const expansion = useExpanded({ showSiteTab });
  const { expanded } = expansion;
  const presentation = appPresentation({
    showSiteTab, showSitesHome, appearanceOpen, activeTab, visibleWorkspaceId, addNotice,
  });
  const { guestTarget } = presentation;
  // The visible project tab's guest when one is on screen, else the Projects screen itself — see
  // `use-find-in-page.hooks.ts`'s own header for why the target routing lives there, not here.
  const find = useFindInPageHook({ activeGuestId: guestTarget });
  // Same routing, for Cmd+Plus / Cmd+- / Cmd+0 — see `use-zoom.hooks.ts`'s own header.
  const zoom = useZoomHook({ activeGuestId: guestTarget });
  // Expanded mode's whole visible effect. See `@jini-ai/ui/app-shell`'s `expanded-mode.ts` for why this is a plain function
  // rather than three conditions inlined into the JSX below.
  const chrome = chromeVisibility({ expanded, inSites, appearanceOpen });
  useRunnerNavigationHook({ setActiveId, setActiveTab });
  const tabClose = useTabCloseAskHook({ projects, closeTab: closeProjectTab, onSiteUpdated: applySiteRecord });
  const runningCount = countRunningSites({ projects });
  const active = findSection({ id: activeId });
  useProductScreenHook({ screen: appScreen({ appearanceOpen, showSitesHome, isCreating, isImporting, activeId }) });

  return <AppView state={state} imports={imports} navigation={{ view, expansion, presentation, find, zoom, chrome, tabClose, runningCount, active }} />;
}

function AppView({ state, imports, navigation }: Pick<Parameters<typeof AppNavigation>[0], 'state' | 'imports'> & { navigation: {
  view: ReturnType<typeof deriveSitesHomeView>; expansion: ReturnType<typeof useExpandedMode>; presentation: ReturnType<typeof appPresentation>;
  find: ReturnType<typeof useFindInPage>; zoom: ReturnType<typeof useZoom>; chrome: ReturnType<typeof chromeVisibility>;
  tabClose: ReturnType<typeof useTabCloseAsk>; runningCount: number; active: ReturnType<typeof findSection>;
} }) {
  const { projects } = state.projectState;
  const { applySiteRecord } = state;
  const { siteToast } = imports;
  const { find, tabClose } = navigation;
  const { tabNotice } = navigation.presentation;
  return (
    <ResourcesMonitor projects={projects} onSiteUpdated={applySiteRecord}>
    <div className="app">
      <FindBar find={find} />
      <AppChrome state={state} navigation={navigation} />

      <main className="main">
        <TabCloseAsk project={tabClose.asking} stopping={tabClose.stopping} error={tabClose.error}
          onStop={() => void tabClose.stopAndClose()} onKeepRunning={tabClose.keepRunning} onCancel={tabClose.cancel} />
        {/* Re-adding a tracked site opens its tab; keep that confirmation visible there too.
            Folder failures belong to the websites view and must not carry into site tabs. */}
        {tabNotice !== undefined && <p className="projects-feedback" role="status">{tabNotice}</p>}
        <AppMainArea state={state} imports={imports} navigation={navigation} />

        <AppImportPage state={state} imports={imports} navigation={navigation} />

        <AppSiteWorkspaces state={state} navigation={navigation} />
      </main>

      <SiteToast toast={siteToast.toast} onDismiss={siteToast.dismiss} labels={SITE_TOAST_LABELS} classNames={SITE_TOAST_CLASSES} />

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

function AppChrome({ state, navigation }: Pick<Parameters<typeof AppView>[0], 'state' | 'navigation'>) {
  const { theme: [theme, setTheme], sitesSettings } = state;
  const { activeId, openAppearance, selectSection, hideImporting, importTabOpen, startImporting, stopImporting } = state.nav;
  const { setActiveTab } = state.tabs;
  const { showTopNav, showTabStrip } = navigation.chrome;
  const { onSitesHome, selectedTab } = navigation.presentation;
  const { openSites, showImportPage } = navigation.view;
  const { runningCount, tabClose } = navigation;
  return <>
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
          onSelectSitesHome={() => { setActiveTab(null); hideImporting(); }}
          onSelectTab={(id) => { setActiveTab(id); hideImporting(); }}
          onCloseTab={(id) => tabClose.requestClose({ id })}
          importTab={importTabProps({ open: importTabOpen, selected: showImportPage, onSelect: startImporting, onClose: stopImporting })}
        />
      )}
  </>;
}

function AppMainArea({ state, imports, navigation }: Parameters<typeof AppView>[0]) {
  const { projects, projectsLoading, loadError } = state.projectState;
  const { rescanning, rescanError, rescan } = state.rescanState;
  const { applySiteRecord, sitesSettings } = state;
  const { appearanceOpen, closeAppearance, activeId, isCreating, isImporting } = state.nav;
  const { openProjectTab } = state.tabs;
  const { openCreateWebsite, handleCreate, handleDelete, cancelCreate, createFormKey, lastCreated } = imports.mutations;
  const { openImportPage } = imports;
  const { active, view: { showSitesHome, showCreateForm } } = navigation;
  return <>
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
          onOpenProject={(id) => { reportShellTelemetry({ payload: { kind: 'action', id: 'open_admin' } }); openProjectTab({ id }); }}
          onDeleteProject={(id) => handleDelete({ id })}
          onSiteUpdated={applySiteRecord}
          onRescan={rescan}
          rescanning={rescanning}
          rescanError={rescanError}
          onImport={openImportPage}
          useFolders={sitesSettings.useFolders}
        />

        <CreateWebsiteHost
          key={createFormKey}
          hidden={!showCreateForm}
          onBack={cancelCreate}
          onCreate={async (input) => { await handleCreate(input); }}
        />
  </>;
}

function AppImportPage({ state, imports, navigation }: Parameters<typeof AppView>[0]) {
  const { stopImporting } = state.nav;
  const { liveImport } = imports;
  const { adding, addSite, addDroppedFolder, addError, addDetails } = imports.added;
  const { showImportPage } = navigation.view;
  return (
        <ImportWebsite
          shown={showImportPage}
          onBack={stopImporting}
          adding={adding}
          onChooseFolder={() => { liveImport.clearFailure(); return addSite(); }}
          onDropFolder={(folder) => { liveImport.clearFailure(); return addDroppedFolder({ folder }); }}
          onImportArchive={liveImport.importArchive}
          onRefuse={liveImport.refuse}
          address={liveImport.address}
          onAddressChange={liveImport.setAddress}
          importing={liveImport.importing}
          archiveRun={liveImport.archiveRun}
          onCancelImport={() => void liveImport.cancelArchive()}
          onPageOpen={liveImport.pageOpened}
          onImportAddress={liveImport.importLive}
          failure={liveImport.failure}
          addError={addError}
          addDetails={addDetails}
        />
  );
}

function AppSiteWorkspaces({ state, navigation }: Pick<Parameters<typeof AppView>[0], 'state' | 'navigation'>) {
  const { applySiteRecord, tabs: { adminPages } } = state;
  const { inSites, openSites, visibleWorkspaceId } = navigation.view;
  const { expanded, toggleExpanded } = navigation.expansion;
  const { find, zoom } = navigation;
  return (
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
  );
}
