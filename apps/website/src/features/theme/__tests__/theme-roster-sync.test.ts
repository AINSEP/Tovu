import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { discoverAllBuiltInThemes, requestThemePreviewRefresh, type DiscoveredTheme } from "#src/features/theme/index";
import { syncThemeRoster, themeRosterFingerprint } from "#src/features/theme/theme-roster-sync";

/**
 * @file `syncThemeRoster` — one process's roster following theme changes made by ANOTHER process
 * (2026-10-08: the agent daemon's `theme_duplicate` + `theme_set_active` left the web server
 * rendering the fallback theme). Real folders on disk; "the other process" is simply a write this
 * roster was not told about.
 */

function writeTheme(dir: string, id: string, ink = "#000"): void {
  fs.mkdirSync(path.join(dir, "templates"), { recursive: true });
  fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify({ id, name: id, version: "1.0.0", tier: "declarative", engine: 1 }));
  fs.writeFileSync(path.join(dir, "tokens.json"), JSON.stringify({ "--ink": ink }));
  fs.writeFileSync(path.join(dir, "styles.css"), "body{margin:0}");
  fs.writeFileSync(path.join(dir, "templates", "home.json"), '{"type":"doc","content":[]}');
  fs.writeFileSync(path.join(dir, "templates", "entry.json"), '{"type":"doc","content":[]}');
}

function siteThemes(t: test.TestContext): { themesDir: string; themes: DiscoveredTheme[] } {
  const themesDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-roster-sync-"));
  t.after(() => fs.rmSync(themesDir, { recursive: true, force: true }));
  writeTheme(path.join(themesDir, "static", "tovu-starter"), "tovu-starter");
  const themes = discoverAllBuiltInThemes({ dir: themesDir, source: "built-in" });
  assert.equal(syncThemeRoster({ themes, themesDir }), false, "the first sync adopts the boot discovery");
  return { themesDir, themes };
}

const ids = (themes: DiscoveredTheme[]) => themes.map((theme) => theme.manifest.id);

test("a theme folder another process created is discovered on the next sync", (t) => {
  const { themesDir, themes } = siteThemes(t);
  writeTheme(path.join(themesDir, "static", "editorial-rose"), "editorial-rose");
  assert.equal(syncThemeRoster({ themes, themesDir }), true);
  assert.deepEqual(ids(themes), ["editorial-rose", "tovu-starter"]);
});

test("a new top-level folder is discovered even without a marker bump", (t) => {
  const { themesDir, themes } = siteThemes(t);
  writeTheme(path.join(themesDir, "aurora"), "aurora");
  assert.equal(syncThemeRoster({ themes, themesDir }), true);
  assert.deepEqual(ids(themes), ["aurora", "tovu-starter"]);
});

test("a theme folder another process removed drops out", (t) => {
  const { themesDir, themes } = siteThemes(t);
  writeTheme(path.join(themesDir, "static", "editorial-rose"), "editorial-rose");
  syncThemeRoster({ themes, themesDir });
  fs.rmSync(path.join(themesDir, "static", "editorial-rose"), { recursive: true });
  assert.equal(syncThemeRoster({ themes, themesDir }), true);
  assert.deepEqual(ids(themes), ["tovu-starter"]);
});

test("an edit inside a theme is picked up when the writer bumps the marker", (t) => {
  const { themesDir, themes } = siteThemes(t);
  fs.writeFileSync(path.join(themesDir, "static", "tovu-starter", "tokens.json"), JSON.stringify({ "--ink": "#f0f" }));
  requestThemePreviewRefresh({ themesDir });
  assert.equal(syncThemeRoster({ themes, themesDir }), true);
  assert.equal(themes[0]?.tokens["--ink"], "#f0f");
});

test("nothing changed: no rescan, the roster's theme objects are untouched", (t) => {
  const { themesDir, themes } = siteThemes(t);
  const before = themes[0];
  assert.equal(syncThemeRoster({ themes, themesDir }), false);
  assert.equal(syncThemeRoster({ themes, themesDir }), false);
  assert.equal(themes[0], before);
});

test("one change rescans once, however many syncs follow it", (t) => {
  const { themesDir, themes } = siteThemes(t);
  requestThemePreviewRefresh({ themesDir });
  assert.equal(syncThemeRoster({ themes, themesDir }), true);
  assert.equal(syncThemeRoster({ themes, themesDir }), false);
  requestThemePreviewRefresh({ themesDir });
  assert.equal(syncThemeRoster({ themes, themesDir }), true);
});

test("a hand-built roster (themes on no disk) survives its first sync", (t) => {
  const themesDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-roster-sync-"));
  t.after(() => fs.rmSync(themesDir, { recursive: true, force: true }));
  const fabricated = { manifest: { id: "fixture-only" } } as DiscoveredTheme;
  const themes = [fabricated];
  assert.equal(syncThemeRoster({ themes, themesDir }), false);
  assert.deepEqual(themes, [fabricated]);
});

test("rosters are tracked independently: one process's sync does not mark another's as current", (t) => {
  const { themesDir, themes: serverRoster } = siteThemes(t);
  const daemonRoster = discoverAllBuiltInThemes({ dir: themesDir, source: "built-in" });
  syncThemeRoster({ themes: daemonRoster, themesDir });
  writeTheme(path.join(themesDir, "static", "editorial-rose"), "editorial-rose");
  assert.equal(syncThemeRoster({ themes: daemonRoster, themesDir }), true);
  assert.equal(syncThemeRoster({ themes: serverRoster, themesDir }), true);
  assert.deepEqual(ids(serverRoster), ["editorial-rose", "tovu-starter"]);
});

test("the fingerprint tolerates a themes folder that does not exist yet", () => {
  const missing = path.join(os.tmpdir(), "tovu-roster-sync-missing-never-created");
  assert.equal(themeRosterFingerprint({ themesDir: missing }), JSON.stringify([null, null, null, null, null, null]));
});
