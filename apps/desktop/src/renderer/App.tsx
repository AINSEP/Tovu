import { useCallback, useRef, useState, type DragEvent } from 'react';
import { ConversationList } from '@jini-ai/chat/react';
import { ChatPane } from '@jini-ai/chat/react/chat-pane';
import type { ChatPaneComposerHandle, ChatPaneRunContext } from '@jini-ai/chat/react/chat-pane';
import { findSection, visibleSections, type RunnerSection, type RunnerSectionId } from '../contracts/sections.js';
import { GearIcon, SectionIcon } from './icons.js';
import { runnerInventoryBridge } from './runner-api.js';
import { useTheme, type ThemePreference } from './theme.js';
import {
  deriveFleetView,
  useConversationDeleteConfirmation,
  useDismissibleDropdown,
  useExpandedMode,
  useProjectMutations,
  useProjectStart,
  useProjectTabs,
  useProjectRescan,
  useProjectsPolling,
  useRunnerChatTransport,
  useRunnerConversations,
  useRunnerNavigation,
  useSectionNav,
  useWebviewLoadFailure,
} from './App.hooks.js';
import { folderPathsFromDataTransfer } from './folder-drop.js';
import { ProjectGrid } from './ProjectGrid.js';
import { CreateWebsiteOnboarding } from './CreateWebsiteOnboarding.js';
import { STATUS_LABEL } from './project-status.js';
import type { CreateProjectInput, ProjectRecord, ProjectView } from '../contracts/project.js';

const THEMES: readonly ThemePreference[] = ['light', 'system', 'dark'];

// Admin first because that is where a workspace opens. See `ProjectWorkspace` for why.
const PROJECT_VIEWS: readonly ProjectView[] = ['admin', 'site'];

/**
 * Runner's root component.
 *
 * Every prop is a HOOK, defaulted to the real one, so a test can mount `App` with polling, tab, or
 * section state replaced by a stub — no `setInterval`, no `window.tovuRunner`, no `window` keydown
 * listener. Production keeps calling `<App />` with no props at all, which is why the whole props
 * object defaults to `{}`.
 *
 * Two rules decided what is on this list and what is not. First, the prop is the hook FUNCTION,
 * never its result: a default of `useProjectsPolling()` would only be evaluated when the caller
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
 */
export function App({
  useProjects = useProjectsPolling,
  useTabs = useProjectTabs,
  useNav = useSectionNav,
  useExpanded = useExpandedMode,
}: {
  useProjects?: typeof useProjectsPolling;
  useTabs?: typeof useProjectTabs;
  useNav?: typeof useSectionNav;
  useExpanded?: typeof useExpandedMode;
} = {}) {
  const [theme, setTheme] = useTheme();
  const { projects, setProjects, projectsLoading, loadError } = useProjects();
  const { rescanning, rescanError, rescan } = useProjectRescan(setProjects);
  // Tabs before nav, and not the other way round: `useSectionNav` needs `setActiveTab` because
  // every section-level move also drops back to the fleet tab. What used to make that ordering
  // impossible — the tabs hook consuming `activeId`/`appearanceOpen` — is now `deriveFleetView`.
  const { openTabs, activeTab, setActiveTab, openProjectTab, closeProjectTab } = useTabs();
  const {
    activeId,
    setActiveId,
    appearanceOpen,
    isCreating,
    selectSection,
    openAppearance,
    closeAppearance,
    startCreating,
    stopCreating,
  } = useNav(setActiveTab);
  const { openProjects, inProjects, showProjectTab, showFleet, visibleWorkspaceId, showCreateForm } =
    deriveFleetView({ activeId, appearanceOpen, activeTab, openTabs, projects, isCreating });
  const { expanded, toggleExpanded } = useExpanded(showProjectTab);
  useRunnerNavigation(setActiveId, setActiveTab);
  const { lastCreated, openCreateWebsite, handleCreate, handleDelete, cancelCreate, createFormKey } =
    useProjectMutations({
      setProjects,
      closeProjectTab,
      startCreating,
      stopCreating,
    });

  const runningCount = projects.filter((project) => project.status === 'running').length;
  const active = findSection(activeId);

  return (
    <div className="app">
      {!expanded && (
      <TopNav
        activeId={activeId}
        onFleet={showFleet && !appearanceOpen}
        runningCount={runningCount}
        theme={theme}
        onThemeChange={setTheme}
        onOpenAppearance={openAppearance}
        onSelectSection={selectSection}
      />
      )}

      {inProjects && !appearanceOpen && !expanded && (
        <TabStrip
          projects={openProjects}
          activeTab={showProjectTab ? activeTab : null}
          onSelectFleet={() => setActiveTab(null)}
          onSelectTab={setActiveTab}
          onCloseTab={closeProjectTab}
        />
      )}

      <main className="main">
        <MainArea
          appearanceOpen={appearanceOpen}
          onCloseAppearance={closeAppearance}
          showFleet={showFleet}
          activeId={activeId}
          isCreating={isCreating}
          active={active}
          lastCreated={lastCreated}
          projectsLoading={projectsLoading}
          loadError={loadError}
          projects={projects}
          onCreateWebsite={openCreateWebsite}
          onOpenProject={openProjectTab}
          onDeleteProject={handleDelete}
          onRescan={rescan}
          rescanning={rescanning}
          rescanError={rescanError}
        />

        <CreateWebsiteHost
          key={createFormKey}
          hidden={!showCreateForm}
          onBack={cancelCreate}
          onCreate={handleCreate}
        />

        <ProjectWorkspaces
          inProjects={inProjects}
          openProjects={openProjects}
          visibleWorkspaceId={visibleWorkspaceId}
          expanded={expanded}
          onToggleExpanded={toggleExpanded}
        />
      </main>

      {/* The fleet-operator chat behind this FAB is not built yet — see
          `2026-09-06-runner-ui-port-manifest-v2.md` §9, open question 2. Rendered (it is on
          Leona's reference) but disabled the same way a not-yet-built nav destination is: a real
          button, `aria-disabled`, an early return in its own click handler, `tabIndex={-1}` so it
          is not keyboard-reachable, and `data-tip` so the destination is still named on hover.
          Absent while expanded, same as the top nav and tab strip: the admin filling the window
          has no room left for a second chat entry point. */}
      {!expanded && <DisabledChatFab />}
    </div>
  );
}

