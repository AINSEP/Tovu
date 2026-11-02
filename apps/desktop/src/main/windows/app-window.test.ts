/**
 * @file `app-window.ts`: the standalone admin window, built through a fake `BrowserWindow` factory
 * with the real navigation policy installed on a fake `webContents`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { appWindowOptions, createAppWindow } from "./app-window.ts";
import type { AppWindow, AppWindowOptions } from "./app-window.ts";
import type { WindowOpenResponse } from "../../window-navigation-policy.ts";

const APP = "http://127.0.0.1:4567";

/** A window fake that records every step in `log`, in order, plus the registered handlers. */
function fakeWindowFactory() {
  const log: string[] = [];
  const created: AppWindowOptions[] = [];
  let popup: ((details: { url: string }) => WindowOpenResponse) | undefined;
  let navigate: ((event: { preventDefault(): void }, url: string) => void) | undefined;
  let titleUpdated: ((event: { preventDefault(): void }) => void) | undefined;
  const window: AppWindow = {
    webContents: {
      setWindowOpenHandler(handler) { log.push("policy"); popup = handler; },
      on(event: string, listener: unknown) {
        if (event === "will-navigate") navigate = listener as typeof navigate;
        return undefined;
      },
    },
    on(event, listener) {
      log.push(event);
      titleUpdated = listener;
      return undefined;
    },
    async loadURL(url) {
      log.push(`load ${url}`);
      // The boundary must already answer by the time the first load starts.
      assert.ok(popup, "policy must be installed before loadURL");
      assert.deepEqual(popup({ url: "https://evil.example/" }), { action: "deny" });
    },
  };
  return {
    log, created, window,
    create: (options: AppWindowOptions) => { created.push(options); log.push("create"); return window; },
    popup: (url: string) => popup!({ url }), // `!`: only called after createAppWindow registered it.
    /** @returns whether the navigation was prevented. */
    navigate(url: string): boolean {
      let prevented = false;
      navigate!({ preventDefault: () => { prevented = true; } }, url); // `!`: registered by the policy.
      return prevented;
    },
    /** @returns whether the title update was prevented. */
    updateTitle(): boolean {
      let prevented = false;
      titleUpdated!({ preventDefault: () => { prevented = true; } }); // `!`: registered by createAppWindow.
      return prevented;
    },
  };
}

test("admin window options: 1360x900 with a 1024x700 floor, sandboxed, speech preload, titled Tovu by default", () => {
  assert.deepEqual(appWindowOptions({ preloadPath: "/speech.cjs" }), {
    width: 1360, height: 900, minWidth: 1024, minHeight: 700, title: "Tovu", show: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: "/speech.cjs" },
  });
});

test("a site's partition and title are applied; a self-test window stays hidden", () => {
  const options = appWindowOptions({ preloadPath: "/speech.cjs" }, { title: "My Site", partition: "persist:site-a", selftest: true });
  assert.equal(options.title, "My Site");
  assert.equal(options.show, false);
  assert.equal(options.webPreferences.partition, "persist:site-a");
});

test("no partition means no partition key at all (attach mode keeps the default session)", () => {
  for (const partition of [undefined, ""]) {
    const options = appWindowOptions({ preloadPath: "/p" }, { partition });
    assert.equal("partition" in options.webPreferences, false, JSON.stringify(partition));
  }
});

test("setup order: create, track, pin title, install the boundary, then load", () => {
  const fake = fakeWindowFactory();
  const tracked: AppWindow[] = [];
  const window = createAppWindow(
    { url: `${APP}/admin`, createBrowserWindow: fake.create, preloadPath: "/speech.cjs", openExternal: () => {} },
    { title: "Site A", partition: "persist:a", trackWindow: (w) => { tracked.push(w); fake.log.push("track"); } },
  );
  assert.equal(window, fake.window);
  assert.deepEqual(tracked, [fake.window]);
  assert.deepEqual(fake.log, ["create", "track", "page-title-updated", "policy", `load ${APP}/admin`]);
  assert.equal(fake.created[0]?.title, "Site A");
  assert.equal(fake.created[0]?.webPreferences.partition, "persist:a");
  assert.equal(fake.created[0]?.show, true);
});

test("without a tracker the window still opens and loads", () => {
  const fake = fakeWindowFactory();
  createAppWindow({ url: `${APP}/admin`, createBrowserWindow: fake.create, preloadPath: "/p", openExternal: () => {} }, { selftest: true });
  assert.deepEqual(fake.log, ["create", "page-title-updated", "policy", `load ${APP}/admin`]);
  assert.equal(fake.created[0]?.show, false);
  assert.equal(fake.created[0]?.title, "Tovu");
});

test("the page may not retitle the window", () => {
  const fake = fakeWindowFactory();
  createAppWindow({ url: `${APP}/admin`, createBrowserWindow: fake.create, preloadPath: "/p", openExternal: () => {} });
  assert.equal(fake.updateTitle(), true);
});

test("the boundary is the loaded URL's parsed origin, not a string prefix", () => {
  const fake = fakeWindowFactory();
  const opened: string[] = [];
  createAppWindow({ url: `${APP}/admin/pages?x=1`, createBrowserWindow: fake.create, preloadPath: "/p", openExternal: (u) => opened.push(u) });
  assert.equal(fake.navigate(`${APP}/admin/media`), false, "same origin stays in the window");
  assert.equal(fake.navigate(`${APP}@evil.example/admin`), true, "userinfo is not the host");
  assert.equal(fake.navigate("http://127.0.0.1:4568/admin"), true, "another port is another origin");
  assert.deepEqual(fake.popup("https://example.com/"), { action: "deny" });
  assert.ok(opened.includes("https://example.com/"), "a foreign http(s) popup goes to the OS browser");
  assert.ok(opened.includes(`${APP}@evil.example/admin`), "a foreign navigation goes to the OS browser");
});

test("an unparseable URL throws before anything loads", () => {
  const fake = fakeWindowFactory();
  assert.throws(
    () => createAppWindow({ url: "not a url", createBrowserWindow: fake.create, preloadPath: "/p", openExternal: () => {} }),
    { name: "TypeError" },
  );
  assert.equal(fake.log.some((step) => step.startsWith("load")), false);
});
