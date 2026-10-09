/**
 * @file The server's {@link SitePreviewCapturePort}: headless Chromium through Playwright, resized
 * with sharp. The desktop captures with Electron's hidden `BrowserWindow.capturePage()`, which a
 * plain Node server does not have; this repo already ships Playwright as a runtime dependency for
 * site evidence (`features/site-evidence/tool-registrations.ts`), so the same optional browser is
 * reused here rather than adding a second screenshot stack.
 *
 * Same capture shape as the desktop's `captureSitePreview` (`apps/desktop/main.ts`): the site's
 * PUBLIC root at 1280×800, a short settle for late paint, stored at 640px wide.
 *
 * The lazy launch/close lifecycle and the JPEG encode are the shared headless-capture core
 * (`platform/headless-browser/lazy-browser.ts`), which `web_screenshot_page` uses too.
 *
 * Cost: one Chromium process (~150–250 MB RSS) is launched lazily for a drain of the service's
 * queue and closed when it empties; each page is ~1–2 s of CPU. With the service's throttle
 * (one at a time, once per site run, at most every 30 minutes while the Sites screen is viewed)
 * that is a few seconds of work per site per half hour, and none at all when nobody looks.
 *
 * When Playwright or its browser is missing — a self-hosted image may not carry Chromium — every
 * capture is `null` and cards show their placeholder; the service's retry delay keeps that from
 * relaunching on every listing.
 */
import { createLazyBrowser, encodeJpeg, importPlaywrightChromium } from "#src/platform/headless-browser/lazy-browser";
import type { SitePreviewCapturePort } from "./site-preview-service.js";

/** The slice of Playwright this adapter drives — structural, so tests pass a fake without mocking modules. */
export interface PreviewPage {
  goto(url: string, options: { waitUntil: "load"; timeout: number }): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  screenshot(options: { type: "png" }): Promise<Buffer>;
}
export interface PreviewBrowser {
  newContext(options: { viewport: { width: number; height: number }; ignoreHTTPSErrors: boolean }): Promise<{ newPage(): Promise<PreviewPage>; close(): Promise<void> }>;
  close(): Promise<void>;
}
export interface PreviewBrowserLauncher {
  launch(options: { headless: boolean; args: string[] }): Promise<PreviewBrowser>;
}

export interface PlaywrightSitePreviewCaptureOptions {
  /** Resolves Chromium; defaults to a dynamic `import("playwright")` so a missing module is a `null` capture, not a boot failure. */
  loadLauncher?: () => Promise<PreviewBrowserLauncher>;
  /** PNG in, stored bytes out; defaults to sharp → 640px JPEG. */
  resize?: (required: { png: Buffer; width: number }) => Promise<Buffer>;
  log?: (message: string) => void;
}

const VIEWPORT = { width: 1280, height: 800 };
const STORED_WIDTH_PX = 640;
const PAINT_SETTLE_MS = 1200;
const LOAD_TIMEOUT_MS = 15_000;
// Same flags and reasoning as site evidence's `TOVU_BROWSER_LAUNCH_OPTIONS`: this browser only ever
// opens a loopback URL the server built for one of its own sites, never a caller-chosen address.
const LAUNCH_OPTIONS = { headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] };

async function loadPlaywrightLauncher(): Promise<PreviewBrowserLauncher> {
  const chromium = await importPlaywrightChromium();
  return { launch: (options) => chromium.launch(options) as Promise<PreviewBrowser> };
}

async function resizeWithSharp({ png, width }: { png: Buffer; width: number }): Promise<Buffer> {
  return (await encodeJpeg({ image: png, maxWidth: width }, { quality: 72 })).bytes;
}

/**
 * @complexity O(1) per capture beyond the page load, screenshot and resize themselves.
 */
export function createPlaywrightSitePreviewCapture(
  _required: Record<string, never> = {},
  { loadLauncher = loadPlaywrightLauncher, resize = resizeWithSharp, log = (message) => console.warn(message) }: PlaywrightSitePreviewCaptureOptions = {},
): SitePreviewCapturePort {
  const browser = createLazyBrowser({ launch: async () => (await loadLauncher()).launch(LAUNCH_OPTIONS) });

  async function shoot(url: string): Promise<Buffer> {
    // `ignoreHTTPSErrors`: dev sites serve the repo's self-signed localhost certificate, and the
    // URL is always this server's own loopback address (see `SitePreviewTarget.url`).
    const context = await (await browser.acquire()).newContext({ viewport: VIEWPORT, ignoreHTTPSErrors: true });
    try {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "load", timeout: LOAD_TIMEOUT_MS });
      await page.waitForTimeout(PAINT_SETTLE_MS);
      return await resize({ png: await page.screenshot({ type: "png" }), width: STORED_WIDTH_PX });
    } finally {
      await context.close();
    }
  }

  return {
    async capture({ url }) {
      try {
        return await shoot(url);
      } catch (error) {
        log(`[site-preview] could not capture ${url}: ${(error as Error).message}`);
        return null;
      }
    },
    close() {
      // The service closes once its queue drains, so no Chromium idles between card views.
      return browser.close();
    },
  };
}
