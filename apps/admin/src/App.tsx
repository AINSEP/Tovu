import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createFrontendSessionBridge, type FrontendSessionBridge } from "@jini-ai/chat/react";
import { createDomPageDriver } from "@jini-ai/agentic/dom";
import { matchRoute, resolveAgentPageId, type AdminRoute } from "@jini-ai/admin/core";
import { Sidebar, useSidebar } from "@jini-ai/admin/react";
import { buildAdminAgentPages } from "./lib/agent-pages";
import { installInternalLinkInterceptor, useRouteLocation } from "./lib/router";
import { WORKSPACE_ID, api, type AdminUser } from "./lib/api";
import { subscribeToSettingsChanges } from "./lib/settings-events";
import {
  publishAssistantDockState,
  subscribeToAssistantDockRequests,
} from "./lib/assistant-dock-bus";
import { getNav } from "./nav";
import { Login } from "./features/auth";
import { Placeholder } from "./components/Placeholder";
import { ADMIN_PANELS } from "./panels";
import { translateAdminNavGroups, translateAdminNavLabel } from "./lib/admin-nav-i18n";
import { useAdminLocale } from "./hooks/use-admin-locale.hooks";
import { AssistantDock } from "./components/AssistantDock/AssistantDock";
import { ChatFab } from "./components/ChatFab/ChatFab";
import { ASSISTANT_DOCK_DICT } from "./components/AssistantDock/assistant-dock-i18n";

/**
 * A resolved route, plus the one Tovu-local wrinkle `@jini-ai/admin/core`'s generic matcher does
 * not know about — see `parseRoute` below.
 */
interface Route extends AdminRoute {
  /**
   * Set only by the legacy `/section/:id` branch when `id` does not match a registered panel.
   * Distinguishes "a stored URL naming a section that no longer exists" (render `Placeholder`,
   * `unknownSectionId` set) from "an unrecognized bare segment" (`matchRoute` already returns
   * `panelId: null` for that, and it means fall through to the dashboard) — the same distinction
   * `App.tsx` used to make via a separate `"section"` variant in its own `Route` union.
   */
  unknownSectionId?: string;
}

/** Panel id -> panel, for O(1) render dispatch. Built once; `ADMIN_PANELS` is a module constant. */
const PANELS_BY_ID = new Map(ADMIN_PANELS.map((panel) => [panel.id, panel] as const));

/**
 * The `localStorage` key Tovu has always persisted the desktop sidebar rail collapse under.
 * `@jini-ai/admin/react`'s `Sidebar` defaults `railStorageKey` to its own package key
 * (`jini-admin-sidebar-rail-collapsed`) — letting that default stand here would strand every
 * operator's saved rail preference behind a key nothing ever wrote to, springing every collapsed
 * rail back open on the next deploy. Passed straight through to `Sidebar` below.
 */
const SIDEBAR_RAIL_STORAGE_KEY = "tovu-admin-sidebar-rail-collapsed";

/**
 * Parses a *route path* (base already stripped by `router.ts`) into a `Route`.
 *
 * Delegates to `@jini-ai/admin/core`'s `matchRoute` against `panels.tsx`'s `ADMIN_PANELS` for
 * everything except one Tovu-specific shape the generic matcher was never given a branch for:
 * legacy `/section/:id` URLs, which — unlike a modern bare `/settings` segment — accept an
 * *arbitrary* id. `matchRoute` matches over an array (`panels.find(p => p.id === segment)`), so
 * the historic `Object.hasOwn` hazard this file used to guard against (`/admin/constructor` etc.
 * resolving to `Object.prototype` members via `in`) cannot recur here by construction — there is
 * no plain-object key lookup left to walk a prototype chain.
 *
 * `section/` is still accepted as a leading segment. Not for new URLs — nothing generates it any
 * more — but `router.ts`'s legacy-hash redirect strips it, and this is the second line of defence
 * for a stored URL that reaches the parser without going through that redirect.
 */
