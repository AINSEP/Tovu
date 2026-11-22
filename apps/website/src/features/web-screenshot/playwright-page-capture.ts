import { describeErrorForLog } from "@jini-ai/core/model-facing-tool-errors";
import { captureBudget, type CaptureBudget, type CaptureBudgetLimits } from "@jini-ai/diagnostics/web-evidence/capture-budget";
import { REAL_CAPTURE_CLOCK, type CaptureClock } from "@jini-ai/diagnostics/web-evidence/capture-clock";
import { renderPage, PageWorkTimeout, PUBLIC_RENDER_LAUNCH_OPTIONS, createRenderBrowserPool, type RenderBrowserPool, type RenderBrowserLease, type RenderSession } from "@jini-ai/diagnostics/web-evidence/playwright";
import { importPlaywrightChromium } from "#src/platform/headless-browser/playwright-loader";
import type { HttpClientPort } from "#src/platform/http/index";
import { createRequestRouter, fetchOwnSiteResource, type OwnSiteFetch, type RequestRouterOptions, type RouteLike } from "./request-guard.js";
import { CAPTURE_LIMITS, PageCaptureError, type PageCapture, type PageCapturePort, type PageCaptureRequest } from "./web-screenshot.js";

/**
 * @file `web_screenshot_page`'s {@link PageCapturePort}: headless Chromium through Playwright, on the
 * shared lazy-browser core (`createLazyBrowser`, `@jini-ai/diagnostics/web-evidence/playwright`) the Sites card previews use.
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
const scrollThroughExpression = ({ cap }: { cap: number }, _optional = {}) =>
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
  /** The host's capture limits; each request's own total and work deadline are computed from them. */
  limits?: CaptureBudgetLimits;
  /** One time source for the render's budget, its hard stop and this adapter's outer race; tests pass a fake of it. */
  clock?: CaptureClock;
  idleCloseMs?: number;
}

async function loadPlaywrightLauncher(): Promise<CaptureBrowserLauncher> {
  const chromium = await importPlaywrightChromium();
  return { launch: (options) => chromium.launch({ ...options }) as Promise<CaptureBrowser> };
}

function clampHeight({ raw, fallback }: { raw: unknown; fallback: number }, _optional = {}): number {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.ceil(raw) : fallback;
}

/**
 * @param required.httpClient - Guarded client built from `WEB_SCREENSHOT_EGRESS_POLICY`.
 * @complexity O(1) per capture beyond the page load and screenshot; at most one browser per adapter.
 */
export function createPlaywrightPageCapture(
  { httpClient }: { httpClient: HttpClientPort },
  { loadLauncher = loadPlaywrightLauncher, ownSiteFetch = fetchOwnSiteResource, routerOptions = {}, allowUnsandboxed = false, limits = CAPTURE_LIMITS, clock = REAL_CAPTURE_CLOCK, idleCloseMs = IDLE_CLOSE_MS, browserPool }: PlaywrightPageCaptureOptions = {},
): PageCapturePort {
  const browser = browserPool ?? createRenderBrowserPool(
    { launch: async () => {
      const launched = await (await loadLauncher()).launch({ headless: true, chromiumSandbox: !allowUnsandboxed, args: [...PUBLIC_RENDER_LAUNCH_OPTIONS.args] });
      return { newContext: options => launched.newContext(options as unknown as CaptureContextOptions), close: () => launched.close() };
    } },
    { idleCloseMs },
  );

  const shoot = createCaptureShooter({ browser, httpClient, ownSiteFetch, routerOptions, clock });

  return {
    async capture(request, { signal } = {}) {
      const plan = captureBudget(budgetRequestOf({ request }), limits);
      const progress: CaptureProgress = { loaded: false };
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) controller.abort();
      let timer: unknown;
      const deadline = new Promise<never>((_, reject) => {
        timer = clock.setTimeout(() => {
          controller.abort();
          reject(timeoutError({ plan, progress, hardStop: true }));
        }, plan.totalMs);
      });
      try {
        const work = shoot({ request, plan, progress }, controller.signal);
        // A capture that lost the race still settles later; its outcome is already reported.
        work.catch(() => {});
        return await Promise.race([work, deadline]);
      } catch (error) {
        // A caller's cancel is not a capture failure: its own reason reaches the caller, never a "navigation failed".
        if (signal?.aborted) throw signal.reason;
        dropBrowserAfterTimeout({ browser, error, owned: !browserPool });
        throw error;
      } finally {
        clock.clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      }
    },
    close() {
      return browser.close();
    },
  };
}

/** Playwright's `page.screenshot`, with both `animations` modes the fallback uses. */
type FrameShooter = { screenshot(options: Omit<Parameters<CapturePage["screenshot"]>[0], "animations"> & { animations: "disabled" | "allow" }): Promise<Buffer> };
type ScreenshotBudget = { run<T>(required: { work: () => Promise<T> }): Promise<T>; remainingMs(): number };
type FrameClip = { clip?: { x: number; y: number; width: number; height: number } };

