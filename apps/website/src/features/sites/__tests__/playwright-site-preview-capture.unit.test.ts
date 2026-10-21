import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { createPlaywrightSitePreviewCapture, createSitePreviewCaptureForHost, type PreviewBrowser, type PreviewBrowserLauncher } from "../site-preview/playwright-site-preview-capture.js";
import { importPlaywrightChromium } from "../../../platform/headless-browser/lazy-browser.js";
import { playwrightModuleLoader } from "../../../platform/headless-browser/playwright-loader.js";

/**
 * @file `playwright-site-preview-capture.ts` — the headless capture adapter, against a structural
 * fake browser (no Chromium; injected launcher and real Sharp encoding).
 */

function fakeLauncher({ failAt, png = Buffer.from("png") }: { failAt?: "launch" | "goto"; png?: Buffer } = {}) {
  const calls: string[] = [];
  const browser: PreviewBrowser = {
    async newContext(options) {
      calls.push(`context:${options.viewport.width}x${options.viewport.height}:${options.ignoreHTTPSErrors}`);
      return {
        async newPage() {
          return {
            async goto(url, options) { calls.push(`goto:${url}:${options.waitUntil}:${options.timeout}`); if (failAt === "goto") throw new Error("net::ERR_CONNECTION_REFUSED"); },
            async waitForTimeout(ms) { calls.push(`settle:${ms}`); },
            async screenshot(options) { calls.push(`shot:${options.type}`); return png; },
          };
        },
        async close() { calls.push("context-close"); },
      };
    },
    async close() { calls.push("browser-close"); },
  };
  const launcher: PreviewBrowserLauncher = {
    async launch(options) {
      calls.push(`launch:${options.headless}:${options.args.join(" ")}`);
      if (failAt === "launch") throw new Error("Executable doesn't exist");
      return browser;
    },
  };
  return { launcher, calls };
}

test("captures the public root at 1280x800 after a settle, resizes to 640, and reuses one browser until close", async () => {
  const { launcher, calls } = fakeLauncher();
  const resized: string[] = [];
  const port = createPlaywrightSitePreviewCapture({}, {
    loadLauncher: async () => launcher,
    resize: async ({ png, width }) => { resized.push(`${png.toString()}@${width}`); return Buffer.from("jpeg"); },
    log: () => assert.fail("no failure expected"),
  });
  assert.equal((await port.capture({ url: "https://localhost:3101/" }))?.toString(), "jpeg");
  assert.equal((await port.capture({ url: "https://localhost:3102/" }))?.toString(), "jpeg");
  await port.close();
  await port.close();
  assert.deepEqual(resized, ["png@640", "png@640"]);
  assert.deepEqual(calls, [
    "launch:true:--no-sandbox --disable-dev-shm-usage",
    "context:1280x800:true", "goto:https://localhost:3101/:load:15000", "settle:1200", "shot:png", "context-close",
    "context:1280x800:true", "goto:https://localhost:3102/:load:15000", "settle:1200", "shot:png", "context-close",
    "browser-close",
  ]);
});

test("default Sharp resizing stores a 640px JPEG and releases the injected browser", async t => {
  const png = await sharp({ create: { width: 1280, height: 800, channels: 3, background: "red" } }).png().toBuffer();
  const { launcher, calls } = fakeLauncher({ png });
  // Only the launcher is replaced; the JPEG encoder stays real. Host loading is checked separately below.
  const port = createPlaywrightSitePreviewCapture({}, { loadLauncher: async () => launcher });
  t.after(() => port.close());
  const jpeg = await port.capture({ url: "https://localhost:3101/" });
  assert.ok(jpeg);
  const metadata = await sharp(jpeg).metadata();
  assert.deepEqual([metadata.format, metadata.width, metadata.height], ["jpeg", 640, 400]);
  await port.close();
  assert.deepEqual(calls, [
    "launch:true:--no-sandbox --disable-dev-shm-usage",
    "context:1280x800:true", "goto:https://localhost:3101/:load:15000", "settle:1200", "shot:png", "context-close",
    "browser-close",
  ]);
});

test("default Chromium loading delegates to the host module loader", async t => {
  const chromium = { launch: async () => assert.fail("loading must not launch a browser") };
  const load = t.mock.method(playwrightModuleLoader, "load", async () => ({ chromium }));

  assert.equal(await importPlaywrightChromium(), chromium);
  assert.equal(load.mock.callCount(), 1);
  assert.deepEqual(load.mock.calls[0]?.arguments, [{ moduleName: "playwright" }]);
});

