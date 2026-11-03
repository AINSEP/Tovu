/**
 * @file The Projects-card preview's Electron half, extracted from `main.ts`: where a capture points
 * (this launch's own server or another app's lease), the hidden-window capture itself, the list
 * poll's once-per-port ask, and the boot hygiene sweep. `site-preview-scheduler.ts` owns WHEN a
 * capture runs; `site-preview-store.ts` owns the cache files. Electron, storage and timers are ports.
 */
import type { PreviewTarget } from "../../site-preview-scheduler.ts";
import { withRenderTimeout } from "@jini-ai/desktop-host";

/** The capture window's own size, at the SAME 16:10 ratio `.card__tile` renders (`app.css`) — so
 *  downscaling to {@link PREVIEW_WIDTH_PX} below never crops a different ratio than the one the
 *  card actually shows. */
export const PREVIEW_CAPTURE_WIDTH_PX = 1280;
export const PREVIEW_CAPTURE_HEIGHT_PX = 800;

/** The stored preview's width in px; height follows automatically — `nativeImage`'s own `resize()`
 *  keeps the source's aspect ratio when only one dimension is given. */
export const PREVIEW_WIDTH_PX = 640;

/** How long to wait after the hidden capture window finishes loading before taking the screenshot.
 *  A fixed settle rather than a network-idle wait: a site's own public page is server-rendered, not
 *  an SPA polling for data, so this is enough and needs no new dependency to detect idleness. */
export const PREVIEW_PAINT_SETTLE_MS = 1200;

/** Bound hidden-window navigation even when a page's subresources never finish loading. */
export const PREVIEW_LOAD_TIMEOUT_MS = 10_000;

/** How long to wait, after a site's server first publishes into `openSites`, before capturing it —
 *  separate from and additional to {@link PREVIEW_PAINT_SETTLE_MS}'s post-navigation settle inside
 *  the capture itself. "The listener answered ready" is not "there is a first paint worth a
 *  screenshot yet". */
export const PREVIEW_CAPTURE_DEBOUNCE_MS = 1500;

/** The slice of a hidden `BrowserWindow` a capture drives. */
export interface PreviewWindow {
  loadURL(url: string): Promise<unknown>;
  isDestroyed(): boolean;
  destroy(): void;
  webContents: { capturePage(): Promise<{ resize(options: { width: number }): { toPNG(): Buffer } }> };
}

export interface PreviewCapturePorts {
  /** `new BrowserWindow(options)`. */
  createHiddenWindow: (options: { show: false; width: number; height: number; webPreferences: { partition: string } }) => PreviewWindow;
  /** Resolves after `ms` (a `setTimeout` promise). */
  delay: (ms: number) => Promise<void>;
  /** `site-preview-store.ts`'s `writePreview`, bound to this launch's `userData`. */
  writePreview: (required: { siteDir: string; png: Buffer }) => number | null;
  warn: (message: string) => void;
}

/**
 * Capture `siteDir`'s own PUBLIC surface — `http://127.0.0.1:<port>/`, never `/admin/` — into its
 * preview cache, then discard the window that took it.
 *
 * **Offscreen, not the live embedded guest.** `App.tsx` defaults a project tab's workspace view to
 * `'admin'`, and both surfaces are the same origin on different paths — a passive capture of the
 * guest would screenshot the Tovu ADMIN for most operators most of the time, confidently and
 * uniformly wrong. A dedicated hidden window loading the site's own root sidesteps that question
 * entirely, and needs no `did-attach-webview`/partition-tracking machinery to do it.
 *
 * A hidden (`show: false`) `BrowserWindow` rather than Electron's separate offscreen-rendering mode:
 * `capturePage()` works on an ordinary hidden window (Electron paints a hidden window by default —
 * `paintWhenInitiallyHidden` — so there is a frame to capture), and the offscreen mode is a
 * different API built for streaming frames out through a `paint` event, none of which this needs.
 *
 * Loaded on the site's OWN session partition, so a route the site itself gates on a cookie behaves
 * for this capture exactly as it would for a real visit.
 *
 * Best-effort and silent on every failure, same discipline as `announceDesktopToolsToSite`: a
 * preview is decoration, and failing to capture one must never surface as a problem with the site
 * that just opened, or delay it.
 *
 * Its signature is the scheduler's `capture` port, so the composition root passes it directly.
 * @returns whether a preview was stored.
 * @complexity O(1) beyond the hidden window's own load/capture/destroy cost.
 */
