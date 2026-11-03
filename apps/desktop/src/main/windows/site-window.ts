/**
 * @file Own-server mode's one-window-per-site open, extracted from `main.ts`'s `openSiteWindow` so
 * its decisions are verified without Electron: reuse a live window, reuse a retained server, roll a
 * fresh spawn back when its window cannot be created, and — on close — either release only the
 * window (macOS, not quitting) or stop the site in the order crash recovery depends on. `main.ts`
 * passes the supervisor, the backend starter, the window factory and the teardown tracker in.
 */
import type { QuitPhase } from "@jini-ai/desktop-host/shutdown";

/** The slice of a `tovu serve` handle this open touches. */
interface SiteWindowServer {
  adminUrl: string;
  pid: number;
  stop(): Promise<unknown>;
}

/** The slice of a `BrowserWindow` this open touches. */
interface SiteWindow {
  isDestroyed(): boolean;
  show(): void;
  focus(): void;
  on(event: "closed", listener: () => void): unknown;
}

/** One `openSites` entry, as `main.ts`'s `OpenSite` declares it. */
interface SiteWindowEntry<S, W> {
  server: S;
  window?: W;
  siteDir: string;
}

/** Per-site preview cancellation and theme snapshot hooks. */
type SiteHook = (required: { siteDir: string }, optional: Readonly<Record<string, never>>) => unknown;

/** Everything one site-window open needs from `main.ts`. */
interface SiteWindowPorts<S extends SiteWindowServer, W extends SiteWindow, C extends { registryPath: string }> {
  /** `main.ts`'s `openSites` supervisor (its `Map` surface). */
  openSites: {
    get(siteDir: string): SiteWindowEntry<S, W> | undefined;
    set(siteDir: string, entry: SiteWindowEntry<S, W>): unknown;
    delete(siteDir: string): unknown;
  };
  /** Spawn (or attach to) the site's server and arm its session — `main.ts`'s `startSiteBackend`. */
  startSiteBackend: (required: { siteDir: string; ctx: C }, optional: { port?: number }) => Promise<{ server: S; partition: string }>;
  sitePartition: (siteDir: string) => string;
  /** `main.ts`'s `createWindow` (see `app-window.ts`). */
  createWindow: (required: { url: string; title: string; partition: string }) => W;
  readSiteName: (siteDir: string) => string;
  /** Drop this child's crash-safety row — `site-process-registry.ts`'s `recordSiteClosed`. */
  recordSiteClosed: (required: { registryPath: string; siteDir: string; pid: number }) => void;
  siteThemePreviews: { sync: SiteHook; stop: SiteHook };
  sitePreviewScheduler: { cancel: SiteHook };
  /** Revoke the window's admin session over loopback — `desktop-auth.ts`'s `endSiteSession`. */
  endSiteSession: (required: { partition: string; adminUrl: string }) => Promise<unknown>;
  /** `pendingTeardowns.track`, so `before-quit` can wait for the stop. */
  trackTeardown: (required: { promise: Promise<unknown> }) => unknown;
  /** `process.platform`. */
  platform: string;
  /** The live `quitPhase`, read when the window closes. */
  quitPhase: () => QuitPhase;
  logError: (message: string) => void;
}

/** What a close handler needs to know about the site it belongs to. */
interface ClosedWindow<S extends SiteWindowServer, W extends SiteWindow, C extends { registryPath: string }> {
  siteDir: string;
  ctx: C;
  window: W;
  server: S;
  partition: string;
  ports: SiteWindowPorts<S, W, C>;
}

/**
 * Whether a closed window leaves its site running: macOS keeps an app alive with no windows, so a
 * close there releases only the window — unless a quit is already draining, which must stop it.
 * @complexity O(1).
 */
function retainsSiteOnClose({ platform, quitPhase }: { platform: string; quitPhase: QuitPhase }, _optional = {}): boolean {
  return platform === "darwin" && quitPhase === "idle";
}

/** Keep the crash-recovery row until stop confirms exit, for both close and failed-open rollback.
 * A rejected stop deliberately leaves the row for the next launch. @complexity O(1) beyond stop. */
async function stopSiteServer<S extends SiteWindowServer, W extends SiteWindow, C extends { registryPath: string }>(
  { siteDir, ctx, server, ports }: Pick<ClosedWindow<S, W, C>, "siteDir" | "ctx" | "server" | "ports">,
  _optional = {},
): Promise<void> {
  await server.stop();
  ports.recordSiteClosed({ registryPath: ctx.registryPath, siteDir, pid: server.pid });
}

/**
 * Stop a closed window's site: end its session, stop its child, and only then drop its row.
 * @complexity O(1) beyond the stop itself.
 */
function trackSiteTeardown<S extends SiteWindowServer, W extends SiteWindow, C extends { registryPath: string }>(
  { siteDir, ctx, server, partition, ports }: ClosedWindow<S, W, C>,
  { revokeSession = true }: { revokeSession?: boolean } = {},
): void {
  // Ends this window's session for real instead of leaving it to expire on its own up to 30 days
  // later — the other half of the accumulation fix above. Best-effort and awaited before
  // `server.stop()` so the request actually reaches the child before BR-07's graceful SIGTERM
  // drain tears it down; a failed or no-op logout (nothing left to revoke) never blocks the close.
  //
  // TRACKED, and the crash-safety row is dropped only at the END of it. The row exists so the
  // next launch can reap a child this process left running, so it must outlive the child, not the
  // window: dropping it up front — as this did — meant a hard kill during the stop left a
  // `tovu serve` that `reconcileOrphans` could never find. `before-quit` waits on the tracked
  // promise, which is what stops `app.quit()` racing an unfinished `server.stop()` when this is
  // the last window (see `shutdown-tracker.ts`).
  ports.trackTeardown({
    promise: (revokeSession ? ports.endSiteSession({ partition, adminUrl: server.adminUrl }) : Promise.resolve())
      .catch(() => {})
      .then(() => stopSiteServer({ siteDir, ctx, server, ports }))
      .catch((error: unknown) => ports.logError(`[tovu-desktop] site shutdown failed: ${(error as Error).message}`)),
  });
}

