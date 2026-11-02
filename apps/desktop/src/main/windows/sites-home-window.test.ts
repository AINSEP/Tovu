/**
 * @file `sites-home-window.ts`: the sites home window, built through a fake `BrowserWindow` with the
 * real guest and navigation policies installed on a fake `webContents`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

import { openSitesHomeWindow, sitesHomeWindowOptions } from "./sites-home-window.ts";
import type { SitesHomePorts, SitesHomeWebContents, SitesHomeWindow, SitesHomeWindowOptions } from "./sites-home-window.ts";
import type { GuestWebPreferences } from "../../webview-guest-policy.ts";
import type { SpellCheckWebContents } from "../../spellcheck-menu.ts";
import type { WindowOpenResponse } from "../../window-navigation-policy.ts";
import type { WindowBounds } from "../../window-bounds-store.ts";

const RENDERER_PATH = "/app/dist/renderer/index.html";
const RENDERER_URL = pathToFileURL(RENDERER_PATH).href;
const SUPERVISED = "http://127.0.0.1:4567/admin/";
const DISPLAY = { bounds: { x: 0, y: 0, width: 1920, height: 1080 } };

type Listener = (...args: never[]) => void;

/** A `webContents` stand-in that keeps every listener by event name, plus the popup handler. */
function fakeContents(log: string[]): SitesHomeWebContents & { listeners: Map<string, Listener>; popup?: (details: { url: string }) => WindowOpenResponse } {
  const contents = {
    listeners: new Map<string, Listener>(),
    popup: undefined as ((details: { url: string }) => WindowOpenResponse) | undefined,
    setWindowOpenHandler(handler: (details: { url: string }) => WindowOpenResponse) { log.push("policy"); contents.popup = handler; },
    on(event: string, listener: Listener) { log.push(`contents:${event}`); contents.listeners.set(event, listener); return undefined; },
    replaceMisspelling() {}, cut() {}, copy() {}, paste() {}, selectAll() {},
    session: { addWordToSpellCheckerDictionary() {} },
  };
  return contents;
}

interface FakeHomeWindow extends SitesHomeWindow {
  webContents: ReturnType<typeof fakeContents>;
  handlers: Map<string, Listener>;
  state: { destroyed: boolean; fullScreen: boolean };
}

function fakeHome(overrides: Partial<SitesHomePorts<FakeHomeWindow>> = {}) {
  const log: string[] = [];
  const created: SitesHomeWindowOptions[] = [];
  const writes: Array<{ boundsPath: string; bounds: WindowBounds }> = [];
  const opened: string[] = [];
  const errors: string[] = [];
  const spellChecked: SpellCheckWebContents[] = [];
  const exitCodes: number[] = [];
  const dialogs: Array<[string, string]> = [];
  let quits = 0;
  const bounds = { x: 100, y: 120, width: 1000, height: 800 };
  const window: FakeHomeWindow = {
    webContents: fakeContents(log),
    handlers: new Map(),
    state: { destroyed: false, fullScreen: false },
    on(event: string, listener: Listener) { log.push(`window:${event}`); window.handlers.set(event, listener); return window; },
    isDestroyed: () => window.state.destroyed,
    isFullScreen: () => window.state.fullScreen,
    getBounds: () => bounds,
    async loadFile(filePath: string) {
      log.push(`load ${filePath}`);
      assert.ok(window.webContents.popup, "the navigation boundary must exist before the renderer loads");
    },
  };
  const ports: SitesHomePorts<FakeHomeWindow> = {
    rendererPath: RENDERER_PATH,
    sitesPreloadPath: "/app/dist/preload/preload.mjs",
    guestPreloadPath: "/app/dist/speech/preload-speech.cjs",
    userDataDir: "/user-data",
    fileExists: (filePath) => filePath === RENDERER_PATH,
    createBrowserWindow: (options) => { created.push(options); log.push("create"); return window; },
    getAllDisplays: () => [DISPLAY],
    readWindowBounds: () => null,
    writeWindowBounds: (args) => { writes.push(args); },
    isSupervisedGuestUrl: (url) => url === SUPERVISED,
    openExternal: (url) => { opened.push(url); },
    relayFindResults: ({ window: relayed }) => { assert.equal(relayed, window); log.push("relay"); },
    registerSpellCheck: ({ webContents }) => { spellChecked.push(webContents); log.push("spellcheck"); },
    showErrorBox: (title, message) => { dialogs.push([title, message]); },
    logError: (message) => { errors.push(message); },
    setExitCode: (code) => { exitCodes.push(code); },
    quit: () => { quits++; },
    ...overrides,
  };
  return { ports, window, log, created, writes, opened, errors, spellChecked, exitCodes, dialogs, quits: () => quits };
}

