import assert from "node:assert/strict";
import test from "node:test";

import { EgressRefusedError, type HttpClientPort, type HttpResponse } from "#src/platform/http/index";
import { createPlaywrightPageCapture, type CaptureBrowser, type CaptureBrowserLauncher, type CaptureContextOptions, type CaptureLaunchOptions, type CapturePage } from "../playwright-page-capture.js";
import { MAX_REDIRECT_HOPS, type RouteLike } from "../request-guard.js";
import { PageCaptureError, VIEWPORT_PRESETS, type PageCaptureRequest } from "../web-screenshot.js";

/**
 * @file The Playwright adapter against a structural fake browser (no Chromium, no module mocks).
 * The fake page's `goto` drives the registered route handler with a main-frame navigation request,
 * the way Chromium would, so refusal detection is exercised through the real router.
 */

interface FakeOptions {
  failLaunch?: boolean;
  /** Status the fake "network" (the fulfilled route) answers the navigation with. */
  hangGoto?: boolean;
  pageHeight?: number;
}

function fakeBrowser({ failLaunch = false, hangGoto = false, pageHeight = 2400 }: FakeOptions = {}) {
  const events: string[] = [];
  const launches: CaptureLaunchOptions[] = [];
  const contexts: CaptureContextOptions[] = [];
  const screenshots: Array<Parameters<CapturePage["screenshot"]>[0]> = [];
  const browser: CaptureBrowser = {
    async newContext(options) {
      contexts.push(options);
      let handler: ((route: RouteLike) => Promise<void>) | undefined;
      return {
        async route(pattern, routeHandler) { events.push(`route:${pattern}`); handler = routeHandler; },
        async routeWebSocket(pattern) { events.push(`ws:${pattern}`); },
        async newPage() {
          let current = "about:blank";
          const page: CapturePage = {
            async goto(url) {
              if (hangGoto) await new Promise(() => {});
              let fulfilled: number | undefined;
              let aborted: string | undefined;
              await handler!({
                request: () => ({ url: () => url, method: () => "GET", headers: () => ({}), resourceType: () => "document", isNavigationRequest: () => true, frame: () => ({ parentFrame: () => null }) }),
                fulfill: async ({ status }) => { fulfilled = status; },
                abort: async (code) => { aborted = code; },
              });
              if (aborted) throw new Error(`page.goto: net::ERR_BLOCKED_BY_CLIENT at ${url}`);
              current = url;
              return { status: () => fulfilled! };
            },
            async waitForLoadState() {},
            async waitForTimeout(ms) { events.push(`settle:${ms}`); },
            async evaluate(expression) { events.push(expression.includes("scrollTo") ? "scroll-through" : "measure"); return pageHeight; },
            async title() { return "T".repeat(400); },
            url: () => current,
            async screenshot(options) { screenshots.push(options); return Buffer.from("png"); },
          };
          return page;
        },
        async close() { events.push("context-close"); },
      };
    },
    async close() { events.push("browser-close"); },
  };
  const launcher: CaptureBrowserLauncher = {
    async launch(options) {
      launches.push(options);
      events.push("launch");
      if (failLaunch) throw new Error("Executable doesn't exist at /Users/x/ms-playwright/chromium");
      return browser;
    },
  };
  return { launcher, events, launches, contexts, screenshots };
}

function client(behavior: "ok" | "refuse"): HttpClientPort & { urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    async send(request) {
      urls.push(request.url);
      if (behavior === "refuse") throw new EgressRefusedError({ message: "private" }, { callerSafeMessage: "refused" });
      return { status: 200, headers: { "content-type": "text/html" }, bodyText: "<p>x</p>", bodyBytes: Buffer.from("<p>x</p>") };
    },
  };
}

function request(overrides: Partial<PageCaptureRequest> = {}): PageCaptureRequest {
  return { url: "https://example.com/", viewport: VIEWPORT_PRESETS.desktop, fullPage: false, maxPageHeightPx: 8000, settleMs: 1200, allowedOrigins: [], ...overrides };
}