/** See the FAB's own call site in `App` for why this exists instead of `@jini-ai/chat/react`'s
 *  `ChatFab`: that component has no disabled state to give it, and disabling by wrapping would
 *  leave its internal button itself still focusable. */
function DisabledChatFab() {
  return (
    <button
      type="button"
      className="chat-fab chat-fab--disabled"
      aria-disabled="true"
      tabIndex={-1}
      onClick={(event) => event.preventDefault()}
      data-tip="Fleet chat (not available yet)"
      aria-label="Fleet chat (not available yet)"
    >
      <span aria-hidden="true" />
    </button>
  );
}

/**
 * Runner's own navigation, horizontal across the top.
 *
 * This is a top nav rather than a sidebar for a structural reason, not a stylistic one: a project
 * tab embeds that site's Tovu admin, which ships its OWN left sidebar and its own site-assistant
 * chat. A Runner sidebar would sit directly beside that one, giving the operator two stacked
 * sidebars and two chat entry points with different owners — exactly the blur `sections.ts`
 * warns about. Keeping Runner's chrome on the horizontal axis leaves the vertical axis to
 * whichever site is in view.
 */
function TopNav({
  activeId,
  onFleet,
  runningCount,
  theme,
  onThemeChange,
  onOpenAppearance,
  onSelectSection,
}: {
  activeId: RunnerSectionId;
  onFleet: boolean;
  runningCount: number;
  theme: ThemePreference;
  onThemeChange: (next: ThemePreference) => void;
  onOpenAppearance: () => void;
  onSelectSection: (id: RunnerSectionId) => void;
}) {
  return (
    <nav className="topnav" aria-label="Tovu sections">
      <span className="topnav__brand">
        <span className="topnav__mark" aria-hidden="true" />
        <span className="topnav__wordmark">Tovu</span>
      </span>

      <div className="topnav__links">
        {visibleSections().map((section) => {
          // A section is only "current" when the fleet tab is what's on screen. With a site's
          // admin in view, no Runner section is being displayed, so none should read as active.
          const isActive = onFleet && section.id === activeId;
          return (
            <NavLink
              key={section.id}
              section={section}
              isActive={isActive}
              runningCount={runningCount}
              onSelectSection={onSelectSection}
              // Only Projects has anything behind it right now; the rest are inert until their
              // sections are real. Tooltips stay live because this is functional/visual disabling
              // on a real button, not the `disabled` attribute (which would also kill hover).
              disabled={section.id !== 'projects'}
            />
          );
        })}
      </div>

      <div className="topnav__tools">
        <SettingsControl theme={theme} onThemeChange={onThemeChange} onOpenAppearance={onOpenAppearance} />
      </div>
    </nav>
  );
}

/**
 * One icon-only nav destination.
 *
 * The label is never rendered as visible text — it lives in a `data-tip` CSS tooltip and in
 * `aria-label`. `data-tip` rather than the native `title` attribute because the native one waits
 * ~1s and is OS-styled, which is too slow and too foreign when the tooltip is the ONLY place a
 * destination's name is written — including a DISABLED destination's, which is why `disabled` is
 * `aria-disabled` on a real `<button>` plus `tabIndex={-1}`, never the native `disabled` attribute:
 * that would also suppress `data-tip`'s hover/focus tooltip, the only place an unbuilt section's
 * name appears.
 */
function NavLink({
  section,
  isActive,
  runningCount,
  onSelectSection,
  disabled,
}: {
  section: RunnerSection;
  isActive: boolean;
  runningCount: number;
  onSelectSection: (id: RunnerSectionId) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`topnav__link ${isActive ? 'is-active' : ''} ${disabled ? 'topnav__link--disabled' : ''}`}
      onClick={() => {
        if (disabled) return;
        onSelectSection(section.id);
      }}
      aria-current={isActive ? 'page' : undefined}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : undefined}
      data-tip={section.label}
      aria-label={section.label}
    >
      <SectionIcon id={section.id} />
      {section.id === 'projects' && runningCount > 0 && (
        <span className="topnav__count">{runningCount}</span>
      )}
    </button>
  );
}

/** Gear icon that opens a small dropdown holding appearance (Light/System/Dark) — the one
 *  setting Runner has today. Closes on selection or on a click/tap outside the dropdown. */
