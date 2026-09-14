/**
 * Custom hooks pulled out of `App.tsx`.
 *
 * Most of this is stateful/effectful logic that used to live inline inside `App()` or one of its
 * child components — polling, subscriptions, and view state. Splitting it out of the components is
 * what let `App()` and `SiteGrid` drop back under the complexity ceiling without changing what
 * either one does; see the header comment in `eslint.config.mjs` for why that ceiling exists. This
 * file carries no JSX and no rendering decisions of its own — those stay in `App.tsx`, unchanged
 * in shape.
 *
 * The plain functions mixed in here (`deriveSitesHomeView`, `computeCanCreate`,
 * `buildCreateProjectInput`, `siteSlug`) are deliberately NOT hooks. Each is a rule that used to
 * be inlined into a hook body, pulled out to where it can be called with an object and asserted
 * against directly — no React, no component, no hook harness. `countRunningSites`, `navLinkClick`,
 * `settingsControlHandlers` and `startThenNotify` are the same kind of thing pulled out of
 * `App.tsx`'s component bodies instead, so those components define no functions of their own. When something in this file can be
 * a pure function, it should be one; the hooks around them exist for the state and the effects
 * they genuinely need.
 *
 * Components take these hooks as props with the real hook as the default (see `App`,
 * `SiteGrid`, `CreateWebsiteOnboarding`), so a test can substitute a stub without the component
 * reaching for IPC, timers, or window listeners. The prop is always the hook FUNCTION, never its
 * result — a default of `useFoo()` would only run when the caller omits the prop, which makes hook
 * order depend on the call site. Biome's `correctness/useHookAtTopLevel` runs at error severity in
 * `npm run lint` and catches exactly that mistake.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type RefObject,
  type SetStateAction,
} from 'react';
import type {
  ChatPaneProps,
  ChatPaneRuntimeAccess,
  ChatPaneWorkingDirectoryAccess,
} from '@jini-ai/chat/react/chat-pane';
import type { ChatMessage } from '@jini-ai/chat/core';
import type { ConversationListItem } from '@jini-ai/chat/react';
import { runnerInventoryBridge } from './runner-api.js';
import { createWorkspaceChatTransport, type WorkspaceChatTransport } from './workspace-chat-transport.js';
import { createLocalAttachmentUploader } from './chat-attachments.js';
import { persistableMessages } from './persistable-messages.js';
import type { RunnerSectionId } from '../contracts/sections.js';
import type { ThemePreference } from './theme.js';
import type { CreateSiteInput, DatabaseProviderKind, SiteRecord } from '../contracts/project.js';
import type { WorkspaceConversationSummary } from '../contracts/workspace-conversations.js';

/**
 * Polls Runner's project inventory on a 4s interval.
 *
 * Runner supervises OS processes that change state on their own — a site can crash, or finish
 * booting, with no user action in this window. A mount-only fetch would leave the grid showing a
 * state that stopped being true minutes ago, so re-poll on an interval.
 */
