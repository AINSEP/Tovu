/**
 * @file Proof for `window-navigation-policy.ts` — the popup and navigation boundary every
 * `createWindow` window gets, and the origin primitive the `<webview>` guest policy shares with it.
 *
 * The defect this pins: `createWindow` allowed any popup whose URL merely STARTED WITH the app's
 * origin, so `http://127.0.0.1:4567@evil.example/admin` (userinfo `127.0.0.1:4567`, host
 * `evil.example`) opened inside Electron and inherited the window's speech preload, `tovuFiles`
 * included. Every other URL went to `shell.openExternal` whatever its scheme, and the window had no
 * `will-navigate` policy at all.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  installAppWindowNavigationPolicy,
  installSitesHomeNavigationPolicy,
  isExternalBrowserUrl,
  isSameOrigin,
  isShellPageUrl,
} from "./window-navigation-policy.ts";
import type { NavigableContents, WindowOpenResponse } from "./window-navigation-policy.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP_ORIGIN = "http://127.0.0.1:4567";

/** A `webContents` stand-in that keeps whatever the policy registers, plus every URL handed to the
 *  OS browser. */
function installOnFake(
  install: (contents: NavigableContents, openExternal: (url: string) => void) => void = (contents, openExternal) =>
    installAppWindowNavigationPolicy(contents, { appOrigin: APP_ORIGIN, openExternal }),
) {
  let openHandler: ((details: { url: string }) => WindowOpenResponse) | undefined;
  let navigateListener: ((event: { preventDefault(): void }, url: string) => void) | undefined;
  let redirectListener: ((details: { url: string; isMainFrame: boolean; preventDefault(): void }) => void) | undefined;
  const opened: string[] = [];
  const contents: NavigableContents = {
    setWindowOpenHandler(handler) {
      openHandler = handler;
    },
    on(event, listener) {
      if (event === "will-navigate") navigateListener = listener as typeof navigateListener;
      if (event === "will-redirect") redirectListener = listener as typeof redirectListener;
      return contents;
    },
  };
  install(contents, (url) => opened.push(url));

  return {
    opened,
    windowOpen(url: string): WindowOpenResponse {
      assert.ok(openHandler, "expected a window-open handler to be registered");
      return openHandler({ url });
    },
    /** @returns whether the navigation was prevented. */
    navigate(url: string): boolean {
      assert.ok(navigateListener, "expected a will-navigate listener to be registered");
      let prevented = false;
      navigateListener({ preventDefault: () => (prevented = true) }, url);
      return prevented;
    },
    /** @returns whether the redirect's navigation was prevented. */
    redirect(url: string, isMainFrame: boolean): boolean {
      assert.ok(redirectListener, "expected a will-redirect listener to be registered");
      let prevented = false;
      redirectListener({ url, isMainFrame, preventDefault: () => (prevented = true) });
      return prevented;
    },
  };
}

test("a popup whose URL only STARTS WITH the app origin is denied — userinfo is not the host", () => {
  const fake = installOnFake();
  assert.deepEqual(fake.windowOpen("http://127.0.0.1:4567@evil.example/admin"), { action: "deny" });
});

test("a popup to the same host on a different port is denied", () => {
  const fake = installOnFake();
  assert.deepEqual(fake.windowOpen("http://127.0.0.1:4568/admin"), { action: "deny" });
  assert.deepEqual(fake.windowOpen("http://127.0.0.1:45670/admin"), { action: "deny" });
});

test("a popup to the same host and port over a different scheme is denied", () => {
  const fake = installOnFake();
  assert.deepEqual(fake.windowOpen("https://127.0.0.1:4567/admin"), { action: "deny" });
});

test("a same-origin popup is still allowed in the app, and nothing is handed to the OS", () => {
  const fake = installOnFake();
  assert.deepEqual(fake.windowOpen("http://127.0.0.1:4567/admin/pages?tab=drafts#top"), { action: "allow" });
  assert.deepEqual(fake.windowOpen("http://127.0.0.1:4567/"), { action: "allow" });
  assert.deepEqual(fake.opened, []);
});