function SettingsControl({
  theme,
  onThemeChange,
  onOpenAppearance,
}: {
  theme: ThemePreference;
  onThemeChange: (next: ThemePreference) => void;
  onOpenAppearance: () => void;
}) {
  const { open, setOpen, containerRef } = useDismissibleDropdown<HTMLDivElement>();
  // Same temporary lock as the section links in `NavLink`: only Projects is live right now.
  const disabled = true;

  return (
    <div className="settings" ref={containerRef}>
      <button
        type="button"
        className={`topnav__link ${open ? 'is-active' : ''} ${disabled ? 'topnav__link--disabled' : ''}`}
        onClick={() => {
          if (disabled) return;
          setOpen((current) => !current);
        }}
        aria-expanded={open}
        aria-haspopup="true"
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : undefined}
        data-tip="Settings"
        aria-label="Settings"
      >
        <GearIcon />
      </button>
      {open && (
        <div className="settings__dropdown" role="menu">
          <ThemeControl
            value={theme}
            onChange={(next) => {
              onThemeChange(next);
              setOpen(false);
            }}
          />
          {/* The quick pills above change the setting inline; this opens the real page for it —
              same relationship a form field has to "Advanced settings" elsewhere in the app. */}
          <button
            type="button"
            role="menuitem"
            className="settings__pagelink"
            onClick={() => {
              setOpen(false);
              onOpenAppearance();
            }}
          >
            Appearance
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M7.5 4.5 13 10l-5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * One tab per open site, plus a permanent leading tab for Tovu's own screens. That leading tab is
 * labelled "All" because what it shows is the grid of every website; the `fleet` in `tab--fleet`
 * and `onSelectFleet` is the internal name for the same thing.
 *
 * It is not closable by design: it is the only route back to the project list, and a tab strip
 * that can be emptied needs a second way home that would duplicate the nav above it.
 */
function TabStrip({
  projects,
  activeTab,
  onSelectFleet,
  onSelectTab,
  onCloseTab,
}: {
  projects: readonly ProjectRecord[];
  activeTab: string | null;
  onSelectFleet: () => void;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
}) {
  return (
    <div className="tabstrip" role="tablist" aria-label="Open websites">
      <button
        type="button"
        role="tab"
        className={`tab tab--fleet ${activeTab === null ? 'is-active' : ''}`}
        aria-selected={activeTab === null}
        onClick={onSelectFleet}
      >
        <span className="tab__label">All</span>
      </button>

      {projects.map((project) => (
        <span key={project.id} className={`tab ${project.id === activeTab ? 'is-active' : ''}`}>
          <button
            type="button"
            role="tab"
            className="tab__select"
            aria-selected={project.id === activeTab}
            onClick={() => onSelectTab(project.id)}
          >
            <span className={`tab__dot is-${project.status}`} aria-hidden="true" />
            <span className="tab__label">{project.displayName}</span>
          </button>
          <button
            type="button"
            className="tab__close"
            onClick={() => onCloseTab(project.id)}
            aria-label={`Close ${project.displayName}`}
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M6 6l8 8M14 6l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </span>
      ))}
    </div>
  );
}

/**
 * Every open project's workspace, all mounted at once inside `App`'s `<main>`.
 *
 * Open workspaces are hidden with CSS, never unmounted. A <webview> is a live browsing context:
 * unmounting one on a tab switch would throw away the site's admin route, scroll position and any
 * half-written form, and re-run its whole boot the next time the operator came back to it.
 */
function ProjectWorkspaces({
  inProjects,
  openProjects,
  visibleWorkspaceId,
  expanded,
  onToggleExpanded,
}: {
  inProjects: boolean;
  openProjects: readonly ProjectRecord[];
  visibleWorkspaceId: string | null;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  if (!inProjects) return null;
  return (
    <>
      {openProjects.map((project) => (
        <ProjectWorkspace
          key={project.id}
          project={project}
          hidden={project.id !== visibleWorkspaceId}
          expanded={expanded}
          onToggleExpanded={onToggleExpanded}
        />
      ))}
    </>
  );
}

/**
 * One open project's tab: the site's own `tovu serve` output, embedded.
 *
 * The guest is an Electron `<webview>` rather than an `<iframe>` so it runs in its own process —
 * this renderer holds `window.tovuRunner`, which can create and delete any project in the fleet,
 * and a site has no business executing beside it. `main.cjs`'s `openFleetWindow` enables the tag
 * and pins the guest's `webPreferences` from `will-attach-webview`.
 *
 * The embed OPENS on the site's ADMIN rather than its public front end: the admin is the surface
 * an operator works in, and it can reach the front end from the inside while the reverse is not
 * true. The bar's view toggle is what makes the front end a second view instead of a trapdoor —
 * getting back is one click, so landing there strands nobody. Trailing slash on `/admin/` included
 * deliberately: `/admin` answers 301 to `/admin/`, and letting the guest spend its first
 * navigation on a redirect is a visible flash on every open.
 *
 * `partition` is set explicitly to the project's own `sitePartition` (`contracts/project.ts`,
 * `desktop-auth.cjs`) — a deliberate departure from Tovu-Runner's own `ProjectWorkspace`, which
 * sets no `partition` at all. Tovu's own `desktop-auth.cjs` documents why this shell cannot skip
 * it: cookies ignore port, so two sites both answering on `127.0.0.1` would otherwise share one
 * cookie jar and each open would overwrite the other's session — the exact bug that motivated
 * `sitePartition` for the per-project `BrowserWindow` model in the first place. Setting the same
 * partition string here is what makes the boot-session cookie `main.cjs`'s `openSiteServer` already
 * seeded into that partition visible to THIS guest.
 *
 * `hidden` is a CSS concern, not a mount one. See the <main> body in `App` for why.
 */
function ProjectWorkspace({
  project,
  hidden,
  expanded,
  onToggleExpanded,
}: {
  project: ProjectRecord;
  hidden: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  // Per workspace, not lifted into `App`: every open project stays mounted at once, so one shared
  // value would swing every other tab's guest at the same time.
  const [view, setView] = useState<ProjectView>('admin');
  // Remounting the guest IS the reload. The imperative `.reload()` would mean typing a ref
  // against Electron's element API for one call, and a key change gets the same fresh load.
  const [reloadNonce, setReloadNonce] = useState(0);
  const url = `http://127.0.0.1:${project.port}${view === 'site' ? '/' : '/admin/'}`;
  const running = project.status === 'running';

  // `did-fail-load` is how a mid-session wedge gets caught: the registry row this `running` reads
  // never changes on its own, so nothing else here would notice. Combining `reloadNonce` and `view`
  // into one reset key mirrors what actually invalidates a failure — a fresh guest node or a fresh
  // navigation, not a re-render for its own sake.
  // `guestRef` is a CALLBACK ref, not a ref object, and that distinction is the whole of D-03: the
  // hook's listeners have to attach when the guest actually mounts, and this tab mounts it
  // conditionally (`running && !failed` below). See the hook's own doc.
  const { failed, stalled, guestRef } = useWebviewLoadFailure(`${reloadNonce}:${view}`);

  // Deliberately sends an id and a view, never `url` — main rebuilds it from the registry row, so
  // this bridge is not an "open any url" button. A rejection means the project stopped existing
  // between the last poll and this click, and that same poll is about to take the tab away.
  const openInBrowser = () => {
    void runnerInventoryBridge()
      ?.openProjectExternal({ projectId: project.id, view })
      .catch(() => undefined);
  };

  return (
    <section
      className={`workspace ${running ? 'is-running' : ''} ${hidden ? 'is-hidden' : ''}`}
      aria-hidden={hidden}
    >
      {/* The bar survives into expanded mode on purpose. It is the only chrome left, so it is
          also the only always-available way back out — Escape does not reach this document while
          focus is inside the guest. */}
      <div className="workspace__bar">
        <span className="state" aria-hidden="true">
          <span className="state__dot" />
        </span>
        <div className="workspace__views">
          {PROJECT_VIEWS.map((option) => (
            <button
              type="button"
              key={option}
              className={`workspace__view ${option === view ? 'is-on' : ''}`}
              onClick={() => setView(option)}
              aria-pressed={option === view}
            >
              {option === 'admin' ? 'View admin' : 'View site'}
            </button>
          ))}
        </div>
        {/* The url is the toggle's answer written out, so it tracks the active view. */}
        <span className="workspace__url">{url}</span>
        <span className="workspace__spacer" />
        <button
          type="button"
          className="workspace__act"
          onClick={() => setReloadNonce((nonce) => nonce + 1)}
          disabled={!running}
        >
          Reload
        </button>
        <button
          type="button"
          className="workspace__act"
          onClick={openInBrowser}
          disabled={!running}
          title="Open the current view in your default browser"
        >
          Open in browser
        </button>
        <button
          type="button"
          className="workspace__act workspace__act--icon"
          onClick={onToggleExpanded}
          title={expanded ? 'Exit full window (Esc)' : 'Expand to full window'}
          aria-label={expanded ? 'Exit full window' : 'Expand to full window'}
          aria-pressed={expanded}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
            {expanded ? (
              <path d="M9.5 2.5v4h4M6.5 13.5v-4h-4" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M10 2.5h3.5V6M6 13.5H2.5V10" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
        </button>
      </div>
      {running && !failed ? (
        // `stalled` and `failed` gate whether the recovery overlay shows, not whether the guest
        // stays mounted: `failed` is Chromium reporting a real error on the guest's main frame — a
        // FACT, nothing left to wait for — while `stalled` is this hook's own guess, made only
        // because `STALL_TIMEOUT_MS` passed with no verdict from Chromium either way. Unmounting on
        // a guess would kill a load that was merely slow with no path back to it except a manual
        // retry, so the guest stays mounted for as long as it might still be right and `stalled`
        // only toggles an overlay on top of it.
        <div className="workspace__guest">
          {/* `allowpopups` grants the guest nothing: `registerGuestNavigationPolicy` in `main.cjs`
              denies every window-open request a guest makes, handing the url to the operator's own
              browser only when it targets a site this launch supervises. Without the attribute
              Electron sets `disablePopups` on the guest and the request never leaves its renderer,
              so main never sees it at all — which is why the admin's `target="_blank"` "View site"
              link would otherwise do nothing.

              The cast past `boolean` is not cosmetic — see `electron-webview.d.ts`'s own header on
              why React's own `webview` JSX entry silently drops a real boolean `true` here and a
              string is what Electron's presence check actually reads.

              Switching views is a `src` change and NOT a `key` bump on purpose: React mutates the
              attribute, and Electron's webview navigates the guest that is already running, so a
              toggle costs one navigation instead of destroying a process and building another.
              `key` stays the reload affordance, and because it remounts with whichever `src` is
              current, reload reloads the view on screen rather than always the admin. */}
          <webview
            ref={guestRef}
            key={reloadNonce}
            className="workspace__frame"
            src={url}
            partition={project.partition}
            allowpopups={'' as unknown as boolean}
          />
          {stalled && (
            <div className="workspace__overlay">
              <ProjectStartPanel
                project={project}
                body={`${project.displayName} is taking longer than usual to answer on port ${project.port}. It may still be starting.`}
                onStarted={() => setReloadNonce((nonce) => nonce + 1)}
              />
            </div>
          )}
        </div>
      ) : running ? (
        // The registry row still says `running` — nothing crashed for a poll to catch — but the
        // guest just told us, as a fact rather than a guess, that its main frame would not load.
        // Nothing is left running underneath worth preserving, so this replaces the guest outright
        // rather than overlaying it the way `stalled` does above.
        <ProjectStartPanel
          project={project}
          body={`${project.displayName} isn't answering on port ${project.port}. It may still be running, but stuck.`}
          onStarted={() => setReloadNonce((nonce) => nonce + 1)}
        />
      ) : (
        <ProjectStartPanel project={project} />
      )}
    </section>
  );
}

/**
 * What a project tab shows when its process is not up — or when it is up but just failed to
 * answer the guest (`ProjectWorkspace`'s `did-fail-load` branch). `body` and `onStarted` are what
 * let the second case share this panel instead of duplicating it: the registry status text this
 * panel shows by default would read "Running", which is true and explains nothing, so the wedge
 * caller overrides it; and that caller's `running` never flips on its own the way a genuinely
 * stopped project's does, so it needs telling when to give the guest another try.
 *
 * Starting from here rather than only from the grid matters because this is where the operator
 * already is when they find out — the tab was opened expecting a site. Nothing is set locally on
 * success for a stopped project: `App`'s 4s poll flips `status` to `running`, which swaps this
 * panel for the webview on its own.
 */
function ProjectStartPanel({
  project,
  body,
  onStarted,
}: {
  project: ProjectRecord;
  body?: string;
  onStarted?: () => void;
}) {
  const { starting, error, start } = useProjectStart(project);

  const handleStart = async () => {
    await start();
    onStarted?.();
  };

  return (
    <div className="workspace__idle">
      <h2 className="empty__title">{project.displayName}</h2>
      <p className="empty__body">
        {body ??
          `${STATUS_LABEL[project.status]} on port ${project.port}.`}
      </p>
      {/* A blocked project is waiting on database-provider support Tovu does not have, so the
          only honest affordance is none — starting it would fail every time. Every project this
          shell tracks is sqlite today (`buildProjectRecord`), so this branch is currently dead in
          practice; kept because `ProjectLifecycleStatus` still declares `'blocked'` as a real
          value the contract allows a future provider to reach. */}
      {project.status !== 'blocked' && (
        <button
          type="button"
          className="button button--create"
          onClick={() => void handleStart()}
          disabled={starting}
        >
          {starting ? 'Starting…' : 'Start site'}
        </button>
      )}
      {error && <p className="workspace__error">{error}</p>}
    </div>
  );
}

/**
 * The create-website form's permanent home. Mounted once, for the life of `App`, and never torn
 * down by navigation — hidden with the exact same CSS-only technique (`is-hidden` → `display:
 * none`, plus `aria-hidden` for anything that ignores CSS) rather than by conditionally rendering
 * `<CreateWebsiteOnboarding>` out of the tree.
 *
 * That used to be exactly backwards: `isCreating` looked like it gated the form, but `MainArea`
 * returns `<AppearancePage>` or `null` before it ever consults `isCreating`, so Settings →
 * Appearance unmounted the form regardless of that flag — silently destroying everything typed,
 * including a half-entered credential, with no confirmation. See
 * `development/notes/agent-navigation-dismissal.md` for the full trace. Keeping the form mounted
 * here and only hiding it fixes that for every incidental exit at once, human or agent-driven.
 *
 * `display: none` is what actually satisfies "hidden means unreachable": a hidden host is pulled
 * out of the accessibility tree, out of tab order, and out of reach of an Enter key pressed
 * anywhere else on the page.
 *
 * `key={createFormKey}` (`App`, sourced from `useProjectMutations`) is the deliberate-exit
 * boundary: Cancel and a successful create both bump it, which remounts this subtree fresh. That
 * is what actually empties the two uncontrolled credential inputs — they hold no React state a
 * setter could reset, so nothing short of a new DOM node clears them. Ordinary navigation away and
 * back never touches the key, so the same instance — and everything typed into it — survives.
 */
function CreateWebsiteHost({
  hidden,
  onBack,
  onCreate,
}: {
  hidden: boolean;
  onBack: () => void;
  onCreate: (input: CreateProjectInput) => Promise<void>;
}) {
  return (
    <div className={`create-website-host ${hidden ? 'is-hidden' : ''}`} aria-hidden={hidden}>
      <CreateWebsiteOnboarding onBack={onBack} onCreate={onCreate} />
    </div>
  );
}

/**
 * Everything `App` puts inside `<main>` other than the two always-mounted layers — the project
 * workspaces and the create form host: the Appearance page, or the fleet header + content,
 * depending on what the operator has open. `active` arrives as the section object rather than
 * pre-split label/description strings so its two `?? fallback`s — one per consumer, each with its
 * own fallback text — live in one place.
 */
function MainArea({
  appearanceOpen,
  onCloseAppearance,
  showFleet,
  activeId,
  isCreating,
  active,
  lastCreated,
  projectsLoading,
  loadError,
  projects,
  onCreateWebsite,
  onOpenProject,
  onDeleteProject,
  onRescan,
  rescanning,
  rescanError,
}: {
  appearanceOpen: boolean;
  onCloseAppearance: () => void;
  showFleet: boolean;
  activeId: RunnerSectionId;
  isCreating: boolean;
  active: RunnerSection | undefined;
  lastCreated: ProjectRecord | null;
  projectsLoading: boolean;
  loadError: string | null;
  projects: readonly ProjectRecord[];
  onCreateWebsite: () => void;
  onOpenProject: (id: string) => void;
  onDeleteProject: (id: string) => Promise<void>;
  onRescan: () => Promise<void>;
  rescanning: boolean;
  rescanError: string | null;
}) {
  if (appearanceOpen) {
    return <AppearancePage onBack={onCloseAppearance} />;
  }
  if (!showFleet) return null;
  return (
    <>
      <MainHeader
        activeId={activeId}
        isCreating={isCreating}
        activeLabel={active?.label ?? 'Runner'}
        onCreateWebsite={onCreateWebsite}
        onRescan={onRescan}
        rescanning={rescanning}
      />
      <MainContent
        activeId={activeId}
        isCreating={isCreating}
        lastCreated={lastCreated}
        projectsLoading={projectsLoading}
        loadError={loadError}
        rescanError={rescanError}
        projects={projects}
        activeLabel={active?.label ?? ''}
        activeDescription={active?.agentDescription ?? ''}
        onCreateWebsite={onCreateWebsite}
        onOpenProject={onOpenProject}
        onDeleteProject={onDeleteProject}
      />
    </>
  );
}

function MainHeader({
  activeId,
  isCreating,
  activeLabel,
  onCreateWebsite,
  onRescan,
  rescanning,
}: {
  activeId: RunnerSectionId;
  isCreating: boolean;
  activeLabel: string;
  onCreateWebsite: () => void;
  onRescan: () => Promise<void>;
  rescanning: boolean;
}) {
  return (
    <header className="main__head">
      <h1 className="main__title">{isCreating ? 'Create a website' : activeLabel}</h1>
      <div className="main__spacer" />
      {activeId === 'projects' && !isCreating && (
        <div className="main__tools">
          {/* Ahead of "Create website" and styled quiet: this one only ever ADDS cards for sites
              that already exist, so it must not compete with the primary action. */}
          <button type="button" className="button button--quiet" onClick={() => void onRescan()} disabled={rescanning}>
            {rescanning ? 'Scanning…' : 'Rescan'}
          </button>
          <button type="button" className="button button--create" onClick={onCreateWebsite}>
            <span aria-hidden="true">+</span>
            Create website
          </button>
        </div>
      )}
    </header>
  );
}

function ProjectsBody({
  projectsLoading,
  loadError,
  rescanError,
  projects,
  onCreate,
  onOpen,
  onDelete,
}: {
  projectsLoading: boolean;
  loadError: string | null;
  /**
   * A failed RESCAN, deliberately not folded into `loadError`. That one means "there is no list to
   * show" and short-circuits into the empty state below, which is right for it and catastrophic
   * here: a scan that failed leaves every project already on screen real, openable, and unchanged,
   * so replacing the grid with an error would hide working sites to report a failure to look for
   * more of them.
   */
  rescanError: string | null;
  projects: readonly ProjectRecord[];
  onCreate: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  if (projectsLoading) {
    return (
      <div className="empty">
        <p className="empty__body">Loading projects…</p>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="empty">
        <p className="empty__body">{loadError}</p>
      </div>
    );
  }
  return (
    <>
      {rescanError && <p className="empty__body">{rescanError}</p>}
      <ProjectGrid projects={projects} onCreate={onCreate} onOpen={onOpen} onDelete={onDelete} />
    </>
  );
}

function MainContent({
  activeId,
  isCreating,
  lastCreated,
  projectsLoading,
  loadError,
  rescanError,
  projects,
  activeLabel,
  activeDescription,
  onCreateWebsite,
  onOpenProject,
  onDeleteProject,
}: {
  activeId: RunnerSectionId;
  isCreating: boolean;
  lastCreated: ProjectRecord | null;
  projectsLoading: boolean;
  loadError: string | null;
  rescanError: string | null;
  projects: readonly ProjectRecord[];
  activeLabel: string;
  activeDescription: string;
  onCreateWebsite: () => void;
  onOpenProject: (id: string) => void;
  onDeleteProject: (id: string) => Promise<void>;
}) {
  if (activeId !== 'projects') {
    return <NotBuilt label={activeLabel} description={activeDescription} />;
  }
  // The form itself lives in `CreateWebsiteHost` now — always mounted, a sibling of `MainArea` —
  // so there is nothing left to render here. This branch still has to exist: without it the fleet
  // grid below would show through beneath the (visible) form host, and `MainHeader` still needs
  // `isCreating` to swap its title, so the flag stays threaded through even though this component
  // no longer acts on it beyond staying out of the way.
  if (isCreating) {
    return null;
  }
  return (
    <>
      {lastCreated && (
        <p className="creation-notice" role="status">
          <span className="creation-notice__dot" aria-hidden="true" />
          {/* A freshly created project has no port yet — `handleCreate` (`project-ipc.cjs`) only
              runs `tovu init`, and a port is not allocated until `openSiteWindow` actually spawns
              `tovu serve` on the first open. Claiming "port 0" here would be a lie the operator
              could act on (there is no server listening on port 0). Port 0 is otherwise
              unreachable: `buildProjectRecord` only ever reports a real port for an open project. */}
          {lastCreated.port === 0 ? (
            <>
              <strong>{lastCreated.displayName}</strong> is ready — open it to start its own server.
            </>
          ) : (
            <>
              <strong>{lastCreated.displayName}</strong> is provisioned on port {lastCreated.port}
              {lastCreated.templateVersion ? ` from Tovu ${lastCreated.templateVersion}` : ''}.
            </>
          )}
        </p>
      )}
      <ProjectsBody
        projectsLoading={projectsLoading}
        loadError={loadError}
        rescanError={rescanError}
        projects={projects}
        onCreate={onCreateWebsite}
        onOpen={onOpenProject}
        onDelete={onDeleteProject}
      />
    </>
  );
}

function ThemeControl({
  value,
  onChange,
}: {
  value: ThemePreference;
  onChange: (next: ThemePreference) => void;
}) {
  return (
    <div className="themer" role="group" aria-label="Appearance">
      {THEMES.map((option) => (
        <button
          type="button"
          key={option}
          className={`themer__opt ${option === value ? 'is-on' : ''}`}
          onClick={() => onChange(option)}
          aria-pressed={option === value}
        >
          {option === 'light' ? 'Light' : option === 'system' ? 'System' : 'Dark'}
        </button>
      ))}
    </div>
  );
}

/**
 * The picker's model/reasoning choice reaches the transport through `runContext`, not through
 * `startRun`'s own arguments: `ChatTransport.StartRunInput` carries `agentId` but nothing about how
 * that agent should be configured, and `context` is the port's designated opaque per-host payload.
 */
const RUNNER_RUN_CONTEXT: ChatPaneRunContext = ({ selection }) => ({
  ...(selection.model === undefined ? {} : { model: selection.model }),
  ...(selection.reasoning === undefined ? {} : { reasoning: selection.reasoning }),
});

function RunnerChatPane({ onClose }: { onClose: () => void }) {
  const { transport, runtimeAccess, workingDirectoryAccess, getPathForFile, uploadAttachments } =
    useRunnerChatTransport();
  const conversations = useRunnerConversations();
  const deleteConfirmation = useConversationDeleteConfirmation();
  // The working-directory picker (native folder dialog + MRU list) — unrelated to, and untouched
  // by, the drop handler below. A folder drop no longer feeds this: see `onDropCapture`'s doc.
  const [workingDirectory, setWorkingDirectory] = useState<string | null>(null);
  // Populated by `ChatPane` itself once mounted (`ChatPaneComposerHandle`, `@jini-ai/chat`). The
  // seam `onDropCapture` uses to write a dropped folder's path into the draft as text.
  const composerHandle = useRef<ChatPaneComposerHandle | null>(null);

  // Capture phase, deliberately not a bubble-phase `onDrop`: this has to see the raw event BEFORE
  // `ChatPane`'s own drop handler (buried in its tree, attached in the bubble phase) would expand a
  // dropped folder into synthesized leaf files via the `FileSystemEntry` API — see
  // `folderPathsFromDataTransfer`'s doc for why that expansion loses the folder's own path.
  //
  // Unlike an earlier version of this handler, a recovered folder path now `preventDefault`s AND
  // `stopPropagation`s instead of passing the event through: letting `ChatPane` see it is exactly
  // the bug this exists to fix (TODO.md, "Chat composer: folder drop should yield a path, not an
  // upload") — the owner dropped a folder wanting a path and got "You can attach at most 10 files
  // to one message." The path goes into the composer as TEXT via `composerHandle.insertText`
  // instead; the fleet agent already has filesystem/Bash access on this machine and can act on it
  // directly. A drop that resolves to no folder at all (a loose file, a plain text drag) is left
  // alone on purpose: `ChatPane` now has `uploadAttachments` wired (`chat-attachments.ts`'s
  // `createLocalAttachmentUploader`), so that case is a real staged attachment, not an unhandled
  // drop — exactly the folder/file distinction this handler exists to preserve.
  const onDropCapture = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (getPathForFile === undefined) return;
      const folders = folderPathsFromDataTransfer(event.dataTransfer, getPathForFile);
      if (folders.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      composerHandle.current?.insertText(folders.join(' '));
    },
    [getPathForFile],
  );

  return (
    <aside className="runner-chat-pane" aria-label="Runner chat" onDropCapture={onDropCapture}>
      <header className="runner-chat-pane__head">
        <div>
          <p>Runner operator</p>
          <h2>Fleet chat</h2>
        </div>
        <div className="runner-chat-pane__head-actions">
          {/* The conversation switcher lives in the `<aside>`'s own header, not `ChatPane`'s (see
              `header={<></>}` below for why) — it doubles as the "New thread" affordance via its
              own "New" button, which creates a REAL conversation and switches to it rather than
              silently discarding whatever is on screen. */}
          {transport !== undefined && (
            <ConversationList
              // `ConversationListItem[]` (mutable) is the package's own prop type; this hook's
              // return stays `readonly` for consistency with every other list in `App.hooks.ts`
              // (`useProjectsPolling`'s `projects`, etc.), so the boundary is a shallow copy here
              // rather than widening the hook's own contract for one caller.
              conversations={[...conversations.conversations]}
              activeConversationId={conversations.activeId}
              onSelect={conversations.select}
              onCreate={conversations.create}
              onDelete={conversations.remove}
              onRename={conversations.rename}
              confirmDelete={deleteConfirmation.confirmDelete}
            />
          )}
          <button type="button" onClick={onClose} aria-label="Close Runner chat">×</button>
        </div>
      </header>
      {deleteConfirmation.pendingTitle !== null && (
        // Inline, not `window.confirm` — a native modal would block this renderer's own IPC (see
        // `useConversationDeleteConfirmation`'s doc, and commit `204f3e6` for the project-delete
        // precedent this mirrors).
        <div className="runner-chat-pane__confirm" role="alertdialog" aria-label="Confirm delete">
          <p>
            Delete “{deleteConfirmation.pendingTitle}”? This can’t be undone.
          </p>
          <div className="runner-chat-pane__confirm-actions">
            <button type="button" onClick={() => deleteConfirmation.resolvePending(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="runner-chat-pane__confirm-delete"
              onClick={() => deleteConfirmation.resolvePending(true)}
            >
              Delete
            </button>
          </div>
        </div>
      )}
      {transport === undefined || runtimeAccess === undefined ? (
        <p className="runner-chat-pane__status">
          Open Runner desktop to scan locally installed agent CLIs.
        </p>
      ) : (
        <ChatPane
          // Remounts the pane on a real conversation switch, never on the incidental `activeId`
          // move a lazy adoption makes mid-turn — see `paneKey`'s own doc on `UseRunnerConversations`.
          key={conversations.paneKey}
          transport={transport}
          runtimeAccess={runtimeAccess}
          runContext={RUNNER_RUN_CONTEXT}
          initialMessages={conversations.initialMessages}
          {...(conversations.activeId === null ? {} : { conversationId: conversations.activeId })}
          onMessagesChange={conversations.onMessagesChange}
          // Replaces `ChatPane`'s own default header (title + a "New thread" button wired to its
          // own `onReset`, which only clears the local transcript and writes nothing durable) with
          // an empty fragment — not `title`/`undefined` alone, since `resolveChatPaneHeader` falls
          // back to the default on `undefined` too. The real switcher and "New thread" action live
          // in the `<aside>`'s own header above instead: Runner already renders its own "Runner
          // operator / Fleet chat" title bar there, so putting a second one here would stack two
          // headers rather than integrate with the one that already exists (see Tovu's
          // `AssistantDock.tsx`, which resolves the same default-header problem by replacing it
          // with its own header content directly, in a dock with no separate title bar above it).
          header={<></>}
          placeholder="Ask about the fleet, or tell it what to run"
          variant="workspace"
          workingDirectory={workingDirectory}
          onChangeWorkingDirectory={setWorkingDirectory}
          workingDirectoryAccess={workingDirectoryAccess}
          composerHandle={composerHandle}
          uploadAttachments={uploadAttachments}
          // Deliberately unrestricted, unlike Tovu's `attachmentAccept="image/*"`: that limit
          // exists because Tovu's daemon-side pipeline only handles images today, and Runner has
          // no such pipeline to outrun — a staged file's absolute path is simply handed to the
          // fleet agent (`runner-daemon.ts`'s `imagePaths`/`extraAllowedDirs`), which already has
          // full filesystem/Bash access on this machine and can act on any file type directly.
        />
      )}
    </aside>
  );
}

function NotBuilt({ label, description }: { label: string; description: string }) {
  return (
    <div className="empty">
      <h2 className="empty__title">{label} isn’t built yet</h2>
      <p className="empty__body">{description}</p>
    </div>
  );
}

/**
 * TEMPORARY SCAFFOLD — see `appearanceOpen` in `useSectionNav`. Exists to judge whether "Settings
 * dropdown → its own page" feels right, not as the real Appearance screen. Not a
 * `RunnerSectionId`: a real version belongs in `contracts/sections.ts` once its actual content
 * (more than a theme toggle, presumably) is decided.
 */
function AppearancePage({ onBack }: { onBack: () => void }) {
  return (
    <div className="empty">
      <button type="button" className="back-link" onClick={onBack}>← Back</button>
      <h2 className="empty__title">Appearance</h2>
      <p className="empty__body">Nothing here yet beyond the theme toggle already in the Settings dropdown.</p>
    </div>
  );
}