export function createSitePreviewCapture({ ports }: { ports: PreviewCapturePorts }, _optional = {}) {
  return async function captureSitePreview(
    { siteDir, port, partition, scheme = "http" }: PreviewTarget & { siteDir: string }, _opts = {},
  ): Promise<boolean> {
    let window: PreviewWindow | undefined;
    try {
      window = ports.createHiddenWindow({ show: false, width: PREVIEW_CAPTURE_WIDTH_PX, height: PREVIEW_CAPTURE_HEIGHT_PX, webPreferences: { partition } });
      // An https dev server's certificate names `localhost`, not the loopback IP.
      await withRenderTimeout({ promise: window.loadURL(scheme === "https" ? `https://localhost:${port}/` : `http://127.0.0.1:${port}/`) }, { timeoutMs: PREVIEW_LOAD_TIMEOUT_MS });
      await ports.delay(PREVIEW_PAINT_SETTLE_MS);
      if (window.isDestroyed()) return false;
      const captured = await window.webContents.capturePage();
      return ports.writePreview({ siteDir, png: captured.resize({ width: PREVIEW_WIDTH_PX }).toPNG() }) !== null;
    } catch (error) {
      ports.warn(`tovu desktop: could not capture a preview for ${siteDir} — ${(error as Error).message}`);
      return false;
    } finally {
      if (window && !window.isDestroyed()) window.destroy();
    }
  };
}

export interface PreviewTargetPorts {
  /** This launch's own `openSites` entry for `siteDir`, if any. */
  openSite: (required: { siteDir: string }) => { server: { port: number } } | undefined;
  /** The shared-sites running lease for `siteDir` (`sharedSites.running({ path }).read({})`). */
  readLease: (required: { siteDir: string }) => { port: number; scheme: "http" | "https" } | null | undefined;
  partitionFor: (required: { siteDir: string }) => string;
}

/**
 * The scheduler's `current` port: where `siteDir` is serving right now, read when the debounce
 * fires rather than when it was scheduled.
 * @returns this launch's own server, else a live lease another app holds, else `undefined`.
 * @complexity O(1).
 */
export function createPreviewTargetResolver({ ports }: { ports: PreviewTargetPorts }, _optional = {}) {
  return function currentPreviewTarget({ siteDir }: { siteDir: string }, _opts = {}): PreviewTarget | undefined {
    const entry = ports.openSite({ siteDir });
    if (entry) return { port: entry.server.port, partition: ports.partitionFor({ siteDir }) };
    // A site another app runs (`npm run dev`, a sibling desktop): its lease names the live port.
    const lease = ports.readLease({ siteDir });
    return lease && lease.port > 0 ? { port: lease.port, partition: ports.partitionFor({ siteDir }), scheme: lease.scheme } : undefined;
  };
}

/**
 * The list poll's ask: capture a running site that has no preview yet. ONE attempt per site per
 * port: the poll runs every 4 s, and a capture that keeps failing (an untrusted certificate, a page
 * that never loads) must not open a hidden window on every tick. A restart on a new port earns a
 * fresh attempt. Goes through the same scheduler, so an open's own capture and this one never race.
 *
 * @param required.schedule `sitePreviewScheduler.schedule`.
 * @returns `requestListedSitePreview`, the shape `project-ipc.ts`'s `requestPreviewCapture` expects.
 * @complexity O(1) per request.
 */
export function createListedPreviewRequests(
  { schedule }: { schedule: (required: { siteDir: string }, optional: {}) => void }, _optional = {},
) {
  /** Every `siteDir` + port the list poll has already asked to capture. */
  const listedPreviewRequests = new Set<string>();
  return function requestListedSitePreview({ siteDir, port }: { siteDir: string; port: number }, _opts = {}): void {
    const key = `${siteDir}\0${port}`;
    if (listedPreviewRequests.has(key)) return;
    listedPreviewRequests.add(key);
    schedule({ siteDir }, {});
  };
}

/**
 * Delete every cached preview no tracked site claims, once at boot. Hygiene, not correctness — see
 * `site-preview-store.ts`'s own doc on why an orphaned file can never reach the UI on its own, since
 * `buildSiteRecord` only ever asks for the preview of a row it is already building.
 *
 * Wrapped rather than left to throw: a hygiene sweep must never be the reason an otherwise-healthy
 * launch fails.
 *
 * @param required.readTrackedSites `tracked-sites.ts`'s reader. May throw.
 * @param required.sweepOrphanedPreviews `site-preview-store.ts`'s sweep, bound to `userData`. May throw.
 * @complexity O(n) in tracked-site count, plus `sweepOrphanedPreviews`'s own `readdir`.
 */
export function sweepSitePreviewsOnBoot({ projectsPath, readTrackedSites, sweepOrphanedPreviews, warn }: {
  projectsPath: string;
  readTrackedSites: (projectsPath: string) => readonly { siteDir: string }[];
  sweepOrphanedPreviews: (required: { trackedDirs: string[] }) => unknown;
  warn: (message: string) => void;
}, _optional = {}): void {
  try {
    const trackedDirs = readTrackedSites(projectsPath).map((row) => row.siteDir);
    sweepOrphanedPreviews({ trackedDirs });
  } catch (error) {
    warn(`tovu desktop: could not sweep orphaned site previews — ${(error as Error).message}`);
  }
}