test("a denied http(s) popup is handed to the OS browser, exactly as requested", () => {
  const fake = installOnFake();
  assert.deepEqual(fake.windowOpen("https://example.com/view?x=1"), { action: "deny" });
  assert.deepEqual(fake.windowOpen("http://127.0.0.1:4567@evil.example/admin"), { action: "deny" });
  assert.deepEqual(fake.opened, ["https://example.com/view?x=1", "http://127.0.0.1:4567@evil.example/admin"]);
});

test("a popup with any non-http(s) scheme is denied and never reaches shell.openExternal", () => {
  const fake = installOnFake();
  const refused = [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "data:text/html,<script>alert(1)</script>",
    "smb://evil.example/share",
    "vscode://file/etc/passwd",
    "ms-msdt:/id",
    "not a url",
    "",
  ];
  for (const url of refused) {
    assert.deepEqual(fake.windowOpen(url), { action: "deny" }, url);
  }
  assert.deepEqual(fake.opened, []);
});

test("in-window navigation to another origin is prevented and handed to the OS browser", () => {
  const fake = installOnFake();
  assert.equal(fake.navigate("http://127.0.0.1:4567@evil.example/admin"), true);
  assert.equal(fake.navigate("http://127.0.0.1:4568/admin"), true);
  assert.equal(fake.navigate("https://example.com/"), true);
  assert.deepEqual(fake.opened, ["http://127.0.0.1:4567@evil.example/admin", "http://127.0.0.1:4568/admin", "https://example.com/"]);
});

test("in-window navigation to a non-http(s) scheme is prevented and never reaches shell.openExternal", () => {
  const fake = installOnFake();
  assert.equal(fake.navigate("javascript:alert(1)"), true);
  assert.equal(fake.navigate("file:///etc/passwd"), true);
  assert.equal(fake.navigate("smb://evil.example/share"), true);
  assert.equal(fake.navigate("not a url"), true);
  assert.deepEqual(fake.opened, []);
});

test("in-window same-origin navigation is left alone — the admin has to keep working", () => {
  const fake = installOnFake();
  assert.equal(fake.navigate("http://127.0.0.1:4567/admin/login?next=%2Fadmin%2F"), false);
  assert.equal(fake.navigate("http://127.0.0.1:4567/"), false);
  assert.deepEqual(fake.opened, []);
});

test("a main-frame server redirect to another origin is prevented and handed to the OS browser", () => {
  // `will-navigate` does not fire for a 30x, and a site's own redirect rules may name an absolute,
  // allowlisted origin (`apps/website/src/features/redirects`). Without this, a same-origin click
  // that redirects lands a foreign origin in this window, preload and all.
  const fake = installOnFake();
  assert.equal(fake.redirect("https://partner.example/landing", true), true);
  assert.equal(fake.redirect("http://127.0.0.1:4567@evil.example/admin", true), true);
  assert.equal(fake.redirect("smb://evil.example/share", true), true);
  assert.deepEqual(fake.opened, ["https://partner.example/landing", "http://127.0.0.1:4567@evil.example/admin"]);
});

test("a same-origin main-frame redirect, and any subframe redirect, is left alone", () => {
  // A subframe never runs the preload (no `nodeIntegrationInSubFrames`), so an embed that redirects
  // across origins is the page's business, not this boundary's.
  const fake = installOnFake();
  assert.equal(fake.redirect("http://127.0.0.1:4567/admin/login", true), false);
  assert.equal(fake.redirect("https://video.example/embed/123", false), false);
  assert.deepEqual(fake.opened, []);
});

test("isSameOrigin compares parsed origins, and an opaque or unparseable origin never matches", () => {
  assert.equal(isSameOrigin("http://127.0.0.1:4567/admin", "http://127.0.0.1:4567"), true);
  assert.equal(isSameOrigin("http://127.0.0.1:4567/admin", "http://127.0.0.1:4567/other/"), true);
  assert.equal(isSameOrigin("http://127.0.0.1:4567@evil.example/", "http://127.0.0.1:4567"), false);
  assert.equal(isSameOrigin("http://127.0.0.1:45670/", "http://127.0.0.1:4567"), false);
  // Two opaque origins both serialize as "null"; equal strings, not the same origin.
  assert.equal(isSameOrigin("file:///a", "file:///b"), false);
  assert.equal(isSameOrigin("data:text/html,a", "data:text/html,a"), false);
  assert.equal(isSameOrigin("", ""), false);
  assert.equal(isSameOrigin("not a url", "not a url"), false);
});

