import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { createFrontendSessionBridge, type FrontendSessionBridge } from "@jini-ai/chat/react";
import { createDomPageDriver } from "@jini-ai/agentic/dom";

import { buildAdminAgentPages } from "./lib/agent-pages";
import {
  ADMIN_CAPTURE_SCREENSHOT_CAPABILITY_ID,
  captureAdminScreenshotToolResult,
  renderAdminScreenshotCanvas,
  type RenderElementToCanvas,
} from "./lib/agent-screenshot";
import { publishScreenshotCaptured, subscribeToScreenshotCaptured } from "./lib/agent-screenshot-bus";
import { installInternalLinkInterceptor, navigate } from "./lib/router";
import { WORKSPACE_ID, api, onUnauthenticated, type AdminUser } from "./lib/api";
import { takeBootToken } from "./lib/boot-token-fragment";
import { subscribeToSettingsChanges } from "./lib/settings-events";
import { publishSettingsRefresh } from "./lib/settings-refresh-bus";
import { publishAssistantDockState, subscribeToAssistantDockRequests } from "./lib/assistant-dock-bus";
import { t as translateAssistantDockDictLabel } from "./components/AssistantDock/assistant-dock-i18n";
import type { AdminNavGroup, AdminNavItem } from "./nav";

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
 * All five hooks below are exposed as injectable seams on `App.tsx`'s `AppProps` (`useSession`,
 * `useDrawer`, `useLinkInterceptor`, `useChatDock`, `useAgentBridge` — see `App.tsx` for the exact
 * prop names and wiring), per `INFO.md`'s Components rule 3: every one of them touches the DOM,
 * a browser API, or IO. `useSession` was the first seamed and is still the highest-value one —
 * every existing test of `App` (`app-plugins-route`, `app-sidebar-rail-storage-key`,
 * `app-agent-page-identity`, `app-route-prototype-keys`) pays the cost of mocking `fetch`/
 * `EventSource` and awaiting the boot screen's exit before it can assert anything, because `App`
 * had no way to skip the real `api.me()` round trip. (An earlier revision of this comment said the
 * other four were extracted but deliberately not seamed, on the reasoning that nothing in that
 * task asked for more and `AssistantDock.hooks.tsx`'s own header made the same call for its three.
 * That call did not survive contact with rule 3 — `AssistantDock.hooks.tsx`'s header was corrected
 * the same day, and this one is corrected here rather than left to disagree with it.)
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
    // The zip launcher's one-time sign-in link (run-from-zip plan S2): `#boot=<token>`. Read and
    // stripped SYNCHRONOUSLY, before either network call below fires — see `takeBootToken`'s own
    // doc for why the fragment must not survive past this line. `null` (no fragment, the ordinary
    // case for every ELSE launch path) skips straight to the existing `api.me()` chain, unchanged.
    const bootToken = takeBootToken(window.location, window.history);
    const redeemed = bootToken ? api.redeemBootSession(bootToken).catch(() => undefined) : Promise.resolve(undefined);

    redeemed
      .then(() => api.me())
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  /**
   * A 401 from ANY screen's own `request()` call (`lib/api.ts`) means this tab's session is no
   * longer valid — expired, revoked, or the server restarted and dropped in-memory state. Clearing
   * `user` here re-triggers `App.tsx`'s existing `if (!user) return <Login .../>` gate, the same
   * screen the boot check above already shows for a not-yet-authenticated tab. No new UI: a
   * mid-session 401 now degrades to the exact same place a fresh unauthenticated load already goes,
   * instead of leaving whichever screen hit the 401 spinning with no explanation (the live bug this
   * fixes, 2026-08-17 — see `onUnauthenticated`'s own doc comment in `lib/api.ts`).
   */
  useEffect(() => onUnauthenticated(() => setUser(null)), []);

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
   * `useWiredAdminLocale()` (called from `App.tsx`, not here) is the visible casualty. It mounts while
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

