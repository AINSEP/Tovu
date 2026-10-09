/**
 * @file When an admin Sites card's preview is (re)captured, and the one-at-a-time queue that does it.
 *
 * Policy, mirroring the desktop's `site-preview-scheduler.ts` and adding the one thing a browser
 * admin needs that the desktop does not (a long-lived server outlives many card views):
 *
 * - **Never on the request path.** {@link SitePreviewService.versions} only reads mtimes and
 *   enqueues; the Sites listing never waits on a capture, and the image route only reads the file.
 * - **Only running sites.** A stopped site has no address; its card shows the last capture.
 * - **Once per live lifecycle**, like the desktop (a restart is a new pid, so a new capture), plus a
 *   refresh when the stored capture is older than `refreshMs` while someone is looking at the
 *   Sites screen — "recent", without a timer running when nobody is.
 * - **One capture at a time, machine-wide for this server**, deduped by site name, and a failed site
 *   waits `retryMs` before it is tried again, so a broken site cannot keep a browser busy.
 * - **A capture older than the site's `createdAt` is ignored**: it belongs to a deleted folder that
 *   had the same name, and must not decorate its replacement.
 *
 * The browser, store, clock and deferral are ports; this module does no I/O itself.
 */
import type { SitePreviewStore } from "./site-preview-store.js";

/** A running site this server can screenshot: its public root URL and an identity for this run. */
export interface SitePreviewTarget {
  name: string;
  /** The site's PUBLIC root, always a loopback URL this server built — never caller-supplied. */
  url: string;
  /** Changes on every restart (a pid), so a new run gets one fresh capture. */
  lifecycle: string;
}

export interface SitePreviewCapturePort {
  /** The resized image bytes, or `null` on any failure. Must not throw. */
  capture(required: { url: string }, optional?: {}): Promise<Buffer | null>;
  /** Release the browser once the queue drains, so no Chromium idles between card views. */
  close(required?: {}, optional?: {}): Promise<void>;
}

export interface SitePreviewService {
  /**
   * Version tokens for every listed site that has a usable capture, and enqueue whichever running
   * targets are due. Returns immediately.
   */
  versions(required: { sites: readonly { name: string; createdAt: string }[]; targets: readonly SitePreviewTarget[] }, optional?: {}): Record<string, number>;
  read(required: { name: string }, optional?: {}): Buffer | null;
  /** Resolves once the queue is empty — for tests and shutdown, never awaited by a route. */
  idle(required?: {}, optional?: {}): Promise<void>;
}

export interface SitePreviewServiceOptions {
  now?: () => number;
  /** A stored capture older than this is refreshed while the Sites screen is being viewed. */
  refreshMs?: number;
  /** A site whose capture failed is not retried sooner than this. */
  retryMs?: number;
  /** Runs the drain off the caller's stack (`setImmediate` in production). */
  defer?: (work: () => void) => void;
}

const MINUTE_MS = 60_000;

/**
 * @complexity `versions` is O(s + t·q) for s sites, t targets and a queue of at most t entries
 *   (t ≤ the local-site limit + 1, so in practice a handful); the drain is one capture at a time.
 */
export function createSitePreviewService(
  { store, capture }: { store: SitePreviewStore; capture: SitePreviewCapturePort },
  { now = Date.now, refreshMs = 30 * MINUTE_MS, retryMs = 5 * MINUTE_MS, defer = (work) => { setImmediate(work); } }: SitePreviewServiceOptions = {},
): SitePreviewService {
  const capturedLifecycle = new Map<string, string>();
  const failedAt = new Map<string, number>();
  const queue: SitePreviewTarget[] = [];
  let active: string | null = null;
  let drain: Promise<void> = Promise.resolve();

  /** A capture made before this folder existed belongs to a deleted namesake. */
  function usableVersion(name: string, createdAt: string): number | null {
    const version = store.version({ name });
    const created = Date.parse(createdAt);
    return version !== null && !(created > version) ? version : null;
  }

  function isDue(target: SitePreviewTarget, version: number | null): boolean {
    if (active === target.name || queue.some((queued) => queued.name === target.name)) return false;
    const failed = failedAt.get(target.name);
    if (failed !== undefined && now() - failed < retryMs) return false;
    if (version === null || capturedLifecycle.get(target.name) !== target.lifecycle) return true;
    return now() - version >= refreshMs;
  }

  async function runQueue(): Promise<void> {
    try {
      for (let target = queue.shift(); target !== undefined; target = queue.shift()) {
        active = target.name;
        const bytes = await capture.capture({ url: target.url });
        const written = bytes === null ? null : store.write({ name: target.name, bytes });
        if (written === null) {
          failedAt.set(target.name, now());
        } else {
          failedAt.delete(target.name);
          capturedLifecycle.set(target.name, target.lifecycle);
        }
      }
    } finally {
      active = null;
      await capture.close();
    }
  }

  function enqueue(target: SitePreviewTarget): void {
    const wasIdle = queue.length === 0 && active === null;
    queue.push(target);
    if (!wasIdle) return;
    drain = new Promise<void>((resolve) => {
      defer(() => { void runQueue().catch(() => {}).finally(resolve); });
    });
  }

  return {
    versions({ sites, targets }) {
      const result: Record<string, number> = {};
      const createdAtByName = new Map(sites.map((site) => [site.name, site.createdAt]));
      for (const site of sites) {
        const version = usableVersion(site.name, site.createdAt);
        if (version !== null) result[site.name] = version;
      }
      for (const target of targets) {
        if (!createdAtByName.has(target.name)) continue;
        if (isDue(target, result[target.name] ?? null)) enqueue(target);
      }
      return result;
    },
    read({ name }) {
      return store.read({ name });
    },
    idle() {
      return drain;
    },
  };
}
