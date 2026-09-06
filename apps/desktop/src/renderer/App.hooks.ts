/**
 * Custom hooks pulled out of `App.tsx`.
 *
 * Most of this is stateful/effectful logic that used to live inline inside `App()` or one of its
 * child components — polling, subscriptions, and view state. Splitting it out of the components is
 * what let `App()` and `ProjectGrid` drop back under the complexity ceiling without changing what
 * either one does; see the header comment in `eslint.config.mjs` for why that ceiling exists. This
 * file carries no JSX and no rendering decisions of its own — those stay in `App.tsx`, unchanged
 * in shape.
 *
 * The plain functions mixed in here (`deriveFleetView`, `computeCanCreate`,
 * `buildCreateProjectInput`, `siteSlug`) are deliberately NOT hooks. Each is a rule that used to
 * be inlined into a hook body, pulled out to where it can be called with an object and asserted
 * against directly — no React, no component, no hook harness. When something in this file can be
 * a pure function, it should be one; the hooks around them exist for the state and the effects
 * they genuinely need.
 *
 * Components take these hooks as props with the real hook as the default (see `App`,
 * `ProjectGrid`, `CreateWebsiteOnboarding`), so a test can substitute a stub without the component
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
import { createRunnerChatTransport, type RunnerChatTransport } from './fleet-chat-transport.js';
import { createLocalAttachmentUploader } from './chat-attachments.js';
import { persistableMessages } from './persistable-messages.js';
import type { RunnerSectionId } from '../contracts/sections.js';
import type { CreateProjectInput, DatabaseProviderKind, ProjectRecord } from '../contracts/project.js';
import type { RunnerConversationSummary } from '../contracts/fleet-conversations.js';

/**
 * Polls Runner's project inventory on a 4s interval.
 *
 * Runner supervises OS processes that change state on their own — a site can crash, or finish
 * booting, with no user action in this window. A mount-only fetch would leave the grid showing a
 * state that stopped being true minutes ago, so re-poll on an interval.
 */
export function useProjectsPolling(): {
  projects: readonly ProjectRecord[];
  setProjects: Dispatch<SetStateAction<readonly ProjectRecord[]>>;
  projectsLoading: boolean;
  loadError: string | null;
} {
  const [projects, setProjects] = useState<readonly ProjectRecord[]>([]);
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
        .listProjects()
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
 * `runner.navigate` is a tool the fleet chat can actually call, so the nav is agent-movable and
 * not only user-movable. Nothing else in main pushes on this channel. It also pulls focus back
 * to the fleet tab — navigating to a Runner section while a site's admin fills the screen would
 * otherwise change something the operator cannot see.
 *
 * Takes the RAW `setActiveId`, deliberately not `useSectionNav`'s `selectSection`. Agent
 * navigation therefore does not close the Appearance page or cancel a half-filled create form the
 * way a click on the nav does. That asymmetry is pre-existing and preserved here unchanged, but it
 * is worth knowing about: with Appearance open, a `runner.navigate` call moves `activeId` and the
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
 * it, and whether the create-website form has replaced the fleet grid.
 *
 * These three used to be raw `useState` calls in `App`, kept there on the argument that they cross
 * sibling subtrees and are written together by coordinated callbacks. That argument is about
 * architecture and answers the wrong question — `selectSection` writes four pieces of state at
 * once, and "does moving section also cancel a half-filled create form" is exactly the kind of
 * thing worth pinning down without standing up a component tree. Owning them here makes that one
 * function the unit under test; `App` still does the wiring, it just no longer holds the setters.
 *
 * `setActiveTab` arrives as an argument rather than being owned here because tabs are a separate
 * concern with a separate hook (`useProjectTabs`) — but dropping to the fleet tab is genuinely part
 * of every section-level move, so the call belongs inside these callbacks rather than duplicated at
 * each `App` call site. That ordering constraint (tabs hook first, this one second) is why the
 * `activeId`/`appearanceOpen` half of the old `useProjectTabs` became `deriveFleetView` below.
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
  // returns to the fleet grid rather than to a workspace the operator has not seen for a while.
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
  // Project ids with an open tab, in the order they were opened. Always empty under the
  // N-BrowserWindow model — see this hook's own doc — kept in the shape so `TabStrip` and
  // `deriveFleetView` need no separate "no tabs" type.
  openTabs: readonly string[];
  activeTab: string | null;
  setActiveTab: Dispatch<SetStateAction<string | null>>;
  closeProjectTab: (id: string) => void;
}