/**
 * Whether the ADMIN assistant is enabled server-side (`TOVU_ADMIN_ASSISTANT=off`,
 * `admin-assistant-enabled.ts`) — gates whether `App.tsx` mounts `AssistantDock`/`ChatFab` at all.
 * Off is a real disable, not a hidden widget: every endpoint the dock calls 404s in that state, so
 * rendering it anyway would show a permanently broken chat surface instead of nothing.
 *
 * Reuses the SAME `GET .../assistant/settings` endpoint and `api.getAssistantSettings()` function
 * the "AI Assistant" panel's own `use-ai-assistant.hooks.ts` already calls, reading the sibling
 * `adminAssistantEnabled` field that route's own doc explains piggy-backing onto that response
 * — no new endpoint. `assistant-settings` is one of exactly two admin-assistant server modules
 * mounted UNCONDITIONALLY (`server/app.ts`'s module-mounting comment), so this GET stays reachable
 * and answers correctly with the flag off, unlike the four gated modules the dock itself would
 * otherwise call.
 *
 * Defaults to `true` (rendered) until the fetch settles, and fails open on a rejected fetch —
 * mirroring both the server's own "default ON, absent the var" posture
 * (`admin-assistant-enabled.ts`'s header) and this admin's existing fail-open convention for
 * degraded reads (`useAdminLocale` falls back to English the same way rather than blanking the
 * sidebar). This means the (rare, operator-chosen) OFF case can briefly mount the dock before
 * hiding it once the fetch resolves — accepted deliberately: no conversation has started in that
 * window, so nothing is lost, and the far more common ON/default case never delays the dock's
 * first paint waiting on a network round trip.
 *
 * Gated on `user`, mirroring `useAdminSession`'s own settings-change-feed effect: a pre-login
 * request would 401, and this value plays no role before `App.tsx`'s `<Login>` gate clears.
 *
 * Deliberately NOT folded into `useAdminSession` above despite the obvious similarity. That hook's
 * existing regression coverage (`app-session-unauthenticated-kickback.unit.test.tsx`) counts raw
 * `fetch` mock invocations by call ORDER to test 401/403 handling; a second fetch fired from inside
 * that same hook would shift every one of those counts and make the suite racy for reasons entirely
 * unrelated to what it tests. A sibling hook, called separately from `App()`, costs nothing and
 * leaves that suite untouched.
 *
 * @param user - `useAdminSession()`'s current session, or `null` before login.
 * @returns `true` unless the server has confirmed the flag is off.
 */