test("launches sandboxed Chromium behind a dead proxy, in a fresh isolated context per capture, and reuses one browser", async () => {
  const fake = fakeBrowser();
  const capture = createPlaywrightPageCapture({ httpClient: client("ok") }, { loadLauncher: async () => fake.launcher });
  const first = await capture.capture(request());
  await capture.capture(request({ viewport: VIEWPORT_PRESETS.mobile }));
  await capture.close();

  assert.equal(fake.launches.length, 1);
  assert.equal(fake.launches[0]!.chromiumSandbox, true, "untrusted pages must render with the sandbox on");
  assert.ok(fake.launches[0]!.args.includes("--proxy-server=http://127.0.0.1:9"));
  assert.ok(fake.launches[0]!.args.includes("--proxy-bypass-list=<-loopback>"));
  assert.ok(!fake.launches[0]!.args.includes("--no-sandbox"));
  assert.deepEqual(fake.contexts.map((context) => [context.viewport.width, context.viewport.height, context.deviceScaleFactor, context.isMobile, context.hasTouch]), [[1280, 800, 1, false, false], [375, 812, 2, true, true]]);
  for (const context of fake.contexts) {
    assert.equal(context.serviceWorkers, "block");
    assert.equal(context.acceptDownloads, false);
    assert.equal(context.ignoreHTTPSErrors, false);
  }
  assert.deepEqual(fake.events, [
    "launch", "ws:/.*/", "route:**/*", "settle:1200", "context-close",
    "ws:/.*/", "route:**/*", "settle:1200", "context-close", "browser-close",
  ]);
  assert.equal(first.status, 200);
  assert.equal(first.finalUrl, "https://example.com/");
  assert.equal(first.title.length, 300, "titles are capped");
  assert.deepEqual([first.pageHeight, first.capturedHeight], [800, 800]);
});

test("allowUnsandboxed is the only way to turn the sandbox off", async () => {
  const fake = fakeBrowser();
  const capture = createPlaywrightPageCapture({ httpClient: client("ok") }, { loadLauncher: async () => fake.launcher, allowUnsandboxed: true });
  await capture.capture(request());
  await capture.close();
  assert.equal(fake.launches[0]!.chromiumSandbox, false);
});

test("full page: height is measured, capped at maxPageHeightPx, and captured as a clip of that size", async () => {
  const fake = fakeBrowser({ pageHeight: 20_000 });
  const capture = createPlaywrightPageCapture({ httpClient: client("ok") }, { loadLauncher: async () => fake.launcher });
  const shot = await capture.capture(request({ fullPage: true }));
  await capture.close();
  assert.deepEqual([shot.pageHeight, shot.capturedHeight], [20_000, 8000]);
  // Scroll-reveal sections and lazy images only render once scrolled into view, so the page is
  // scrolled through (bounded by the cap) BEFORE its height is measured and shot.
  assert.deepEqual(fake.events.filter((event) => event === "scroll-through" || event === "measure"), ["scroll-through", "measure"]);
  assert.deepEqual(fake.screenshots[0], { type: "png", fullPage: true, timeout: 20_000, animations: "disabled", clip: { x: 0, y: 0, width: 1280, height: 8000 } });
});

test("a top-level navigation the egress guard refuses is a 'refused' PageCaptureError, and the context is still closed", async () => {
  const fake = fakeBrowser();
  const httpClient = client("refuse");
  const capture = createPlaywrightPageCapture({ httpClient }, { loadLauncher: async () => fake.launcher });
  await assert.rejects(capture.capture(request({ url: "http://intranet.example/" })), (error: unknown) => error instanceof PageCaptureError && error.kind === "refused");
  await capture.close();
  assert.deepEqual(httpClient.urls, ["http://intranet.example/"]);
  assert.ok(fake.events.includes("context-close"));
});

