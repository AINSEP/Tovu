import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";
import { ToolInputError } from "@jini-ai/core";

import { encodeScreenshotTiles } from "../screenshot-image.js";
import {
  captureRelativePaths,
  createWebScreenshotService,
  MAX_FULL_PAGE_HEIGHT_PX,
  PageCaptureError,
  readWebScreenshotInput,
  UNTRUSTED_NOTICE,
  type PageCapture,
  type PageCapturePort,
  type PageCaptureRequest,
  type WebScreenshotEvent,
  type WebScreenshotPorts,
} from "../web-screenshot.js";

/**
 * @file `web_screenshot_page`'s domain: input rules, viewport presets, size caps (tiles), the
 * one-at-a-time queue, failure messages and the own-site mode. The capture port is a fake; the tile
 * encoder is the REAL sharp-backed one, and its output is decoded again to check sizes.
 */

async function solidPng(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 20, g: 120, b: 220 } } }).png().toBuffer();
}

function fakeCapture(make: (request: PageCaptureRequest) => Promise<PageCapture>): PageCapturePort & { requests: PageCaptureRequest[] } {
  const requests: PageCaptureRequest[] = [];
  return { requests, capture: async (request) => { requests.push(request); return make(request); }, close: async () => {} };
}

async function shotFor(request: PageCaptureRequest, overrides: Partial<PageCapture> = {}): Promise<PageCapture> {
  const scale = request.viewport.deviceScaleFactor;
  const height = request.fullPage ? Math.min(3000, request.maxPageHeightPx) : request.viewport.height;
  return {
    png: await solidPng(request.viewport.width * scale, height * scale),
    finalUrl: request.url, status: 200, title: "Example", pageHeight: request.fullPage ? 3000 : request.viewport.height, capturedHeight: height, blockedRequests: 0,
    ...overrides,
  };
}

function ports(capture: PageCapturePort, events: WebScreenshotEvent[] = []): WebScreenshotPorts {
  return { capture, encodeTiles: encodeScreenshotTiles, nowMs: () => Date.parse("2026-10-08T12:00:00.000Z"), observe: (event) => events.push(event) };
}

type Envelope = { content: Array<{ type: string; text?: string; mimeType?: string; data?: string }> };
const factsOf = (result: Envelope) => JSON.parse(result.content[0]!.text!) as Record<string, unknown>;
const imagesOf = (result: Envelope) => result.content.slice(1);

test("input: exactly one of url/sitePath, a known viewport, a bounded integer waitMs, a boolean fullPage", () => {
  assert.deepEqual(readWebScreenshotInput({ url: "https://example.com/about#team" }), { target: { kind: "url", url: "https://example.com/about" }, viewport: "desktop", fullPage: false, waitMs: 1200 });
  assert.deepEqual(readWebScreenshotInput({ sitePath: "/", viewport: "mobile", fullPage: true, waitMs: 0 }), { target: { kind: "site", path: "/" }, viewport: "mobile", fullPage: true, waitMs: 0 });
  const refusals: Array<[Record<string, unknown>, RegExp]> = [
    [{}, /exactly one of 'url'/],
    [{ url: "https://a.example", sitePath: "/" }, /exactly one of 'url'/],
    [{ url: "ftp://a.example/" }, /only http and https/],
    [{ url: "javascript:alert(1)" }, /only http and https/],
    [{ url: "https://user:pw@a.example/" }, /embedded credentials/],
    [{ url: "/relative" }, /absolute http\(s\) URL/],
    [{ url: `https://a.example/${"x".repeat(2050)}` }, /at most 2048/],
    [{ sitePath: "about" }, /root-relative path/],
    [{ sitePath: "//evil.example/" }, /root-relative path/],
    [{ sitePath: "/\\evil" }, /root-relative path/],
    [{ url: "https://a.example", viewport: "watch" }, /viewport must be one of desktop, tablet, mobile/],
    [{ url: "https://a.example", waitMs: 5001 }, /waitMs must be an integer from 0 to 5000/],
    [{ url: "https://a.example", waitMs: -1 }, /waitMs/],
    [{ url: "https://a.example", waitMs: 1.5 }, /waitMs/],
    [{ url: "https://a.example", fullPage: "yes" }, /fullPage must be a boolean/],
  ];
  for (const [input, message] of refusals) {
    assert.throws(() => readWebScreenshotInput(input), (error: unknown) => error instanceof ToolInputError && message.test(error.message) && error.message.startsWith("web_screenshot_page: "), JSON.stringify(input).slice(0, 80));
  }
});

