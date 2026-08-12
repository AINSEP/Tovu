import { useEffect, useMemo, useRef, useState } from "react";
import { createFrontendSessionBridge, type FrontendSessionBridge } from "@jini-ai/chat/react";
import { createDomPageDriver } from "@jini-ai/agentic/dom";

import { buildAdminAgentPages } from "./lib/agent-pages";
import { installInternalLinkInterceptor } from "./lib/router";
import { WORKSPACE_ID, api, type AdminUser } from "./lib/api";
import { subscribeToSettingsChanges } from "./lib/settings-events";
import { publishSettingsRefresh } from "./lib/settings-refresh-bus";
import { publishAssistantDockState, subscribeToAssistantDockRequests } from "./lib/assistant-dock-bus";

/**
 * @file `App`'s state/effects/refs/DOM logic (2026-08-12 extraction, same pattern
 * `ChatFab.hooks.tsx`/`AssistantDock.hooks.tsx` already established — see those two files for the
 * reference shape). `App.tsx` keeps props + JSX only; every `useState`/`useEffect`/`useRef` that
 * used to live directly in `App()` now lives in one of the named hooks below, grouped by the
 * cohesive concern each one owns rather than dumped into a single catch-all hook — the same
 * decomposition `AssistantDock.hooks.tsx` uses for its own three hooks.
 *
 * A verbatim move, not a redesign: no behavior changes, and every comment carried over from
 * `App.tsx` was re-checked against the code it now sits next to rather than copied blind — several
 * referred to JSX "below" in the same file, which stopped being true once that JSX stayed in
 * `App.tsx` while the state/effect moved here. Those are rewritten to name the actual file/element
 * they describe instead of a position that no longer holds.
 *
 * `useSession` (the first hook below) is `App`'s one injectable seam, mirroring `ChatFab.tsx`'s
 * `useFab` — every existing test of `App` (`app-plugins-route`, `app-sidebar-rail-storage-key`,
 * `app-agent-page-identity`, `app-route-prototype-keys`) pays the cost of mocking `fetch`/
 * `EventSource` and awaiting the boot screen's exit before it can assert anything, because `App`
 * had no way to skip the real `api.me()` round trip. The other three hooks below are extracted but
 * NOT seamed, the same call `AssistantDock.hooks.tsx`'s own header makes for its three: nothing in
 * this task asked for more seams, and a fake for routing/chat-dock/agent-bridge state buys little
 * that a real `renderHook` test against these exports directly would not already cover.
 */

export interface UseAdminSession {
  user: AdminUser | null;
  /** `true` until the initial `api.me()` round trip settles (resolved or rejected). */
  checking: boolean;
  /** `Login`'s `onLogin` — also publishes an unscoped settings refresh, since signing in changes
   *  what this tab is allowed to read, not just who it is (see this function's own inline comment
   *  in the implementation below for the concrete bug that made that necessary). */
  handleLogin: (next: AdminUser) => void;
  logout: () => Promise<void>;
}

/**
 * Owns the boot-time auth check and the session it resolves to — `App`'s gate on whether to render
 * the boot screen, `Login`, or the real admin shell. Split out as `App`'s one injectable seam (see
 * this file's own header) so a future test can render `App` already authenticated, with no `fetch`
 * mock and no `waitFor` on the boot screen clearing.
 *
 * @example
 * const { user, checking, handleLogin, logout } = useAdminSession();
 */