/**
 * Owns which project tabs are open and which one is selected — the state, and nothing derived
 * from it. Everything that was derived here now lives in `deriveFleetView`, which needs section
 * state this hook does not have.
 *
 * `openTabs` never grows under the N-`BrowserWindow` model: a project opens in its OWN OS window
 * (`useOpenProjectWindow`, IPC to `openSiteWindow`) rather than an embedded tab, so there is
 * nothing left for a tab to switch to — the tab strip renders its permanent "All" tab only (see
 * `TabStrip` in `App.tsx`). No `openProjectTab` here for exactly that reason: nothing calls it.
 * `closeProjectTab` stays — `useProjectMutations`'s delete flow still calls it defensively, and it
 * is a safe no-op against an already-empty list.
 */
export function useProjectTabs(): ProjectTabsState {
  // `null` active tab means the fleet tab (Runner's own sections); a string would mean a
  // project's tab, but nothing ever sets one — see this hook's own doc.
  const [openTabs, setOpenTabs] = useState<readonly string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const closeProjectTab = (id: string) => {
    setOpenTabs((current) => current.filter((tabId) => tabId !== id));
    // Closing the tab you are looking at falls back to the fleet tab rather than guessing a
    // neighbour — the fleet tab always exists, so there is no second empty-state to design.
    setActiveTab((current) => (current === id ? null : current));
  };

  return { openTabs, activeTab, setActiveTab, closeProjectTab };
}

/**
 * A project card's click target under the N-`BrowserWindow` model: ask main to open (or focus)
 * that project in its own OS window, via `runner:projects:open-window` → `openSiteWindow`. Errors
 * are logged rather than surfaced inline — there is no per-card error slot in `ProjectGrid` today,
 * and the 4s poll (`useProjectsPolling`) is what would show the project as still stopped if the
 * open genuinely failed.
 */
export function useOpenProjectWindow(): (id: string) => void {
  return useCallback((id: string) => {
    const bridge = runnerInventoryBridge();
    if (bridge === undefined) return;
    void bridge.openProjectWindow(id).catch((err) => {
      console.error(`tovu-runner: could not open project ${id} —`, err);
    });
  }, []);
}

export interface ProjectMutationsState {
  /**
   * The created record, not just its name: the notice reports the port and template version the
   * provisioner actually produced, which is the only place those are known to be true.
   */
  lastCreated: ProjectRecord | null;
  openCreateWebsite: () => void;
  handleCreate: (input: CreateProjectInput) => Promise<void>;
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
 * The fleet mutations `App` offers — open the create form, create, delete, cancel a create — plus
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
  setProjects: Dispatch<SetStateAction<readonly ProjectRecord[]>>;
  closeProjectTab: (id: string) => void;
  stopCreating: () => void;
  startCreating: () => void;
}): ProjectMutationsState {
  const [lastCreated, setLastCreated] = useState<ProjectRecord | null>(null);
  // See `createFormKey` on `ProjectMutationsState`. Starts at 0 and only ever goes up; the actual
  // number carries no meaning beyond "changed since the form last mounted".
  const [createFormKey, setCreateFormKey] = useState(0);

  // Clear first, open second. The notice names a specific site on a specific port; carrying the
  // previous one into a fresh form would caption the new site with the old site's facts.
  //
  // Bumping `createFormKey` here is what makes "+ Create website" mean what it says. The form
  // survives being HIDDEN — Appearance, a project tab, `runner.navigate` — because those leave
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

  const handleCreate = async (input: CreateProjectInput) => {
    const bridge = runnerInventoryBridge();
    if (bridge === undefined) {
      throw new Error('Runner desktop connection required to create a website.');
    }
    const result = await bridge.createProject(input);
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
    await bridge.deleteProject(id);
    // Dropped locally rather than left to the 4s poll: the card the operator just confirmed
    // against would otherwise sit there looking untouched for up to four seconds. Its tab goes
    // too — a tab pointing at a deleted project has nothing left to render.
    deps.setProjects((current) => current.filter((project) => project.id !== id));
    deps.closeProjectTab(id);
  };

  return { lastCreated, openCreateWebsite, handleCreate, handleDelete, cancelCreate, createFormKey };
}

