import { createLazyBrowser, importPlaywrightChromium } from "#src/platform/headless-browser/lazy-browser";
import type { HttpClientPort } from "#src/platform/http/index";
import { createRequestRouter, fetchOwnSiteResource, MAX_REDIRECT_HOPS, type OwnSiteFetch, type RequestRouter, type RequestRouterOptions, type RouteLike } from "./request-guard.js";
import { CAPTURE_DEADLINE_MS, PageCaptureError, type PageCapture, type PageCapturePort, type PageCaptureRequest } from "./web-screenshot.js";

/**
 * @file `web_screenshot_page`'s {@link PageCapturePort}: headless Chromium through Playwright, on the
 * shared lazy-browser core (`platform/headless-browser/lazy-browser.ts`) the Sites card previews use.
 *
 * Isolation, per capture: a FRESH browser context (no cookies, storage or cache from any other
 * call), service workers blocked (so every request reaches the router), downloads refused,
 * WebSockets closed before they connect, and every HTTP request routed through `request-guard.ts`,
 * which fetches it itself through the egress guard. As defence in depth, Chromium is launched with
 * a dead proxy and no loopback bypass, so any request that somehow escaped routing would fail
 * rather than reach a network, and WebRTC is limited to proxied UDP (none). That proxy is not
 * hypothetical: Playwright does not route the next hop of a fulfilled 3xx, which is why the router
 * never fulfills one and the page's own redirects are followed by {@link navigate} instead.
 *
 * Unlike the preview capture, Chromium's own sandbox stays ON (`chromiumSandbox: true`): this
 * browser renders arbitrary, untrusted pages. A host that cannot run the sandbox (some containers)
 * gets `unavailable` unless its composition explicitly passes `allowUnsandboxed`.
 *
 * The browser launches on first use and closes after {@link IDLE_CLOSE_MS} without a capture.
 */

/** The slice of Playwright this adapter drives — structural, so tests pass a fake without mocking modules. */
export interface CapturePage {
  goto(url: string, options: { waitUntil: "domcontentloaded"; timeout: number }): Promise<{ status(): number } | null>;
  waitForLoadState(state: "load", options: { timeout: number }): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
  /** Called with a string expression only, so no page-side function crosses the boundary. */
  evaluate(expression: string): Promise<unknown>;
  title(): Promise<string>;
  url(): string;
  screenshot(options: { type: "png"; fullPage: boolean; clip?: { x: number; y: number; width: number; height: number }; timeout: number; animations: "disabled" }): Promise<Buffer>;
}
export interface CaptureContext {
  route(pattern: string, handler: (route: RouteLike) => Promise<void>): Promise<unknown>;
  routeWebSocket(pattern: RegExp, handler: (socket: { close(): Promise<void> }) => unknown): Promise<unknown>;
  newPage(): Promise<CapturePage>;
  close(): Promise<void>;
}
export interface CaptureContextOptions {
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
  serviceWorkers: "block";
  acceptDownloads: false;
  ignoreHTTPSErrors: false;
  javaScriptEnabled: true;
}
export interface CaptureBrowser {
  newContext(options: CaptureContextOptions): Promise<CaptureContext>;
  close(): Promise<void>;
}
export interface CaptureLaunchOptions { headless: true; chromiumSandbox: boolean; args: string[] }
export interface CaptureBrowserLauncher {
  launch(options: CaptureLaunchOptions): Promise<CaptureBrowser>;
}

export const IDLE_CLOSE_MS = 60_000;
/** Longest wait for the `load` event after the DOM is ready; slow trackers must not cost a capture. */
const LOAD_WAIT_MS = 8_000;
/**
 * Scrolls a full-page capture through its height (capped at `cap` px) one viewport at a time, then
 * back to the top. Scroll-reveal sections and lazy images only appear once scrolled into view; a
 * full-page screenshot never scrolls, so without this everything below the fold of such a page
 * (luviraconsulting.com, 2026-10-08) is captured as blank sections. `behavior: "instant"` because a
 * page with CSS `scroll-behavior: smooth` otherwise animates each jump and never gets far. A string,
 * so no page-side function crosses the boundary; ~10 steps of 150 ms at the 8000 px cap.
 */
const scrollThroughExpression = (cap: number) =>
  `(async () => { const end = Math.min(document.documentElement.scrollHeight, ${cap}); ` +
  `for (let y = 0; y < end; y += window.innerHeight) { window.scrollTo({ top: y, behavior: "instant" }); await new Promise((r) => setTimeout(r, 150)); } ` +
  `window.scrollTo({ top: 0, behavior: "instant" }); await new Promise((r) => setTimeout(r, 300)); })()`;
/** Port 9 (discard) on loopback: nothing listens, so an unrouted request fails instead of escaping. */
const DEAD_PROXY = "http://127.0.0.1:9";
const LAUNCH_ARGS = [
  "--disable-dev-shm-usage",
  `--proxy-server=${DEAD_PROXY}`,
  // Chromium implicitly bypasses proxies for loopback; `<-loopback>` removes that bypass.
  "--proxy-bypass-list=<-loopback>",
  "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
];

export interface PlaywrightPageCaptureOptions {
  loadLauncher?: () => Promise<CaptureBrowserLauncher>;
  ownSiteFetch?: OwnSiteFetch;
  routerOptions?: RequestRouterOptions;
  /** Only for hosts that cannot run Chromium's sandbox; never set from env. */
  allowUnsandboxed?: boolean;
  deadlineMs?: number;
  idleCloseMs?: number;
}

