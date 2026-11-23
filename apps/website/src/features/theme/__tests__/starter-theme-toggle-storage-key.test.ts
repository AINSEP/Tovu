import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

/**
 * @file A046: the starter theme's light/dark choice is remembered per THEME, not per Tovu Starter.
 *
 * `theme-toggle.js` used to hard-code the key `tovu-starter:mode`, so every copy made by
 * `theme_duplicate` (which only rewrites `/theme-assets/<id>/` URLs and `theme.json`) read and wrote
 * the SAME `localStorage` entry: flipping one theme to light flipped every sibling on that origin.
 * The script now derives its key from the theme id in its own URL (`/theme-assets/<id>/scripts/…`,
 * which `rewriteAssetPaths` + `duplicateTheme` already keep correct), so no extra rewrite step exists
 * to forget. The two on-disk copies (live and `__original-themes__`) must stay byte-identical or
 * "Reset to original" would silently bring the old key back.
 */

const THEMES = path.resolve(import.meta.dirname, "../../../../../../content/themes");
const LIVE = path.join(THEMES, "static/tovu-starter/scripts/theme-toggle.js");
const ORIGINAL = path.join(THEMES, "__original-themes__/static/tovu-starter/scripts/theme-toggle.js");

interface Harness { keysRead: string[]; store: Map<string, string>; click(): void }

/** Run the real script in a sandbox with a fake document and an observable `localStorage`. */
function runToggle({ src, seed = {} }: { src: string; seed?: Record<string, string> }): Harness {
  const store = new Map(Object.entries(seed));
  const keysRead: string[] = [];
  const attrs = new Map<string, string>();
  const root = {
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    removeAttribute: (k: string) => void attrs.delete(k),
    getAttribute: (k: string) => attrs.get(k) ?? null,
  };
  const button = { listeners: [] as Array<() => void>, setAttribute() {}, addEventListener(_t: string, fn: () => void) { this.listeners.push(fn); } };
  const domReady: Array<() => void> = [];
  const document = {
    documentElement: root,
    currentScript: { src },
    addEventListener: (_t: string, fn: () => void) => void domReady.push(fn),
    querySelectorAll: () => [button],
  };
  const localStorage = {
    getItem: (k: string) => { keysRead.push(k); return store.get(k) ?? null; },
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  vm.runInNewContext(fs.readFileSync(LIVE, "utf8"), { document, localStorage, setInterval: () => 0, Date });
  domReady.forEach((fn) => fn());
  return { keysRead, store, click: () => button.listeners.forEach((fn) => fn()) };
}

test("a duplicated theme remembers its own mode and never reads or writes the starter's key", () => {
  const copy = runToggle({ src: "https://example.test/theme-assets/my-copy/scripts/theme-toggle.js", seed: { "tovu-starter:mode": "light" } });
  copy.click();
  assert.ok(!copy.keysRead.includes("tovu-starter:mode"), `copy read the starter's key: ${copy.keysRead.join(",")}`);
  assert.ok(!copy.store.has("tovu-starter:mode") || copy.store.get("tovu-starter:mode") === "light", "copy overwrote the starter's saved mode");
  assert.deepEqual([...copy.store.keys()].filter((k) => k !== "tovu-starter:mode"), ["my-copy:mode"]);
});

test("the stock starter keeps its historical key so existing visitors keep their choice", () => {
  const starter = runToggle({ src: "https://example.test/theme-assets/tovu-starter/scripts/theme-toggle.js" });
  starter.click();
  assert.deepEqual([...starter.store.keys()], ["tovu-starter:mode"]);
});

test("a preview URL carries the same id", () => {
  const preview = runToggle({ src: "https://example.test/preview/theme-assets/other-copy/scripts/theme-toggle.js" });
  preview.click();
  assert.deepEqual([...preview.store.keys()], ["other-copy:mode"]);
});

test("a static download (relative script URL, no id) falls back to the historical key instead of throwing", () => {
  const download = runToggle({ src: "https://example.test/scripts/theme-toggle.js" });
  download.click();
  assert.deepEqual([...download.store.keys()], ["tovu-starter:mode"]);
});

test("the live theme and its stored original carry the same toggle script", () => {
  assert.equal(fs.readFileSync(LIVE, "utf8"), fs.readFileSync(ORIGINAL, "utf8"));
});