/** A page that hung the renderer can also hang its context's close: drop the whole browser (never a pool its host shares). */
function dropBrowserAfterTimeout({ browser, error, owned }: { browser: RenderBrowserPool; error: unknown; owned: boolean }, _optional = {}): void {
  if (!owned || !(error instanceof PageCaptureError) || error.kind !== "timeout") return;
  void browser.close().catch((closeError: unknown) => console.error("[screenshot] Could not close the timed-out browser", describeErrorForLog({ err: closeError })));
}

/** How far one capture got, shared by the render and the outer race so a timeout can say what ran out. */
interface CaptureProgress { loaded: boolean }

/** The capture's timeout. Before the page loaded it is the work deadline that ran out (a render that never committed
 *  navigation fails there); once loaded, or when the hard stop of the whole capture fires, it is the total. */
function timeoutError(
  { plan, progress, hardStop = false }: { plan: CaptureBudget; progress: CaptureProgress; hardStop?: boolean },
  _optional = {},
): PageCaptureError {
  const limitMs = progress.loaded || hardStop ? plan.totalMs : plan.softDeadlineMs;
  return new PageCaptureError({ kind: "timeout", message: `exceeded ${limitMs}ms`, limitMs, loaded: progress.loaded });
}

/** What the request asks for, in the units `captureBudget` reads. A selector wait adds nothing: it ends when the element shows. */
function budgetRequestOf({ request }: { request: PageCaptureRequest }, _optional = {}): Parameters<typeof captureBudget>[0] {
  return { settleMs: request.settleMs, fullPage: request.fullPage, ...(typeof request.waitFor === "number" ? { waitForSeconds: request.waitFor } : {}) };
}

/**
 * The work `renderPage` hands over once the page has loaded: scroll (full page), measure, shoot, read the title.
 * `session.phaseTimedOut` is set when ordinary work hit its deadline on a page that had already loaded: that page
 * is shot as it is, inside what is left of the total. The scroll is ordinary work too, so it gets the same treatment.
 * @complexity O(1) beyond the page work.
 */
async function consumeCapture(
  { session: { page, response, finalUrl, budget, phaseTimedOut }, request, router, plan, clock }: { session: RenderSession; request: PageCaptureRequest; router: { report(): { blocked: number } }; plan: CaptureBudget; clock: CaptureClock },
  _optional = {},
): Promise<PageCapture> {
  const { viewport } = request;
  const scrollCutShort = request.fullPage && await scrollWithinWorkTime({ page, budget, cap: request.maxPageHeightPx, plan, clock });
  const pageHeight = request.fullPage ? await measuredHeight({ page, budget, fallback: viewport.height }) : viewport.height;
  const { capturedHeight, clip } = frameGeometry({ request, pageHeight });
  if (!page.screenshot) throw new Error("Browser cannot take screenshots");
  // NEEDS-JINI: `RenderPage.screenshot` narrows `animations` to "disabled"; the object is
  // Playwright's Page, whose documented option also takes "allow" (the fallback below).
  const { png, note } = await shootFrame({ page: page as unknown as FrameShooter, budget, fullPage: request.fullPage, clip, plan, settleCutShort: phaseTimedOut !== undefined || scrollCutShort });
  const title = (await budget.run({ work: () => page.title() })).slice(0, 300);
  return { png, finalUrl, status: response?.status() ?? null, title, pageHeight, capturedHeight, blockedRequests: router.report().blocked, ...(note ? { note } : {}) };
}

/** What a capture keeps of the page: the height (a full page is capped) and, for a full page, the clip that spans it. */
function frameGeometry(
  { request, pageHeight }: { request: PageCaptureRequest; pageHeight: number },
  _optional = {},
): { capturedHeight: number; clip: FrameClip } {
  if (!request.fullPage) return { capturedHeight: Math.min(pageHeight, request.viewport.height), clip: {} };
  const capturedHeight = Math.min(pageHeight, request.maxPageHeightPx);
  return { capturedHeight, clip: { clip: { x: 0, y: 0, width: request.viewport.width, height: capturedHeight } } };
}

/** The document's full height in CSS px, or `fallback` when the page reports none; within the page budget. */
async function measuredHeight(
  { page, budget, fallback }: { page: Pick<RenderSession["page"], "evaluate">; budget: ScreenshotBudget; fallback: number },
  _optional = {},
): Promise<number> {
  const raw = await budget.run({ work: () => page.evaluate("Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)") });
  return clampHeight({ raw, fallback });
}

/**
 * Scrolls a full page, but only until the work deadline (the total minus the reserve): a page that is still
 * scrolling by then is shot as it is, like one still settling, instead of failing with nothing.
 * The scroll that lost the race is abandoned; the race already handled its late rejection (the budget's own timeout).
 * @returns true when the work deadline cut the scroll short.
 * @throws PageWorkTimeout when the total budget ends first; a scroll script that fails on its own is best-effort.
 * @complexity O(1) beyond the page work.
 */
