import { useMemo, type ReactNode } from "react";
import { matchRoute, resolveAgentPageId, type AdminRoute } from "@jini-ai/admin/core";
import { Sidebar, useSidebar } from "@jini-ai/admin/react";
import { useRouteLocation } from "./lib/router";
import { getNav } from "./nav";
import { Login } from "./features/auth";
import { Placeholder } from "./components/Placeholder";
import { ADMIN_PANELS } from "./panels";
import { translateAdminNavGroups, translateAdminNavLabel } from "./lib/admin-nav-i18n";
import { useWiredAdminLocale } from "./hooks/use-admin-locale.hooks";
import { AssistantDock } from "./components/AssistantDock/AssistantDock";
import { ChatFab } from "./components/ChatFab/ChatFab";
import { ASSISTANT_DOCK_DICT } from "./components/AssistantDock/assistant-dock-i18n";
import {
  useAdminAssistantAvailability,
  useAdminSession,
  useAgentPageBridge,
  useChatDockLayout,
  useInternalLinkInterceptor,
  useSidebarDrawer,
} from "./App.hooks";

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

export interface AppProps {
  /**
   * Injectable seam for the boot-time auth check — defaults to the real {@link useAdminSession}.
   * Every existing test of `App` pays for mocking `fetch`/`EventSource` and awaiting the boot
   * screen's exit before it can assert anything about routing or the shell, because there was no
   * way to skip the real `api.me()` round trip. A fake here lets a future test render `App`
   * already authenticated instead.
   */
  useSession?: typeof useAdminSession;
  /** Injectable seam for the mobile drawer's open state — defaults to the real
   *  {@link useSidebarDrawer}. Touches `document` (its Escape-key listener) and `localStorage`
   *  indirectly through the effects it owns, so INFO.md's Components rule 3 applies. */
  useDrawer?: typeof useSidebarDrawer;
  /** Injectable seam for the app-wide SPA-link interceptor — defaults to the real
   *  {@link useInternalLinkInterceptor}. Attaches a real `document` click listener, so rule 3
   *  applies even though this hook has no return value to fake. */
  useLinkInterceptor?: typeof useInternalLinkInterceptor;
  /** Injectable seam for the assistant dock/sheet chrome — defaults to the real
   *  {@link useChatDockLayout}. Touches `window.matchMedia`, two `ResizeObserver`s, `document`
   *  keydown/focus, and `lib/assistant-dock-bus.ts`'s pub/sub, so rule 3 applies. */
  useChatDock?: typeof useChatDockLayout;
  /** Injectable seam for the agent page-control bridge — defaults to the real
   *  {@link useAgentPageBridge}. Constructs an `EventSource`-backed session bridge and a DOM page
   *  driver scoped to the live `<main>` node, so rule 3 applies. */
  useAgentBridge?: typeof useAgentPageBridge;
}

/**
 * Resolves each of `App`'s five injectable-seam props to its real implementation when a caller
 * passes none. The same `??`-avoidance idiom `MenuEditor.tsx`'s `orEmpty`,
 * `CollectionEntryEditor.tsx`'s `resolveCollectionEntryEditorHook`, and
 * `AssistantDock.tsx`'s own resolver group use (2026-08-14, applied here per the DI migration
 * sweep's own follow-up audit — this file's debt-list entry already attributed +6 cyclomatic to
 * exactly this shape): ESLint's cyclomatic-complexity rule counts a default parameter value inside
 * a function's OWN body as one of that function's own branches — a call out to a separately-scoped
 * resolver does not.
 */
function resolveSessionHook(override: typeof useAdminSession | undefined): typeof useAdminSession {
  return override ?? useAdminSession;
}
function resolveDrawerHook(override: typeof useSidebarDrawer | undefined): typeof useSidebarDrawer {
  return override ?? useSidebarDrawer;
}
function resolveLinkInterceptorHook(
  override: typeof useInternalLinkInterceptor | undefined
): typeof useInternalLinkInterceptor {
  return override ?? useInternalLinkInterceptor;
}
function resolveChatDockHook(override: typeof useChatDockLayout | undefined): typeof useChatDockLayout {
  return override ?? useChatDockLayout;
}
function resolveAgentBridgeHook(override: typeof useAgentPageBridge | undefined): typeof useAgentPageBridge {
  return override ?? useAgentPageBridge;
}

