import { reportShellTelemetry } from '../product-telemetry.js';
import { NavIcon } from '../icons.js';
import { workspaceOnScreen } from '../expanded-mode.js';
import { useSiteWorkspace } from '../use-site-workspace.hooks.js';
import { useLiveViews, type LiveGuest, type ParkedView } from '../use-live-views.hooks.js';
import type { SiteAdminPage } from '../import-site-entry.js';
import { useComposedGuestRef, type FindableGuest } from '../use-find-in-page.hooks.js';
import type { ZoomableGuest } from '../use-zoom.hooks.js';
import type { SiteRecord, SiteSurface } from '../../contracts/project.js';
import { SiteStartPanel } from './SiteStartPanel.js';
import { Spinner } from './Spinner.js';

// Admin first because that is where a workspace opens. See `SiteWorkspace` for why.
const SITE_SURFACES: readonly SiteSurface[] = ['admin', 'site'];

/**
 * Every open project's workspace, all mounted at once inside `App`'s `<main>`.
 *
 * Open workspaces are hidden with CSS, never unmounted. A <webview> is a live browsing context:
 * unmounting one on a tab switch would throw away the site's admin route, scroll position and any
 * half-written form, and re-run its whole boot the next time the operator came back to it.
 *
 * That still holds for the WORKSPACE, which keeps its bar, history and reducer. Only its guest can
 * go, and only through `useLiveViews`: past the "Live site views" limit a hidden, least recently
 * focused guest is released once its own page agrees (no unsaved editor, no draft it could not
 * save, no upload or reply in flight), with its route and scroll recorded so focusing the tab
 * brings it back there. A guest that says no stays, half-written form and all.
 */
export function SiteWorkspaces({
  inSites,
  openSites,
  visibleWorkspaceId,
  expanded,
  onToggleExpanded,
  registerGuest,
  registerZoomGuest,
  onSiteUpdated,
  adminPages,
}: {
  inSites: boolean;
  openSites: readonly SiteRecord[];
  visibleWorkspaceId: string | null;
  expanded: boolean;
  onToggleExpanded: () => void;
  registerGuest: (projectId: string, element: FindableGuest | null) => void;
  registerZoomGuest: (projectId: string, element: ZoomableGuest | null) => void;
  /** Applies main's refreshed record after a tab's own "Start site" — see `useSiteStart`. */
  onSiteUpdated: (record: SiteRecord) => void;
  /** The admin page each tab was opened on (`useProjectTabs`). */
  adminPages: Readonly<Record<string, SiteAdminPage>>;
}) {
  const live = useLiveViews({ openIds: openSites.map((project) => project.id), focusedId: inSites ? visibleWorkspaceId : null });
  // Outside Websites every workspace is `hidden` (workspaceOnScreen), never unmounted: see above.
  return (
    <>
      {openSites.map((project) => (
        <SiteWorkspace
          key={project.id}
          project={project}
          hidden={!workspaceOnScreen({ inSites, projectId: project.id, visibleWorkspaceId })}
          live={live.isLive(project.id)}
          parked={live.parked[project.id]}
          registerLiveGuest={live.registerGuest}
          expanded={expanded}
          onToggleExpanded={onToggleExpanded}
          registerGuest={registerGuest}
          registerZoomGuest={registerZoomGuest}
          onSiteUpdated={onSiteUpdated}
          adminPage={adminPages[project.id]}
        />
      ))}
    </>
  );
}

/**
 * One open project's tab: the site's own `tovu serve` output, embedded.
 *
 * The guest is an Electron `<webview>` rather than an `<iframe>` so it runs in its own process —
 * this renderer holds `window.tovuRunner`, which can create and delete any project in Sites Home,
 * and a site has no business executing beside it. `main.js`'s `openSitesHomeWindow` enables the tag
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
 * `desktop-auth.ts`) — a deliberate departure from Tovu-Runner's own `SiteWorkspace`, which
 * sets no `partition` at all. Tovu's own `desktop-auth.ts` documents why this shell cannot skip
 * it: cookies ignore port, so two sites both answering on `127.0.0.1` would otherwise share one
 * cookie jar and each open would overwrite the other's session — the exact bug that motivated
 * `sitePartition` for the per-project `BrowserWindow` model in the first place. Setting the same
 * partition string here is what makes the boot-session cookie `main.js`'s `openSiteServer` already
 * seeded into that partition visible to THIS guest.
 *
 * `hidden` is a CSS concern, not a mount one. See the <main> body in `App` for why. `live` is the
 * one mount concern: a released tab renders its bar with no guest (`SiteWorkspaces`' own doc).
 */