const MISSING = `The sites home UI is not built. Run \`npm run build\` in apps/desktop, or unset TOVU_DESKTOP_UI to launch a site instead.\n\nExpected: ${RENDERER_PATH}`;

test("an unbuilt renderer: logs why, fails the run, shows the reason, quits, and opens no window", () => {
  const home = fakeHome({ fileExists: () => false, createBrowserWindow: () => assert.fail("no window without a renderer") });
  assert.equal(openSitesHomeWindow({ ports: home.ports }), null);
  assert.deepEqual(home.errors, [`tovu desktop: ${MISSING}`]);
  assert.deepEqual(home.exitCodes, [1]);
  assert.deepEqual(home.dialogs, [["Tovu could not start", MISSING]]);
  assert.equal(home.quits(), 1);
});

test("an unbuilt renderer in a self-test shows no dialog, but still fails and quits", () => {
  const home = fakeHome({ fileExists: () => false });
  assert.equal(openSitesHomeWindow({ ports: home.ports }, { selftest: true }), null);
  assert.deepEqual(home.dialogs, []);
  assert.deepEqual(home.exitCodes, [1]);
  assert.equal(home.quits(), 1);
});

// The floor (moved from main-project-wiring.test.ts): a window with no minimum can be dragged to a
// width nothing has an answer for. It is no longer tied to a breakpoint: `.main__head` and
// `.main__tools` wrap, and the create-website form reflows on `@container onboarding (max-width:
// 520px)`, keyed to its own width because the operator chat is a grid COLUMN that narrows the content
// pane while the viewport does not move. What cannot reflow is chiefly `.topnav`, a fit-content pill
// with no wrap. Any floor must still fit one card column: `.grid`'s `minmax(214px, 1fr)` plus its
// 1.75rem side padding (28px each), so at least 270. 480 itself is the owner's choice (2026-09-12),
// not derived from the stylesheet. `createWindow`'s 1024x700 floor is for a SITE's admin, whose
// responsive behaviour this shell does not own.
test("options: unsandboxed sites preload with the webview tag, the owner's 480x600 floor, fallback size with nothing remembered", () => {
  const home = fakeHome();
  assert.deepEqual(sitesHomeWindowOptions({ ports: home.ports, boundsPath: "/user-data/window-bounds.json" }), {
    width: 1360, height: 900, minWidth: 480, minHeight: 600, title: "Tovu", show: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, preload: "/app/dist/preload/preload.mjs", webviewTag: true },
  });
});

test("a remembered spot on a current display is reopened; one no display covers falls back to a centred default", () => {
  const remembered = { x: 200, y: 150, width: 900, height: 700 };
  const reads: string[] = [];
  const onScreen = fakeHome({ readWindowBounds: ({ boundsPath }) => { reads.push(boundsPath); return remembered; } });
  openSitesHomeWindow({ ports: onScreen.ports });
  assert.deepEqual(reads, ["/user-data/window-bounds.json"]);
  const reopened = onScreen.created[0];
  assert.deepEqual([reopened?.x, reopened?.y, reopened?.width, reopened?.height], [200, 150, 900, 700]);

  const unplugged = fakeHome({ readWindowBounds: () => ({ x: 5000, y: 0, width: 900, height: 700 }) });
  openSitesHomeWindow({ ports: unplugged.ports });
  assert.equal(unplugged.created[0]?.x, undefined);
  assert.equal(unplugged.created[0]?.width, 1360);
  assert.equal(unplugged.created[0]?.height, 900);
});

test("a self-test window stays hidden and is tracked before anything loads", () => {
  const home = fakeHome();
  const tracked: FakeHomeWindow[] = [];
  openSitesHomeWindow({ ports: home.ports }, { selftest: true, trackWindow: (w) => { tracked.push(w); home.log.push("track"); } });
  assert.equal(home.created[0]?.show, false);
  assert.deepEqual(tracked, [home.window]);
  assert.ok(home.log.indexOf("track") < home.log.indexOf(`load ${RENDERER_PATH}`));
});

