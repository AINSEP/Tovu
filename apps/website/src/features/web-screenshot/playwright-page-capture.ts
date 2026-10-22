import { renderPage, PageWorkTimeout, PUBLIC_RENDER_LAUNCH_OPTIONS, createRenderBrowserPool, type RenderBrowserPool, type RenderBrowserLease } from "@jini-ai/diagnostics/web-evidence/playwright";
import { importPlaywrightChromium } from "#src/platform/headless-browser/lazy-browser";
import type { HttpClientPort } from "#src/platform/http/index";
import { createRequestRouter, fetchOwnSiteResource, type OwnSiteFetch, type RequestRouterOptions, type RouteLike } from "./request-guard.js";
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
 * never fulfills one and the page's own redirects are followed by {@link renderPage} instead.
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
  waitForTimeout(ms: number): Promise<void>;
  waitForLoadState?(state: "load", options: { timeout: number }): Promise<void>;
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

export interface PlaywrightPageCaptureOptions {
  loadLauncher?: () => Promise<CaptureBrowserLauncher>;
  /** Host shares this pool with public reading; its composition owns sandbox/loader choices. */
  browserPool?: RenderBrowserPool;
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
  { loadLauncher = loadPlaywrightLauncher, ownSiteFetch = fetchOwnSiteResource, routerOptions = {}, allowUnsandboxed = false, deadlineMs = CAPTURE_DEADLINE_MS, idleCloseMs = IDLE_CLOSE_MS, browserPool }: PlaywrightPageCaptureOptions = {},
): PageCapturePort {
  const browser = browserPool ?? createRenderBrowserPool(
    { launch: async () => {
      const launched = await (await loadLauncher()).launch({ headless: true, chromiumSandbox: !allowUnsandboxed, args: [...PUBLIC_RENDER_LAUNCH_OPTIONS.args] });
      return { newContext: options => launched.newContext(options as unknown as CaptureContextOptions), close: () => launched.close() };
    } },
    { idleCloseMs },
  );

  async function shoot(request: PageCaptureRequest, signal: AbortSignal): Promise<PageCapture> {
    let lease: RenderBrowserLease;
    try {
      lease = await browser.acquire({}, { signal });
    } catch (error) {
      throw new PageCaptureError({ kind: "unavailable", message: (error as Error).message });
    }
    const { viewport } = request;
    const router = createRequestRouter({ httpClient, ownSiteFetch, allowedOrigins: request.allowedOrigins, signal }, { ...routerOptions, allowDataRequests: false });
    const contextOptions: CaptureContextOptions = {
      viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.deviceScaleFactor,
      isMobile: viewport.isMobile, hasTouch: viewport.isMobile, serviceWorkers: "block", acceptDownloads: false,
      ignoreHTTPSErrors: false, javaScriptEnabled: true,
    };
    try {
      return await renderPage({
        browser: { newContext: () => lease.browser.newContext({ ...contextOptions }), close: () => lease.browser.close() },
        url: request.url,
        consume: async ({ page, response, finalUrl, budget }) => {
          if (request.fullPage) await budget.run({ work: () => page.evaluate(scrollThroughExpression(request.maxPageHeightPx)) }).catch(error => { if (error instanceof PageWorkTimeout) throw error; });
          const pageHeight = request.fullPage
            ? clampHeight(await budget.run({ work: () => page.evaluate("Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)") }), viewport.height)
            : viewport.height;
          const capturedHeight = Math.min(pageHeight, request.fullPage ? request.maxPageHeightPx : viewport.height);
          if (!page.screenshot) throw new Error("Browser cannot take screenshots");
          const clip = request.fullPage ? { clip: { x: 0, y: 0, width: viewport.width, height: capturedHeight } } : {};
          // NEEDS-JINI: `RenderPage.screenshot` narrows `animations` to "disabled"; the object is
          // Playwright's Page, whose documented option also takes "allow" (the fallback below).
          const { png, note } = await shootFrame({ page: page as unknown as FrameShooter, budget, fullPage: request.fullPage, clip, deadlineMs });
          const title = (await budget.run({ work: () => page.title() })).slice(0, 300);
          return { png, finalUrl, status: response?.status() ?? null, title, pageHeight, capturedHeight, blockedRequests: router.report().blocked, ...(note ? { note } : {}) };
        },
      }, { originPolicy: "public", router, signal, timeoutMs: deadlineMs,
        waitFor: request.waitFor ?? request.settleMs / 1000,
        dismissCookieBanners: request.dismissCookieBanners === true, loadWaitMs: 5_000,
      });
    } catch (error) {
      if (error instanceof PageWorkTimeout) throw new PageCaptureError({ kind: "timeout", message: `exceeded ${deadlineMs}ms` });
      if (router.report().navigationRefused) throw new PageCaptureError({ kind: "refused", message: "refused by the egress guard" });
      throw new PageCaptureError({ kind: "failed", message: navigationErrorCode(error) });
    } finally { lease.release(); }
  }

  return {
    async capture(request, { signal } = {}) {
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) controller.abort();
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
        if (!browserPool && error instanceof PageCaptureError && error.kind === "timeout") void browser.close().catch(() => {});
        throw error;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      }
    },
    close() {
      return browser.close();
    },
  };
}