export function parseRoute(routePath: string): Route {
  const [rawPath] = routePath.split("?");
  const parts = (rawPath ?? "").split("/").filter(Boolean);

  if (parts[0] === "section" && parts[1]) {
    const id = parts[1];
    if (!PANELS_BY_ID.has(id)) {
      return { panelId: null, view: null, params: {}, query: new URLSearchParams(), unknownSectionId: id };
    }
    // A known id resolves exactly like the modern bare-segment path. Anything past the id is
    // ignored, matching the single inline branch this replaces (`/section/settings/foo` never
    // looked past `settings` either).
    return matchRoute(`/${id}`, ADMIN_PANELS);
  }

  return matchRoute(routePath, ADMIN_PANELS);
}

/**
 * Which panel id is "current" for this route — feeds the sidebar highlight directly, and (via
 * {@link agentPageId}'s fallback) the page id an agent is told when no per-route override applies.
 * Deliberately not always {@link agentPageId}'s answer; see that function's own comment for the one
 * case (`widget-regions`) where the two genuinely diverge.
 */
function currentPanelId(route: Route): string {
  return route.unknownSectionId ?? route.panelId ?? "dashboard";
}

/**
 * The page id this route reports to an agent through `data-agent-page`.
 *
 * Deliberately a separate question from {@link currentPanelId}, which is what it used to share
 * before the split. The two answer different questions and only *usually* agree: the sidebar wants
 * the nav row to light up, and an agent wants the id it can pass back to `page.navigate`. Widget
 * regions is where they genuinely diverge — `agent-pages.ts` publishes `widget-regions`, and the
 * sidebar has no such row, so it highlights `widgets`. Sharing one function meant
 * `page.navigate("widget-regions")` landed on the right screen and then reported `after:
 * "widgets"`, i.e. told the agent it had arrived somewhere it had not asked for. An agent's only
 * correction for that is to navigate again. `panels.tsx`'s `widgets` entry carries this exact case
 * forward as a per-route `agentPageId`, which `resolveAgentPageId` reads.
 *
 * Everything else still falls through to the panel id on purpose: a detail route reports its list
 * page (`/posts/abc` → `posts`), which is the nearest id an agent can actually act on.
 *
 * Values here must stay keys of `ADMIN_AGENT_PAGE_PATHS` wherever a published page exists for the
 * route, or the id an agent reads back is one `page.navigate` will refuse.
 */
export function agentPageId(route: Route): string {
  if (route.unknownSectionId !== undefined) return route.unknownSectionId;
  return resolveAgentPageId(ADMIN_PANELS, route.panelId ?? "dashboard", route.view) ?? "dashboard";
}

/**
 * The screen for this route: `Placeholder` for a legacy `/section/:id` naming an id that no longer
 * exists (see `Route.unknownSectionId`), otherwise the matched panel's own render — each panel does
 * its own small `view` switch (see `panels.tsx`), which is what lets a panel own its URL space
 * without a shared dispatch to edit.
 */
function renderRoute(route: Route): ReactNode {
  if (route.unknownSectionId !== undefined) {
    return <Placeholder sectionId={route.unknownSectionId} />;
  }
  const panel = PANELS_BY_ID.get(route.panelId ?? "dashboard");
  return panel ? panel.render({ view: route.view, params: route.params, query: route.query }) : null;
}

/**
 * Tovu's own log-out control, rendered inside `<Sidebar.Footer>`.
 *
 * `@jini-ai/admin/react`'s `Sidebar` no longer renders a log-out button itself — the compound
 * component's whole premise is that "who logs out and how" is a host decision, not a package one
 * (see the package's own file header). This is that decision: same markup, class names
 * (`.cms-logout`, styled by `styles.css`, unchanged by this port), and icon the package used to
 * render internally. `useSidebar().railTooltipProps` is what wires this button into the same
 * rail-mode tooltip behavior every nav item gets — it must be called from inside a `<Sidebar>`,
 * which is why this is a separate component rather than inline JSX in `App`.
 */