async function loadPlaywrightLauncher(): Promise<CaptureBrowserLauncher> {
  const chromium = await importPlaywrightChromium();
  return { launch: (options) => chromium.launch({ ...options }) as Promise<CaptureBrowser> };
}

function clampHeight(raw: unknown, fallback: number): number {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.ceil(raw) : fallback;
}

/**
 * @param required.httpClient - Guarded client built from `WEB_SCREENSHOT_EGRESS_POLICY`.
 * @complexity O(1) per capture beyond the page load and screenshot; at most one browser per adapter.
 */
export function createPlaywrightPageCapture(
  { httpClient }: { httpClient: HttpClientPort },
  { loadLauncher = loadPlaywrightLauncher, ownSiteFetch = fetchOwnSiteResource, routerOptions = {}, allowUnsandboxed = false, deadlineMs = CAPTURE_DEADLINE_MS, idleCloseMs = IDLE_CLOSE_MS }: PlaywrightPageCaptureOptions = {},
): PageCapturePort {
  const browser = createLazyBrowser(
    { launch: async () => (await loadLauncher()).launch({ headless: true, chromiumSandbox: !allowUnsandboxed, args: [...LAUNCH_ARGS] }) },
    { idleCloseMs },
  );

  async function shoot(request: PageCaptureRequest, signal: AbortSignal): Promise<PageCapture> {
    let launched: CaptureBrowser;
    try {
      launched = await browser.acquire();
    } catch (error) {
      throw new PageCaptureError({ kind: "unavailable", message: (error as Error).message });
    }
    const { viewport } = request;
    const router = createRequestRouter({ httpClient, ownSiteFetch, allowedOrigins: request.allowedOrigins, signal }, routerOptions);
    const context = await launched.newContext({
      viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.deviceScaleFactor,
      isMobile: viewport.isMobile, hasTouch: viewport.isMobile, serviceWorkers: "block", acceptDownloads: false,
      ignoreHTTPSErrors: false, javaScriptEnabled: true,
    });
    try {
      await context.routeWebSocket(/.*/, (socket) => socket.close().catch(() => {}));
      await context.route("**/*", (route) => router.handle(route));
      const page = await context.newPage();
      const response = await navigate({ page, router, url: request.url, timeoutMs: deadlineMs });
      await page.waitForLoadState("load", { timeout: LOAD_WAIT_MS }).catch(() => {});
      if (request.fullPage) await page.evaluate(scrollThroughExpression(request.maxPageHeightPx)).catch(() => {});
      if (request.settleMs > 0) await page.waitForTimeout(request.settleMs);
      const pageHeight = request.fullPage
        ? clampHeight(await page.evaluate("Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)"), viewport.height)
        : viewport.height;
      const capturedHeight = Math.min(pageHeight, request.fullPage ? request.maxPageHeightPx : viewport.height);
      const png = await page.screenshot({
        type: "png", fullPage: request.fullPage, timeout: deadlineMs, animations: "disabled",
        ...(request.fullPage ? { clip: { x: 0, y: 0, width: viewport.width, height: capturedHeight } } : {}),
      });
      return { png, finalUrl: page.url(), status: response?.status() ?? null, title: (await page.title()).slice(0, 300), pageHeight, capturedHeight, blockedRequests: router.report().blocked };
    } finally {
      await context.close().catch(() => {});
    }
  }

  return {
    async capture(request, { signal } = {}) {
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      signal?.addEventListener("abort", onAbort, { once: true });
      let timer: NodeJS.Timeout | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new PageCaptureError({ kind: "timeout", message: `exceeded ${deadlineMs}ms` }));
        }, deadlineMs);
      });
      try {
        const work = shoot(request, controller.signal);
        // A capture that lost the race still settles later; its outcome is already reported.
        work.catch(() => {});
        return await Promise.race([work, deadline]);
      } catch (error) {
        // A page that hung the renderer can also hang its context's close: drop the whole browser.
        if (error instanceof PageCaptureError && error.kind === "timeout") await browser.close();
        throw error;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        browser.release();
      }
    },
    close() {
      return browser.close();
    },
  };
}

/**
 * Navigates the page, following the page's own redirects one `goto` per hop: the router aborts a
 * main-frame redirect and records its target, so every hop is routed and vetted like the first.
 * @complexity O(hops), at most {@link MAX_REDIRECT_HOPS} + 1 navigations.
 */
async function navigate(
  { page, router, url, timeoutMs }: { page: CapturePage; router: RequestRouter; url: string; timeoutMs: number },
  _optional: {} = {},
): Promise<{ status(): number } | null> {
  let target = url;
  for (let hop = 0; ; hop += 1) {
    try {
      return await page.goto(target, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    } catch (error) {
      const next = router.takeNavigationRedirect();
      if (next !== undefined && hop < MAX_REDIRECT_HOPS) { target = next; continue; }
      if (router.report().navigationRefused) throw new PageCaptureError({ kind: "refused", message: "refused by the egress guard" });
      throw new PageCaptureError({ kind: "failed", message: next !== undefined ? "too many redirects" : navigationErrorCode(error) });
    }
  }
}

/** Chromium's `net::ERR_*` code only — never a raw message that could echo an internal address. */
function navigationErrorCode(error: unknown): string {
  const code = /net::(ERR_[A-Z_]+)/.exec(error instanceof Error ? error.message : "")?.[1];
  return code ?? "navigation failed";
}
