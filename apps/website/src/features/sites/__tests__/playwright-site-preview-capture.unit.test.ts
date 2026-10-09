import assert from "node:assert/strict";
import test from "node:test";

import { createPlaywrightSitePreviewCapture, type PreviewBrowser, type PreviewBrowserLauncher } from "../site-preview/playwright-site-preview-capture.js";

/**
 * @file `playwright-site-preview-capture.ts` — the headless capture adapter, against a structural
 * fake browser (no Chromium, no module mocks).
 */

function fakeLauncher({ failAt }: { failAt?: "launch" | "goto" } = {}) {
  const calls: string[] = [];
  const browser: PreviewBrowser = {
    async newContext(options) {
      calls.push(`context:${options.viewport.width}x${options.viewport.height}:${options.ignoreHTTPSErrors}`);
      return {
        async newPage() {
          return {
            async goto(url, options) { calls.push(`goto:${url}:${options.waitUntil}:${options.timeout}`); if (failAt === "goto") throw new Error("net::ERR_CONNECTION_REFUSED"); },
            async waitForTimeout(ms) { calls.push(`settle:${ms}`); },
            async screenshot(options) { calls.push(`shot:${options.type}`); return Buffer.from("png"); },
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