export function App(props: AppProps) {
  // No `AppProps = {}` default on the parameter itself (2026-08-14 — the sixth branch this file's
  // debt-list note flagged as untried): every real call site is JSX (`<App />`), and JSX's own
  // `createElement`/`jsx` runtime always constructs an actual props object — `{}` when no
  // attributes are given, never `undefined` — so `App` is never invoked with zero arguments the way
  // a plain function call could be. `AppProps`' five fields are all optional, so `{}` satisfies the
  // type and this compiles the same as before for every existing call site.
  const useSession = resolveSessionHook(props.useSession);
  const useDrawer = resolveDrawerHook(props.useDrawer);
  const useLinkInterceptor = resolveLinkInterceptorHook(props.useLinkInterceptor);
  const useChatDock = resolveChatDockHook(props.useChatDock);
  const useAgentBridge = resolveAgentBridgeHook(props.useAgentBridge);

  const { user, checking, handleLogin, logout } = useSession();
  // `TOVU_ADMIN_ASSISTANT=off` — see `useAdminAssistantAvailability`'s own doc for why this is a
  // separate hook rather than a `useSession()` field, and why it is called unconditionally here
  // (before the `checking`/`!user` early returns below) even though it only fetches once `user` is
  // set: React's rules of hooks forbid calling it conditionally.
  const adminAssistantEnabled = useAdminAssistantAvailability(user);
  const routePath = useRouteLocation();
  const route = useMemo(() => parseRoute(routePath), [routePath]);

  const { sidebarOpen, setSidebarOpen } = useDrawer({ routePath });
  useLinkInterceptor();

  // --- Assistant dock/sheet chrome (MSG-06/MSG-09) — see `useChatDockLayout`'s own doc for why
  // this is one hook rather than several: every value here reads or reacts to at least one other.
  const {
    chatOpen,
    setChatOpen,
    sheetExpanded,
    setSheetExpanded,
    isSheetMode,
    sheetHeightPx,
    dockWidthPx,
    chatDockRef,
    chatFabRef,
  } = useChatDock();

  const { contentEl, setContentEl, agentBridge } = useAgentBridge();

  /**
   * Read once per render rather than at each of the two `<Sidebar.Nav>` call sites below, so both
   * slices are guaranteed to come from the same array instance. `getNav()` is memoized internally
   * (see `nav.ts`), so this is about intent rather than cost: it makes "one nav model, split for
   * layout" explicit instead of leaving two independent lookups to be kept in agreement by hand.
   */
  const rawNavGroups = getNav();

  /**
   * Sidebar nav translation — outside `SettingsUi.tsx`'s `I18nProvider` entirely, since this nav
   * renders on every admin page, not just inside the settings dialog. `useWiredAdminLocale()`
   * (shared with every translated content screen — see `use-admin-locale.hooks.ts`'s own doc
   * comment) re-fetches on every `core.language` refresh notification, not just at mount, so
   * switching the Language setting updates the sidebar immediately instead of requiring a reload.
   */
  const navLocale = useWiredAdminLocale();
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

  if (checking) return <div className="boot-screen">Loading Tovu…</div>;
  if (!user) return <Login onLogin={handleLogin} />;

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
      {/* `TOVU_ADMIN_ASSISTANT=off` (`useAdminAssistantAvailability`'s own doc): the chat surface
          itself, not rendered at all in that state — every endpoint it calls 404s off, so mounting
          it anyway would show a permanently broken dock instead of nothing. Distinct from the
          `ai-assistant` operator control panel (`panels.tsx`), which stays reachable regardless. */}
      {adminAssistantEnabled ? (
        <>
          {/* `hidden`, never unmounted: every admin page shares one assistant conversation, which must
              survive both closing the dock and navigating to a different section (ADR-049).
              `inert` alongside it (not instead of it) — belt-and-suspenders: `hidden` already drops
              this to `display: none`, which removes it from the tab order and accessibility tree on
              its own, but `inert` states that intent explicitly rather than leaving it as a side
              effect of a display value. `tabIndex={-1}` makes the element a valid *programmatic*
              focus target (the open-focus effect in `useChatDockLayout`) without adding it to the
              normal Tab order — the sheet's own close button and the assistant's composer are what Tab
              should reach, not the `<aside>` wrapper itself. */}
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
        </>
      ) : null}
    </div>
  );
}