test("the default logger warns when a capture fails and returns a placeholder", async t => {
  const { launcher } = fakeLauncher({ failAt: "launch" });
  const warnings: string[] = [];
  t.mock.method(console, "warn", (message: string) => warnings.push(message));
  const port = createPlaywrightSitePreviewCapture({}, { loadLauncher: async () => launcher });
  t.after(() => port.close());
  assert.equal(await port.capture({ url: "http://localhost:3101/" }), null);
  assert.deepEqual(warnings, ["[site-preview] could not capture http://localhost:3101/: Executable doesn't exist"]);
});

test("a page that fails to load is a logged null, and its context is still closed", async () => {
  const { launcher, calls } = fakeLauncher({ failAt: "goto" });
  const logs: string[] = [];
  const port = createPlaywrightSitePreviewCapture({}, { loadLauncher: async () => launcher, resize: async () => Buffer.from("x"), log: (m) => logs.push(m) });
  assert.equal(await port.capture({ url: "http://localhost:3101/" }), null);
  assert.deepEqual(logs, ["[site-preview] could not capture http://localhost:3101/: net::ERR_CONNECTION_REFUSED"]);
  assert.equal(calls.at(-1), "context-close");
});

test("a missing browser is a null capture and close does not throw; the next drain launches again", async () => {
  const { launcher, calls } = fakeLauncher({ failAt: "launch" });
  const logs: string[] = [];
  const port = createPlaywrightSitePreviewCapture({}, { loadLauncher: async () => launcher, log: (m) => logs.push(m) });
  assert.equal(await port.capture({ url: "http://localhost:3101/" }), null);
  await port.close();
  assert.equal(await port.capture({ url: "http://localhost:3101/" }), null);
  assert.equal(calls.filter((call) => call.startsWith("launch:")).length, 2);
  assert.deepEqual(logs, [
    "[site-preview] could not capture http://localhost:3101/: Executable doesn't exist",
    "[site-preview] could not capture http://localhost:3101/: Executable doesn't exist",
  ]);
});

test("with no injected launcher the adapter launches Chromium from the host module loader with the loopback-only flags", async t => {
  const { launcher, calls } = fakeLauncher();
  const load = t.mock.method(playwrightModuleLoader, "load", async () => ({ chromium: launcher }));
  const port = createPlaywrightSitePreviewCapture({}, { resize: async ({ width }) => Buffer.from(`jpeg:${width}`), log: () => assert.fail("no failure expected") });

  assert.equal((await port.capture({ url: "https://localhost:3101/" }))?.toString(), "jpeg:640");
  await port.close();

  assert.equal(load.mock.callCount(), 1);
  assert.equal(calls[0], "launch:true:--no-sandbox --disable-dev-shm-usage");
  assert.equal(calls.at(-1), "browser-close");
});

test("a host with no desktop render bridge configured captures through headless Chromium", async () => {
  const { launcher, calls } = fakeLauncher();
  const port = createSitePreviewCaptureForHost({}, { env: {}, loadLauncher: async () => launcher, resize: async () => Buffer.from("jpeg") });

  assert.equal((await port.capture({ url: "https://localhost:3102/" }))?.toString(), "jpeg");
  assert.ok(calls.includes("goto:https://localhost:3102/:load:15000"), "the Chromium page loaded the site");
  await port.close();
  assert.equal(calls.at(-1), "browser-close");
});

test("a native capture failure with no injected logger warns on the console", async t => {
  const warn = t.mock.method(console, "warn", () => {});
  const port = createSitePreviewCaptureForHost({}, { capture: { async captureUrl() { throw new Error("bridge down"); } } });
  assert.equal(await port.capture({ url: "http://127.0.0.1:4200/" }), null);
  assert.deepEqual(warn.mock.calls.map((call) => call.arguments), [["[site-preview] native capture failed"]]);
});

test("a native capture with no injected resize stores a 640px JPEG via Sharp", async () => {
  const png = await sharp({ create: { width: 1280, height: 800, channels: 3, background: "#336699" } }).png().toBuffer();
  const port = createSitePreviewCaptureForHost({}, { capture: { async captureUrl(input) {
    return { png, finalUrl: input.url, title: "", status: null, pageHeight: 800, capturedHeight: 800, blockedRequests: 0 };
  } } });
  const jpeg = await port.capture({ url: "http://127.0.0.1:4200/" });
  assert.ok(jpeg);
  const meta = await sharp(jpeg).metadata();
  assert.deepEqual({ format: meta.format, width: meta.width }, { format: "jpeg", width: 640 });
});
