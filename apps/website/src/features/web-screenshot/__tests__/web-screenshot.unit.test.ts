import { SharpImageTransformer } from "@jini-ai/cms/media/node";
import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";
import { ToolInputError } from "@jini-ai/core";

import { createScreenshotTileEncoder } from "../screenshot-image.js";
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

const encodeScreenshotTiles = createScreenshotTileEncoder({ imageCodec: new SharpImageTransformer() });

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

test("the tile encoder defaults to quality 70 when options are omitted", async () => {
  const png = await solidPng(32, 20);
  const tiles = await encodeScreenshotTiles({ png, maxWidth: 32, tileHeight: 20 });
  assert.deepEqual(tiles.map(({ top, width, height }) => ({ top, width, height })), [{ top: 0, width: 32, height: 20 }]);
  assert.deepEqual(tiles[0]!.bytes, await sharp(png).jpeg({ quality: 70 }).toBuffer());
});

test("the tile encoder defaults to quality 70 when options contain no quality", async () => {
  const png = await solidPng(32, 20);
  const tiles = await encodeScreenshotTiles({ png, maxWidth: 32, tileHeight: 20 }, {});
  assert.equal(tiles.length, 1);
  assert.deepEqual(tiles[0]!.bytes, await sharp(png).jpeg({ quality: 70 }).toBuffer());
});

test("the tile encoder honours an explicit quality, which changes the JPEG bytes", async () => {
  const png = await solidPng(32, 20);
  const tiles = await encodeScreenshotTiles({ png, maxWidth: 32, tileHeight: 20 }, { quality: 20 });
  assert.equal(tiles.length, 1);
  assert.deepEqual(tiles[0]!.bytes, await sharp(png).jpeg({ quality: 20 }).toBuffer());
  assert.notDeepEqual(tiles[0]!.bytes, await sharp(png).jpeg({ quality: 70 }).toBuffer());
});

type Envelope = { content: Array<{ type: string; text?: string; mimeType?: string; data?: string }> };
const factsOf = (result: Envelope) => JSON.parse(result.content[0]!.text!) as Record<string, unknown>;
const imagesOf = (result: Envelope) => result.content.slice(1);