export function useAdminAssistantAvailability(user: AdminUser | null): boolean {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api
      .getAssistantSettings()
      .then((response) => {
        if (!cancelled) setEnabled(response.adminAssistantEnabled ?? true);
      })
      .catch(() => {
        // Fail open — see this function's own doc comment.
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return enabled;
}

/**
 * `panels.tsx`'s own id for the Sites section, named once here rather than inlined at the two call
 * sites that gate on it ({@link withoutSiteSection} and {@link resolveSiteSectionRouteGate}).
 *
 * The id itself is untouched by this gate, deliberately: `ADMIN_PANELS` still declares `sites` in
 * the same position with the same `nav` block, `matchRoute` still resolves `/sites` to it, and
 * `ADMIN_AGENT_PAGE_PATHS` still publishes it. Hiding a section here means "do not show it and do
 * not let this route render it on this deployment" — never renaming, renumbering, or removing a
 * panel, which would move every other section's identity with it.
 */
export const SITES_PANEL_ID = "sites";

/**
 * Whether this deployment has a Sites section at all.
 *
 * Three states, not a boolean, and the third one is the point: the answer comes from the server,
 * so "not answered yet" has to be distinguishable from "no". Collapsing `unknown` into `false`
 * would redirect a developer's own `/admin/sites` deep link to the dashboard in the window before
 * the flag arrives; collapsing it into `true` would flash the Sites screen inside the desktop app,
 * which is the exact thing this gate exists to prevent.
 */
export type SiteSectionAvailability = "unknown" | "available" | "unavailable";

/**
 * Reads the deployment's site-switcher capability flag and reports it as a section-visibility
 * answer.
 *
 * ## Why this reuses `switchingEnabled` rather than introducing a second flag
 *
 * `TOVU_ENABLE_SITE_SWITCHER` (`apps/website/src/server/runtime/composition/site-switcher-enabled.ts`)
 * already exists, is already default-OFF, and its own header already enumerates exactly the three
 * deployments this section cares about: ON for local `npm run dev` (set by
 * `development/scripts/dev.mjs`), OFF for a Tovu-Runner/desktop host, OFF for a hosted install.
 * That is the owner's requirement verbatim — "sites page is for when a dev runs `npm run dev`
 * themselves" — with no new variable, and with nothing to set on the desktop side: the Electron
 * shell's `buildServeEnv` never sets this var, so every server it spawns already reports it off.
 *
 * The flag also already reaches this client. `GET .../system/sites` is deliberately NOT gated on
 * it; the route carries its value instead, and that route's own header states the intended use in
 * as many words — "its response CARRIES the flag's value (`switchingEnabled`) so the UI can decide
 * whether to render the 'Sites' nav item, a disabled Create button, etc. without a second round
 * trip". Until now only the second half of that sentence was wired: `Sites.tsx` disabled Create and
 * Activate and explained why, while the nav item and the route stayed live everywhere. This hook is
 * the first half.
 *
 * A plain `useState`/`useEffect` pair rather than `useFetchQuery`, matching
 * {@link useAdminAssistantAvailability} directly above it: this file's imports stop at `lib/`, and
 * reaching into `features/sites/rules.ts` for its cache key to share one request would invert that.
 * The cost is one extra `GET .../system/sites` on the Sites screen itself, where the screen's own
 * query runs anyway — a directory listing, on the one screen that was always going to make it.
 *
 * Fails CLOSED, the opposite of `useAdminAssistantAvailability`'s fail-open posture, because the
 * server's own default is the opposite: absent the var the capability is off, and
 * `features/sites/rules.ts`'s `readSnapshot` already records the same rule for the same field
 * ("`switchingEnabled` in particular must fall back to `false`, not true"). A rejected read —
 * including the 403 an operator without `system.read` gets — therefore hides the section rather
 * than showing a screen whose every request would fail.
 *
 * Gated on `user` for the same reason its sibling is: a pre-login request would 401, and the value
 * plays no role before `App.tsx`'s `<Login>` gate clears.
 *
 * @param user - `useAdminSession()`'s current session, or `null` before login.
 * @returns `unknown` until the read settles, then `available` only if the server said the flag is on.
 * @complexity O(1) plus one server round trip per session.
 */
export function useSiteSectionAvailability(user: AdminUser | null): SiteSectionAvailability {
  // Keyed to the SESSION OBJECT that asked, not a bare flag — an answer belongs to the `user` that
  // was current when its read settled. Logout, a 401, and a new login each set a NEW `user`
  // reference (`useAdminSession`; nothing re-creates the same one mid-session), so the derived
  // return below reads `unknown` for every one of those until that session's own read settles.
  // Without this, `setAvailability` alone survived logout/401 (both are just `setUser(null)`, with
  // no reload) and kept painting the PREVIOUS session's answer — including into the first frame of
  // whoever logs in next, before their own request has even started.
  const [answer, setAnswer] = useState<{ user: AdminUser; value: "available" | "unavailable" } | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api
      .listSites()
      .then((snapshot) => {
        if (!cancelled) setAnswer({ user, value: snapshot.switchingEnabled === true ? "available" : "unavailable" });
      })
      .catch(() => {
        // Fails closed — see this function's own doc comment.
        if (!cancelled) setAnswer({ user, value: "unavailable" });
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return answer !== null && answer.user === user ? answer.value : "unknown";
}

/** {@link withoutSiteSection}'s predicate, hoisted out of the `.filter` call so the id comparison is
 *  one named thing rather than an inline arrow repeated per group. */
function isNotSiteSection(item: AdminNavItem): boolean {
  return item.id !== SITES_PANEL_ID;
}

/**
 * The sidebar nav model with the Sites row dropped when this deployment has no Sites section.
 *
 * Filters ITEMS, never groups. `App.tsx` splits the rendered nav by group index
 * (`navGroups.slice(0, 1)` for the ungrouped top row, `.slice(1)` for the labelled sections), so
 * dropping a group would shift that boundary and move the rail toggle. Sites lives in the ungrouped
 * top row alongside Overview and AI Assistant, both of which survive, so the group itself is never
 * emptied and every index either side of it is unchanged. `AdminNavItem` carries no positional
 * field — `buildNav` sorts by `order` with registration order as the tiebreak — so removing one row
 * cannot renumber another.
 *
 * Returns the input array unchanged (same reference) when the section is visible, so the common
 * case allocates nothing.
 *
 * @param groups - `nav.ts`'s `getNav()` output, untranslated.
 * @param availability - {@link useSiteSectionAvailability}'s answer. Anything but `available` hides
 *   the row, so the desktop app never paints a Sites item it would then have to take away.
 * @complexity O(n) in total nav items.
 */
export function withoutSiteSection(
  groups: readonly AdminNavGroup[],
  availability: SiteSectionAvailability,
): readonly AdminNavGroup[] {
  if (availability === "available") return groups;
  return groups.map((group) => ({ ...group, items: group.items.filter(isNotSiteSection) }));
}

/** What `App.tsx`'s `renderRoute` should do with the route it just resolved. `hold` is the
 *  not-yet-known case — render nothing for this one frame rather than guess. */
export type SiteSectionRouteGate = "render" | "hold" | "redirect";

/**
 * Whether this route may render, must wait, or must leave.
 *
 * This is the half of the change that makes the section genuinely absent rather than merely
 * unlinked. A hidden nav row with a live route still answers `/admin/sites` — to a typed URL, to a
 * bookmark, to `page.navigate("sites")`, and to anything that restores the last section an operator
 * was on — which is precisely the surface the desktop app must not have.
 *
 * `redirect` sends the browser to the default section (`/`, the dashboard) rather than rendering a
 * "not available here" screen. Both satisfy "unreachable"; the redirect is chosen because a
 * not-available screen is still a Sites screen, in a shell whose own tabs already own site
 * switching, offering the operator nothing to do — and because this admin already resolves exactly
 * this shape that way twice (`WorkspaceRedirect`, `IntegrationsRedirect`), so a third case behaves
 * like the two beside it.
 *
 * Every non-Sites route returns `render` on the first branch, so no other section can be affected
 * by this gate however the flag resolves.
 *
 * @param panelId - the resolved route's panel id (`null` for a route matching no panel).
 * @param availability - {@link useSiteSectionAvailability}'s answer.
 * @complexity O(1).
 */
export function resolveSiteSectionRouteGate(
  panelId: string | null | undefined,
  availability: SiteSectionAvailability,
): SiteSectionRouteGate {
  if (panelId !== SITES_PANEL_ID) return "render";
  if (availability === "available") return "render";
  if (availability === "unknown") return "hold";
  return "redirect";
}

/**
 * Sends the browser from a section this deployment does not have to the default one.
 *
 * `replace: true`, not a pushed entry, for the reason `useWorkspaceRedirect` already documents for
 * its own near-identical call: a pushed entry would make Back land on the route that just
 * redirected and bounce straight forward again.
 *
 * Empty dependency array — the target is a fixed string, and the component owning this effect is
 * only mounted once the gate has already decided.
 *
 * @complexity O(1) — one fixed navigation call.
 */
export function useDefaultSectionRedirect(): void {
  useEffect(() => {
    navigate("/", { replace: true });
  }, []);
}

export interface UseLogoutConfirm {
  /** Whether the "are you sure you want to log out?" dialog is open. */
  open: boolean;
  /** Opens the dialog — wired to the sidebar's logout button's own click, which no longer logs out
   *  directly (see `App.tsx`'s `SidebarLogoutButton`). */
  request: () => void;
  /** Closes the dialog without logging out — wired to `ConfirmDialog`'s `onCancel` (Escape,
   *  backdrop click, and the Cancel button all route through this one prop). */
  cancel: () => void;
  /** Disables both dialog actions while the real `logout()` call is in flight, same `pending`
   *  convention every other `ConfirmDialog` caller in this app uses (e.g. `Roles.tsx`'s
   *  `RoleDeleteDialog`). */
  pending: boolean;
  /** Calls the real `logout` this hook was given, then closes the dialog. */
  confirm: () => Promise<void>;
}

/**
 * Confirmation-modal state around the `logout` action `useAdminSession` already provides —
 * deliberately its OWN hook rather than a field added to `UseAdminSession` itself. It is not one of
 * `App.tsx`'s five injectable seams (see that file's own `AppProps` doc): it touches no DOM or
 * browser API of its own, only `setState` and whatever `logout` implementation the caller already
 * resolved (real or a test's fake), so `app-session-seam.unit.test.tsx`'s existing `UseAdminSession`
 * fixture — a full object literal, not a partial — stays exactly as it was.
 *
 * The owner's own words for why this exists at all: people can click "Log out" by accident, so it
 * should ask first, the same way every other destructive action in this app (delete role, delete
 * page, …) already does via `@jini-ai/admin/react`'s `ConfirmDialog` rather than `window.confirm`.
 *
 * @param logout - The real (or faked) `logout` from `useAdminSession()`.
 * @example
 * const { logout } = useSession();
 * const logoutConfirm = useLogoutConfirm(logout);
 */
export function useLogoutConfirm(logout: () => Promise<void>): UseLogoutConfirm {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    try {
      await logout();
    } finally {
      // Still reached even after a successful logout: `logout()` clears `user`, which makes
      // `App.tsx` render `<Login>` instead of the shell this dialog lives in — this dialog
      // unmounts along with it, so resetting this state here is a no-op then, not a bug. It only
      // does real work on a FAILED logout (`useAdminSession.logout` already swallows the request
      // error and clears `user` regardless — see that function's own comment — so today this
      // branch is unreachable in practice; kept anyway so a future `logout` that can actually
      // reject leaves the dialog usable instead of stuck `pending` forever).
      setPending(false);
      setOpen(false);
    }
  }

  return { open, pending, request: () => setOpen(true), cancel: () => setOpen(false), confirm };
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

/**
 * `App.tsx`'s `dockT` translator, minus the fallback chain itself — kept here rather than as an
 * inline closure in `App.tsx` per this codebase's standing rule against derived logic living in a
 * `.tsx` file (see `App.tsx`'s `AssistantChrome` for the same reasoning applied to JSX branches).
 * `App.tsx` still defines its own `dockT` closure (`(key) => translateAssistantDockLabel(navLocale,
 * key)`) so every existing call site keeps calling `dockT("...")` with no `locale` argument to
 * thread through by hand. Delegates to `assistant-dock-i18n.ts`'s own `t` (COMMON_I18N-falling-back,
 * via `createDictionaryTranslator`) rather than duplicating `ASSISTANT_DOCK_DICT[locale]?.[key] ??
 * key` inline — same fix as `AssistantDock.hooks.tsx`'s `useAssistantDockChrome`, which had an
 * independent copy of the same no-fallback lookup.
 */
export function translateAssistantDockLabel(locale: string, key: string): string {
  return translateAssistantDockDictLabel(locale, key);
}

/**
 * The clearance `ChatFab` needs to avoid overlapping the assistant dock/sheet — pure derived state
 * from `useChatDockLayout`'s own output, factored out for the same "no derived logic in `.tsx`"
 * reason as {@link translateAssistantDockLabel} above. Bottom clearance only applies in sheet mode
 * (a *bottom* sheet), right clearance only at desktop widths (the docked panel sits beside
 * `.admin-content`, not below it) — see `UseChatDockLayout.isSheetMode`'s own doc for why the two
 * are mutually exclusive rather than both potentially nonzero.
 *
 * @example
 * const { avoidBottomPx, avoidRightPx } = resolveChatFabClearance({ isSheetMode, chatOpen, sheetHeightPx, dockWidthPx });
 */
export function resolveChatFabClearance(params: {
  isSheetMode: boolean;
  chatOpen: boolean;
  sheetHeightPx: number;
  dockWidthPx: number;
}): { avoidBottomPx: number; avoidRightPx: number } {
  const { isSheetMode, chatOpen, sheetHeightPx, dockWidthPx } = params;
  return {
    avoidBottomPx: isSheetMode && chatOpen ? sheetHeightPx : 0,
    avoidRightPx: !isSheetMode && chatOpen ? dockWidthPx : 0,
  };
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
  /**
   * SPEC-053: `App.tsx`'s `<aside onDropCapture={...}>` handler (the SAME dock wrapper `chatDockRef`
   * measures). Forwards the raw drop event to whatever {@link publishDropCapture} last recorded —
   * `AssistantDock`'s `useFolderDrop().handleDropCapture` — and does nothing until something has been
   * published, so a drop before `AssistantDock` mounts falls through to `ChatPane`'s own bubble-phase
   * attachment handling. Stable identity for the life of the hook.
   */
  handleDockDropCapture: (event: DragEvent<HTMLElement>) => void;
  /**
   * SPEC-053: `AssistantDock`'s `onFolderDropCaptureReady` — records its folder-drop handler for
   * {@link handleDockDropCapture} to forward to. Held in a plain data ref inside this hook, not state:
   * publishing a handler must not re-render anything. Lives here (not a second, standalone hook)
   * because it is a handle onto this one dock's wrapper, owned by the hook that owns the wrapper —
   * the same reasoning as `chatDockRef`. Stable identity for the life of the hook.
   */
  publishDropCapture: (handler: (event: DragEvent<HTMLElement>) => void) => void;
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
  const dropCaptureRef = useRef<((event: DragEvent<HTMLElement>) => void) | null>(null);
  const handleDockDropCapture = useCallback((event: DragEvent<HTMLElement>) => dropCaptureRef.current?.(event), []);
  const publishDropCapture = useCallback((handler: (event: DragEvent<HTMLElement>) => void) => {
    dropCaptureRef.current = handler;
  }, []);

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
    handleDockDropCapture,
    publishDropCapture,
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
/**
 * Builds the `executors` map `createFrontendSessionBridge` claims under the `"admin."` prefix — the
 * host-extension seam `frontend-session-bridge.ts`'s own module doc describes ("Product capabilities,
 * keyed by id prefix... This is how a consumer exposes verbs the engine has never heard of"), used
 * here for the first time by a Tovu-native verb rather than a Jini one. See `lib/agent-screenshot.ts`'s
 * module doc for why `admin.capture_screenshot` lives outside `page.*`/`chat.*`.
 *
 * A plain function, not inlined into {@link useAgentPageBridge}'s effect, so it is directly
 * unit-testable with no `EventSource`/React involved — see `app-hooks-admin-capability-executors.unit.test.tsx`.
 *
 * @param contentEl - The element to capture. `null` is handled by
 * {@link captureAdminScreenshotToolResult} itself (reported as a text failure, not thrown).
 * @param renderElementToCanvas - Test seam; defaults to the real `html2canvas`-backed adapter.
 * @throws Rejects (never throws synchronously) for a capability id under this prefix this module does
 * not recognize — mirrors `frontend-session-bridge.ts`'s own "nothing on this page serves ..." wording
 * for an unclaimed id, since `serveLocally` there always awaits this.
 * @complexity O(1) to build; the returned handler's cost is `captureAdminScreenshotToolResult`'s own.
 */
export function buildAdminCapabilityExecutors(
  contentEl: HTMLElement | null,
  renderElementToCanvas: RenderElementToCanvas = renderAdminScreenshotCanvas,
): Record<string, (capabilityId: string, input: Record<string, unknown>) => Promise<unknown>> {
  return {
    "admin.": async (capabilityId: string) => {
      if (capabilityId !== ADMIN_CAPTURE_SCREENSHOT_CAPABILITY_ID) {
        throw new Error(`no admin capability serves "${capabilityId}"`);
      }
      const result = await captureAdminScreenshotToolResult({ element: contentEl, renderElementToCanvas });
      // Announce on success only: a failure (no content area attached, capture error, over budget)
      // never actually showed the operator's screen to anyone, so nothing needs announcing — see
      // `agent-screenshot-bus.ts`'s own module doc for why every REAL capture must be, though.
      if (result.content.some((block) => block.type === "image")) publishScreenshotCaptured();
      return result;
    },
  };
}

/**
 * Routes a `createFrontendSessionBridge` `onError` call to the right console level.
 *
 * The bridge fans every non-tool-call failure through one callback: a malformed frame, a failed
 * response POST, and — for every stream hiccup, not just fatal ones — the `EventSource`'s own
 * native `error` `Event`, whose `target` is the source itself. `settings-events.ts`'s identical
 * `readyState` check is why: the browser retries a dropped connection on its own while
 * `readyState` is still `CONNECTING`/`OPEN`, so logging every one of those as an error meant
 * nearly every admin page logged one on load (a dev daemon restart, a sleeping laptop, an ordinary
 * network blip). Only a stream that has actually given up (`CLOSED`) is worth a warning; a real
 * `Error` (the other three cases above) still means something broke and stays at error level.
 *
 * @param error - Whatever the bridge's `onError` was called with.
 * @complexity O(1).
 */
export function logFrontendSessionError(error: unknown): void {
  if (error instanceof Event) {
    const source = error.target as { readyState?: unknown } | null;
    if (source?.readyState === EventSource.CLOSED) {
      console.warn("[admin] frontend session stream closed", error);
    }
    return;
  }
  console.error("[admin] frontend session", error);
}

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
      executors: buildAdminCapabilityExecutors(contentEl),
      onError: logFrontendSessionError,
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

export interface UseScreenshotAnnouncement {
  /** Whether `admin.capture_screenshot` has captured this admin's screen since the last dismissal. */
  announced: boolean;
  /** Clears `announced` — wired to the `<Toast>`'s `onDismiss` in `App.tsx`. */
  dismiss: () => void;
}

/**
 * The on-screen half of `admin.capture_screenshot`'s consent decision — see
 * `agent-screenshot-bus.ts`'s own module doc for why a capture is announced rather than silent or
 * settings-gated.
 *
 * Extracted out of `App()`'s body for the same "grouped by cohesive concern" reasoning as this
 * file's other hooks (see the file header), even though this one is not itself one of `App.tsx`'s
 * five DI-seamed hooks: subscribing to an in-memory pub/sub module touches no DOM, browser API, or
 * IO (rule 3's own criterion), so there is nothing here a test would need to fake in place of.
 *
 * @example
 * const { announced, dismiss } = useScreenshotAnnouncement();
 */
export function useScreenshotAnnouncement(): UseScreenshotAnnouncement {
  const [announced, setAnnounced] = useState(false);
  useEffect(() => subscribeToScreenshotCaptured(() => setAnnounced(true)), []);
  return { announced, dismiss: () => setAnnounced(false) };
}

/**
 * Which nav groups get a collapse toggle: every LABELLED section (CONTENT, PEOPLE, MARKETING,
 * OPERATIONS, STUDIO, ADMINISTRATION). Derived from the nav rather than hardcoded so a section
 * added to `panels.tsx` later is collapsible the day it appears — a hardcoded list would silently
 * leave exactly one heading behaving differently from its neighbours, which reads as a bug rather
 * than a choice.
 *
 * `filter(Boolean)` drops the ungrouped top row (Overview / AI Assistant), which has no label and
 * therefore no heading to click. It is sliced off separately in `App.tsx`'s render anyway; this
 * keeps the array honest on its own terms rather than relying on that.
 *
 * @param navGroups - The (already-translated) nav groups `App.tsx` renders `<Sidebar.Nav>` from.
 * @complexity Time/space: O(navGroups.length) per recompute.
 */
export function useCollapsibleNavGroupLabels(navGroups: readonly AdminNavGroup[]): readonly string[] {
  return useMemo(
    () => navGroups.map((group) => group.label).filter((label): label is string => Boolean(label)),
    [navGroups],
  );
}
