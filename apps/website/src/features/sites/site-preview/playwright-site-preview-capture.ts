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
 * When Playwright or both browsers are missing — a self-hosted image may not carry either — every
 * capture is `null` and cards show their placeholder; the service's retry delay keeps that from
 * relaunching on every listing.
 */
import { createLazyBrowser, encodeJpeg } from "#src/platform/headless-browser/lazy-browser";
import { openPlaywrightRenderBrowser } from "@jini-ai/diagnostics/web-evidence/playwright";
import { playwrightModuleLoader } from "#src/platform/headless-browser/playwright-loader";
import type { SitePreviewCapturePort } from "./site-preview-service.js";
import { desktopRenderForHost } from '#src/platform/headless-browser/desktop-render';
import type { UrlCapturePort } from '@jini-ai/desktop-host';

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
  /** Defaults to Jini's bundled Chromium/system Chrome selection; missing browsers yield a `null` capture, not a boot failure. */
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

/** Jini owns browser fallback; retain the preview's launch policy on both attempts.
 * Unavailable results reject the capture into its existing placeholder/retry path.
 * @complexity O(1) state, at most two browser launches per acquisition. */
async function loadPlaywrightLauncher(): Promise<PreviewBrowserLauncher> {
  return { launch: async (options) => {
    const result = await openPlaywrightRenderBrowser({}, { moduleLoader: playwrightModuleLoader, launchOptions: options });
    if (!result.available) throw new Error(result.reason);
    return result.browser as unknown as PreviewBrowser;
  } };
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

/** Sites and Themes previews share the desktop native browser capability when present.
 * The established queue still owns retries and the established encoder owns JPEG sizing.
 * @complexity O(pixels), bounded by the native capture contract.
 */
export function createSitePreviewCaptureForHost(
  _required: Record<string, never> = {},
  { env = process.env, capture = desktopRenderForHost({ env }), ...options }: PlaywrightSitePreviewCaptureOptions & { env?: NodeJS.ProcessEnv; capture?: UrlCapturePort | null } = {},
): SitePreviewCapturePort {
  if (!capture) return createPlaywrightSitePreviewCapture({}, options);
  const resize = options.resize ?? resizeWithSharp;
  const log = options.log ?? console.warn;
  return {
    async capture({ url }) {
      try {
        const result = await capture.captureUrl({ url, viewport: VIEWPORT, fullPage: false,
          maxPageHeightPx: VIEWPORT.height, settleMs: PAINT_SETTLE_MS });
        return await resize({ png: Buffer.from(result.png), width: STORED_WIDTH_PX });
      } catch {
        log('[site-preview] native capture failed');
        return null;
      }
    },
    async close() {},
  };
}
