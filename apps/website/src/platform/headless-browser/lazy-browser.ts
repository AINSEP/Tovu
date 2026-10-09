/**
 * @file The shared core of every headless-Chromium capture in this server: one lazily launched
 * browser per owner, reused across captures and closed when idle, plus the JPEG encoding both
 * screenshot paths store or return.
 *
 * Two owners today, each with its OWN instance because their launch flags differ on purpose:
 * - Sites card previews (`features/sites/site-preview/`) open only loopback URLs this server built,
 *   so they may run Chromium unsandboxed in a container.
 * - `web_screenshot_page` (`features/web-screenshot/`) opens arbitrary public pages, so it keeps
 *   Chromium's sandbox on and routes every request through the egress guard.
 *
 * Generic (no Tovu types), so it is a candidate for `@jini-ai/diagnostics/web-evidence` beside
 * `playwright-browser.ts`; it lives here until a Jini release carries it, because a Tovu import of an
 * unbuilt Jini export crashes the dev server.
 *
 * Cost: one Chromium process (~150–250 MB RSS) while in use; nothing at all between uses.
 */

/** Anything with an async `close` — a Playwright `Browser` satisfies it structurally. */
export interface ClosableBrowser {
  close(): Promise<void>;
}

export interface LazyBrowser<B extends ClosableBrowser> {
  /** The running browser, launching it on first use. A failed launch is retried on the next call. */
  acquire(required?: {}, optional?: {}): Promise<B>;
  /** Marks the end of one use; with `idleCloseMs` set, the browser closes once that long passes unused. */
  release(required?: {}, optional?: {}): void;
  /** Closes now. Safe to call repeatedly and when nothing was launched. */
  close(required?: {}, optional?: {}): Promise<void>;
}

export interface LazyBrowserTimers {
  setTimeout(work: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const NODE_TIMERS: LazyBrowserTimers = {
  // `unref`: an idle-close timer must never keep a finishing process (or a test runner) alive.
  setTimeout: (work, ms) => setTimeout(work, ms).unref(),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

/**
 * @param required.launch - Starts the browser; called at most once per launched lifetime.
 * @param optional.idleCloseMs - Close this long after the last `release`; omitted, only `close` closes.
 * @param optional.timers - Injected for tests.
 * @complexity O(1) per call.
 */
export function createLazyBrowser<B extends ClosableBrowser>(
  { launch }: { launch: () => Promise<B> },
  { idleCloseMs, timers = NODE_TIMERS }: { idleCloseMs?: number; timers?: LazyBrowserTimers } = {},
): LazyBrowser<B> {
  let browser: Promise<B> | null = null;
  let idleTimer: unknown = null;

  function cancelIdleClose(): void {
    if (idleTimer === null) return;
    timers.clearTimeout(idleTimer);
    idleTimer = null;
  }

  async function close(): Promise<void> {
    cancelIdleClose();
    const closing = browser;
    browser = null;
    if (closing === null) return;
    try {
      await (await closing).close();
    } catch {
      // A launch that failed has nothing to close; a close that failed leaves nothing to retry.
    }
  }

  return {
    acquire() {
      cancelIdleClose();
      const launching = browser ?? launch();
      browser = launching;
      // A failed launch must not be cached, or every later capture would replay the same rejection.
      launching.catch(() => { if (browser === launching) browser = null; });
      return launching;
    },
    release() {
      if (idleCloseMs === undefined || browser === null) return;
      cancelIdleClose();
      idleTimer = timers.setTimeout(() => { idleTimer = null; void close(); }, idleCloseMs);
    },
    close,
  };
}

/** Dynamic so a deployment without Playwright gets a rejected capture, not a boot failure. */
export async function importPlaywrightChromium(): Promise<{ launch(options: Record<string, unknown>): Promise<unknown> }> {
  const { chromium } = await import("playwright");
  return chromium as unknown as { launch(options: Record<string, unknown>): Promise<unknown> };
}

/**
 * Re-encodes a screenshot as JPEG no wider than `maxWidth` (never enlarged).
 * @complexity O(pixels) — one decode and one encode.
 */
export async function encodeJpeg(
  { image, maxWidth }: { image: Buffer; maxWidth: number },
  { quality = 72 }: { quality?: number } = {},
): Promise<{ bytes: Buffer; width: number; height: number }> {
  const { default: sharp } = await import("sharp");
  const { data, info } = await sharp(image).resize({ width: maxWidth, withoutEnlargement: true }).jpeg({ quality }).toBuffer({ resolveWithObject: true });
  return { bytes: data, width: info.width, height: info.height };
}
