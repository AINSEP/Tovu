import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

/**
 * @file A046-ext: the Tovu Theme's light/dark choice is remembered per THEME, not per Tovu Theme.
 * Sibling of `starter-theme-toggle-storage-key.test.ts`, which documents the same defect and fix
 * for the starter.
 *
 * `theme-toggle.js` hard-coded the key `tovu-theme:relay`, so every copy made by `theme_duplicate`
 * (which only rewrites `/theme-assets/<id>/` URLs and `theme.json`) read and wrote the SAME
 * `localStorage` entry: flipping one theme to light flipped every sibling on that origin. The script
 * now derives its key from the theme id in its own URL; `tovu-theme` keeps its historical
 * `tovu-theme:relay` so existing visitors keep their choice. The two on-disk copies (live and
 * `__original-themes__`) must stay byte-identical or "Reset to original" would bring the old key back.
 */

const THEMES = path.resolve(import.meta.dirname, "../../../../../../content/themes");
const LIVE = path.join(THEMES, "static/tovu-theme/scripts/theme-toggle.js");
const ORIGINAL = path.join(THEMES, "__original-themes__/static/tovu-theme/scripts/theme-toggle.js");

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
  vm.runInNewContext(fs.readFileSync(LIVE, "utf8"), { document, localStorage });
  for (const ready of domReady) ready();
  return { keysRead, store, click: () => { for (const listener of button.listeners) listener(); } };
}

test("a duplicated theme remembers its own mode and never reads or writes the Tovu Theme's key", () => {
  const copy = runToggle({ src: "https://example.test/theme-assets/my-copy/scripts/theme-toggle.js", seed: { "tovu-theme:relay": "light" } });
  copy.click();
  assert.ok(!copy.keysRead.includes("tovu-theme:relay"), `copy read the Tovu Theme's key: ${copy.keysRead.join(",")}`);
  assert.equal(copy.store.get("tovu-theme:relay"), "light", "copy overwrote the Tovu Theme's saved mode");
  assert.deepEqual([...copy.store.keys()].filter((k) => k !== "tovu-theme:relay"), ["my-copy:relay"]);
});

test("the stock Tovu Theme keeps its historical key so existing visitors keep their choice", () => {
  const stock = runToggle({ src: "https://example.test/theme-assets/tovu-theme/scripts/theme-toggle.js", seed: { "tovu-theme:relay": "light" } });
  assert.ok(stock.keysRead.includes("tovu-theme:relay"), "the stock theme no longer reads its historical key");
  stock.click();
  assert.deepEqual([...stock.store.entries()], [["tovu-theme:relay", "dark"]]);
});

test("a preview URL carries the same id", () => {
  const preview = runToggle({ src: "https://example.test/preview/theme-assets/other-copy/scripts/theme-toggle.js" });
  preview.click();
  assert.deepEqual([...preview.store.keys()], ["other-copy:relay"]);
});

test("a static download (relative script URL, no id) falls back to the historical key instead of throwing", () => {
  const download = runToggle({ src: "https://example.test/scripts/theme-toggle.js" });
  download.click();
  assert.deepEqual([...download.store.keys()], ["tovu-theme:relay"]);
});

test("a script with no current URL (inlined or evaluated) still falls back to the historical key", () => {
  const inlined = runToggle({ src: "" });
  inlined.click();
  assert.deepEqual([...inlined.store.keys()], ["tovu-theme:relay"]);
});

test("the live theme and its stored original carry the same toggle script", () => {
  assert.equal(fs.readFileSync(LIVE, "utf8"), fs.readFileSync(ORIGINAL, "utf8"));
});