test("isExternalBrowserUrl admits only parseable http and https URLs", () => {
  assert.equal(isExternalBrowserUrl("https://example.com/"), true);
  assert.equal(isExternalBrowserUrl("http://127.0.0.1:4567/"), true);
  assert.equal(isExternalBrowserUrl("javascript:alert(1)"), false);
  assert.equal(isExternalBrowserUrl("file:///etc/passwd"), false);
  assert.equal(isExternalBrowserUrl("mailto:a@example.com"), false);
  assert.equal(isExternalBrowserUrl("not a url"), false);
});

test("main.ts installs this policy on every createWindow window, against the loaded URL's parsed origin", () => {
  // Source text: `main.ts` imports "electron" at module scope and cannot load under plain node --test
  // (see `main-speech-wiring.test.ts`). Without this, the policy above could be correct and unused.
  const source = fs.readFileSync(path.join(__dirname, "..", "main.ts"), "utf8");
  assert.match(source, /from "\.\/src\/window-navigation-policy\.ts"/);
  const createWindow = source.slice(source.indexOf("function createWindow("), source.indexOf("function openSitesHomeWindow("));
  assert.match(
    createWindow,
    /installAppWindowNavigationPolicy\(window\.webContents, \{\s*appOrigin: new URL\(url\)\.origin,/,
  );
  assert.doesNotMatch(source, /\.startsWith\(origin\)/, "a string prefix is not an origin check");
});

test("the webview guest's will-navigate uses the same origin primitive, not a second copy", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "main.ts"), "utf8");
  const guestPolicy = source.slice(source.indexOf("function registerGuestNavigationPolicy("), source.indexOf("async function adoptAndOpenSite("));
  assert.match(guestPolicy, /will-navigate[\s\S]{0,200}?isSameOrigin\(url, contents\.getURL\(\)\)/);
  assert.doesNotMatch(guestPolicy, /new URL\(/, "the guest policy must not carry its own origin parse");
});

test("the webview guest refuses a main-frame redirect to anything but a supervised site", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "main.ts"), "utf8");
  const guestPolicy = source.slice(source.indexOf("function registerGuestNavigationPolicy("), source.indexOf("async function adoptAndOpenSite("));
  assert.match(
    guestPolicy,
    /on\("will-redirect", \(details\) => \{\s*if \(!details\.isMainFrame \|\| isSupervisedGuestUrl\(details\.url\)\) return;\s*details\.preventDefault\(\);/,
  );
});

const RENDERER = "file:///Applications/Tovu.app/Contents/Resources/app/dist/renderer/index.html";
const pages = (overrides: { attachUrl?: string } = {}) => ({
  isSupervisedSite: (url: string) => url.startsWith("http://127.0.0.1:4567/"), // the fake's own shortcut; the real one is isSupervisedGuestUrl
  rendererFileUrl: RENDERER,
  ...overrides,
});

test("isShellPageUrl admits a supervised site's pages", () => {
  assert.equal(isShellPageUrl("http://127.0.0.1:4567/admin/", pages()), true);
  assert.equal(isShellPageUrl("http://127.0.0.1:4568/admin/", pages()), false);
});

test("isShellPageUrl admits attach mode's origin by parsed origin, and nothing when there is no attach url", () => {
  const attach = pages({ attachUrl: "http://localhost:5173" });
  assert.equal(isShellPageUrl("http://localhost:5173/admin/pages", attach), true);
  assert.equal(isShellPageUrl("http://localhost:5173@evil.example/admin/", attach), false);
  assert.equal(isShellPageUrl("http://localhost:51730/admin/", attach), false);
  assert.equal(isShellPageUrl("http://localhost:5173/admin/", pages()), false);
  assert.equal(isShellPageUrl("http://localhost:5173/admin/", pages({ attachUrl: "" })), false);
});

test("isShellPageUrl admits the sites home renderer's own file, whatever its hash or query, and no other file", () => {
  assert.equal(isShellPageUrl(RENDERER, pages()), true);
  assert.equal(isShellPageUrl(`${RENDERER}#/projects`, pages()), true);
  assert.equal(isShellPageUrl(`${RENDERER}?tab=1`, pages()), true);
  assert.equal(isShellPageUrl("file:///tmp/index.html", pages()), false);
  assert.equal(isShellPageUrl("file://evil-host/Applications/Tovu.app/Contents/Resources/app/dist/renderer/index.html", pages()), false);
});