export function useSitesPolling(): {
  projects: readonly SiteRecord[];
  setProjects: Dispatch<SetStateAction<readonly SiteRecord[]>>;
  projectsLoading: boolean;
  loadError: string | null;
} {
  const [projects, setProjects] = useState<readonly SiteRecord[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const bridge = runnerInventoryBridge();
    if (bridge === undefined) {
      setProjectsLoading(false);
      return;
    }
    let cancelled = false;

    const load = () =>
      bridge
        .listSites()
        .then((result) => {
          if (cancelled) return;
          setProjects(result);
          setLoadError(null);
        })
        .catch(() => {
          if (!cancelled) setLoadError("Couldn't load projects.");
        })
        .finally(() => {
          if (!cancelled) setProjectsLoading(false);
        });

    void load();
    const timer = setInterval(() => void load(), 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return { projects, setProjects, projectsLoading, loadError };
}

/**
 * The operator-triggered discovery pass behind the Projects header's "Rescan" control.
 *
 * A button and not only the boot pass, because the reasons a site appears on disk mid-session are
 * ordinary: `tovu init` in a terminal, a folder restored from a backup, a checkout pulled down
 * next to this one. Without it the answer to "my site is right there and Tovu cannot see it" is
 * "quit and relaunch".
 *
 * Takes `setProjects` — `useSitesPolling`'s own setter — and applies main's returned list
 * immediately rather than leaving the grid to the next 4s poll. To the operator those are not the
 * same thing: a rescan that has already found their site but shows nothing for four seconds reads
 * as a button that does not work.
 *
 * `rescanning` is deliberately not derived from the polling hook's `projectsLoading`: that one is
 * true only until the first list arrives, so it would report nothing at all here.
 */
export function useSiteRescan(setProjects: Dispatch<SetStateAction<readonly SiteRecord[]>>): {
  rescanning: boolean;
  rescanError: string | null;
  rescan: () => Promise<void>;
} {
  const [rescanning, setRescanning] = useState(false);
  const [rescanError, setRescanError] = useState<string | null>(null);

  const rescan = useCallback(async () => {
    const bridge = runnerInventoryBridge();
    if (bridge === undefined) return;
    setRescanning(true);
    setRescanError(null);
    try {
      setProjects(await bridge.rescanSites());
    } catch {
      setRescanError("Couldn't scan for sites.");
    } finally {
      setRescanning(false);
    }
  }, [setProjects]);

  return { rescanning, rescanError, rescan };
}

/**
 * `desktop.navigate` is a tool the fleet chat can actually call, so the nav is agent-movable and
 * not only user-movable. Nothing else in main pushes on this channel. It also pulls focus back
 * to the sites home tab — navigating to a Runner section while a site's admin fills the screen would
 * otherwise change something the operator cannot see.
 *
 * Takes the RAW `setActiveId`, deliberately not `useSectionNav`'s `selectSection`. Agent
 * navigation therefore does not close the Appearance page or cancel a half-filled create form the
 * way a click on the nav does. That asymmetry is pre-existing and preserved here unchanged, but it
 * is worth knowing about: with Appearance open, a `desktop.navigate` call moves `activeId` and the
 * operator sees nothing happen, because `MainArea` renders Appearance ahead of the section. Fixing
 * it means deciding what the agent is allowed to dismiss on the operator's behalf, which is a
 * product question, not a refactor.
 */
export function useRunnerNavigation(
  setActiveId: Dispatch<SetStateAction<RunnerSectionId>>,
  setActiveTab: Dispatch<SetStateAction<string | null>>,
): void {
  useEffect(() => {
    const bridge = runnerInventoryBridge();
    return bridge?.onNavigate((section) => {
      setActiveId(section);
      setActiveTab(null);
    });
  }, [setActiveId, setActiveTab]);
}

export interface SectionNavState {
  activeId: RunnerSectionId;
  /**
   * The raw setter, exposed only for `useRunnerNavigation`. Agent navigation deliberately moves
   * `activeId` WITHOUT running `selectSection`'s other three resets — see the note on that hook.
   */
  setActiveId: Dispatch<SetStateAction<RunnerSectionId>>;
  appearanceOpen: boolean;
  isCreating: boolean;
  selectSection: (id: RunnerSectionId) => void;
  openAppearance: () => void;
  closeAppearance: () => void;
  startCreating: () => void;
  stopCreating: () => void;
}

/**
 * Which Runner screen is showing: the current section, whether the Appearance page is layered over
 * it, and whether the create-website form has replaced the sites grid.
 *
 * These three used to be raw `useState` calls in `App`, kept there on the argument that they cross
 * sibling subtrees and are written together by coordinated callbacks. That argument is about
 * architecture and answers the wrong question — `selectSection` writes four pieces of state at
 * once, and "does moving section also cancel a half-filled create form" is exactly the kind of
 * thing worth pinning down without standing up a component tree. Owning them here makes that one
 * function the unit under test; `App` still does the wiring, it just no longer holds the setters.
 *
 * `setActiveTab` arrives as an argument rather than being owned here because tabs are a separate
 * concern with a separate hook (`useProjectTabs`) — but dropping to the sites home tab is genuinely part
 * of every section-level move, so the call belongs inside these callbacks rather than duplicated at
 * each `App` call site. That ordering constraint (tabs hook first, this one second) is why the
 * `activeId`/`appearanceOpen` half of the old `useProjectTabs` became `deriveSitesHomeView` below.
 */
export function useSectionNav(
  setActiveTab: Dispatch<SetStateAction<string | null>>,
): SectionNavState {
  const [activeId, setActiveId] = useState<RunnerSectionId>('projects');
  // TEMPORARY SCAFFOLD — this is not a real `RunnerSectionId` page, just enough state to judge
  // whether "Settings dropdown → its own page" feels right before building a real
  // Appearance/Settings screen against the contract. See `AppearancePage` in `App.tsx`.
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Moving section is a full reset of everything layered over the section's own screen: an
  // in-progress create form, the Appearance page, and any project tab all belong to where you
  // were, not where you are going.
  const selectSection = (id: RunnerSectionId) => {
    setActiveId(id);
    setIsCreating(false);
    setActiveTab(null);
    setAppearanceOpen(false);
  };

  // Appearance covers the whole content area. Dropping the active tab means closing Appearance
  // returns to the sites grid rather than to a workspace the operator has not seen for a while.
  const openAppearance = () => {
    setAppearanceOpen(true);
    setActiveTab(null);
  };

  const closeAppearance = () => setAppearanceOpen(false);
  const startCreating = () => setIsCreating(true);
  const stopCreating = () => setIsCreating(false);

  return {
    activeId,
    setActiveId,
    appearanceOpen,
    isCreating,
    selectSection,
    openAppearance,
    closeAppearance,
    startCreating,
    stopCreating,
  };
}

export interface ProjectTabsState {
  // Project ids with an open tab, in the order they were opened.
  openTabs: readonly string[];
  activeTab: string | null;
  setActiveTab: Dispatch<SetStateAction<string | null>>;
  openProjectTab: (id: string) => void;
  closeProjectTab: (id: string) => void;
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
export function useProjectTabs(): ProjectTabsState {
  // `null` active tab means the sites home tab (Runner's own sections); a string means that project's
  // embedded admin.
  const [openTabs, setOpenTabs] = useState<readonly string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const openProjectTab = (id: string) => {
    setOpenTabs((current) => (current.includes(id) ? current : [...current, id]));
    setActiveTab(id);
  };

  const closeProjectTab = (id: string) => {
    setOpenTabs((current) => current.filter((tabId) => tabId !== id));
    // Closing the tab you are looking at falls back to the sites home tab rather than guessing a
    // neighbour — the sites home tab always exists, so there is no second empty-state to design.
    setActiveTab((current) => (current === id ? null : current));
  };

  return { openTabs, activeTab, setActiveTab, openProjectTab, closeProjectTab };
}

export interface SiteMutationsState {
  /**
   * The created record, not just its name: the notice reports the port and template version the
   * provisioner actually produced, which is the only place those are known to be true.
   */
  lastCreated: SiteRecord | null;
  openCreateWebsite: () => void;
  handleCreate: (input: CreateSiteInput) => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
  /** Cancel's handler, not `stopCreating` directly — see `cancelCreate` below for why the two
   *  differ. */
  cancelCreate: () => void;
  /** Bumped on every deliberate exit from the create form. `App` passes it as the form's `key`,
   *  so the ONLY thing that resets the form's typed fields is this counter changing — ordinary
   *  navigation away and back must not. */
  createFormKey: number;
}

/**
 * The sites-home mutations `App` offers — open the create form, create, delete, cancel a create — plus
 * the record the last successful create produced and the counter that clears the create form.
 *
 * These lived inline in `App` on the argument that `handleCreate` needs `setProjects` from the
 * polling hook and `stopCreating` from the nav hook in the same function, so it is composition and
 * composition is what the component is for. That reasoning does not hold: needing two values from
 * two places is a reason to take them as ARGUMENTS, which is what this hook does. What it actually
 * bought was async handlers, each with a bridge-missing branch and an ordering rule, that could
 * not be exercised without mounting `App` and stubbing `window.tovuRunner`.
 *
 * `createFormKey` lives here rather than in `useSectionNav` alongside `isCreating`, for the same
 * reason `lastCreated` does: its writers are `handleCreate` and `cancelCreate`, both defined here,
 * and both need to distinguish a deliberate exit (clear the form) from `isCreating` simply going
 * false as a side effect of navigating elsewhere (do not clear it) — a distinction `useSectionNav`
 * has no way to make, since it does not know why `stopCreating` was called.
 *
 * `lastCreated` moves here with them rather than staying behind, because `handleCreate` and
 * `openCreateWebsite` are its only writers — state separated from its only writers is the split
 * this extraction exists to undo, not one to introduce.
 *
 * Every dependency arrives as an argument and nothing is closed over, so a test calls this with
 * four spies and asserts the orderings that matter: that a missing bridge throws BEFORE any state
 * is touched, that delete drops the row locally AND closes its tab, and that `openCreateWebsite`
 * clears a stale notice before the form opens rather than after.
 */
export function useProjectMutations(deps: {
  setProjects: Dispatch<SetStateAction<readonly SiteRecord[]>>;
  closeProjectTab: (id: string) => void;
  stopCreating: () => void;
  startCreating: () => void;
}): SiteMutationsState {
  const [lastCreated, setLastCreated] = useState<SiteRecord | null>(null);
  // See `createFormKey` on `SiteMutationsState`. Starts at 0 and only ever goes up; the actual
  // number carries no meaning beyond "changed since the form last mounted".
  const [createFormKey, setCreateFormKey] = useState(0);

  // Clear first, open second. The notice names a specific site on a specific port; carrying the
  // previous one into a fresh form would caption the new site with the old site's facts.
  //
  // Bumping `createFormKey` here is what makes "+ Create website" mean what it says. The form
  // survives being HIDDEN — Appearance, a project tab, `desktop.navigate` — because those leave
  // `isCreating` true and the operator returns to the same instance with their typing intact.
  // But a path that ends the creation outright (`selectSection` resets `isCreating` on a TopNav
  // click) makes this button the only way back, and it should open an empty form: the operator
  // asked to create a website, not to resume one. Without this, that route would re-present a
  // stale half-filled form — including whatever was typed into the credential inputs, which no
  // longer has an owner on screen.
  const openCreateWebsite = () => {
    setLastCreated(null);
    setCreateFormKey((key) => key + 1);
    deps.startCreating();
  };

  const handleCreate = async (input: CreateSiteInput) => {
    const bridge = runnerInventoryBridge();
    if (bridge === undefined) {
      throw new Error('Runner desktop connection required to create a website.');
    }
    const result = await bridge.createSite(input);
    deps.setProjects((current) => [...current, result]);
    setLastCreated(result);
    deps.stopCreating();
    // A successful create is a deliberate exit exactly like Cancel: bumping the key here is what
    // remounts the form empty rather than leaving the just-submitted site's name and credential
    // sitting in fields the operator is about to open again for a second site.
    setCreateFormKey((key) => key + 1);
  };

  // Distinct from `deps.stopCreating` rather than a second name for it: Cancel is the ONE exit
  // that must also clear typed state (see `createFormKey`). Every other way the form stops being
  // visible — a project tab, Appearance, a different section — is incidental and must NOT clear
  // it, which is the entire point of keeping the form mounted instead of unmounting it on those.
  const cancelCreate = () => {
    deps.stopCreating();
    setCreateFormKey((key) => key + 1);
  };

  const handleDelete = async (id: string) => {
    const bridge = runnerInventoryBridge();
    if (bridge === undefined) {
      throw new Error('Runner desktop connection required to delete a website.');
    }
    await bridge.deleteSite(id);
    // Dropped locally rather than left to the 4s poll: the card the operator just confirmed
    // against would otherwise sit there looking untouched for up to four seconds. Its tab goes
    // too — a tab pointing at a deleted project has nothing left to render.
    deps.setProjects((current) => current.filter((project) => project.id !== id));
    deps.closeProjectTab(id);
  };

  return { lastCreated, openCreateWebsite, handleCreate, handleDelete, cancelCreate, createFormKey };
}

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

/**
 * Immersive mode: the active project's admin takes the whole window and Tovu's own chrome (top
 * nav, tab strip, fleet chat) gets out of the way. Owns both the state and the two rules that keep
 * it honest — it must never outlive the workspace it is immersing, and Escape must collapse it.
 */
export function useExpandedMode(showSiteTab: boolean): {
  expanded: boolean;
  toggleExpanded: () => void;
} {
  const [expanded, setExpanded] = useState(false);

  // Expanded hides the only navigation there is, so it must never outlive the thing it was
  // expanding. Closing the tab, deleting the project, or a `desktop.navigate` call moving the nav
  // would otherwise leave the chrome hidden with nothing to be immersed in and no way back.
  useEffect(() => {
    if (!showSiteTab) setExpanded(false);
  }, [showSiteTab]);

  // Escape collapses. This listener only sees keys pressed in Tovu's own chrome — a <webview>
  // is a separate browsing context and does not bubble its keydowns out to this document — so it
  // is a convenience, never the only exit. The bar's collapse button is the one that always works.
  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expanded]);

  const toggleExpanded = () => setExpanded((on) => !on);

  return { expanded, toggleExpanded };
}

/**
 * A dropdown's open state plus the "click/tap outside closes it" behaviour every dropdown in the
 * top nav wants (`NavLink`'s sub-link menu, `SettingsControl`'s appearance menu). Was duplicated
 * inline in both call sites before this extraction.
 */
export function useDismissibleDropdown<T extends HTMLElement = HTMLDivElement>(): {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  containerRef: RefObject<T | null>;
} {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<T>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return { open, setOpen, containerRef };
}

/**
 * How many tracked sites are running right now — the count `NavLink` badges on the Projects entry.
 *
 * @complexity O(n) in the number of sites.
 */
export function countRunningSites(projects: readonly SiteRecord[]): number {
  return projects.filter((project) => project.status === 'running').length;
}

/**
 * `NavLink`'s `onClick`: selects its section unless the link is disabled, in which case the click
 * does nothing. `NavLink` disables through `aria-disabled` rather than the native attribute (see its
 * doc), so a disabled button still receives clicks and this guard is what makes it inert.
 *
 * @param input.disabled `NavLink`'s own optional flag; `undefined` means enabled.
 * @complexity O(1).
 */
export function navLinkClick(input: {
  disabled: boolean | undefined;
  id: RunnerSectionId;
  onSelectSection: (id: RunnerSectionId) => void;
}): () => void {
  return () => {
    if (input.disabled) return;
    input.onSelectSection(input.id);
  };
}

/** `SettingsControl`'s three handlers — see {@link settingsControlHandlers}. */
export interface SettingsControlHandlers {
  /** The gear button: flips the dropdown, unless the control is disabled. */
  toggleOpen: () => void;
  /** A theme pill: applies the theme, then closes the dropdown. */
  chooseTheme: (next: ThemePreference) => void;
  /** The "Appearance" link: closes the dropdown, then opens the page. */
  openAppearancePage: () => void;
}

/**
 * `SettingsControl`'s handlers, built from its dropdown setter and its two callbacks.
 *
 * Only the gear button checks `disabled`, for the same `aria-disabled` reason as
 * {@link navLinkClick}. The two dropdown entries do not, because a dropdown that cannot open offers
 * nothing to click.
 *
 * @complexity O(1).
 */
export function settingsControlHandlers(input: {
  disabled: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  onThemeChange: (next: ThemePreference) => void;
  onOpenAppearance: () => void;
}): SettingsControlHandlers {
  return {
    toggleOpen: () => {
      if (input.disabled) return;
      input.setOpen((current) => !current);
    },
    chooseTheme: (next) => {
      input.onThemeChange(next);
      input.setOpen(false);
    },
    openAppearancePage: () => {
      input.setOpen(false);
      input.onOpenAppearance();
    },
  };
}

/**
 * The project grid's delete-confirm flow: which card (if any) is asking to be confirmed, which
 * one is mid-delete, and the error from the last failed attempt.
 *
 * Confirmation lives on the card rather than in a `window.confirm`: a native modal dialog blocks
 * the whole renderer, and in Electron that also freezes the IPC this window answers on.
 */
export function useDeleteConfirmation(onDelete: (id: string) => Promise<void>): {
  pendingId: string | null;
  deletingId: string | null;
  deleteError: string | null;
  requestDelete: (id: string) => void;
  cancelDelete: () => void;
  confirmDelete: (id: string) => Promise<void>;
} {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const requestDelete = (id: string) => {
    setDeleteError(null);
    setPendingId(id);
  };

  const cancelDelete = () => setPendingId(null);

  const confirmDelete = async (id: string) => {
    setDeletingId(id);
    setDeleteError(null);
    try {
      await onDelete(id);
      setPendingId(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId(null);
    }
  };

  return { pendingId, deletingId, deleteError, requestDelete, cancelDelete, confirmDelete };
}

/**
 * `SiteStartPanel`'s start/pending/error state.
 *
 * Starting from here rather than only from the grid matters because this is where the operator
 * already is when they find out — the tab was opened expecting a site. Nothing is set locally on
 * success: `useSitesPolling`'s 4s poll flips `status` to `running`, which swaps the panel this
 * hook backs for the webview on its own.
 *
 * Deliberately NOT built on `useDeleteConfirmation`'s shape, even though both are a "pending flag
 * + error string around one async call": on a missing bridge, `start` sets `error` and returns
 * WITHOUT ever setting `starting` true — a call that never got as far as attempting the action
 * shouldn't flash a loading state. `useDeleteConfirmation`'s `confirmDelete` always sets its
 * pending flag first and lets the try/catch around the call itself produce the error. A shared
 * generic "set pending, run this, catch" wrapper can't reproduce the early return without either
 * special-casing it (which defeats sharing) or setting `starting` true for one tick it was never
 * true for before. That is a real, if small, behaviour change, so the two stay separate.
 *
 * `start` resolves to whether it actually started the site — `false` on a missing bridge or a
 * caught `startSite` error, `true` otherwise — rather than throwing. It never rejects: both failure
 * paths are already reported through `error` state, so a caller does not also need a try/catch.
 * That boolean is what lets {@link startThenNotify} tell a real start apart from a failed attempt
 * that merely finished.
 */
export function useSiteStart(project: SiteRecord): {
  starting: boolean;
  error: string | null;
  start: () => Promise<boolean>;
} {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    const bridge = runnerInventoryBridge();
    if (bridge === undefined) {
      setError('Tovu desktop connection required to start a website.');
      return false;
    }
    setStarting(true);
    setError(null);
    try {
      await bridge.startSite(project.id);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setStarting(false);
    }
  };

  return { starting, error, start };
}

/**
 * `SiteStartPanel`'s Start handler: awaits `start`, then calls `onStarted` only if `start` reports
 * it actually started the site.
 *
 * Both of `SiteStartPanel`'s `onStarted` call sites (`App.tsx`'s stalled/failed workspace overlays)
 * pass `workspace.recover`, which remounts the `<webview>` for a fresh attempt at loading the
 * guest. Remounting is only worth doing when the start it is reacting to actually happened — on a
 * failed attempt (missing bridge, or `startSite` itself failing) nothing changed for the guest to
 * find, so recovering would just remount into the same failure or stall. `useSiteStart`'s `start`
 * never rejects (a missing bridge or a caught error both resolve, having recorded `error` state
 * instead), so telling the two apart means reading the resolved boolean rather than whether the
 * promise settled at all. If `start` does reject for some other reason, `onStarted` is skipped and
 * the rejection reaches the caller, same as before.
 *
 * @complexity O(1) plus `start`'s own cost.
 */
export function startThenNotify(
  start: () => Promise<boolean>,
  onStarted: (() => void) | undefined,
): () => Promise<void> {
  return async () => {
    const started = await start();
    if (started) onStarted?.();
  };
}

/**
 * Detects a guest that is alive-but-not-answering, and tells apart the two different ways that
 * can happen — `failed`, a FACT: `did-fail-load` fired on the `<webview>`'s main frame with a
 * real error, as opposed to a normal in-flight navigation being cancelled. `stalled`, a GUESS:
 * neither `did-fail-load` nor `did-finish-load` showed up at all within `STALL_TIMEOUT_MS`, which
 * means exactly nothing — Chromium never told this hook anything either way, and the guest may
 * still be about to answer on its own. `SiteWorkspace` treats the two accordingly: `failed`
 * swaps the guest out outright, the same way a stopped project does, because there is nothing left
 * to wait for. `stalled` only lays a recovery panel over the still-loading guest, because there
 * might be.
 *
 * Two Electron quirks make `isMainFrame`/`errorCode` filtering load-bearing rather than optional.
 * `did-fail-load` fires for sub-resources too — a missing favicon, a failed XHR inside the admin —
 * and `isMainFrame` is what tells those apart from the guest itself being unreachable. It also
 * fires with `errorCode === -3` (`ABORTED`) on completely ordinary navigations: the view toggle
 * and the reload button both cancel whatever load was already in flight, and Chromium reports that
 * cancellation exactly the way it reports a real failure. Counting either as a failure would swap
 * a perfectly good admin for an error panel on every ordinary click.
 *
 * `STALL_TIMEOUT_MS` is this hook's own ceiling on "still loading, no verdict yet" — ported
 * unchanged from Tovu-Runner's own measurement of a freshly created project's slowest real first
 * `/admin/` request (see that file's own history for the live numbers): comfortably past how long a
 * local admin normally takes to answer, comfortably short of leaving the operator staring at a
 * blank pane for the rest of the session.
 *
 * `resetKey` is `useSiteWorkspace`'s `loadResetKey` (`reloadNonce`, `view`, `softLoads`), not read
 * here for its value — only for when it changes. A recovery remount replaces the guest (new DOM
 * node, so listeners must move with it), while a view switch or a soft load (`reload()`,
 * `loadURL()`) renavigates the same node; all of them deserve a clean slate, since
 * without one a single transient failure would pin the recovery panel in place even after the
 * operator's next click plainly asked for another try. The same reset also re-arms the stall timer,
 * which is what lets the recovery panel's own "Start site" retry get a second, fresh judgment.
 *
 * **The guest arrives through `guestRef`, a callback ref, and that is the D-03 fix.** This used to
 * take a `RefObject` and depend on `[webviewRef, resetKey]`. A ref OBJECT is stable for the
 * component's whole life, and `SiteWorkspace` renders the `<webview>` only when
 * `running && !failed` — so on the two ordinary paths that mount a guest (a stopped tab whose 4 s
 * poll flips to `running`, and the failure panel's own retry) neither dependency changed, the
 * effect never re-ran, and NO listener and no stall timer were ever installed on the node actually
 * on screen. Only "Reload while healthy" — where `key` remounts the guest in the same commit the
 * effect follows — attached them, which is the path that needs recovery least. The hook was right
 * in form and wrong in binding: its own doc said the listeners "must move with" the node, and
 * nothing in its inputs changed when the node appeared. Holding the node in STATE makes it a
 * dependency that really does change on attach, so the effect's lifetime IS the node's.
 *
 * The reset is deliberately a SECOND effect keyed on `resetKey` alone. Folding it back into the
 * node-keyed effect looks tidier and reintroduces a worse bug: `failed` going true unmounts the
 * guest, which fires `guestRef(null)`, which would re-run a combined effect and clear the very
 * flag that unmounted it — the guest remounts, fails again, and the panel flickers forever.
 *
 * @returns `guestRef` alongside the two flags — the caller MUST put it on the `<webview>`; there is
 *   no other way for this hook to see the node. `guest` is that node, for `useSiteWorkspace`'s
 *   history listeners, which need the same lifetime and cannot take a second ref on one element.
 */
export function useWebviewLoadFailure(resetKey: unknown): {
  failed: boolean;
  stalled: boolean;
  guest: HTMLWebViewElement | null;
  guestRef: (node: HTMLWebViewElement | null) => void;
} {
  const [failed, setFailed] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [guest, setGuest] = useState<HTMLWebViewElement | null>(null);

  useEffect(() => {
    // Not read for its value — only for when it changes. `resetKey` is what makes reload and a
    // view switch a clean slate rather than a permanent black mark; without a genuine reference
    // to it here, Biome's exhaustive-deps rule reads the dependency as dead weight and asks to
    // drop it, which would drop the reset along with it.
    void resetKey;
    setFailed(false);
    setStalled(false);
  }, [resetKey]);

  useEffect(() => {
    if (guest === null) return;

    const STALL_TIMEOUT_MS = 8000;
    const stallTimer = window.setTimeout(() => setStalled(true), STALL_TIMEOUT_MS);

    const onFailLoad = (event: WebviewDidFailLoadEvent) => {
      if (!event.isMainFrame || event.errorCode === -3) return;
      window.clearTimeout(stallTimer);
      // A fact arriving after a guess: the guess was wrong (or overtaken), so withdraw it rather
      // than leave both true and ask `SiteWorkspace` to decide which one wins.
      setStalled(false);
      setFailed(true);
    };
    const onFinishLoad = () => {
      window.clearTimeout(stallTimer);
      setFailed(false);
      setStalled(false);
    };

    guest.addEventListener('did-fail-load', onFailLoad);
    guest.addEventListener('did-finish-load', onFinishLoad);
    return () => {
      window.clearTimeout(stallTimer);
      guest.removeEventListener('did-fail-load', onFailLoad);
      guest.removeEventListener('did-finish-load', onFinishLoad);
    };
    // `resetKey` as well as the node: a VIEW switch or a soft load navigates the guest that is
    // already mounted, so the node is unchanged and only this re-arms the stall timer for the new
    // navigation. A recovery remount changes both (`key` remounts the element).
  }, [guest, resetKey]);

  return { failed, stalled, guest, guestRef: setGuest };
}

/**
 * Connects `WorkspaceChatPane` to the fleet chat transport: the bridge lookup, the transport built
 * on top of it, and the runtime-access and working-directory surfaces `ChatPane` needs. All three
 * are one bridge lookup, so they live in one hook rather than one per concern.
 */
export function useWorkspaceChatTransport(): {
  transport: WorkspaceChatTransport | undefined;
  runtimeAccess: ChatPaneRuntimeAccess | undefined;
  workingDirectoryAccess: ChatPaneWorkingDirectoryAccess | undefined;
  /** `undefined` only when the bridge itself is (no preload). See `RunnerInventoryBridge.getPathForFile`. */
  getPathForFile: ((file: File) => string) | undefined;
  /** `undefined` only when the bridge itself is. See `chat-attachments.ts`'s `createLocalAttachmentUploader`. */
  uploadAttachments: ChatPaneProps['uploadAttachments'];
} {
  const bridge = useMemo(() => runnerInventoryBridge(), []);

  const runtimeAccess = useMemo<ChatPaneRuntimeAccess | undefined>(() => {
    if (bridge === undefined) return undefined;

    return {
      listAgents: bridge.listAgents,
      rescanAgents: bridge.rescanAgents,
      daemonOnline: bridge.daemonOnline,
    };
  }, [bridge]);

  const workingDirectoryAccess = useMemo<ChatPaneWorkingDirectoryAccess | undefined>(() => {
    if (bridge === undefined) return undefined;

    return {
      normalizeWorkingDirectory: bridge.normalizeWorkingDirectory,
      pickWorkingDirectory: bridge.pickWorkingDirectory,
      recentDirectories: bridge.recentWorkingDirectories,
      directoryExists: bridge.workingDirectoryExists,
    };
  }, [bridge]);

  // One transport per pane lifetime. It installs the single run-event listener every subscription
  // multiplexes over, so rebuilding it per render would stack duplicate listeners on that channel.
  const transport = useMemo(
    () => (bridge === undefined ? undefined : createWorkspaceChatTransport(bridge)),
    [bridge],
  );

  // The pane that uses this hook is unmounted, not hidden, when the operator closes it —
  // including mid-run. Without this the listener and every live subscription outlive the pane
  // that owned them.
  useEffect(() => () => transport?.dispose(), [transport]);

  // Runner has no HTTP server (`AGENTS.md`), so this is the IPC uploader
  // (`chat-attachments.ts`), not `@jini-ai/chat`'s daemon-backed one — see that module's doc.
  const uploadAttachments = useMemo(
    () => (bridge === undefined ? undefined : createLocalAttachmentUploader(bridge)),
    [bridge],
  );

  return {
    transport,
    runtimeAccess,
    workingDirectoryAccess,
    getPathForFile: bridge?.getPathForFile,
    uploadAttachments,
  };
}

export interface UseRunnerConversations {
  conversations: readonly WorkspaceConversationSummary[];
  activeId: string | null;
  /**
   * `ChatPane`'s `key`. Deliberately NOT `activeId`.
   *
   * `ChatPane` takes `initialMessages` only at MOUNT (`useConversation.ts`'s
   * `useState(options.initialMessages ?? [])`), so switching to a different conversation's
   * transcript means remounting the pane via a changed `key` — pushing new messages into a live
   * pane would fight its own state instead of replacing it. But `activeId` ALSO changes when an
   * untitled pane silently adopts a freshly created conversation mid-turn (see `onMessagesChange`
   * below), and re-keying on THAT would remount the pane out from under a reply it is currently
   * streaming. So the two stay separate: `paneKey` changes only on `select`/`create`/`remove`;
   * `activeId` tracks where the next write goes. Ported from Tovu admin's
   * `use-assistant-chats.hooks.ts`, which found this the hard way.
   */
  paneKey: string;
  /** Messages to seed the pane with. Changes identity only on a real conversation switch. */
  initialMessages: ChatMessage[];
  select: (id: string) => void;
  create: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  rename: (id: string, title: string) => Promise<void>;
  /**
   * `ChatPane`'s `onMessagesChange`. Fires once on MOUNT with whatever `initialMessages` seeded it
   * with (`useChatPane.hooks.ts`'s effect on `conversation.messages`), so a fresh pane with nothing
   * selected calls this with `[]` at mount — `persistableMessages([]).length === 0` makes that a
   * no-op below, rather than mistaking a mount echo for new content to save.
   */
  onMessagesChange: (messages: ChatMessage[]) => void;
}

/**
 * Owns the fleet chat's persisted conversation threads: which one is open, what's in it, and
 * writing new turns back to Runner's own `runner_conversations`/`runner_conversation_messages`
 * tables over IPC (`fleet-conversation-store.ts`). Structurally mirrors Tovu admin's
 * `useAssistantChats` (`use-assistant-chats.hooks.ts`) — the same hook shape solving the same
 * problem — simplified for a local Sqlite-backed IPC call instead of a flaky HTTP one: no write
 * retry ladder, since a failed local write is not a transient network blip worth re-attempting on
 * a timer, just something to log and let the next delta re-queue.
 *
 * `activeIdRef` mirrors `activeId` state and is written at the point of decision (never from an
 * effect): `onMessagesChange` is called from INSIDE `ChatPane`'s own effect, a child component, and
 * React runs a child's effects before its parent's in the same commit — an effect here mirroring
 * `activeId` would still be reading the outgoing value the moment a delta from the newly-mounted
 * pane arrives. Same hazard `use-assistant-chats.hooks.ts`'s `activeIdRef`/`commitActiveId` documents.
 */
export function useRunnerConversations(): UseRunnerConversations {
  const bridge = useMemo(() => runnerInventoryBridge(), []);

  const [conversations, setConversations] = useState<readonly WorkspaceConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [paneKey, setPaneKey] = useState('new');
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([]);
  const activeIdRef = useRef<string | null>(null);
  /** Message ids already saved, keyed by conversation — without this every delta would re-save the
   *  whole settled transcript, since the callback fires on each one and the settled prefix only grows. */
  const writtenRef = useRef<Map<string, Set<string>>>(new Map());
  /** Guards `select`/`create` against a slower one resolving after a faster, later one already won. */
  const switchSeqRef = useRef(0);
  /** In-flight lazy conversation creation, so concurrent deltas before it resolves adopt ONE conversation, not many. */
  const adoptingRef = useRef<Promise<string | null> | null>(null);
  /** Bumped whenever an in-flight adoption stops belonging to the pane that started it (a `select`/
   *  `create`/`remove` since). An adoption re-checks this before publishing `activeId`. */
  const adoptionGenRef = useRef(0);
  /** Makes each fresh, nothing-selected pane key distinct — `paneKey: 'new'` alone would fail to
   *  remount a pane that had lazily adopted (and is now having that same conversation deleted). */
  const paneNonceRef = useRef(0);
  /** Mirrors the last `conversations` this hook committed, for `remove`'s fallback when its own
   *  `refresh()` lands stale — see `refresh`'s own note. */
  const conversationsRef = useRef<readonly WorkspaceConversationSummary[]>([]);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const resetAdoption = useCallback(() => {
    adoptingRef.current = null;
    adoptionGenRef.current += 1;
  }, []);

  const refresh = useCallback(async (): Promise<readonly WorkspaceConversationSummary[]> => {
    if (bridge === undefined) return conversationsRef.current;
    try {
      const list = await bridge.listConversations();
      setConversations(list);
      return list;
    } catch (err) {
      console.error('tovu-runner: could not load fleet chat conversations —', err);
      return conversationsRef.current;
    }
  }, [bridge]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const commitActive = useCallback((id: string | null) => {
    activeIdRef.current = id;
    setActiveId(id);
  }, []);

  const select = useCallback(
    (id: string) => {
      if (bridge === undefined) return;
      const seq = ++switchSeqRef.current;
      const commit = (messages: ChatMessage[]) => {
        // A slower load for a conversation the operator has since navigated away from must not land.
        if (switchSeqRef.current !== seq) return;
        writtenRef.current.set(id, new Set(messages.map((m) => m.id)));
        setInitialMessages(messages);
        commitActive(id);
        // A deliberate switch is exactly when remounting the pane IS the intent.
        setPaneKey(id);
        resetAdoption();
      };
      void bridge
        .loadConversationMessages(id)
        .then(commit)
        // A failed load still switches, to an empty pane — leaving the operator on the previous
        // conversation while the switcher already says otherwise is the worse of the two failures.
        .catch((err) => {
          console.error(`tovu-runner: could not load fleet chat conversation ${id} —`, err);
          commit([]);
        });
    },
    [bridge, commitActive, resetAdoption],
  );

  const create = useCallback(async () => {
    if (bridge === undefined) return;
    // Claimed BEFORE the request and re-checked after, so a selection made after the click (while
    // the create is still in flight) wins rather than yanking the operator back into a new, empty
    // pane the moment the slower create resolves.
    const seq = ++switchSeqRef.current;
    const conversation = await bridge.createConversation();
    setConversations((current) => [conversation, ...current]);
    if (switchSeqRef.current !== seq) return;
    commitActive(conversation.id);
    setInitialMessages([]);
    setPaneKey(conversation.id);
    writtenRef.current.set(conversation.id, new Set());
    resetAdoption();
  }, [bridge, commitActive, resetAdoption]);

  const remove = useCallback(
    async (id: string) => {
      if (bridge === undefined) return;
      await bridge.deleteConversation(id);
      writtenRef.current.delete(id);
      const list = await refresh();
      if (activeIdRef.current !== id) return;
      const next = list[0]?.id ?? null;
      if (next === null) {
        // Nothing left to land on. Bump the token so a switch already in flight cannot resurrect a
        // transcript into what is about to become an empty pane.
        switchSeqRef.current += 1;
        commitActive(null);
        setInitialMessages([]);
        paneNonceRef.current += 1;
        setPaneKey(`new-${paneNonceRef.current}`);
        // This is the one place `activeId` goes back to `null`, which is the only state that
        // re-enters the lazy-adoption path below — without this reset, the fresh pane would
        // inherit the deleted conversation's adoption and never persist again.
        resetAdoption();
        return;
      }
      // `select`, deliberately, not a raw `setActiveId(next)` — see `select`'s own doc: only
      // `select` publishes id, transcript and written-ids together, in the order that keeps a
      // remount from ever showing an empty pane under a non-empty switcher entry.
      select(next);
    },
    [bridge, refresh, commitActive, resetAdoption, select],
  );

  const rename = useCallback(
    async (id: string, title: string) => {
      if (bridge === undefined) return;
      // Optimistic: a rename that only appears after a round trip feels broken mid-edit.
      setConversations((current) => current.map((c) => (c.id === id ? { ...c, title } : c)));
      try {
        await bridge.renameConversation({ id, title });
      } catch (err) {
        console.error(`tovu-runner: could not rename fleet chat conversation ${id} —`, err);
      }
      void refresh();
    },
    [bridge, refresh],
  );

  /** Writes whatever in `messages` has settled and is not already stored, into `conversationId`. */
  const flush = useCallback(
    (conversationId: string, messages: ChatMessage[]) => {
      if (bridge === undefined) return;
      const written = writtenRef.current.get(conversationId) ?? new Set<string>();
      writtenRef.current.set(conversationId, written);
      const pending = persistableMessages(messages).filter((m) => !written.has(m.id));
      if (pending.length === 0) return;
      // Marked before the request resolves so a second `onMessagesChange` arriving mid-flight —
      // which it will, since deltas keep coming — does not queue the same message twice.
      for (const message of pending) written.add(message.id);
      for (const message of pending) {
        void bridge.saveConversationMessage({ conversationId, message }).catch((err) => {
          console.error('tovu-runner: could not persist a fleet chat message —', err);
          // Un-marked so a later delta gets one more chance, rather than a single failed write
          // silently dropping this message from the durable transcript forever.
          written.delete(message.id);
        });
      }
      // The first turn is what gives an untitled conversation its auto-generated title, and every
      // turn changes `messageCount`/`updatedAt` — re-read rather than patch, so the switcher stays
      // honest without this hook re-deriving the store's own title/ordering rules.
      void refresh();
    },
    [bridge, refresh],
  );

  const onMessagesChange = useCallback(
    (messages: ChatMessage[]) => {
      const conversationId = activeIdRef.current;
      if (conversationId !== null) {
        flush(conversationId, messages);
        return;
      }

      // No conversation is active — the DEFAULT state, not an edge case: nothing selects one on
      // mount, so typing straight into a freshly opened fleet chat (without first clicking "New" or
      // picking from history) lands here. Adopt one lazily, at the first moment there is actually
      // something worth saving, rather than littering the switcher with an empty row per app open.
      if (bridge === undefined || persistableMessages(messages).length === 0) return;

      const generation = adoptionGenRef.current;
      // Claimed only if nothing is already in flight, so two deltas arriving before the create
      // resolves await the SAME creation, not two. (Not `adoptingRef.current ??= …` — Biome's
      // `noAssignInExpressions` refuses an assignment inside the expression that reads it back.)
      if (adoptingRef.current === null) {
        adoptingRef.current = bridge
          .createConversation()
          .then((conversation) => {
            setConversations((current) => [conversation, ...current]);
            writtenRef.current.set(conversation.id, new Set());
            // Superseded: the row exists and shows up in the switcher, but the pane that asked for
            // it is gone (the operator switched away while this was in flight) — pointing
            // `activeId` at it now would route the NEXT pane's writes here. The flush below still
            // runs regardless: these messages came from the pane that asked for this conversation,
            // and dropping them would be exactly the data loss lazy adoption exists to prevent.
            if (adoptionGenRef.current === generation) commitActive(conversation.id);
            return conversation.id;
          })
          .catch((err) => {
            console.error('tovu-runner: could not create a fleet chat conversation —', err);
            return null;
          });
      }
      const adoption = adoptingRef.current;

      void adoption.then((id) => {
        if (id === null) {
          // Cleared so a later turn can retry — leaving a rejected promise in place would wedge
          // persistence for the rest of the session.
          if (adoptingRef.current === adoption) adoptingRef.current = null;
          return;
        }
        flush(id, messages);
      });
    },
    [bridge, flush, commitActive],
  );

  return { conversations, activeId, paneKey, initialMessages, select, create, remove, rename, onMessagesChange };
}

export interface ConversationDeleteConfirmationState {
  /** The title of the conversation currently asking to be confirmed, or `null` when nothing is
   *  pending. Falls back to `'Untitled'` the same way `ConversationList` itself does. */
  pendingTitle: string | null;
  /**
   * `ConversationList`'s `confirmDelete` prop. Deliberately NOT `window.confirm` — this repo has
   * already paid for that lesson once, for project delete: a native modal blocks the whole
   * renderer, and in Electron that also freezes the IPC this window answers on (see
   * `useDeleteConfirmation`'s doc above). This returns a promise that resolves only when the
   * operator answers the inline confirmation `WorkspaceChatPane` renders from `pendingTitle`.
   */
  confirmDelete: (item: ConversationListItem) => Promise<boolean>;
  /** Answers the pending confirmation, if any. A no-op when nothing is pending. */
  resolvePending: (confirmed: boolean) => void;
}

/**
 * The fleet chat's conversation-delete confirmation. `ConversationList` (`@jini-ai/chat/react`)
 * accepts a `confirmDelete` callback returning `boolean | Promise<boolean>` for exactly this
 * purpose — ours resolves it from a real operator click on `WorkspaceChatPane`'s own inline banner
 * rather than from a blocking native dialog. See commit `204f3e6` ("require operator confirmation
 * for project delete") for the precedent this follows.
 */
export function useConversationDeleteConfirmation(): ConversationDeleteConfirmationState {
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const [pendingTitle, setPendingTitle] = useState<string | null>(null);

  const confirmDelete = useCallback((item: ConversationListItem): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      // An unresolved earlier prompt loses to a newer one rather than leaving two pending — the
      // operator can only be looking at (and answering) one banner at a time.
      resolverRef.current?.(false);
      resolverRef.current = resolve;
      setPendingTitle(item.title ?? 'Untitled');
    });
  }, []);

  const resolvePending = useCallback((confirmed: boolean) => {
    resolverRef.current?.(confirmed);
    resolverRef.current = null;
    setPendingTitle(null);
  }, []);

  return { pendingTitle, confirmDelete, resolvePending };
}

