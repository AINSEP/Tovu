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

import { installAppWindowNavigationPolicy, isExternalBrowserUrl, isSameOrigin } from "./window-navigation-policy.ts";
import type { NavigableContents, WindowOpenResponse } from "./window-navigation-policy.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP_ORIGIN = "http://127.0.0.1:4567";

/** A `webContents` stand-in that keeps whatever the policy registers, plus every URL handed to the
 *  OS browser. */
function installOnFake() {
  let openHandler: ((details: { url: string }) => WindowOpenResponse) | undefined;
  let navigateListener: ((event: { preventDefault(): void }, url: string) => void) | undefined;
  const opened: string[] = [];
  const contents: NavigableContents = {
    setWindowOpenHandler(handler) {
      openHandler = handler;
    },
    on(event, listener) {
      if (event === "will-navigate") navigateListener = listener;
      return contents;
    },
  };
  installAppWindowNavigationPolicy(contents, { appOrigin: APP_ORIGIN, openExternal: (url) => opened.push(url) });

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