export interface FleetView {
  // Tabs are a Projects mechanic. Every other section is a single Runner screen, so a strip above
  // one would advertise routes that section cannot take.
  inProjects: boolean;
  showFleet: boolean;
  // Whether the (permanently mounted, see `CreateWebsiteHost` in `App.tsx`) create form should be
  // the thing on screen right now, as opposed to hidden behind Appearance or a non-Projects
  // section.
  showCreateForm: boolean;
}

/**
 * Everything `App` renders from that is a pure function of section state + the create-form flag:
 * whether the fleet grid or the create form is on screen.
 *
 * A plain function, not a hook, and that is the point. It holds no state and calls nothing from
 * React, so the whole "which surface should be showing" rule set is exercisable by calling it with
 * an object — no renderer, no component, no hook harness.
 *
 * Reduced from its original shape, which also derived a project's embedded-tab workspace
 * (`openProjects`, `activeProject`, `showProjectTab`, `visibleWorkspaceId`). Under the
 * N-`BrowserWindow` model a project opens in its own OS window, never an embedded tab (see
 * `useOpenProjectWindow`), so `openTabs`/`activeTab` never hold a project id and `showFleet` is
 * simply "is Projects the active section" — there is no second surface left to derive a switch
 * between. `activeTab`/`openTabs` stay as parameters rather than being dropped from the signature:
 * `useSectionNav`'s `setActiveTab` calls still reset them on every section move, and a caller here
 * should not need to know that reset is now inert to pass the right shape.
 */
export function deriveFleetView(input: {
  activeId: RunnerSectionId;
  appearanceOpen: boolean;
  activeTab: string | null;
  openTabs: readonly string[];
  projects: readonly ProjectRecord[];
  isCreating: boolean;
}): FleetView {
  void input.activeTab;
  void input.openTabs;
  void input.projects;

  const inProjects = input.activeId === 'projects';
  const showFleet = true;
  const showCreateForm = input.isCreating && !input.appearanceOpen && showFleet && inProjects;

  return { inProjects, showFleet, showCreateForm };
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
 * Connects `RunnerChatPane` to the fleet chat transport: the bridge lookup, the transport built
 * on top of it, and the runtime-access and working-directory surfaces `ChatPane` needs. All three
 * are one bridge lookup, so they live in one hook rather than one per concern.
 */
export function useRunnerChatTransport(): {
  transport: RunnerChatTransport | undefined;
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
    () => (bridge === undefined ? undefined : createRunnerChatTransport(bridge)),
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
  conversations: readonly RunnerConversationSummary[];
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

  const [conversations, setConversations] = useState<readonly RunnerConversationSummary[]>([]);
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
  const conversationsRef = useRef<readonly RunnerConversationSummary[]>([]);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const resetAdoption = useCallback(() => {
    adoptingRef.current = null;
    adoptionGenRef.current += 1;
  }, []);

  const refresh = useCallback(async (): Promise<readonly RunnerConversationSummary[]> => {
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
   * operator answers the inline confirmation `RunnerChatPane` renders from `pendingTitle`.
   */
  confirmDelete: (item: ConversationListItem) => Promise<boolean>;
  /** Answers the pending confirmation, if any. A no-op when nothing is pending. */
  resolvePending: (confirmed: boolean) => void;
}

/**
 * The fleet chat's conversation-delete confirmation. `ConversationList` (`@jini-ai/chat/react`)
 * accepts a `confirmDelete` callback returning `boolean | Promise<boolean>` for exactly this
 * purpose — ours resolves it from a real operator click on `RunnerChatPane`'s own inline banner
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
}): CreateProjectInput {
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

export function siteSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
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
  onCreate: (input: CreateProjectInput) => Promise<void>,
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