function SiteWorkspace({
  project,
  hidden,
  live,
  parked,
  registerLiveGuest,
  expanded,
  onToggleExpanded,
  registerGuest,
  registerZoomGuest,
  onSiteUpdated,
  adminPage,
}: {
  project: SiteRecord;
  hidden: boolean;
  /** Whether this tab may mount its guest (`useLiveViews`); the tab on screen always may. */
  live: boolean;
  /** This tab's last release: where its next guest opens, and how far it scrolls. */
  parked?: ParkedView;
  registerLiveGuest: (projectId: string, element: LiveGuest | null) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  registerGuest: (projectId: string, element: FindableGuest | null) => void;
  registerZoomGuest: (projectId: string, element: ZoomableGuest | null) => void;
  /** Applies main's refreshed record after this tab's own "Start site" — see `useSiteStart`. */
  onSiteUpdated: (record: SiteRecord) => void;
  /** Opens this tab's admin on that page rather than its root (the "Import site" entry). */
  adminPage?: SiteAdminPage;
}) {
  // Everything this tab remembers and every action its bar takes: which surface it asked for, where
  // its guest is, its history, and Reload that keeps that history. Per tab, never lifted into `App`.
  // `did-fail-load` (`failed`/`stalled`) still comes from `useWebviewLoadFailure`, inside it.
  const workspace = useSiteWorkspace(project, hidden, { adminPage, parked });
  // `guestRef` is a CALLBACK ref, not a ref object, and that distinction is the whole of D-03: the
  // hooks' listeners have to attach when the guest actually mounts, and this tab mounts it
  // conditionally (`running && !workspace.failed` below). See `useWebviewLoadFailure`'s own doc.
  // Composed with the find bar's and the zoom feature's own registration so ONE ref does all three
  // — see `useComposedGuestRef`. The live-views probe reads the same node (`useLiveViews`).
  const { guestRef } = workspace;
  const combinedGuestRef = useComposedGuestRef(guestRef, registerGuest, project.id, (node) => {
    registerZoomGuest(project.id, node);
    registerLiveGuest(project.id, node);
  });
  const running = workspace.running;

  const startPanel = running ? (
    // The registry row still says `running` — nothing crashed for a poll to catch — but the
    // guest just told us, as a fact rather than a guess, that its main frame would not load.
    // Nothing is left running underneath worth preserving, so this replaces the guest outright
    // rather than overlaying it the way `stalled` does above.
    <SiteStartPanel
      project={project}
      body={`${project.displayName} isn't answering on port ${project.port}. It may still be running, but stuck.`}
      onStarted={workspace.recover}
      onSiteUpdated={onSiteUpdated}
    />
  ) : (
    <SiteStartPanel project={project} body={workspace.attachError ?? (project.externalUrl ? "Connecting to the server already running in the other app…" : undefined)} onSiteUpdated={onSiteUpdated} />
  );

  return (
    <section
      className={`workspace ${running ? 'is-running' : ''} ${hidden ? 'is-hidden' : ''}`}
      aria-hidden={hidden}
    >
      {/* The bar survives into expanded mode on purpose. It is the only chrome left, so it is
          also the only always-available way back out — Escape does not reach this document while
          focus is inside the guest. */}
      <div className="workspace__bar">
        {/* A browser's order: history first, at the leading edge. Icon-only, so each button carries
            its own name and tooltip. */}
        <div className="workspace__nav">
          <button
            type="button"
            className="workspace__act workspace__act--icon"
            onClick={workspace.goBack}
            disabled={!workspace.history.canGoBack}
            title="Back"
            aria-label="Back"
          >
            <NavIcon kind="back" />
          </button>
          <button
            type="button"
            className="workspace__act workspace__act--icon"
            onClick={workspace.goForward}
            disabled={!workspace.history.canGoForward}
            title="Forward"
            aria-label="Forward"
          >
            <NavIcon kind="forward" />
          </button>
          <button
            type="button"
            className="workspace__act workspace__act--icon"
            onClick={workspace.reload}
            disabled={!running}
            title="Reload"
            aria-label="Reload"
          >
            <NavIcon kind="reload" />
          </button>
        </div>
        <span className="state" aria-hidden="true">
          <span className="state__dot" />
        </span>
        <div className="workspace__views">
          {SITE_SURFACES.map((option) => (
            <button
              type="button"
              key={option}
              className={`workspace__view ${option === workspace.surface ? 'is-on' : ''}`}
              onClick={() => { reportShellTelemetry({ payload: { kind: 'action', id: option === 'admin' ? 'open_admin' : 'open_preview' } }); workspace.selectView(option); }}
              aria-pressed={option === workspace.surface}
            >
              {option === 'admin' ? 'Admin' : 'Site'}
            </button>
          ))}
        </div>
        <span className="workspace__spacer" />
        {/* Where the guest actually is, so it follows Back and Forward rather than only the toggle. */}
        <span className="workspace__url">{workspace.displayUrl}</span>
        <button
          type="button"
          className="workspace__act"
          onClick={() => { reportShellTelemetry({ payload: { kind: 'action', id: workspace.surface === 'admin' ? 'open_admin' : 'open_preview' } }); workspace.openInBrowser(); }}
          disabled={!running}
          title="Open the current view in your default browser"
        >
          Open in browser
        </button>
        <ExpandToggle expanded={expanded} onToggle={onToggleExpanded} />
      </div>
      {running && !workspace.failed ? (
        // `stalled` and `failed` gate whether the recovery overlay shows, not whether the guest
        // stays mounted: `failed` is Chromium reporting a real error on the guest's main frame — a
        // FACT, nothing left to wait for — while `stalled` is this hook's own guess, made only
        // because `STALL_TIMEOUT_MS` passed with no verdict from Chromium either way. Unmounting on
        // a guess would kill a load that was merely slow with no path back to it except a manual
        // retry, so the guest stays mounted for as long as it might still be right and `stalled`
        // only toggles an overlay on top of it.
        // A released tab (`live` false) keeps everything above and mounts no guest until it is
        // focused again; it is hidden whenever it is released, so nothing shows in its place.
        live ? <WorkspaceGuest workspace={workspace} project={project} guestRef={combinedGuestRef} onSiteUpdated={onSiteUpdated} /> : null
      ) : startPanel}
    </section>
  );
}

