/**
 * @file The two theme-preview bindings that live only in the Electron entry (`src/main/index.ts`),
 * checked as source text: the entry imports "electron" at module scope and cannot load under
 * node --test, and neither binding has a module of its own.
 *
 * The behaviour around them (a sites-home open syncing the real theme controller, Stop dropping a
 * late frame, a restart streaming from the new server) is tested through the real modules in
 * `src/main/boot/site-backend-theme-preview.test.ts`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { pathToFileURL } from "node:url";

const source = readFileSync(new URL("./main/index.ts", import.meta.url), "utf8");

test("the theme stream fetches through the site's own partition, sending its admin cookies", () => {
  const start = source.indexOf("const siteThemePreviews = createSiteThemePreviewSubscriptions(");
  assert.notEqual(start, -1, "expected the theme-preview controller in the entry");
  const block = source.slice(start, source.indexOf("\n} });", start));
  assert.match(block, /partition: sitePartition\(siteDir\)/);
  assert.match(block, /session\.fromPartition\(target\.partition\)\.fetch\(String\(url\), \{ \.\.\.init, credentials: "include" \}\)/);
});

test("a card's Stop cancels both the preview capture and the theme stream", () => {
  assert.match(
    source,
    /cancelPreviewCapture: \([^)]*\) => \{\s*sitePreviewScheduler\.cancel\(\{ siteDir \}, \{\}\);\s*siteThemePreviews\.stop\(\{ siteDir \}, \{\}\);\s*\}/,
  );
});

test("theme previews reject webview guests even when their owning window is Sites Home", () => {
  const sitesPath = "/install/dist/renderer/index.html";
  const home = { isDestroyed: () => false, getURL: () => pathToFileURL(sitesPath).href };
  const guest = { isDestroyed: () => false, getURL: () => "http://127.0.0.1:4321/admin/" };
  const binding = source.match(/allowed: (\(sender\) => [^\n]+),\n/);
  assert.ok(binding, "the theme-preview IPC must have a sender guard");
  // Exercise the entry's actual predicate without importing Electron's main-process entry.
  // Electron resolves both these contents to the owning Sites Home window.
  const allowed = runInNewContext(stripTypeScriptTypes(`(${binding[1]});`), {
    BrowserWindow: { fromWebContents: () => ({ webContents: home }) },
    SITES_RENDERER_PATH: sitesPath,
    pathToFileURL,
  }) as (sender: { isDestroyed(): boolean; getURL(): string }) => boolean;
  assert.equal(allowed(home), true, "Sites Home keeps its theme preview subscriptions");
  assert.equal(allowed(guest), false, "the guest must not inherit its host window's trust");
  assert.equal(allowed({ isDestroyed: () => false, getURL: () => "https://untrusted.example/" }), false);
  assert.equal(allowed({ isDestroyed: () => true, getURL: () => { throw new Error("contents destroyed"); } }), false);
});