test("a missing browser is 'unavailable', and the next capture tries to launch again", async () => {
  const fake = fakeBrowser({ failLaunch: true });
  const capture = createPlaywrightPageCapture({ httpClient: client("ok") }, { loadLauncher: async () => fake.launcher });
  await assert.rejects(capture.capture(request()), (error: unknown) => error instanceof PageCaptureError && error.kind === "unavailable");
  await assert.rejects(capture.capture(request()), (error: unknown) => error instanceof PageCaptureError && error.kind === "unavailable");
  assert.equal(fake.launches.length, 2);
});

test("a page that never finishes is a 'timeout', and the whole browser is closed so a hung renderer cannot linger", async () => {
  const fake = fakeBrowser({ hangGoto: true });
  const capture = createPlaywrightPageCapture({ httpClient: client("ok") }, { loadLauncher: async () => fake.launcher, deadlineMs: 30 });
  await assert.rejects(capture.capture(request()), (error: unknown) => error instanceof PageCaptureError && error.kind === "timeout");
  assert.ok(fake.events.includes("browser-close"));
});

test("the browser closes by itself after the idle period", async () => {
  const fake = fakeBrowser();
  const capture = createPlaywrightPageCapture({ httpClient: client("ok") }, { loadLauncher: async () => fake.launcher, idleCloseMs: 10 });
  await capture.capture(request());
  assert.ok(!fake.events.includes("browser-close"));
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(fake.events.at(-1), "browser-close");
});

// Playwright does not route the next hop of a fulfilled 3xx, so the page's redirects are followed
// by navigating again — every hop goes through the router (and the guard) like the first.
function redirectingClient(hops: Record<string, string>): HttpClientPort & { urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    async send(request): Promise<HttpResponse> {
      urls.push(request.url);
      const location = hops[request.url];
      if (location !== undefined) return { status: 301, headers: { location }, bodyText: "", bodyBytes: new Uint8Array() };
      return { status: 200, headers: { "content-type": "text/html" }, bodyText: "<p>x</p>", bodyBytes: Buffer.from("<p>x</p>") };
    },
  };
}

test("the page's own redirect is followed by navigating to its target, so the capture reports the real final URL", async () => {
  const fake = fakeBrowser();
  const httpClient = redirectingClient({ "https://example.com/": "https://www.example.com/" });
  const capture = createPlaywrightPageCapture({ httpClient }, { loadLauncher: async () => fake.launcher });
  const shot = await capture.capture(request());
  await capture.close();
  assert.deepEqual(httpClient.urls, ["https://example.com/", "https://www.example.com/"]);
  assert.equal(shot.finalUrl, "https://www.example.com/");
  assert.equal(shot.status, 200);
});

test("a redirect to a private address is 'refused' at that hop; endless redirects are 'failed' after MAX_REDIRECT_HOPS", async () => {
  const fake = fakeBrowser();
  const toPrivate: HttpClientPort & { urls: string[] } = {
    urls: [],
    async send(request) {
      this.urls.push(request.url);
      if (request.url.includes("intranet")) throw new EgressRefusedError({ message: "private" }, { callerSafeMessage: "refused" });
      return { status: 302, headers: { location: "http://intranet.example/secret" }, bodyText: "", bodyBytes: new Uint8Array() };
    },
  };
  const capture = createPlaywrightPageCapture({ httpClient: toPrivate }, { loadLauncher: async () => fake.launcher });
  await assert.rejects(capture.capture(request()), (error: unknown) => error instanceof PageCaptureError && error.kind === "refused");
  assert.deepEqual(toPrivate.urls, ["https://example.com/", "http://intranet.example/secret"]);

  await capture.close();

  const loop = redirectingClient({ "https://example.com/": "https://example.com/" });
  const looping = createPlaywrightPageCapture({ httpClient: loop }, { loadLauncher: async () => fakeBrowser().launcher });
  await assert.rejects(looping.capture(request()), (error: unknown) => error instanceof PageCaptureError && error.kind === "failed" && error.message === "too many redirects");
  await looping.close();
  assert.equal(loop.urls.length, MAX_REDIRECT_HOPS + 1);
});