test("viewport presets reach the capture port with their exact sizes, and each comes back as one legible JPEG", async () => {
  const capture = fakeCapture((request) => shotFor(request));
  const service = createWebScreenshotService({ ports: ports(capture) });
  const sizes: Record<string, [number, number]> = {};
  for (const viewport of ["desktop", "tablet", "mobile"] as const) {
    const result = await service.screenshot({ input: readWebScreenshotInput({ url: "https://example.com/", viewport }) });
    const images = imagesOf(result);
    assert.equal(images.length, 1);
    assert.equal(images[0]!.mimeType, "image/jpeg");
    const meta = await sharp(Buffer.from(images[0]!.data!, "base64")).metadata();
    assert.equal(meta.format, "jpeg");
    sizes[viewport] = [meta.width!, meta.height!];
  }
  assert.deepEqual(capture.requests.map((request) => [request.viewport.width, request.viewport.height, request.viewport.deviceScaleFactor, request.viewport.isMobile]), [
    [1280, 800, 1, false], [768, 1024, 1, true], [375, 812, 2, true],
  ]);
  // Mobile renders at 2x (750px) and is stored at 600px wide.
  assert.deepEqual(sizes, { desktop: [1280, 800], tablet: [768, 1024], mobile: [600, 1299] });
  assert.deepEqual(capture.requests.map((request) => request.allowedOrigins), [[], [], []], "a public url gets no allowlisted origin");
});

test("result shape: one JSON text block of facts, then the image blocks; public pages are flagged untrusted", async () => {
  const events: WebScreenshotEvent[] = [];
  const capture = fakeCapture((request) => shotFor(request, { finalUrl: "https://www.example.com/", status: 200, title: "Example Domain", blockedRequests: 3 }));
  const result = await createWebScreenshotService({ ports: ports(capture, events) }).screenshot({ input: readWebScreenshotInput({ url: "https://example.com/" }) });
  assert.deepEqual(result.content.map((block) => block.type), ["text", "image"]);
  assert.deepEqual(factsOf(result), {
    requestedUrl: "https://example.com/", finalUrl: "https://www.example.com/", status: 200, title: "Example Domain",
    viewport: "desktop", viewportSize: { width: 1280, height: 800 }, fullPage: false, pageHeight: 800, capturedHeight: 800, truncated: false,
    width: 1280, height: 800, images: [{ index: 0, top: 0, height: 800 }], blockedRequests: 3,
    capturedAt: "2026-10-08T12:00:00.000Z", untrusted: true, untrustedNotice: UNTRUSTED_NOTICE,
  });
  assert.deepEqual(events.map((event) => [event.outcome, event.origin, event.blockedRequests]), [["captured", "https://example.com", 3]]);
});

test("size caps: a full page is captured to at most 8000px and returned as <=1600px tiles, flagged truncated", async () => {
  const capture = fakeCapture(async (request) => ({ ...(await shotFor(request)), pageHeight: 12_000, capturedHeight: 4000, png: await solidPng(1280, 4000) }));
  const result = await createWebScreenshotService({ ports: ports(capture) }).screenshot({ input: readWebScreenshotInput({ url: "https://example.com/", fullPage: true }) });
  assert.equal(capture.requests[0]!.maxPageHeightPx, MAX_FULL_PAGE_HEIGHT_PX);
  assert.equal(capture.requests[0]!.fullPage, true);
  const facts = factsOf(result);
  assert.deepEqual(facts.images, [{ index: 0, top: 0, height: 1600 }, { index: 1, top: 1600, height: 1600 }, { index: 2, top: 3200, height: 800 }]);
  assert.equal(facts.truncated, true);
  assert.deepEqual([facts.width, facts.height], [1280, 4000]);
  const heights = await Promise.all(imagesOf(result).map(async (block) => (await sharp(Buffer.from(block.data!, "base64")).metadata()).height));
  assert.deepEqual(heights, [1600, 1600, 800]);
});