test("input: exactly one of url/sitePath, a known viewport, a bounded integer waitMs, a boolean fullPage", () => {
  assert.deepEqual(readWebScreenshotInput({ url: "https://example.com/about#team" }), { target: { kind: "url", url: "https://example.com/about" }, viewport: "desktop", fullPage: false, waitMs: 1200 });
  assert.deepEqual(readWebScreenshotInput({ sitePath: "/", viewport: "mobile", fullPage: true, waitMs: 0 }), { target: { kind: "site", path: "/" }, viewport: "mobile", fullPage: true, waitMs: 0 });
  const refusals: Array<[Record<string, unknown>, RegExp]> = [
    [{ url: 42 }, /absolute http\(s\) URL/],
    [{ url: "" }, /absolute http\(s\) URL/],
    [{ url: "https://:pw@a.example/" }, /embedded credentials/],
    [{ sitePath: 42 }, /root-relative path/],
    [{ sitePath: `/${"x".repeat(2048)}` }, /root-relative path/],
    [{ sitePath: "/about\u0000" }, /root-relative path/],
    [{ url: "https://a.example", viewport: 42 }, /viewport must be/],
    [{ url: "https://a.example", waitMs: "1" }, /waitMs must be/],
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

test("queueing: four callers wait in FIFO order with only one capture at a time", async () => {
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
  const service = createWebScreenshotService({ ports: ports(capture, events) });
  const call = (n: number) => service.screenshot({ input: readWebScreenshotInput({ url: `https://example.com/${n}` }) });
  const calls = [call(1), call(2), call(3), call(4)];
  for (let index = 0; index < 4; index += 1) {
    while (releases.length === 0) await new Promise((resolve) => setImmediate(resolve));
    releases.shift()!();
  }
  await Promise.all(calls);
  assert.deepEqual(order, [1, 2, 3, 4].flatMap(n => [`start https://example.com/${n}`, `end https://example.com/${n}`]));
  assert.ok(events.every(event => event.outcome !== 'busy'));
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
  // MOVE: observe rejection before aborting and yielding, so node:test never sees an unhandled rejection.
  const secondRejected = assert.rejects(second, { name: "AbortError" });
  controller.abort();
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  release();
  await first;
  await secondRejected;
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


test("cookie dismissal is explicitly validated and forwarded to screenshot capture", async () => {
  assert.throws(() => readWebScreenshotInput({ url: "https://example.com/", dismissCookieBanners: "yes" }), /dismissCookieBanners must be a boolean/);
  const capture = fakeCapture(request => shotFor(request));
  const service = createWebScreenshotService({ ports: ports(capture) });
  for (const dismissCookieBanners of [undefined, false, true]) await service.screenshot({ input: readWebScreenshotInput({ url: "https://example.com/", ...(dismissCookieBanners === undefined ? {} : { dismissCookieBanners }) }) });
  assert.deepEqual(capture.requests.map(request => request.dismissCookieBanners), [undefined, false, true]);
});

test("forwards a live cancellation signal and preserves unexpected capture errors", async () => {
  const controller = new AbortController();
  const failure = new Error("capture adapter disconnected");
  const capture: PageCapturePort = {
    async capture(_request, optional) {
      assert.equal(optional?.signal, controller.signal);
      throw failure;
    },
    async close() {},
  };
  const service = createWebScreenshotService({ ports: { ...ports(capture), observe: undefined } });
  await assert.rejects(service.screenshot({ input: readWebScreenshotInput({ url: "https://example.com/" }) }, { signal: controller.signal }),
    error => error === failure);
});

test("a save failure without an error code retains the image and gives the generic write reason", async () => {
  const service = createWebScreenshotService({ ports: ports(fakeCapture(request => shotFor(request))) });
  const result = await service.screenshot({ input: readWebScreenshotInput({ url: "https://example.com/" }),
    saveCaptureFiles: async () => { throw new Error("disk offline"); } });
  assert.equal(imagesOf(result).length, 1);
  assert.deepEqual(factsOf(result).savedFiles, []);
  assert.equal(factsOf(result).saveError, "the capture could not be saved to disk (write failed); the images above are still valid.");
});

test("an encoder returning no tiles produces empty dimensions and no image blocks", async () => {
  const capture = fakeCapture(request => shotFor(request));
  const service = createWebScreenshotService({ ports: { ...ports(capture), encodeTiles: async () => [] } });
  const result = await service.screenshot({ input: readWebScreenshotInput({ url: "https://example.com/", fullPage: true }) });
  const facts = factsOf(result);
  assert.deepEqual([facts.width, facts.height, facts.images, facts.truncated], [0, 0, [], false]);
  assert.deepEqual(imagesOf(result), []);
});

test("own-site final locations outside its origin or without URL syntax are retained verbatim", async () => {
  for (const finalUrl of ["https://other.example/redirected?ok=1", "not an absolute URL"]) {
    let closed = 0;
    const capture = fakeCapture(request => shotFor(request, { finalUrl }));
    const service = createWebScreenshotService({ ports: { ...ports(capture), observe: undefined } });
    const result = await service.screenshot({ input: readWebScreenshotInput({ sitePath: "/" }),
      openOwnSite: async () => ({ origin: "http://127.0.0.1:53142", close: async () => { closed++; } }) });
    assert.equal(factsOf(result).finalPath, finalUrl);
    assert.equal(closed, 1);
  }
});

test("a capture URL without any ASCII slug characters uses the page file-name fallback", () => {
  assert.deepEqual(captureRelativePaths({ capturedAtMs: Date.parse("2026-10-08T12:00:00.000Z"),
    input: readWebScreenshotInput({ url: "http://[::]/" }), count: 1 }), ["2026-10-08/120000-000-page-desktop.jpg"]);
});

test("the service refuses an off-origin site path even when a caller bypasses input parsing", async () => {
  const capture = fakeCapture(request => shotFor(request));
  const service = createWebScreenshotService({ ports: ports(capture) });
  await assert.rejects(service.screenshot({
    input: { target: { kind: "site", path: "//other.example/private" }, viewport: "desktop", fullPage: false, waitMs: 0 },
    openOwnSite: async () => ({ origin: "http://127.0.0.1:53142", close: async () => {} }),
  }), { message: "web_screenshot_page: sitePath must stay on this site." });
  assert.deepEqual(capture.requests, []);
});

test("an own-site queue wait expires after sixty seconds without starting a capture", async () => {
  let release!: () => void;
  let started!: () => void;
  const entered = new Promise<void>(resolve => { started = resolve; });
  let first = true;
  const capture = fakeCapture(async request => {
    if (first) {
      first = false;
      started();
      await new Promise<void>(resolve => { release = resolve; });
    }
    return shotFor(request);
  });
  const events: WebScreenshotEvent[] = [];
  const timeouts: Array<() => void> = [];
  let cancelled = 0;
  const service = createWebScreenshotService({ ports: { ...ports(capture, events), scheduleQueueTimeout: ({ delayMs, onTimeout }) => {
    assert.equal(delayMs, 60_000);
    timeouts.push(onTimeout);
    return () => { cancelled++; };
  } } });
  const call = { input: readWebScreenshotInput({ sitePath: "/" }),
    openOwnSite: async () => ({ origin: "http://127.0.0.1:53142", close: async () => {} }) };
  const pending = service.screenshot(call);
  await entered;
  try {
    const expired = assert.rejects(service.screenshot(call), /waited 60000 ms.*queue.*retry/i);
    timeouts.at(-1)!();
    await expired;
    assert.deepEqual(events, [{ target: "site", origin: "own-site", viewport: "desktop", outcome: "busy", durationMs: 0 }]);
    assert.equal(capture.requests.length, 1);
  } finally {
    release();
    await pending;
  }
  await service.screenshot({ ...call, openOwnSite: async () => ({ origin: 'http://127.0.0.1:53142', close: async () => {} }) });
  assert.equal(capture.requests.length, 2, 'expired waiter must never capture later');
  assert.equal(cancelled, 3, 'every queue timer must be cleared');
});

test('input option validation preserves precedence, integer bounds and explicit false', () => {
  const invalid: Array<[Record<string, unknown>, string]> = [
    [{}, "pass exactly one of 'url'"],
    [{ url: '/bad', viewport: null, fullPage: null, waitMs: null }, 'viewport must be'],
    [{ url: '/bad', fullPage: null, waitMs: null }, 'fullPage must be'],
    [{ url: '/bad', waitMs: null, dismissCookieBanners: null }, 'waitMs must be'],
    [{ url: '/bad', dismissCookieBanners: null }, 'dismissCookieBanners must be'],
    ...[NaN, Infinity, -Infinity, -1, 5001, 0.5, '0'].map(waitMs => [{ sitePath: '/', waitMs }, 'waitMs must be'] as [Record<string, unknown>, string]),
  ];
  for (const [input, message] of invalid) {
    assert.throws(() => readWebScreenshotInput(input), (error: unknown) => error instanceof ToolInputError && error.message.includes(message));
  }
  for (const waitMs of [0, 5000]) {
    assert.deepEqual(readWebScreenshotInput({ sitePath: '/', waitMs, dismissCookieBanners: false }), {
      target: { kind: 'site', path: '/' }, viewport: 'desktop', fullPage: false, waitMs, dismissCookieBanners: false,
    });
  }
});

test('result assembly reports capture before encoding and closes the own-site server after encoder failure', async () => {
  const order: string[] = [];
  const failure = new Error('encode failed');
  const capture = fakeCapture(request => shotFor(request));
  const service = createWebScreenshotService({ ports: {
    ...ports(capture), observe: () => { order.push('captured'); },
    encodeTiles: async () => { order.push('encode'); throw failure; },
  } });
  await assert.rejects(service.screenshot({ input: readWebScreenshotInput({ sitePath: '/' }),
    openOwnSite: async () => ({ origin: 'http://127.0.0.1:53142', close: async () => { order.push('close'); } }),
    saveCaptureFiles: async () => { order.push('save'); return []; },
  }), error => error === failure);
  assert.deepEqual(order, ['captured', 'encode', 'close']);
});

test('off-origin site-path refusal leaks the opened server (reported, not fixed)', async () => {
  let closed = 0;
  const capture = fakeCapture(request => shotFor(request));
  const service = createWebScreenshotService({ ports: ports(capture) });
  await assert.rejects(service.screenshot({
    input: { target: { kind: 'site', path: '//other.example/private' }, viewport: 'desktop', fullPage: false, waitMs: 0 },
    openOwnSite: async () => ({ origin: 'http://127.0.0.1:53142', close: async () => { closed++; } }),
  }), { message: 'web_screenshot_page: sitePath must stay on this site.' });
  assert.equal(closed, 0);
  assert.deepEqual(capture.requests, []);
});

test("a capture that came back with a note (e.g. a still-animating page) passes the note to the caller", async () => {
  const note = "page was still animating near the 20 s deadline; captured the current frame";
  const capture = fakeCapture((request) => shotFor(request, { note }));
  const result = await createWebScreenshotService({ ports: ports(capture) }).screenshot({ input: readWebScreenshotInput({ url: "https://resend.com/" }) });
  assert.equal(factsOf(result).note, note);
  assert.equal(result.content.filter((block) => block.type === "image").length, 1);
});