export function useAdminSession(): UseAdminSession {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  /**
   * The settings change feed, open for as long as an operator is signed in.
   *
   * Mounted here rather than inside `SettingsUi` on purpose. The subscribers are the settings
   * slices, but a change can arrive while the operator is on any page, and the panel that would
   * have opened the connection is frequently not mounted — a feed that only runs while you are
   * already looking at Settings would miss precisely the changes worth telling you about.
   *
   * Gated on `user` so it opens only once authenticated: before login the request has no session
   * and would 401, and `EventSource` would then retry that 401 forever.
   */
  useEffect(() => {
    if (!user) return;
    return subscribeToSettingsChanges(WORKSPACE_ID);
  }, [user]);

  /**
   * Signing in changes what this tab is allowed to READ, not just who it is — so every settings
   * reader already mounted has to re-read.
   *
   * `useAdminLocale()` (called from `App.tsx`, not here) is the visible casualty. It mounts while
   * the login screen is still showing, so its one-shot fetch resolves against a 401 (no session
   * yet), swallows it, and keeps `DEFAULT_LOCALE`. Its effect has no dependency that changes at
   * login, so it never retries: the sidebar stayed English for the whole session no matter what
   * `core.language.locale` said, and an operator who set another language — through the Settings
   * dialog or by asking the assistant — saw the admin ignore it.
   *
   * The bus's unscoped "something moved, re-read" notification is exactly the right signal, and
   * fixes the whole class rather than the locale alone: any settings reader that mounts before
   * authentication has the same 401-at-mount problem. Same reasoning that already gates the change
   * feed above on `user`; this is the read side of it.
   */
  function handleLogin(next: AdminUser) {
    setUser(next);
    publishSettingsRefresh();
  }

  async function logout() {
    await api.logout().catch(() => undefined);
    setUser(null);
  }

  return { user, checking, handleLogin, logout };
}

