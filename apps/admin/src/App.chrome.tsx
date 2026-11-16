import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { FrontendSessionBridge } from "@jini-ai/chat/react";
import { Toast } from "@jini-ai/ui";
import { ScrollJumpButtons } from "@jini-ai/ui/admin-widgets";
import { KitProvider } from "@jini-ai/ui-kit/react";
import type { useAdminThemeBoundary } from "./admin-themes/use-admin-theme.hooks";
import { AssistantDock } from "./components/AssistantDock/AssistantDock";
import { DockHeaderTip } from "./components/AssistantDock/DockHeaderTip";
import { PublishContentDialog } from "./features/publish-content/PublishContentDialog";
import { closePublishRequest, type usePublishRequest } from "./features/publish-content/hooks/publish-request.store";
import { tovuAgentAttrs, tovuKit } from "./integrations/jini-admin/kit";
import { t as tApp } from "./app-i18n";
import type { createAdminShellTranslators, useAgentPageBridge, useChatDockLayout } from "./App.hooks";

/** @file Presentational pieces of `App.tsx`'s shell (`AdminShell`): props-in JSX with no hooks of their own. */

export type DockT = (input: { key: string }, options?: Record<string, never>) => string;

/**
 * Mobile-sheet-only chrome (`styles.css` hides this at desktop widths, where the docked
 * panel closes only via the FAB same as before) — rendered here, around `<AssistantDock>`, rather
 * than inside it: that component's own internals are not where this dispatch's changes belong
 * (ADR-049's "never unmount" is about not touching its mount lifecycle, and staying out of its
 * render body is the safest way to honor that).
 */
function SheetBar({ sheetExpanded, setSheetExpanded, setChatOpen, dockT }: {
  sheetExpanded: boolean; setSheetExpanded: Dispatch<SetStateAction<boolean>>; setChatOpen: Dispatch<SetStateAction<boolean>>; dockT: DockT;
}) {
  return (
    <div className="chat-sheet-bar">
      <span className="chat-sheet-handle" aria-hidden="true" />
      <span className="chat-sheet-bar-title">{dockT({ key: "Tovu assistant" })}</span>
      <span className="chat-sheet-bar-actions">
        <button
          type="button"
          className="chat-sheet-action"
          onClick={() => setSheetExpanded((current) => !current)}
          aria-expanded={sheetExpanded}
          aria-label={sheetExpanded ? dockT({ key: "Collapse assistant panel" }) : dockT({ key: "Expand assistant panel" })}
          title={sheetExpanded ? dockT({ key: "Collapse assistant panel" }) : dockT({ key: "Expand assistant panel" })}
        >
          <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
            {sheetExpanded ? <path d="M4 6.5 9 11.5l5-5" /> : <path d="M4 11.5 9 6.5l5 5" />}
          </svg>
        </button>
        {/* Same white tip under it as the dock header's other icon buttons (owner, 2026-10-11). */}
        <DockHeaderTip label={dockT({ key: "Close AI chat" })}>
          <button
            type="button"
            className="chat-sheet-action"
            onClick={() => setChatOpen(false)}
            aria-label={dockT({ key: "Close AI chat" })}
          >
            <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              <path d="M5 5 13 13M13 5 5 13" strokeLinecap="round" />
            </svg>
          </button>
        </DockHeaderTip>
      </span>
    </div>
  );
}

/** The assistant dock `<aside>` (mobile sheet bar plus `AssistantDock`); `dock` is `useChatDockLayout`'s result. */
export function ChatDockAside(props: {
  dock: ReturnType<typeof useChatDockLayout>;
  themeBoundary: ReturnType<typeof useAdminThemeBoundary>;
  agentBridge: FrontendSessionBridge | null;
  principalId: string;
  dockT: DockT;
  locale: string;
}): ReactNode {
  const { chatDockRef, chatOpen, sheetExpanded, setSheetExpanded, setChatOpen, handleDockDropCapture, publishDropCapture } = props.dock;
  const { themeBoundary, agentBridge, principalId, dockT, locale } = props;
  return (
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
        Classic's light pin is REQUIRED, not cosmetic, for the same reason `features/settings/SettingsUi.tsx`
        and `features/ai-assistant/AiAssistant.tsx` pin it — and it must live on THIS element, not on a wrapper
        inside `<AssistantDock>`. Glass uses the document's resolved scheme at this same boundary.

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
        {...themeBoundary}
        // Jini's tip placement keeps every ⓘ / header tip bubble inside the dock, not over the page.
        data-jini-tip-bounds=""
        className={`admin-chat-dock${chatOpen ? " is-open" : ""}${sheetExpanded ? " is-expanded" : ""}`}
        hidden={!chatOpen}
        inert={!chatOpen}
        tabIndex={-1}
        aria-label={tApp({ locale: locale, key: "Assistant" })}
        // SPEC-053: capture phase, on this EXISTING element rather than a new wrapper inside
        // `<AssistantDock>` — a `display: contents` (or any real) div added there is the exact
        // layout trap `data-theme="light"`'s own comment two blocks up already documents for
        // `.admin-chat-dock > * { flex: 1 }`. `onDockDropCapture` (`useChatDockLayout`) is a no-op
        // until `AssistantDock` mounts and publishes its handler through `onFolderDropCaptureReady`,
        // so a drop before then just falls through to `ChatPane`'s own (bubble-phase)
        // attachment-upload handling — the same "no-op until ready" behavior
        // `getPathForFile === undefined` gives the desktop shell's own equivalent handler.
        onDropCapture={handleDockDropCapture}
      >
        <SheetBar sheetExpanded={sheetExpanded} setSheetExpanded={setSheetExpanded} setChatOpen={setChatOpen} dockT={dockT} />
        <AssistantDock
          agentBridge={agentBridge}
          principalId={principalId}
          onFolderDropCaptureReady={publishDropCapture}
        />
      </aside>
    </>
  );
}