test("setup order: every listener and boundary is in place before the renderer file loads", () => {
  const home = fakeHome();
  assert.equal(openSitesHomeWindow({ ports: home.ports }), home.window);
  assert.deepEqual(home.log.filter((step) => !step.startsWith("contents:") || step.endsWith("attach-webview")), [
    "create", "window:page-title-updated", "window:close", "relay", "spellcheck",
    "contents:will-attach-webview", "contents:did-attach-webview", "policy", `load ${RENDERER_PATH}`,
  ]);
  assert.deepEqual(home.spellChecked, [home.window.webContents], "the Projects screen's own text fields get the spelling menu");
});

test("the page may not retitle the window", () => {
  const home = fakeHome();
  openSitesHomeWindow({ ports: home.ports });
  let prevented = false;
  (home.window.handlers.get("page-title-updated") as (event: { preventDefault(): void }) => void)({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
});

test("close remembers the bounds, except for a destroyed or full-screen window", () => {
  for (const state of [{ destroyed: false, fullScreen: false }, { destroyed: false, fullScreen: true }, { destroyed: true, fullScreen: false }]) {
    const home = fakeHome();
    openSitesHomeWindow({ ports: home.ports });
    home.window.state = state;
    (home.window.handlers.get("close") as () => void)();
    const expected = state.destroyed || state.fullScreen ? [] : [{ boundsPath: "/user-data/window-bounds.json", bounds: home.window.getBounds() }];
    assert.deepEqual(home.writes, expected, JSON.stringify(state));
  }
});

test("a supervised guest attaches with the speech preload and Node off, whatever the page asked for", () => {
  const home = fakeHome();
  openSitesHomeWindow({ ports: home.ports });
  const attach = home.window.webContents.listeners.get("will-attach-webview") as (event: { preventDefault(): void }, prefs: GuestWebPreferences, params: { src?: unknown }) => void;
  let prevented = 0;
  const prefs: GuestWebPreferences = { nodeIntegration: true, contextIsolation: false, preload: "/evil.js" };
  attach({ preventDefault: () => { prevented++; } }, prefs, { src: SUPERVISED });
  assert.equal(prevented, 0);
  assert.equal(prefs.preload, "/app/dist/speech/preload-speech.cjs");
  assert.equal(prefs.nodeIntegration, false);
  assert.equal(prefs.contextIsolation, true);
});

test("a guest pointed anywhere else, or nowhere, is refused and its preferences are left untouched", () => {
  for (const params of [{ src: "https://attacker.example/admin" }, { src: `${SUPERVISED}`.replace("4567", "4568") }, {}, { src: 42 }]) {
    const home = fakeHome();
    openSitesHomeWindow({ ports: home.ports });
    const attach = home.window.webContents.listeners.get("will-attach-webview") as (event: { preventDefault(): void }, prefs: GuestWebPreferences, params: { src?: unknown }) => void;
    let prevented = 0;
    const prefs: GuestWebPreferences = { nodeIntegration: true, preload: "/evil.js" };
    attach({ preventDefault: () => { prevented++; } }, prefs, params);
    assert.equal(prevented, 1, JSON.stringify(params));
    assert.deepEqual(prefs, { nodeIntegration: true, preload: "/evil.js" });
  }
});

test("an attached guest gets its own spelling menu", () => {
  const home = fakeHome();
  openSitesHomeWindow({ ports: home.ports });
  const guest = fakeContents([]);
  (home.window.webContents.listeners.get("did-attach-webview") as (event: unknown, contents: SpellCheckWebContents) => void)({}, guest);
  assert.deepEqual(home.spellChecked, [home.window.webContents, guest]);
});

test("only the renderer's own file may load; a remote page goes to the OS browser instead", () => {
  const home = fakeHome();
  openSitesHomeWindow({ ports: home.ports });
  const navigate = home.window.webContents.listeners.get("will-navigate") as (event: { preventDefault(): void }, url: string) => void;
  const prevented = (url: string) => { let p = false; navigate({ preventDefault: () => { p = true; } }, url); return p; };
  assert.equal(prevented(`${RENDERER_URL}#/projects`), false);
  assert.equal(prevented("https://evil.example/"), true);
  assert.equal(prevented("file:///Users/someone/Downloads/dropped.html"), true);
  assert.deepEqual(home.opened, ["https://evil.example/"]);
  assert.deepEqual(home.window.webContents.popup?.({ url: "https://evil.example/" }), { action: "deny" });
});