/** The running guest and the overlays laid over it. Its own component so `SiteWorkspace` stays
 *  under the complexity ceiling; it holds no state. */
function WorkspaceGuest({ workspace, project, guestRef, onSiteUpdated }: {
  workspace: ReturnType<typeof useSiteWorkspace>;
  project: SiteRecord;
  guestRef: (node: HTMLWebViewElement | null) => void;
  onSiteUpdated: (record: SiteRecord) => void;
}, _options = {}) {
  return (
    <div className="workspace__guest">
      {/* `allowpopups` grants the guest nothing: `registerGuestNavigationPolicy` in `main.js`
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
          `key` is now recovery only: Reload calls the guest's own `reload()`, which keeps its
          history, and `useSiteWorkspace` remounts only a guest that failed or stalled. */}
      <webview
        ref={guestRef}
        key={workspace.reloadNonce}
        className="workspace__frame"
        src={workspace.src}
        partition={project.partition}
        allowpopups={'' as unknown as boolean}
      />
      <WorkspaceLoadingOverlay workspace={workspace} project={project} />
      {workspace.stalled && (
        <div className="workspace__overlay">
          <SiteStartPanel
            project={project}
            body={`${project.displayName} is taking longer than usual to answer on port ${project.port}. It may still be starting.`}
            onStarted={workspace.recover}
            onSiteUpdated={onSiteUpdated}
          />
        </div>
      )}
    </div>
  );
}

/** The first-content loading overlay, sharing the guest's existing load state. */
function WorkspaceLoadingOverlay({ workspace, project }: {
  workspace: ReturnType<typeof useSiteWorkspace>;
  project: SiteRecord;
}, _options = {}) {
  return <>
    {/* Covers the guest from the moment it mounts until its FIRST real content answers —
        `did-finish-load`, not the server merely accepting the connection. Without this an
        operator who just watched a 40-75s boot finish saw a blank pane next, indistinguishable
        from a hang, for however long the admin's own bundle then took to answer. `stalled`
        wins once `useWebviewLoadFailure`'s own guess kicks in (`STALL_TIMEOUT_MS`, 8s): that
        overlay says the wait may be abnormal, which this one must not claim while it is still
        well within an ordinary load. */}
    {!workspace.loaded && !workspace.stalled && (
      <div className="workspace__overlay workspace__overlay--loading" role="status">
        <Spinner />
        <p>Loading {project.displayName}…</p>
      </div>
    )}
  </>;
}

/**
 * The workspace bar's expand / exit-full-window button. Its own component so `SiteWorkspace` stays
 * under the complexity ceiling; it holds no state.
 */
function ExpandToggle({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="workspace__act workspace__act--icon"
      onClick={onToggle}
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
  );
}
