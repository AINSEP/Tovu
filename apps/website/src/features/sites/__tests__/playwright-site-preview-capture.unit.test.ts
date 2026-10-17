import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { createPlaywrightSitePreviewCapture, type PreviewBrowser, type PreviewBrowserLauncher } from "../site-preview/playwright-site-preview-capture.js";

/**
 * @file `playwright-site-preview-capture.ts` — the headless capture adapter, against a structural
 * fake browser (no Chromium; only the external SDK is mocked for default-wiring coverage).
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

test("default Playwright loading and Sharp resizing store a 640px JPEG and release the browser", async t => {
  const png = await sharp({ create: { width: 1280, height: 800, channels: 3, background: "red" } }).png().toBuffer();
  const { launcher, calls } = fakeLauncher({ png });
  // Only the external SDK is replaced; the host loader and JPEG encoder stay real.
  t.mock.module("playwright", { namedExports: { chromium: launcher } });
  const port = createPlaywrightSitePreviewCapture();
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