/** Mobile shell chrome follows the same drawer state as the sidebar and backdrop. */
function AdminTopbar({ sidebarOpen, setSidebarOpen, navLocale }: {
  sidebarOpen: boolean; setSidebarOpen: (value: boolean | ((current: boolean) => boolean)) => void; navLocale: string;
}) {
  return (
    <div className="admin-topbar">
      <button
        type="button"
        className="admin-topbar-toggle"
        aria-expanded={sidebarOpen}
        aria-controls="admin-sidebar"
        aria-label={tApp({ locale: navLocale, key: sidebarOpen ? "Close navigation" : "Open navigation" })}
        onClick={() => setSidebarOpen((current) => !current)}
      >
        <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path d="M2.5 5h13M2.5 9h13M2.5 13h13" strokeLinecap="round" />
        </svg>
      </button>
      <span className="admin-topbar-title">Tovu</span>
    </div>
  );
}

/** The column right of the sidebar: topbar, the routed `<main>` and the scroll buttons. */
export function ShellMain({ sidebarOpen, setSidebarOpen, navLocale, agentPage, setContentEl, contentEl, content }: {
  sidebarOpen: boolean;
  setSidebarOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  navLocale: string;
  agentPage: string;
  setContentEl: ReturnType<typeof useAgentPageBridge>["setContentEl"];
  contentEl: ReturnType<typeof useAgentPageBridge>["contentEl"];
  content: ReactNode;
}) {
  const contentNode = contentEl ?? null;
  return (
    <div className="admin-main-col">
      {/* Hidden above the tablet breakpoint (desktop keeps the always-visible sidebar) — see
          `.admin-topbar` in styles.css. */}
      <AdminTopbar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} navLocale={navLocale} />
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
      {/* MailStatusBanner (components/MailStatusBanner) is not mounted while email is parked
          (owner, 2026-10-23: "we aren't doing anything with email right now"); re-mount it here
          with fetchStatus={api.getMailStatus} when email work resumes (development/todos.md). */}
      <main id="main-content" className="admin-content" ref={setContentEl} tabIndex={-1} data-agent-page={agentPage}>
        {/* Keep page overlays in the same allowed root and page identity as their triggers. */}
        <KitProvider kit={tovuKit} agent={tovuAgentAttrs} overlayContainer={contentEl}>
          {content}
        </KitProvider>
      </main>
      {/* One ↑/↓ pair for every long admin page (owner, 2026-10-21); `styles.css` places it
          beside the assistant FAB. */}
      <ScrollJumpButtons
        container={contentNode}
        labels={{ toTop: tApp({ locale: navLocale, key: "Scroll to top" }), toBottom: tApp({ locale: navLocale, key: "Scroll to bottom" }) }}
      />
    </div>
  );
}

/** Screenshot-consent toast and the Publish dialog, rendered after the assistant chrome. */
export function ShellOverlays({ screenshot, openPublishRequest, dockT, dashboardT }: {
  screenshot: { announced: boolean; dismiss: () => void };
  openPublishRequest: ReturnType<typeof usePublishRequest>;
  dockT: DockT;
  dashboardT: ReturnType<typeof createAdminShellTranslators>["dashboardT"];
}) {
  return (
    <>
    {/* Rendered unconditionally on `chatOpen`, deliberately: the assistant can capture a
        screenshot while the panel is collapsed (a background run in flight), and the operator must
        see the announcement either way — see `screenshot.announced`'s own comment above. */}
    {screenshot.announced ? (
      <Toast
        message={dockT({ key: "The assistant just captured a screenshot of this screen." })}
        tone="default"
        ttlMs={5000}
        onDismiss={screenshot.dismiss}
      />
    ) : null}
    {/* publish-criteria-tool-webmcp-plan-2026-09-24.md §4 S2 — `key={requestId}` remounts the
        dialog fresh per request, so a stale instance can never call a newer request's own
        `resolve` (see `publish-request.store.ts`'s header). `port` is left `undefined`: this is
        the one real (non-test) mount, so the dialog resolves its own default port itself. */}
    {openPublishRequest ? (
      <PublishContentDialog
        key={openPublishRequest.requestId}
        criteria={openPublishRequest.criteria}
        scope={openPublishRequest.scope}
        onPlanned={openPublishRequest.resolve}
        onCancel={closePublishRequest}
        t={(key) => dashboardT({ key })}
        port={undefined}
      />
    ) : null}
    </>
  );
}

export function ShellSkipLink({ locale: navLocale }: { locale: string }) {
  return (
    <>
    {/* First focusable element in the app, deliberately before `<Sidebar>` — the auditor
        measured 26 Tab presses to reach main content from a fresh load, because every route
        repeats the full sidebar first, paid on every navigation by a keyboard/screen-reader
        operator. Visually hidden until focused (`.skip-link` in styles.css); the target is
        `#main-content` on `<main>` below, not a route change, so this works identically
        whichever section is currently rendered there. */}
    <a href="#main-content" className="skip-link">
      {tApp({ locale: navLocale, key: "Skip to content" })}
    </a>
    </>
  );
}