test("waitMs is passed through as the settle time", async () => {
  const capture = fakeCapture((request) => shotFor(request));
  await createWebScreenshotService({ ports: ports(capture) }).screenshot({ input: readWebScreenshotInput({ url: "https://example.com/", waitMs: 3000 }) });
  assert.equal(capture.requests[0]!.settleMs, 3000);
});

test("queueing: one capture at a time, in call order; callers beyond the waiting limit are refused as busy", async () => {
  const order: string[] = [];
  const releases: Array<() => void> = [];
  let running = 0;
  const capture = fakeCapture(async (request) => {
    running += 1;
    assert.equal(running, 1, "two captures must never overlap");
    order.push(`start ${request.url}`);
    await new Promise<void>((resolve) => releases.push(resolve));
    order.push(`end ${request.url}`);
    running -= 1;
    return shotFor(request);
  });
  const events: WebScreenshotEvent[] = [];
  const service = createWebScreenshotService({ ports: ports(capture, events) }, { maxWaiting: 2 });
  const call = (n: number) => service.screenshot({ input: readWebScreenshotInput({ url: `https://example.com/${n}` }) });
  const calls = [call(1), call(2), call(3)];
  await assert.rejects(call(4), /another screenshot is already being taken/);
  assert.equal(events.at(-1)?.outcome, "busy");
  for (let index = 0; index < 3; index += 1) {
    while (releases.length === 0) await new Promise((resolve) => setImmediate(resolve));
    releases.shift()!();
  }
  await Promise.all(calls);
  assert.deepEqual(order, ["start https://example.com/1", "end https://example.com/1", "start https://example.com/2", "end https://example.com/2", "start https://example.com/3", "end https://example.com/3"]);
});

test("a failed capture does not block the queue for the next caller", async () => {
  let first = true;
  const capture = fakeCapture(async (request) => {
    if (first) { first = false; throw new PageCaptureError({ kind: "failed", message: "ERR_NAME_NOT_RESOLVED" }); }
    return shotFor(request);
  });
  const service = createWebScreenshotService({ ports: ports(capture) });
  await assert.rejects(service.screenshot({ input: readWebScreenshotInput({ url: "https://nope.example/" }) }), /could not load https:\/\/nope\.example \(ERR_NAME_NOT_RESOLVED\)/);
  assert.equal(imagesOf(await service.screenshot({ input: readWebScreenshotInput({ url: "https://example.com/" }) })).length, 1);
});

test("capture failures become caller-safe ToolInputErrors that name the origin, never an address", async () => {
  const cases: Array<[PageCaptureError, RegExp]> = [
    [new PageCaptureError({ kind: "refused", message: "x" }), /^web_screenshot_page: https:\/\/intranet\.example is not a public internet address .*Use sitePath/],
    [new PageCaptureError({ kind: "unavailable", message: "Executable doesn't exist at /opt/x" }), /^web_screenshot_page: this server cannot take screenshots/],
    [new PageCaptureError({ kind: "timeout", message: "x" }), /did not finish rendering within 20 seconds/],
  ];
  for (const [error, message] of cases) {
    const events: WebScreenshotEvent[] = [];
    const service = createWebScreenshotService({ ports: ports(fakeCapture(async () => { throw error; }), events) });
    await assert.rejects(service.screenshot({ input: readWebScreenshotInput({ url: "https://intranet.example/admin" }) }), (thrown: unknown) => thrown instanceof ToolInputError && message.test(thrown.message) && !thrown.message.includes("/opt/x"));
    assert.equal(events[0]!.outcome, error.kind);
  }
});