test("isShellPageUrl refuses foreign pages and garbage without throwing", () => {
  for (const raw of ["https://evil.example/admin/", "javascript:alert(1)", "data:text/html,x", "about:blank", "", "not a url"]) {
    assert.equal(isShellPageUrl(raw, pages({ attachUrl: "http://localhost:5173" })), false, raw);
  }
});

test("main.ts registers the speech channels with the shell-page sender check", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "main.ts"), "utf8");
  assert.match(source, /registerSpeechIpc\(\{ ipcMain, isTrustedSender: isShellPage \}\)/);
  const shellPage = source.slice(source.indexOf("function isShellPage("), source.indexOf("function registerGuestNavigationPolicy("));
  assert.match(
    shellPage,
    /isShellPageUrl\(raw, \{\s*isSupervisedSite: isSupervisedGuestUrl,\s*attachUrl: process\.env\.TOVU_DESKTOP_URL\?\.trim\(\),\s*rendererFileUrl: pathToFileURL\(SITES_RENDERER_PATH\)\.href,\s*\}\)/,
  );
});

// The sites home window (`openSitesHomeWindow`) runs `sandbox: false` with the `tovuRunner` bridge
// (project create/delete/start/stop/openExternal — none of whose IPC handlers checks the sender).
// Its `script-src 'self'` CSP only covers the page it is on: a link dropped onto the window, or any
// other top-level navigation, replaced the page with a remote one that got the SAME preload and none
// of the CSP. Only the renderer's own file may load there.
const installSitesHome = (contents: NavigableContents, openExternal: (url: string) => void) =>
  installSitesHomeNavigationPolicy(contents, { rendererFileUrl: RENDERER, openExternal });

test("sites home: navigating the window to a remote page is prevented and handed to the OS browser", () => {
  const fake = installOnFake(installSitesHome);
  assert.equal(fake.navigate("https://evil.example/"), true);
  assert.equal(fake.navigate("http://127.0.0.1:4567/admin/"), true);
  assert.deepEqual(fake.opened, ["https://evil.example/", "http://127.0.0.1:4567/admin/"]);
});

test("sites home: navigating to any other file, or a non-http(s) scheme, is prevented and never reaches the OS", () => {
  const fake = installOnFake(installSitesHome);
  assert.equal(fake.navigate("file:///Users/someone/Downloads/dropped.html"), true);
  assert.equal(fake.navigate("file://evil-host/Applications/Tovu.app/Contents/Resources/app/dist/renderer/index.html"), true);
  assert.equal(fake.navigate("javascript:alert(1)"), true);
  assert.equal(fake.navigate("data:text/html,<script>tovuRunner</script>"), true);
  assert.deepEqual(fake.opened, []);
});

test("sites home: the renderer's own file still loads, whatever its hash or query", () => {
  const fake = installOnFake(installSitesHome);
  assert.equal(fake.navigate(RENDERER), false);
  assert.equal(fake.navigate(`${RENDERER}#/projects`), false);
  assert.deepEqual(fake.opened, []);
});

test("sites home: a remote popup is denied and handed to the OS browser; a main-frame redirect off the renderer is prevented", () => {
  const fake = installOnFake(installSitesHome);
  assert.deepEqual(fake.windowOpen("https://evil.example/"), { action: "deny" });
  assert.deepEqual(fake.opened, ["https://evil.example/"]);
  assert.equal(fake.redirect("https://evil.example/", true), true);
});

test("main.ts installs the sites home policy on openSitesHomeWindow's window, against the renderer's own file url", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "main.ts"), "utf8");
  const sitesHome = source.slice(source.indexOf("function openSitesHomeWindow("), source.indexOf("window.loadFile(SITES_RENDERER_PATH)"));
  assert.match(
    sitesHome,
    /installSitesHomeNavigationPolicy\(window\.webContents, \{\s*rendererFileUrl: pathToFileURL\(SITES_RENDERER_PATH\)\.href,/,
  );
});