/**
 * A site window's `closed` handler.
 * @complexity O(1) beyond the tracked stop.
 */
function handleSiteWindowClosed<S extends SiteWindowServer, W extends SiteWindow, C extends { registryPath: string }>(
  closed: ClosedWindow<S, W, C>,
  _optional = {},
): void {
  const { siteDir, window, ports } = closed;
  if (retainsSiteOnClose({ platform: ports.platform, quitPhase: ports.quitPhase() })) {
    const entry = ports.openSites.get(siteDir);
    if (entry?.window === window) entry.window = undefined;
    return;
  }
  // Only when the current entry is still THIS window's (D-09). `site-supervisor.ts` removes an
  // entry whose child died, and the operator can re-open the same site from "Open Recent" while
  // this dead window is still on screen — a second `tovu serve`, a second window, a REPLACEMENT
  // entry under the same key. Deleting by site dir alone then dropped that healthy replacement
  // the moment the old window was closed: `before-quit` no longer stopped it, the Projects screen
  // reported the site as stopped, and "Start" spawned a THIRD child over the same `content.db`.
  // The supervisor's own `handleExit` guards by entry identity for exactly this reason; this is
  // its missing sibling.
  const entry = ports.openSites.get(siteDir);
  if (entry?.window === window) {
    ports.sitePreviewScheduler.cancel({ siteDir }, {});
    ports.siteThemePreviews.stop({ siteDir }, {});
    ports.openSites.delete(siteDir);
  }
  // A replacement can reuse both the child and the partition. A stale close owns neither;
  // when only the child differs, retire that old child without revoking the shared cookie jar.
  else if (entry?.server === closed.server) return;
  trackSiteTeardown(closed, { revokeSession: entry === undefined || entry.window === window });
}

/**
 * Open (or focus) `siteDir`'s own window, spawning its `tovu serve` only when none is running.
 *
 * The backend starter records the crash-safety row before this returns (rather than after
 * `createWindow` runs) — a row must exist for the whole time the server is actually alive, since
 * that is exactly the window `reconcileOrphans()` on the NEXT launch needs to find it if this
 * process is killed before either commits — but if `createWindow` itself throws, this attempt
 * failed as a whole: no window means no way for THIS process to reach or stop that server again (no
 * `openSites` entry, no `closed` listener), so leaving its row behind would strand it silently —
 * recorded but untracked, both here and (should this same siteDir be tried again) unreachable
 * through `already.window` either. The `catch` below stops the just-spawned server and drops the
 * row rather than leaving either half of that inconsistent, then rethrows so the caller still
 * reports the failure.
 *
 * Callers MUST run this through `serializer.run(siteDir, ...)` — this function itself does not
 * serialize, so two concurrent calls for the same `siteDir` (a fast double-click) could otherwise
 * both see "not open yet" and spawn two children for the same site.
 *
 * @param port pin this site's port; see `startSiteBackend`'s `options.port`.
 * @returns the site's window.
 * @complexity O(1) beyond `startSiteBackend`'s own cost.
 */
async function openSiteWindow<S extends SiteWindowServer, W extends SiteWindow, C extends { registryPath: string }>(
  { siteDir, ctx, ports }: { siteDir: string; ctx: C; ports: SiteWindowPorts<S, W, C> },
  options: { port?: number } = {},
): Promise<W> {
  const already = ports.openSites.get(siteDir);
  if (already?.window && !already.window.isDestroyed()) {
    // Previously `window!` was safe: own-server entries always had a window; sites-home entries
    // set none, and no launch reaches both modes. A macOS close now also leaves a windowless entry.
    already.window.show();
    already.window.focus();
    return already.window;
  }

  // On macOS a closed window leaves its server supervised. Reopening reuses that server and
  // cookie jar instead of spawning a second process over the same content.db.
  const { server, partition } = already
    ? { server: already.server, partition: ports.sitePartition(siteDir) }
    : await ports.startSiteBackend({ siteDir, ctx }, options);

  let window: W;
  try {
    window = ports.createWindow({ url: server.adminUrl, title: ports.readSiteName(siteDir), partition });
  } catch (error) {
    if (!already) {
      // No window was published, so only the tracker can make quit wait for this rollback.
      // Keep the recovery row until the child has confirmed its exit, including on stop failure.
      const rollback = stopSiteServer({ siteDir, ctx, server, ports });
      ports.trackTeardown({ promise: rollback });
      await rollback;
    }
    throw error;
  }

  ports.openSites.set(siteDir, { server, window, siteDir });
  ports.siteThemePreviews.sync({ siteDir }, {});
  window.on("closed", () => handleSiteWindowClosed({ siteDir, ctx, window, server, partition, ports }));
  return window;
}

export { handleSiteWindowClosed, openSiteWindow, retainsSiteOnClose };
export type { SiteWindow, SiteWindowEntry, SiteWindowPorts, SiteWindowServer };
