import { useCallback, useRef, useState, type DragEvent } from 'react';
import { ConversationList } from '@jini-ai/chat/react';
import { ChatPane } from '@jini-ai/chat/react/chat-pane';
import type { ChatPaneComposerHandle, ChatPaneRunContext } from '@jini-ai/chat/react/chat-pane';
import { findSection, visibleSections, type RunnerSection, type RunnerSectionId } from '../contracts/sections.js';
import { GearIcon, SectionIcon } from './icons.js';
import { useTheme, type ThemePreference } from './theme.js';
import {
  deriveFleetView,
  useConversationDeleteConfirmation,
  useDismissibleDropdown,
  useOpenProjectWindow,
  useProjectMutations,
  useProjectTabs,
  useProjectsPolling,
  useRunnerChatTransport,
  useRunnerConversations,
  useRunnerNavigation,
  useSectionNav,
} from './App.hooks.js';
import { folderPathsFromDataTransfer } from './folder-drop.js';
import { ProjectGrid } from './ProjectGrid.js';
import { CreateWebsiteOnboarding } from './CreateWebsiteOnboarding.js';
import type { CreateProjectInput, ProjectRecord } from '../contracts/project.js';

const THEMES: readonly ThemePreference[] = ['light', 'system', 'dark'];

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
}: {
  useProjects?: typeof useProjectsPolling;
  useTabs?: typeof useProjectTabs;
  useNav?: typeof useSectionNav;
} = {}) {
  const [theme, setTheme] = useTheme();
  const { projects, setProjects, projectsLoading, loadError } = useProjects();
  // Tabs before nav, and not the other way round: `useSectionNav` needs `setActiveTab` because
  // every section-level move also drops back to the fleet tab. What used to make that ordering
  // impossible — the tabs hook consuming `activeId`/`appearanceOpen` — is now `deriveFleetView`.
  const { openTabs, activeTab, setActiveTab, closeProjectTab } = useTabs();
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
  const { inProjects, showFleet, showCreateForm } = deriveFleetView({
    activeId,
    appearanceOpen,
    activeTab,
    openTabs,
    projects,
    isCreating,
  });
  useRunnerNavigation(setActiveId, setActiveTab);
  const { lastCreated, openCreateWebsite, handleCreate, handleDelete, cancelCreate, createFormKey } =
    useProjectMutations({
      setProjects,
      closeProjectTab,
      startCreating,
      stopCreating,
    });
  // A project card's open target under the N-`BrowserWindow` model: its own OS window, via IPC —
  // see this hook's own doc. Replaces the old `openProjectTab`, which added an embedded tab.
  const openProjectWindow = useOpenProjectWindow();

  const runningCount = projects.filter((project) => project.status === 'running').length;
  const active = findSection(activeId);

  return (
    <div className="app">
      <TopNav
        activeId={activeId}
        onFleet={showFleet && !appearanceOpen}
        runningCount={runningCount}
        theme={theme}
        onThemeChange={setTheme}
        onOpenAppearance={openAppearance}
        onSelectSection={selectSection}
      />

      {inProjects && !appearanceOpen && <TabStrip onSelectFleet={() => setActiveTab(null)} />}

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
          onOpenProject={openProjectWindow}
          onDeleteProject={handleDelete}
        />

        <CreateWebsiteHost
          key={createFormKey}
          hidden={!showCreateForm}
          onBack={cancelCreate}
          onCreate={handleCreate}
        />
      </main>

      {/* The fleet-operator chat behind this FAB is not built yet — see
          `2026-09-06-runner-ui-port-manifest-v2.md` §9, open question 2. Rendered (it is on
          Leona's reference) but disabled the same way a not-yet-built nav destination is: a real
          button, `aria-disabled`, an early return in its own click handler, `tabIndex={-1}` so it
          is not keyboard-reachable, and `data-tip` so the destination is still named on hover. */}
      <DisabledChatFab />
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
 * A single, permanent, always-active "All" tab, labelled after what it shows: the grid of every
 * website. Under the N-`BrowserWindow` model a project opens in its own OS window, never an
 * embedded tab (see `useOpenProjectWindow`), so there is nothing left for a per-project tab to
 * switch to — rendering one would name a destination this strip cannot actually reach, which is
 * the same reasoning `554f6183` recorded on the admin side for refusing a per-project strip there.
 * `onSelectFleet` stays wired (a click always lands on the one tab that exists) rather than
 * removed outright, since a strip whose own tab does nothing when clicked would be a worse trap
 * than a strip with only one tab.
 */
function TabStrip({ onSelectFleet }: { onSelectFleet: () => void }) {
  return (
    <div className="tabstrip" role="tablist" aria-label="Open websites">
      <button
        type="button"
        role="tab"
        className="tab tab--fleet is-active"
        aria-selected="true"
        onClick={onSelectFleet}
      >
        <span className="tab__label">All</span>
      </button>
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
      />
      <MainContent
        activeId={activeId}
        isCreating={isCreating}
        lastCreated={lastCreated}
        projectsLoading={projectsLoading}
        loadError={loadError}
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
}: {
  activeId: RunnerSectionId;
  isCreating: boolean;
  activeLabel: string;
  onCreateWebsite: () => void;
}) {
  return (
    <header className="main__head">
      <h1 className="main__title">{isCreating ? 'Create a website' : activeLabel}</h1>
      <div className="main__spacer" />
      {activeId === 'projects' && !isCreating && (
        <div className="main__tools">
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
  projects,
  onCreate,
  onOpen,
  onDelete,
}: {
  projectsLoading: boolean;
  loadError: string | null;
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
  return <ProjectGrid projects={projects} onCreate={onCreate} onOpen={onOpen} onDelete={onDelete} />;
}

function MainContent({
  activeId,
  isCreating,
  lastCreated,
  projectsLoading,
  loadError,
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
          <strong>{lastCreated.displayName}</strong> is provisioned on port {lastCreated.port}
          {lastCreated.templateVersion ? ` from Tovu ${lastCreated.templateVersion}` : ''}.
        </p>
      )}
      <ProjectsBody
        projectsLoading={projectsLoading}
        loadError={loadError}
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
