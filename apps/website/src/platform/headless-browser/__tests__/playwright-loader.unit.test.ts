import assert from "node:assert/strict";
import test from "node:test";

import { playwrightModuleLoader } from "../playwright-loader.js";
import type { PlaywrightLike } from "@jini-ai/diagnostics/web-evidence/playwright";
import { openPlaywrightRenderBrowser, PUBLIC_RENDER_LAUNCH_OPTIONS } from "@jini-ai/diagnostics/web-evidence/playwright";

test("the host loader adapts Playwright contexts and copies readonly launch arguments", async t => {
  const launches: Array<Parameters<PlaywrightLike["chromium"]["launch"]>[0]> = [];
  const contextInputs: unknown[] = [];
  const routes: unknown[][] = [];
  const sockets: unknown[][] = [];
  const closed: string[] = [];
  const page = {
    goto: async () => null,
    evaluate: async () => 800,
    waitForTimeout: async () => {},
    title: async () => "Example",
  };
  const cookies = [{ name: "consent", value: "no", domain: "example.test", path: "/", expires: -1, httpOnly: false, secure: true, sameSite: "Lax" }];
  const nativeContext = {
    newPage: async () => page,
    route: async (...args: unknown[]) => { routes.push(args); return { dispose() {} }; },
    routeWebSocket: async (...args: unknown[]) => { sockets.push(args); },
    cookies: async () => cookies,
    close: async () => { closed.push("context"); },
  };
  t.mock.module("playwright", { namedExports: { chromium: {
    launch: async (options: Parameters<PlaywrightLike["chromium"]["launch"]>[0]) => {
      launches.push(options);
      if (options?.headless && options.args?.includes("--proxy-server=http://127.0.0.1:9") && options.channel !== "chrome") {
        throw new Error("downloaded Chromium absent");
      }
      return {
        newContext: async (options: unknown) => { contextInputs.push(options); return nativeContext; },
        close: async () => { closed.push("browser"); },
      };
    },
  } } });

  const { chromium } = await playwrightModuleLoader.load({ moduleName: "playwright" });
  const args = Object.freeze(["--disable-dev-shm-usage"]);
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, args });
  const options = { viewport: { width: 1200, height: 700 }, serviceWorkers: "block" };
  const context = await browser.newContext(options);
  assert.deepEqual(contextInputs, [options]);
  assert.equal(await context.newPage(), page);
  assert.ok(context.cookies);
  assert.equal(await context.cookies(), cookies);
  const routeHandler = async () => {};
  const socketHandler = async () => {};
  assert.equal(await context.route("**/*", routeHandler), undefined, "native Disposable must not leak through the evidence port");
  assert.ok(context.routeWebSocket);
  const pattern = /.*/;
  assert.equal(await context.routeWebSocket(pattern, socketHandler), undefined);
  assert.deepEqual(routes, [["**/*", routeHandler]]);
  assert.deepEqual(sockets, [[pattern, socketHandler]]);
  assert.deepEqual(launches, [{ headless: true, chromiumSandbox: true, args: ["--disable-dev-shm-usage"] }]);
  assert.notEqual(launches[0]?.args, args, "the SDK must receive a mutable copy of the caller's readonly arguments");
  await context.close();
  await browser.close();
  assert.deepEqual(closed, ["context", "browser"]);

  const defaults = await chromium.launch();
  await defaults.close();
  const noArgs = await chromium.launch({ headless: false });
  await noArgs.close();
  assert.deepEqual(launches.slice(1), [{}, { headless: false }]);

  const fallback = await openPlaywrightRenderBrowser({}, { moduleLoader: playwrightModuleLoader, launchOptions: PUBLIC_RENDER_LAUNCH_OPTIONS });
  assert.ok(fallback.available, "the host loader must forward the shared system Chrome fallback");
  assert.deepEqual(launches.slice(3), [PUBLIC_RENDER_LAUNCH_OPTIONS, { ...PUBLIC_RENDER_LAUNCH_OPTIONS, channel: "chrome" }]);
  await fallback.browser.close();
});