async function scrollWithinWorkTime(
  { page, budget, cap, plan, clock }: { page: Pick<RenderSession["page"], "evaluate">; budget: ScreenshotBudget; cap: number; plan: CaptureBudget; clock: CaptureClock },
  _optional = {},
): Promise<boolean> {
  const workLeftMs = budget.remainingMs() - plan.reserveMs;
  if (workLeftMs <= 0) return true;
  let timer: unknown;
  const cutShort = new Promise<true>(resolve => { timer = clock.setTimeout(() => resolve(true), workLeftMs); });
  const scrolled = budget.run({ work: () => page.evaluate(scrollThroughExpression({ cap })) })
    .then(() => false, (error: unknown) => { if (error instanceof PageWorkTimeout) throw error; return false; });
  try {
    return await Promise.race([scrolled, cutShort]);
  } finally {
    clock.clearTimeout(timer);
  }
}

/**
 * A stable frame first (`animations: "disabled"` waits for finite animations to end); if Playwright's
 * own timeout fires on that, the page was still animating (WebGL heroes, endless transitions, e.g.
 * a provider dashboard), so the frame on screen is captured as it is, with a note, instead of failing the call.
 * Only Playwright's `TimeoutError` falls back: a closed page or a budget timeout still fails.
 * The stable attempt keeps the plan's reserve for that second shot, taken from what is left before the hard stop.
 * A page whose settling was already cut short (`settleCutShort`) has no time for a stable attempt: it goes straight to the current frame.
 * @complexity O(1) beyond the screenshots.
 */
async function shootFrame(
  { page, budget, fullPage, clip, plan, settleCutShort }: { page: FrameShooter; budget: ScreenshotBudget; fullPage: boolean; clip: FrameClip; plan: CaptureBudget; settleCutShort: boolean },
): Promise<{ png: Buffer; note?: string }> {
  if (settleCutShort) return { png: await currentFrame({ page, budget, fullPage, clip, plan }), note: `page loaded but did not settle within ${plan.softDeadlineMs / 1000} s; captured the current frame (content may still be loading).` };
  // Playwright treats timeout 0 as "no timeout", so the stable attempt always gets at least 1 ms.
  const stableTimeout = Math.max(1, budget.remainingMs() - plan.reserveMs);
  try {
    return { png: await budget.run({ work: () => page.screenshot({ type: "png", fullPage, timeout: stableTimeout, animations: "disabled", ...clip }) }) };
  } catch (error) {
    if ((error as { name?: unknown }).name !== "TimeoutError") throw error;
  }
  return { png: await currentFrame({ page, budget, fullPage, clip, plan }), note: `page was still animating near the ${plan.totalMs / 1000} s deadline; captured the current frame (it may show a mid-animation state).` };
}

/** The frame on screen right now, within what is left of the total; Playwright's own timeout there is the capture's timeout. */
function currentFrame(
  { page, budget, fullPage, clip, plan }: { page: FrameShooter; budget: ScreenshotBudget; fullPage: boolean; clip: FrameClip; plan: CaptureBudget },
): Promise<Buffer> {
  return budget.run({ work: () => page.screenshot({ type: "png", fullPage, timeout: Math.max(1, budget.remainingMs()), animations: "allow", ...clip }) })
    .catch((error: unknown) => { throw (error as { name?: unknown }).name === "TimeoutError" ? new PageWorkTimeout({ timeoutMs: plan.totalMs }) : error; });
}

/** Chromium's `net::ERR_*` code only — never a raw message that could echo an internal address. */
function navigationErrorCode({ error }: { error: unknown }, _optional = {}): string {
  if (error instanceof Error && error.message === "too many redirects") return error.message;
  const code = /net::(ERR_[A-Z_]+)/.exec(error instanceof Error ? error.message : "")?.[1];
  return code ?? "navigation failed";
}

function createCaptureShooter({ browser, httpClient, ownSiteFetch, routerOptions, clock }: { browser: RenderBrowserPool; httpClient: HttpClientPort; ownSiteFetch: OwnSiteFetch; routerOptions: RequestRouterOptions; clock: CaptureClock }) {
  return async function shoot({ request, plan, progress }: { request: PageCaptureRequest; plan: CaptureBudget; progress: CaptureProgress }, signal: AbortSignal): Promise<PageCapture> {
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
        consume: session => { progress.loaded = true; return consumeCapture({ session, request, router, plan, clock }); },
      }, { originPolicy: "public", router, signal, timeoutMs: plan.totalMs, softDeadlineMs: plan.softDeadlineMs, onSoftDeadline: "consume-current", clock,
        waitFor: request.waitFor ?? request.settleMs / 1000,
        dismissCookieBanners: request.dismissCookieBanners === true, loadWaitMs: 5_000,
      });
    } catch (error) {
      if (error instanceof PageWorkTimeout) throw timeoutError({ plan, progress });
      if (router.report().navigationRefused) throw new PageCaptureError({ kind: "refused", message: "refused by the egress guard" });
      throw new PageCaptureError({ kind: "failed", message: navigationErrorCode({ error }) });
    } finally { lease.release(); }
  };
}