function refValue(ref: RefObject<HTMLInputElement | null>): string {
  return ref.current?.value ?? '';
}

/** Pure — no React/DOM dependency, so this is unit-testable on its own. */
export function computeCanCreate(input: {
  slug: string;
  database: DatabaseProviderKind;
  supabaseReady: boolean;
  customReady: boolean;
}): boolean {
  if (input.slug.length === 0) return false;
  if (input.database === 'sqlite') return true;
  return input.database === 'supabase' ? input.supabaseReady : input.customReady;
}

/** Pure — takes every value it needs as an explicit argument rather than closing over component
 *  state, so the submit handler that calls it stays a thin orchestrator. */
export function buildCreateProjectInput(input: {
  displayName: string;
  database: DatabaseProviderKind;
  customProviderLabel: string;
  supabaseUrl: string;
  customConnection: string;
  supabaseKey: string;
  customCredential: string;
}): CreateSiteInput {
  const endpoint =
    input.database === 'supabase'
      ? input.supabaseUrl.trim()
      : input.database === 'custom'
        ? input.customConnection.trim()
        : undefined;
  const credentialValue =
    input.database === 'supabase' ? input.supabaseKey : input.database === 'custom' ? input.customCredential : '';

  return {
    displayName: input.displayName,
    database: {
      kind: input.database,
      ...(input.database === 'custom' && input.customProviderLabel.trim() ? { label: input.customProviderLabel.trim() } : {}),
      ...(endpoint ? { endpoint } : {}),
      ...(credentialValue ? { credential: credentialValue } : {}),
    },
  };
}