/** Budget held back from the stable-frame screenshot so a current-frame fallback can still run. */
export const FALLBACK_FRAME_RESERVE_MS = 4_000;

/** Playwright's `page.screenshot`, with both `animations` modes the fallback uses. */
type FrameShooter = { screenshot(options: Omit<Parameters<CapturePage["screenshot"]>[0], "animations"> & { animations: "disabled" | "allow" }): Promise<Buffer> };
type ScreenshotBudget = { run<T>(required: { work: () => Promise<T> }): Promise<T>; remainingMs(): number };

/**
 * A stable frame first (`animations: "disabled"` waits for finite animations to end); if Playwright's
 * own timeout fires on that, the page was still animating (WebGL heroes, endless transitions, e.g.
 * resend.com), so the frame on screen is captured as it is, with a note, instead of failing the call.
 * Only Playwright's `TimeoutError` falls back: a closed page or a budget timeout still fails.
 * @complexity O(1) beyond the screenshots.
 */
async function shootFrame(
  { page, budget, fullPage, clip, deadlineMs }: { page: FrameShooter; budget: ScreenshotBudget; fullPage: boolean; clip: { clip?: { x: number; y: number; width: number; height: number } }; deadlineMs: number },
): Promise<{ png: Buffer; note?: string }> {
  // Playwright treats timeout 0 as "no timeout", so the stable attempt always gets at least 1 ms.
  const stableTimeout = Math.max(1, budget.remainingMs() - FALLBACK_FRAME_RESERVE_MS);
  try {
    return { png: await budget.run({ work: () => page.screenshot({ type: "png", fullPage, timeout: stableTimeout, animations: "disabled", ...clip }) }) };
  } catch (error) {
    if ((error as { name?: unknown }).name !== "TimeoutError") throw error;
  }
  const png = await budget.run({ work: () => page.screenshot({ type: "png", fullPage, timeout: Math.max(1, budget.remainingMs()), animations: "allow", ...clip }) })
    .catch((error: unknown) => { throw (error as { name?: unknown }).name === "TimeoutError" ? new PageWorkTimeout({ timeoutMs: deadlineMs }) : error; });
  return { png, note: `page was still animating near the ${deadlineMs / 1000} s deadline; captured the current frame (it may show a mid-animation state).` };
}

/** Chromium's `net::ERR_*` code only — never a raw message that could echo an internal address. */
function navigationErrorCode(error: unknown): string {
  if (error instanceof Error && error.message === "too many redirects") return error.message;
  const code = /net::(ERR_[A-Z_]+)/.exec(error instanceof Error ? error.message : "")?.[1];
  return code ?? "navigation failed";
}