test("own site: the injected loopback origin is the ONLY allowlisted origin, the path is joined onto it, and the server is always closed", async () => {
  const opened: string[] = [];
  const openOwnSite = async () => { opened.push("open"); return { origin: "http://127.0.0.1:53142", close: async () => { opened.push("close"); } } };
  const capture = fakeCapture((request) => shotFor(request, { finalUrl: "http://127.0.0.1:53142/about/?x=1" }));
  const service = createWebScreenshotService({ ports: ports(capture) });
  const result = await service.screenshot({ input: readWebScreenshotInput({ sitePath: "/about/?x=1", viewport: "mobile" }), openOwnSite });
  assert.equal(capture.requests[0]!.url, "http://127.0.0.1:53142/about/?x=1");
  assert.deepEqual(capture.requests[0]!.allowedOrigins, ["http://127.0.0.1:53142"]);
  const facts = factsOf(result);
  assert.equal(facts.sitePath, "/about/?x=1");
  assert.equal(facts.finalPath, "/about/?x=1", "the model sees a site path, not the throwaway loopback address");
  assert.equal(facts.requestedUrl, undefined);
  assert.equal(facts.untrusted, undefined, "this site's own render is not third-party content");
  assert.deepEqual(opened, ["open", "close"]);

  const failing = createWebScreenshotService({ ports: ports(fakeCapture(async () => { throw new PageCaptureError({ kind: "failed", message: "ERR_CONNECTION_RESET" }); })) });
  await assert.rejects(failing.screenshot({ input: readWebScreenshotInput({ sitePath: "/" }), openOwnSite }), /could not load this site/);
  assert.deepEqual(opened, ["open", "close", "open", "close"], "the loopback server must be closed on failure too");
});