/**
 * The typed website name reduced to a compact identifier — shown back to the operator as the
 * workspace preview, and read by {@link computeCanCreate} as "a name has been entered".
 *
 * Unicode-aware by necessity, not by preference. The original `[^a-z0-9]+` deleted every character
 * of a name written in any non-Latin script, so the slug came back empty and `computeCanCreate`
 * refused to enable "Create website": there was no name an operator could type in Japanese, Hindi,
 * Greek, Cyrillic or Arabic that this form would accept at all. It also mangled accented Latin
 * names — `Café Münster` was previewed back as `caf-m-nster`.
 *
 * `\p{M}` is in the keep-set alongside letters and numbers because several scripts write their
 * vowels as combining marks rather than letters; without it `हिन्दी` splits into separator-joined
 * fragments. Anything else still collapses to a separator, so a name with no letters or digits in
 * it (`"!!!"`, whitespace) still yields `''` — the signal the create gate depends on.
 *
 * @complexity O(n) in name length.
 */
export function siteSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

export interface CreateWebsiteFormState {
  name: string;
  setName: Dispatch<SetStateAction<string>>;
  database: DatabaseProviderKind;
  setDatabase: Dispatch<SetStateAction<DatabaseProviderKind>>;
  supabaseUrl: string;
  setSupabaseUrl: Dispatch<SetStateAction<string>>;
  setHasSupabaseKey: Dispatch<SetStateAction<boolean>>;
  customProvider: string;
  setCustomProvider: Dispatch<SetStateAction<string>>;
  customConnection: string;
  setCustomConnection: Dispatch<SetStateAction<string>>;
  setHasCustomCredential: Dispatch<SetStateAction<boolean>>;
  supabaseKeyRef: RefObject<HTMLInputElement | null>;
  customCredentialRef: RefObject<HTMLInputElement | null>;
  slug: string;
  canCreate: boolean;
  isSubmitting: boolean;
  formError: string | null;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

/**
 * The create-website onboarding form: every field, its derived validity, and submission.
 *
 * `hasSupabaseKey`/`hasCustomCredential` track only whether a secret was typed, never the secret
 * itself — the two password inputs stay uncontrolled (`supabaseKeyRef`/`customCredentialRef`) so
 * React holds no copy of a credential anywhere in state or a re-render.
 */
export function useCreateWebsiteForm(
  onCreate: (input: CreateSiteInput) => Promise<void>,
): CreateWebsiteFormState {
  const [name, setName] = useState('');
  const [database, setDatabase] = useState<DatabaseProviderKind>('sqlite');
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [hasSupabaseKey, setHasSupabaseKey] = useState(false);
  const [customProvider, setCustomProvider] = useState('');
  const [customConnection, setCustomConnection] = useState('');
  // Tracked but not read below — see the parity note on `hasSupabaseKey`. A custom provider's
  // credential is optional (the form says so), so `customReady` never gates on it; kept as state
  // so a future required-credential provider has somewhere to plug in without a new field.
  const [hasCustomCredential, setHasCustomCredential] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const supabaseKeyRef = useRef<HTMLInputElement>(null);
  const customCredentialRef = useRef<HTMLInputElement>(null);
  const slug = siteSlug(name);
  const supabaseReady = supabaseUrl.trim().length > 0 && hasSupabaseKey;
  const customReady = customProvider.trim().length > 0 && customConnection.trim().length > 0;
  const canCreate = computeCanCreate({ slug, database, supabaseReady, customReady });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreate || isSubmitting) return;

    const input = buildCreateProjectInput({
      displayName: name,
      database,
      customProviderLabel: customProvider,
      supabaseUrl,
      customConnection,
      supabaseKey: refValue(supabaseKeyRef),
      customCredential: refValue(customCredentialRef),
    });
    // Cleared immediately, before the async call, so the DOM never holds the
    // secret longer than it takes to read it — even if the submit fails.
    if (supabaseKeyRef.current) supabaseKeyRef.current.value = '';
    if (customCredentialRef.current) customCredentialRef.current.value = '';

    setFormError(null);
    setIsSubmitting(true);
    try {
      await onCreate(input);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not create website.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    name,
    setName,
    database,
    setDatabase,
    supabaseUrl,
    setSupabaseUrl,
    setHasSupabaseKey,
    customProvider,
    setCustomProvider,
    customConnection,
    setCustomConnection,
    setHasCustomCredential,
    supabaseKeyRef,
    customCredentialRef,
    slug,
    canCreate,
    isSubmitting,
    formError,
    handleSubmit,
  };
}