function SidebarLogoutButton(props: { onLogout: () => void; locale: string }) {
  const { railTooltipProps } = useSidebar();
  const logOutLabel = translateAdminNavLabel(props.locale, "Log out");
  return (
    <button className="cms-logout" onClick={props.onLogout} {...railTooltipProps(logOutLabel)}>
      <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path d="M7 15H4a1.5 1.5 0 01-1.5-1.5v-9A1.5 1.5 0 014 3h3M11.5 12L15 9l-3.5-3M15 9H7" />
      </svg>
      <span>{logOutLabel}</span>
    </button>
  );
}

export function App() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [checking, setChecking] = useState(true);
  const routePath = useRouteLocation();
  const route = useMemo(() => parseRoute(routePath), [routePath]);
  const [chatOpen, setChatOpen] = useState(false);
  // Off-canvas sidebar drawer, mobile only (`styles.css`'s `@media (max-width: 900px)`; inert
  // at desktop widths since `.cms-nav` stays in-flow there regardless of this state).
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // --- Mobile chat sheet (MSG-06) ---
  // Default↔full-height toggle for the bottom sheet at ≤640px (`styles.css`'s `.is-expanded`).
  // Session-only (not persisted like the sidebar rail) — this is a per-conversation reading
  // preference, not a durable layout choice the way the rail collapse is.
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const chatDockRef = useRef<HTMLElement | null>(null);
  const chatFabRef = useRef<HTMLButtonElement | null>(null);

  // Tracks the same breakpoint as `styles.css`'s `@media (max-width: 640px)` — needed in JS so
  // `avoidBottomPx` below only measures/holds clearance for a *bottom* sheet, never for the
  // desktop docked panel (which sits beside `.admin-content`, not below it, so 0 clearance is
  // correct there regardless of the dock's own height).
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

  // Escape-to-dismiss for the sheet — same pattern as the sidebar drawer's own handler below.
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
   * Both directions are wired here, in the component that owns the boolean, so every open still
   * runs the same focus/escape/sheet-sizing effects above rather than a second, divergent path.
   */
  useEffect(() => subscribeToAssistantDockRequests(setChatOpen), []);
  useEffect(() => publishAssistantDockState(chatOpen), [chatOpen]);

  // Focus into the dock on open, back to the FAB on close (MSG-06). `tabIndex={-1}` on the
  // `<aside>` below makes it a valid programmatic focus target without adding it to the normal
  // Tab sequence. Keyed off the open/closed *transition*, not `chatOpen` alone, so this does not
  // fight the user's own focus once the dock has been open for a while.
  const chatWasOpen = useRef(false);
  useEffect(() => {
    if (chatOpen && !chatWasOpen.current) {
      chatDockRef.current?.focus();
    } else if (!chatOpen && chatWasOpen.current) {
      chatFabRef.current?.focus();
    }
    chatWasOpen.current = chatOpen;
  }, [chatOpen]);
  /**
   * State, not a `useRef`, and attached as a callback ref below — because the effect that builds
   * the page driver needs to run *when this node appears*, and a ref being populated is not a
   * dependency change.
   *
   * The concrete failure that forced this (caught live, not in review): `api.me()` resolves
   * `setUser` in a `.then` and `setChecking(false)` in a `.finally`, which are separate
   * microtasks and therefore separate renders. On the first of them `user` is set but the layout
   * is still showing the boot screen, so `<main>` is not mounted — a `useRef` would read `null`,
   * the effect would bail, and the render that actually mounts `<main>` would not re-run it,
   * because nothing in its dependency list changed. Page control would then be silently dead for
   * the whole session with no error anywhere.
   */
  const [contentEl, setContentEl] = useState<HTMLElement | null>(null);
  const [agentBridge, setAgentBridge] = useState<FrontendSessionBridge | null>(null);

  /**
   * Read once per render rather than at each of the two `<Sidebar.Nav>` call sites below, so both
   * slices are guaranteed to come from the same array instance. `getNav()` is memoized internally
   * (see `nav.ts`), so this is about intent rather than cost: it makes "one nav model, split for
   * layout" explicit instead of leaving two independent lookups to be kept in agreement by hand.
   */
  const rawNavGroups = getNav();

  /**
   * Sidebar nav translation — outside `SettingsUi.tsx`'s `I18nProvider` entirely, since this nav
   * renders on every admin page, not just inside the settings dialog. `useAdminLocale()` (shared
   * with every translated content screen — see its own doc comment) re-fetches on every
   * `core.language` refresh notification, not just at mount, so switching the Language setting
   * updates the sidebar immediately instead of requiring a reload.
   */
  const navLocale = useAdminLocale();
  const navGroups = translateAdminNavGroups(navLocale, rawNavGroups);
  const navSoonLabel = translateAdminNavLabel(navLocale, "Soon");

  /** Same `navLocale`, reused for the assistant dock's mobile-sheet chrome and `ChatFab`'s
   *  "assistant" label below — both live here rather than inside `AssistantDock.tsx`/`ChatFab.tsx`
   *  themselves (see the `<aside>`'s own comment for why), so this is that chrome's translation. */
  const dockT = (key: string): string => ASSISTANT_DOCK_DICT[navLocale]?.[key] ?? key;

  /**
   * Every labelled section collapses (CONTENT, PEOPLE, MARKETING, OPERATIONS, STUDIO,
   * ADMINISTRATION). Derived from the nav rather than hardcoded so a section added to `panels.tsx`
   * later is collapsible the day it appears — a hardcoded list would silently leave exactly one
   * heading behaving differently from its neighbours, which reads as a bug rather than a choice.
   *
   * `filter(Boolean)` drops the ungrouped top row (Overview / AI Assistant), which has no label and
   * therefore no heading to click. It is sliced off below anyway; this keeps the array honest on its
   * own terms rather than relying on that.
   */
  const collapsibleGroups = navGroups.map((group) => group.label).filter((label): label is string => Boolean(label));

  // Plain `<a href="/admin/...">` links stay plain anchors and become SPA navigations here — see
  // `installInternalLinkInterceptor` for why this is a document listener and not a <Link>.
  useEffect(() => installInternalLinkInterceptor(), []);

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

  // Stable for the app's lifetime: rebuilding it would tear down the driver (and with it the SSE
  // connection) on every render.
  const agentPages = useMemo(() => buildAdminAgentPages(), []);

  /**
   * Agent-driven control of this tab. The daemon relays each `page.*` invocation down the
   * frontend-session SSE stream (proxied by `src/server/modules/assistant.ts`), having already
   * passed `ToolExecutor`'s authorization, timeout and audit on the way in — this side only
   * executes what arrives.
   *
   * Scoped to `contentRef`, never `document`. Scanning the whole page would make any markup
   * anywhere — including rendered post content an author or a commenter wrote — into an
   * authorization decision, which is the opposite of an explicit allowlist. The chat pane itself
   * sits outside this subtree on purpose, so a page verb cannot reach into the assistant's own UI.
   *
   * No `currentPage`: the driver reads `data-agent-page` off the live DOM on every call, so a
   * navigation actually changes what elements report themselves as belonging to. Pinning it here
   * would freeze it at whatever was mounted when this effect ran.
   *
   * Outlives every route change — the connection belongs to the tab, not to a view. `contentEl`
   * is stable across navigations (the same `<main>` is reused; only its children swap), so this
   * does not reconnect on every section change.
   */
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

  async function logout() {
    await api.logout().catch(() => undefined);
    setUser(null);
  }

  if (checking) return <div className="boot-screen">Loading Tovu…</div>;
  if (!user) return <Login onLogin={setUser} />;

  const content: ReactNode = renderRoute(route);

  return (
    <div className="admin-layout">
      {/* First focusable element in the app, deliberately before `<Sidebar>` — the auditor
          measured 26 Tab presses to reach main content from a fresh load, because every route
          repeats the full sidebar first, paid on every navigation by a keyboard/screen-reader
          operator. Visually hidden until focused (`.skip-link` in styles.css); the target is
          `#main-content` on `<main>` below, not a route change, so this works identically
          whichever section is currently rendered there. */}
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {/* `railDefaultCollapsed`: Tovu's admin opens as an icon rail for a first-time operator, so
          the 26-item nav does not claim 232px before anyone has asked it to. It is a DEFAULT, not a
          forced state — anyone who toggles the rail has their choice persisted under
          `SIDEBAR_RAIL_STORAGE_KEY` and that stored value wins on every later load. */}
      <Sidebar
        activeId={currentPanelId(route)}
        open={sidebarOpen}
        railStorageKey={SIDEBAR_RAIL_STORAGE_KEY}
        railDefaultCollapsed
      >
        <Sidebar.MobileHeader onClose={() => setSidebarOpen(false)} />
        {/* The nav is rendered in two calls so the rail toggle can sit directly under "AI
            Assistant" instead of down in the footer — the operator wants the collapse control
            beside the sections it collapses, not adrift at the bottom of a 26-item list.
            `getNav()[0]` is the ungrouped top row (Overview + AI Assistant; see `panels.tsx:108`),
            and every later group is a labelled section starting with CONTENT.

            Splitting is safe precisely because `Sidebar.Nav` renders a bare fragment of
            `.cms-section` divs — no wrapper element, no ids, no internal indexing across groups —
            so two calls produce exactly the DOM one call would, with the toggle spliced between.
            Doing it here also keeps this a host-only layout choice: `@jini-ai/admin` is unchanged,
            so no package rebuild is involved and no other host inherits Tovu's arrangement. */}
        <Sidebar.Nav groups={navGroups.slice(0, 1)} soonLabel={navSoonLabel} />
        <Sidebar.RailToggle />
        {/* Collapsible sections (owner-directed, 2026-08-06 — piloted on PEOPLE, then widened to
            all six). `collapsibleGroups` defaults to empty in `@jini-ai/admin`, so this opt-in is
            what turns the headings into controls; other hosts embedding the admin are unaffected.
            Open/closed state persists per section via `useNavSections` (localStorage), survives
            reload and navigation, and syncs across tabs. */}
        <Sidebar.Nav groups={navGroups.slice(1)} collapsibleGroups={collapsibleGroups} soonLabel={navSoonLabel} />
        <Sidebar.Footer>
          <SidebarLogoutButton onLogout={logout} locale={navLocale} />
        </Sidebar.Footer>
      </Sidebar>
      {/* Mobile-only backdrop behind the open drawer (`styles.css` hides `.cms-nav`'s off-canvas
          behavior above 900px, so this has nothing to sit behind there either — conditionally
          rendered rather than CSS-hidden since it would otherwise sit invisibly over the whole
          page, intercepting clicks, whenever the drawer is closed). */}
      {sidebarOpen ? <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} /> : null}
      <div className="admin-main-col">
        {/* Hidden above the tablet breakpoint (desktop keeps the always-visible sidebar) — see
            `.admin-topbar` in styles.css. */}
        <div className="admin-topbar">
          <button
            type="button"
            className="admin-topbar-toggle"
            aria-expanded={sidebarOpen}
            aria-controls="admin-sidebar"
            aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
            onClick={() => setSidebarOpen((current) => !current)}
          >
            <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              <path d="M2.5 5h13M2.5 9h13M2.5 13h13" strokeLinecap="round" />
            </svg>
          </button>
          <span className="admin-topbar-title">Tovu</span>
        </div>
        {/* `data-agent-page` is how the page driver reports where it is: `page.find_elements` tags
            every handle with its nearest `[data-agent-page]` ancestor, and `page.navigate` reads it
            back to say which page it left and which it landed on. `agentPageId`, not
            `currentPanelId` — they agree for every route but widget regions, where the published
            page id and the highlighted sidebar row are genuinely different things. */}
        {/* `tabIndex={-1}` — without it, activating the skip link above scrolls `<main>` into
            view but does not actually move keyboard focus there, since a plain `<main>` isn't
            natively focusable; the skip link would then satisfy the letter of "skip navigation"
            while missing the actual point (the next Tab press would resume from wherever focus
            really was, not from main content). Not in the normal Tab order either way, since -1
            only allows *programmatic* focus (the skip link's own `href` jump). */}
        <main id="main-content" className="admin-content" ref={setContentEl} tabIndex={-1} data-agent-page={agentPageId(route)}>
          {content}
        </main>
      </div>
      {/* `hidden`, never unmounted: every admin page shares one assistant conversation, which must
          survive both closing the dock and navigating to a different section (ADR-049).
          `inert` alongside it (not instead of it) — belt-and-suspenders: `hidden` already drops
          this to `display: none`, which removes it from the tab order and accessibility tree on
          its own, but `inert` states that intent explicitly rather than leaving it as a side
          effect of a display value. `tabIndex={-1}` makes the element a valid *programmatic*
          focus target (the open-focus effect above) without adding it to the normal Tab order —
          the sheet's own close button and the assistant's composer are what Tab should reach,
          not the `<aside>` wrapper itself. */}
      {/*
        `data-theme="light"` is REQUIRED, not cosmetic, for the same reason `features/settings/SettingsUi.tsx`
        and `features/ai-assistant/AiAssistant.tsx` pin it — and it must live on THIS element, not on a wrapper
        inside `<AssistantDock>`.

        The runtime picker's BYOK model dropdown is `@jini-ai/ui`'s `CustomSelect`, which portals its
        menu to `document.body` and so escapes any ancestor's theme. It compensates by copying the
        theme from its trigger's nearest `[data-theme]` ancestor. The dock had none, so the menu fell
        through to the stylesheet's dark variant and opened dark inside an all-light admin.

        A `display: contents` wrapper inside `AssistantDock` looks like the tidier place for this and
        is a trap: it generates no box, so `assistant.css`'s `.admin-chat-dock > * { flex: 1 }`
        matched the wrapper and applied to nothing, while `ChatPane` — a grandchild in the DOM, which
        is what child combinators read — stopped matching it at all and collapsed to content width.
        Measured: the dock rendered at roughly half its width. Putting the attribute here adds no
        element and cannot affect layout.
      */}
      <aside
        ref={chatDockRef}
        data-theme="light"
        className={`admin-chat-dock${chatOpen ? " is-open" : ""}${sheetExpanded ? " is-expanded" : ""}`}
        hidden={!chatOpen}
        inert={!chatOpen}
        tabIndex={-1}
        aria-label="Assistant"
      >
        {/* Mobile-sheet-only chrome (`styles.css` hides this at desktop widths, where the docked
            panel closes only via the FAB same as before) — rendered here, around
            `<AssistantDock>`, rather than inside it: that component's own internals are not
            where this dispatch's changes belong (ADR-049's "never unmount" is about not touching
            its mount lifecycle, and staying out of its render body is the safest way to honor
            that). */}
        <div className="chat-sheet-bar">
          <span className="chat-sheet-handle" aria-hidden="true" />
          <span className="chat-sheet-bar-title">{dockT("Tovu assistant")}</span>
          <span className="chat-sheet-bar-actions">
            <button
              type="button"
              className="chat-sheet-action"
              onClick={() => setSheetExpanded((current) => !current)}
              aria-expanded={sheetExpanded}
              aria-label={sheetExpanded ? dockT("Collapse assistant panel") : dockT("Expand assistant panel")}
            >
              <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                {sheetExpanded ? <path d="M4 11.5 9 6.5l5 5" /> : <path d="M4 6.5 9 11.5l5-5" />}
              </svg>
            </button>
            <button
              type="button"
              className="chat-sheet-action"
              onClick={() => setChatOpen(false)}
              aria-label={dockT("Close assistant")}
            >
              <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                <path d="M5 5 13 13M13 5 5 13" strokeLinecap="round" />
              </svg>
            </button>
          </span>
        </div>
        <AssistantDock agentBridge={agentBridge} />
      </aside>
      <ChatFab
        ref={chatFabRef}
        open={chatOpen}
        onToggle={() => setChatOpen((current) => !current)}
        label={dockT("assistant")}
        locale={navLocale}
        avoidBottomPx={isSheetMode && chatOpen ? sheetHeightPx : 0}
        avoidRightPx={!isSheetMode && chatOpen ? dockWidthPx : 0}
      />
    </div>
  );
}