test("own site without a host opener is refused with a pointer to url", async () => {
  const service = createWebScreenshotService({ ports: ports(fakeCapture((request) => shotFor(request))) });
  await assert.rejects(service.screenshot({ input: readWebScreenshotInput({ sitePath: "/" }) }), /cannot render this site's own pages here/);
});

test("an aborted call that is still waiting in the queue never starts a capture", async () => {
  let release!: () => void;
  const capture = fakeCapture(async (request) => { await new Promise<void>((resolve) => { release = resolve; }); return shotFor(request); });
  const service = createWebScreenshotService({ ports: ports(capture) });
  const first = service.screenshot({ input: readWebScreenshotInput({ url: "https://example.com/1" }) });
  const controller = new AbortController();
  const second = service.screenshot({ input: readWebScreenshotInput({ url: "https://example.com/2" }) }, { signal: controller.signal });
  controller.abort();
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  release();
  await first;
  await assert.rejects(second, { name: "AbortError" });
  assert.equal(capture.requests.length, 1);
});

test("themeId: accepted with sitePath only, format-checked, and absent from the input when not passed", () => {
  assert.deepEqual(readWebScreenshotInput({ sitePath: "/about", themeId: "luvira-copy" }), { target: { kind: "site", path: "/about" }, viewport: "desktop", fullPage: false, waitMs: 1200, themeId: "luvira-copy" });
  assert.equal("themeId" in readWebScreenshotInput({ sitePath: "/" }), false);
  const refusals: Array<[Record<string, unknown>, RegExp]> = [
    [{ url: "https://a.example/", themeId: "luvira-copy" }, /themeId only applies to sitePath/],
    [{ sitePath: "/", themeId: "" }, /themeId must be an installed theme's id/],
    [{ sitePath: "/", themeId: "../etc" }, /themeId must be an installed theme's id/],
    [{ sitePath: "/", themeId: 42 }, /themeId must be an installed theme's id/],
  ];
  for (const [input, message] of refusals) {
    assert.throws(() => readWebScreenshotInput(input), (error: unknown) => error instanceof ToolInputError && message.test(error.message), JSON.stringify(input));
  }
});

test("own site with themeId: the opener is asked for that theme and the facts name it", async () => {
  const asked: Array<{ themeId?: string }> = [];
  const openOwnSite = async (_required: {} = {}, optional: { themeId?: string } = {}) => { asked.push(optional); return { origin: "http://127.0.0.1:53142", close: async () => {} }; };
  const service = createWebScreenshotService({ ports: ports(fakeCapture((request) => shotFor(request))) });
  const themed = factsOf(await service.screenshot({ input: readWebScreenshotInput({ sitePath: "/", themeId: "luvira-copy" }), openOwnSite }));
  const active = factsOf(await service.screenshot({ input: readWebScreenshotInput({ sitePath: "/" }), openOwnSite }));
  assert.deepEqual(asked, [{ themeId: "luvira-copy" }, {}]);
  assert.equal(themed.themeId, "luvira-copy");
  assert.equal("themeId" in active, false, "no themeId fact when the active theme rendered");
});

test("capture file names: UTC date folder, time, a slug of the page, the viewport, the theme, and a tile number only when tiled", () => {
  const at = Date.parse("2026-10-08T09:05:07.042Z");
  assert.deepEqual(captureRelativePaths({ capturedAtMs: at, input: readWebScreenshotInput({ url: "https://www.Example.com/About/Team?x=1" }), count: 1 }), ["2026-10-08/090507-042-www-example-com-about-team-desktop.jpg"]);
  assert.deepEqual(captureRelativePaths({ capturedAtMs: at, input: readWebScreenshotInput({ sitePath: "/", viewport: "mobile", themeId: "luvira-copy" }), count: 2 }), [
    "2026-10-08/090507-042-site-mobile-theme-luvira-copy-1.jpg",
    "2026-10-08/090507-042-site-mobile-theme-luvira-copy-2.jpg",
  ]);
  const [long] = captureRelativePaths({ capturedAtMs: at, input: readWebScreenshotInput({ sitePath: `/${"a".repeat(300)}` }), count: 1 });
  assert.ok(long!.length < 120, long);
});

test("captures are saved: each returned JPEG is written once and the facts list the saved paths", async () => {
  const written: Array<{ relPath: string; bytes: Buffer }> = [];
  const saveCaptureFiles = async ({ files }: { files: ReadonlyArray<{ relPath: string; bytes: Buffer }> }) => { written.push(...files); return files.map((file) => `/sites/demo/.captures/${file.relPath}`); };
  const capture = fakeCapture(async (request) => ({ ...(await shotFor(request)), pageHeight: 3000, capturedHeight: 3000, png: await solidPng(1280, 3000) }));
  const result = await createWebScreenshotService({ ports: ports(capture) }).screenshot({ input: readWebScreenshotInput({ url: "https://example.com/", fullPage: true }), saveCaptureFiles });
  const images = imagesOf(result);
  assert.equal(images.length, 2);
  assert.deepEqual(written.map((file) => file.relPath), ["2026-10-08/120000-000-example-com-desktop-1.jpg", "2026-10-08/120000-000-example-com-desktop-2.jpg"]);
  assert.deepEqual(written.map((file) => file.bytes.toString("base64")), images.map((image) => image.data), "the saved file is exactly the image the model saw");
  assert.deepEqual(factsOf(result).savedFiles, ["/sites/demo/.captures/2026-10-08/120000-000-example-com-desktop-1.jpg", "/sites/demo/.captures/2026-10-08/120000-000-example-com-desktop-2.jpg"]);
});

test("a failed save never fails the screenshot: the images still come back with an empty savedFiles and the reason", async () => {
  const saveCaptureFiles = async () => { throw Object.assign(new Error("EACCES: permission denied, open '/x'"), { code: "EACCES" }); };
  const result = await createWebScreenshotService({ ports: ports(fakeCapture((request) => shotFor(request))) }).screenshot({ input: readWebScreenshotInput({ url: "https://example.com/" }), saveCaptureFiles });
  assert.equal(imagesOf(result).length, 1);
  const facts = factsOf(result);
  assert.deepEqual(facts.savedFiles, []);
  assert.equal(facts.saveError, "the capture could not be saved to disk (EACCES); the images above are still valid.");
});