export interface UseSidebarDrawer {
  /** Off-canvas sidebar drawer, mobile only (`styles.css`'s `@media (max-width: 900px)`; inert at
   *  desktop widths since `.cms-nav` stays in-flow there regardless of this state). */
  sidebarOpen: boolean;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Owns the mobile off-canvas sidebar drawer's open state, plus the two effects that keep it honest:
 * auto-close on navigation, and Escape-to-dismiss while open.
 *
 * @param input.routePath - `useRouteLocation()`'s current value (`App.tsx` still owns the hook
 *   call and the derived `route`, since `parseRoute`/`agentPageId` are routing/rendering concerns
 *   these tests import directly — see this file's own header on what stayed out of this move).
 * @example
 * const { sidebarOpen, setSidebarOpen } = useSidebarDrawer({ routePath });
 */
export function useSidebarDrawer({ routePath }: { routePath: string }): UseSidebarDrawer {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Auto-close the mobile drawer on navigation — every `.cms-item` click is itself a route
  // change, so without this the drawer would stay open (covering the page it just navigated to)
  // until the user separately dismissed it.
  useEffect(() => setSidebarOpen(false), [routePath]);

  // Escape-to-dismiss for the drawer (frontend-accessibility: "keyboard-dismissible"). Scoped to
  // only listen while open, so this never fights other Escape handlers (e.g. a dialog) elsewhere
  // in the app.
  useEffect(() => {
    if (!sidebarOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSidebarOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [sidebarOpen]);

  return { sidebarOpen, setSidebarOpen };
}

/**
 * Plain `<a href="/admin/...">` links stay plain anchors and become SPA navigations here — see
 * `installInternalLinkInterceptor` for why this is a document listener and not a `<Link>`. Its own
 * hook (rather than folded into `useSidebarDrawer`) because it has nothing to do with the drawer —
 * it is app-wide routing infrastructure that happens to have been declared next to the sidebar
 * effects in `App.tsx` before this extraction, not because the two are related.
 */
export function useInternalLinkInterceptor(): void {
  useEffect(() => installInternalLinkInterceptor(), []);
}

export interface UseChatDockLayout {
  chatOpen: boolean;
  setChatOpen: React.Dispatch<React.SetStateAction<boolean>>;
  /** Default↔full-height toggle for the mobile bottom sheet at ≤640px (`styles.css`'s
   *  `.is-expanded`). Session-only (not persisted like the sidebar rail) — a per-conversation
   *  reading preference, not a durable layout choice the way the rail collapse is. */
  sheetExpanded: boolean;
  setSheetExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  /** Tracks the same breakpoint as `styles.css`'s `@media (max-width: 640px)` — needed in JS so
   *  `App.tsx`'s `avoidBottomPx`/`avoidRightPx` props on `<ChatFab>` only measure/hold clearance
   *  for a *bottom* sheet, never for the desktop docked panel (which sits beside `.admin-content`,
   *  not below it, so 0 clearance is correct there regardless of the dock's own height). */
  isSheetMode: boolean;
  /** The mobile sheet's actual rendered height in px, or `0` when not applicable — feeds `App.tsx`'s
   *  `<ChatFab avoidBottomPx>`. */
  sheetHeightPx: number;
  /** The desktop dock's actual rendered width in px, or `0` when not applicable — feeds `App.tsx`'s
   *  `<ChatFab avoidRightPx>`. */
  dockWidthPx: number;
  /** Ref for `App.tsx`'s `<aside>` dock/sheet wrapper — measured by the resize observers below and
   *  used as the programmatic focus target when the dock opens. */
  chatDockRef: React.RefObject<HTMLElement | null>;
  /** Ref for `App.tsx`'s `<ChatFab>` button — the programmatic focus target when the dock closes. */
  chatFabRef: React.RefObject<HTMLButtonElement | null>;
}

/**
 * Owns every piece of state behind the assistant dock's chrome (MSG-06/MSG-09): open/closed,
 * mobile-sheet vs. desktop-docked mode, the sheet's expand/collapse toggle, the measured
 * clearances `ChatFab` needs to avoid overlapping the dock, and focus management on open/close.
 * One hook rather than several smaller ones because every piece here reads or reacts to at least
 * one of the others (e.g. the resize observers are gated on `chatOpen` AND `isSheetMode` together)
 * — splitting further would just re-thread the same handful of values back together as parameters.
 *
 * @example
 * const { chatOpen, setChatOpen, sheetExpanded, setSheetExpanded, isSheetMode, sheetHeightPx,
 *   dockWidthPx, chatDockRef, chatFabRef } = useChatDockLayout();
 */
export function useChatDockLayout(): UseChatDockLayout {
  const [chatOpen, setChatOpen] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const chatDockRef = useRef<HTMLElement | null>(null);
  const chatFabRef = useRef<HTMLButtonElement | null>(null);

  const [isSheetMode, setIsSheetMode] = useState(() => window.matchMedia("(max-width: 640px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    function onChange(e: MediaQueryListEvent) {
      setIsSheetMode(e.matches);
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Measures the sheet's actual rendered height (not a guessed `58vh`/`92vh` in px) so
  // `ChatFab`'s `avoidBottomPx` tracks reality — including mid-transition, since `ResizeObserver`
  // fires on every frame of the `height` CSS transition between default and expanded.
  const [sheetHeightPx, setSheetHeightPx] = useState(0);
  useEffect(() => {
    if (!isSheetMode || !chatOpen) {
      setSheetHeightPx(0);
      return;
    }
    const el = chatDockRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setSheetHeightPx(entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isSheetMode, chatOpen]);

  // The desktop counterpart: measures the docked panel's actual rendered WIDTH, for the same
  // reason and by the same means. The FAB offsets from the right edge and the desktop dock is
  // pinned to the right edge, so with the dock open the FAB landed squarely on the composer's send
  // button and swallowed its clicks — Playwright caught it as "chat-fab intercepts pointer
  // events". Measured rather than hard-coded to the dock's 380px, so a future width change (or a
  // themed/resized dock) cannot silently re-open the same overlap.
  const [dockWidthPx, setDockWidthPx] = useState(0);
  useEffect(() => {
    if (isSheetMode || !chatOpen) {
      setDockWidthPx(0);
      return;
    }
    const el = chatDockRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setDockWidthPx(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isSheetMode, chatOpen]);

  // Escape-to-dismiss for the sheet — same pattern as `useSidebarDrawer`'s own Escape handler.
  // Harmless at desktop widths too (closing the docked panel via Escape is a reasonable universal
  // affordance, not sheet-specific), so this is not gated on `isSheetMode`.
  useEffect(() => {
    if (!chatOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setChatOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [chatOpen]);

  /**
   * The dock's half of `lib/assistant-dock-bus.ts` — a section that cannot reach `setChatOpen`
   * (`renderRoute` passes no props) can still ask for the dock, and any control that mirrors its
   * state stays honest when the FAB is what toggled it.
   *
   * Both directions are wired here, in the hook that owns the boolean, so every open still runs
   * the same focus/escape/sheet-sizing effects above rather than a second, divergent path.
   */
  useEffect(() => subscribeToAssistantDockRequests(setChatOpen), []);
  useEffect(() => publishAssistantDockState(chatOpen), [chatOpen]);

  // Focus into the dock on open, back to the FAB on close (MSG-06). `tabIndex={-1}` on `App.tsx`'s
  // `<aside>` makes it a valid programmatic focus target without adding it to the normal Tab
  // sequence. Keyed off the open/closed *transition*, not `chatOpen` alone, so this does not fight
  // the user's own focus once the dock has been open for a while.
  const chatWasOpen = useRef(false);
  useEffect(() => {
    if (chatOpen && !chatWasOpen.current) {
      chatDockRef.current?.focus();
    } else if (!chatOpen && chatWasOpen.current) {
      chatFabRef.current?.focus();
    }
    chatWasOpen.current = chatOpen;
  }, [chatOpen]);

  return {
    chatOpen,
    setChatOpen,
    sheetExpanded,
    setSheetExpanded,
    isSheetMode,
    sheetHeightPx,
    dockWidthPx,
    chatDockRef,
    chatFabRef,
  };
}

export interface UseAgentPageBridge {
  /**
   * State, not a `useRef`, and attached as a callback ref on `App.tsx`'s `<main ref={setContentEl}>`
   * — because the effect below that builds the page driver needs to run *when this node appears*,
   * and a ref being populated is not a dependency change.
   *
   * The concrete failure that forced this (caught live, not in review): `useAdminSession`'s
   * `api.me()` resolves `setUser` in a `.then` and `setChecking(false)` in a `.finally`, which are
   * separate microtasks and therefore separate renders. On the first of them `user` is set but the
   * layout is still showing the boot screen, so `<main>` is not mounted — a `useRef` would read
   * `null`, the effect would bail, and the render that actually mounts `<main>` would not re-run
   * it, because nothing in its dependency list changed. Page control would then be silently dead
   * for the whole session with no error anywhere.
   */
  contentEl: HTMLElement | null;
  setContentEl: React.Dispatch<React.SetStateAction<HTMLElement | null>>;
  agentBridge: FrontendSessionBridge | null;
}

/**
 * Owns agent-driven control of this tab: the DOM page driver scoped to `App.tsx`'s `<main>`, and
 * the frontend-session bridge that relays each `page.*` invocation the daemon sends down the
 * frontend-session SSE stream (proxied by `src/server/modules/assistant.ts`, already past
 * `ToolExecutor`'s authorization/timeout/audit on the way in — this side only executes what
 * arrives).
 *
 * Scoped to `contentEl`, never `document`. Scanning the whole page would make any markup
 * anywhere — including rendered post content an author or a commenter wrote — into an
 * authorization decision, which is the opposite of an explicit allowlist. The chat pane itself
 * sits outside this subtree on purpose, so a page verb cannot reach into the assistant's own UI.
 *
 * No `currentPage`: the driver reads `data-agent-page` off the live DOM on every call, so a
 * navigation actually changes what elements report themselves as belonging to. Pinning it here
 * would freeze it at whatever was mounted when this effect ran.
 *
 * Outlives every route change — the connection belongs to the tab, not to a view. `contentEl` is
 * stable across navigations (`App.tsx` reuses the same `<main>`; only its children swap), so this
 * does not reconnect on every section change.
 *
 * @example
 * const { contentEl, setContentEl, agentBridge } = useAgentPageBridge();
 */
export function useAgentPageBridge(): UseAgentPageBridge {
  const [contentEl, setContentEl] = useState<HTMLElement | null>(null);
  const [agentBridge, setAgentBridge] = useState<FrontendSessionBridge | null>(null);

  // Stable for the app's lifetime: rebuilding it would tear down the driver (and with it the SSE
  // connection) on every render.
  const agentPages = useMemo(() => buildAdminAgentPages(), []);

  useEffect(() => {
    if (!contentEl) return;

    const bridge = createFrontendSessionBridge({
      pageDriver: createDomPageDriver({ root: contentEl, pages: agentPages }),
      onError: (error) => console.error("[admin] frontend session", error),
    });
    // Attach failure is not fatal: the assistant still works, it just cannot drive the page, and
    // every `page.*` call it makes is refused by name rather than hanging.
    bridge.ready.catch((error: unknown) => console.error("[admin] page control never attached", error));
    setAgentBridge(bridge);

    return () => {
      bridge.close();
      setAgentBridge((current) => (current === bridge ? null : current));
    };
  }, [contentEl, agentPages]);

  return { contentEl, setContentEl, agentBridge };
}
