/** Live PUBLIC guest thumbnails. The scheduler owns timing and the preview store owns files.
 * No view is created or navigated for decoration; failed eligibility retains the previous image. */
import type { PreviewTarget } from '../../site-preview-scheduler.ts';
import { withRenderTimeout } from '@jini-ai/desktop-host';

export const PREVIEW_WIDTH_PX = 640;
export const PREVIEW_CAPTURE_DEBOUNCE_MS = 1500;
const PREVIEW_CAPTURE_TIMEOUT_MS = 10_000;

export interface LivePreviewGuest {
  partition: string;
  getURL(): string;
  /** Rechecks owning shell, canonical site, session, readiness and navigation generation. */
  isCurrent(): boolean;
  capturePage(): Promise<{ resize(options: { width: number }): { toPNG(): Buffer } }>;
}
export interface PreviewCapturePorts {
  liveGuest: (input: { siteDir: string }) => LivePreviewGuest | undefined;
  writePreview: (input: { siteDir: string; png: Buffer }) => number | null;
  warn: (message: string) => void;
}

/** Same-origin public pages only. Query/fragment state and reserved private surfaces fail closed.
 * O(url length); the host's canonical server origin is supplied by the existing target resolver. */
export function isPublicPreviewUrl({ url, origin }: { url: string; origin: string }, _options = {}): boolean {
  try {
    const parsed = new URL(url);
    const path = decodeURIComponent(parsed.pathname).toLowerCase();
    if (parsed.origin !== origin || parsed.username || parsed.password || parsed.search || parsed.hash || path.includes('%')) return false;
    return !/(^|[/\\])(admin|api|auth|oauth|login|logout|signin|signout|sign-in|sign-out|signup|sign-up|register|callback|account|profile|private|error|404|500)([/\\]|$)/.test(path);
  } catch { return false; }
}

/** Capture and store only while the guest's identity and public URL remain current.
 * @complexity O(image pixels) time and space for capture/resize.
 */
async function captureEligiblePreview({ guest, origin, siteDir, isCurrent, ports }: {
  guest: LivePreviewGuest; origin: string; siteDir: string; isCurrent: () => boolean; ports: PreviewCapturePorts;
}, _options = {}): Promise<boolean> {
  const url = guest.getURL();
  const eligible = () => isCurrent() && guest.isCurrent() && guest.getURL() === url && isPublicPreviewUrl({ url: guest.getURL(), origin });
  if (!eligible()) return false;
  const captured = await withRenderTimeout({ promise: guest.capturePage() }, { timeoutMs: PREVIEW_CAPTURE_TIMEOUT_MS });
  if (!eligible()) return false;
  return ports.writePreview({ siteDir, png: captured.resize({ width: PREVIEW_WIDTH_PX }).toPNG() }) !== null;
}

/** Capture the registered live guest, validating its identity on both sides of asynchronous I/O.
 * O(image pixels) for capture/resize. Timeout, navigation or release stores nothing. */
export function createSitePreviewCapture({ ports }: { ports: PreviewCapturePorts }, _options = {}) {
  return async function captureSitePreview(
    { siteDir, port, partition, scheme = 'http' }: PreviewTarget & { siteDir: string },
    { isCurrent = () => true }: { isCurrent?: () => boolean } = {},
  ): Promise<boolean> {
    try {
      const guest = ports.liveGuest({ siteDir });
      if (!guest || guest.partition !== partition) return false;
      // An https dev server's certificate names localhost, not the loopback IP.
      const origin = scheme === 'https' ? `https://localhost:${port}` : `http://127.0.0.1:${port}`;
      return await captureEligiblePreview({ guest, origin, siteDir, isCurrent, ports });
    } catch (error) {
      ports.warn(`tovu desktop: could not capture a preview for ${siteDir} — ${error instanceof Error ? error.message : String(error)}`);
      return false;
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
